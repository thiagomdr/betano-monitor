#!/usr/bin/env node
/**
 * Worker HCTG HTML no PC local (IP residencial).
 *
 * Round-robin: 1 jogo por ciclo, fila = ao vivo exceto win (GREEN) / loss (RED).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Opcional: HCTG_POLL_SEC=90, HCTG_POLL_JITTER_SEC=25,
 *   HCTG_MAX_ATTEMPTS=3, HCTG_BROWSER_RESTART_MIN=60,
 *   HCTG_WORKER_SOURCE=local-worker, HCTG_HTML_SOURCE=html-dom-local,
 *   HCTG_HEADLESS=0|1, HCTG_PAUSE_POLL_SEC=15
 *
 * Windows PC: .\scripts\run-local-hctg-worker.ps1
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import {
  clearBrowserCache,
  createBetanoBrowser,
  scrapeHctgOnPage,
  setupPageRoutes,
  slugFromBetanoUrl,
} from "./lib/betano-hctg-playwright.mjs";
import { formatLinesTable, trimHctgLinesForMatch, goalsTotalFromScoreText } from "./lib/betano-hctg-html.mjs";
import { insertSistemaLog, matchLabel } from "./lib/sistema-log.mjs";
import {
  assertColetaAtiva,
  assertNaoPausado,
  beginColetaEpoch,
  ColetaPausadaError,
  isColetaAtiva,
  readColetaState,
} from "./lib/coleta-ativa.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKER_QUEUE_RESULTADOS = ["watching", "pending", "sem_linha_05"];
const maxHctgAttempts = Number(process.env.HCTG_MAX_ATTEMPTS || "3");

function loadDotEnv() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadDotEnv();

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const pollSec = Number(process.env.HCTG_POLL_SEC || "90");
const pollJitterSec = Number(process.env.HCTG_POLL_JITTER_SEC || "25");
const restartEveryCycles = Number(process.env.HCTG_BROWSER_RESTART_CYCLES || "0");
const restartEveryMin = Number(process.env.HCTG_BROWSER_RESTART_MIN || "60");
const errorRetrySec = Number(process.env.HCTG_ERROR_RETRY_SEC || "15");
const pausePollSec = Number(process.env.HCTG_PAUSE_POLL_SEC || "15");
const pausePollMs = Number(process.env.HCTG_PAUSE_POLL_MS || "2000");
const scrapeTimeoutMs = Number(process.env.HCTG_SCRAPE_TIMEOUT_MS || "120000");
const workerSource = (process.env.HCTG_WORKER_SOURCE || "local-worker").trim() || "local-worker";
const htmlSource = (process.env.HCTG_HTML_SOURCE || "html-dom-local").trim() || "html-dom-local";
const headless = (process.env.HCTG_HEADLESS || "0").trim() === "1";

function isPlaywrightBrowserMissing(err) {
  const msg = String(err?.message ?? err);
  return /Executable doesn't exist|playwright install/i.test(msg);
}

const PLAYWRIGHT_INSTALL_HINT =
  "Chromium Playwright nao instalado — rode: cd scripts && npx playwright install chromium";

async function logWorkerError(message, epoch = null) {
  try {
    if (await isColetaAtiva(supabase)) {
      await insertWorkerLog(epoch, {
        level: "error",
        source: workerSource,
        action: "erro",
        message,
      });
      return;
    }
    await insertSistemaLog(supabase, {
      level: "error",
      source: workerSource,
      action: "erro",
      message,
    });
  } catch {
    /* ignore log failure */
  }
}

async function ensurePlaywrightChromiumInstalled() {
  const { chromium } = await import("playwright");
  try {
    const b = await chromium.launch({ headless: true });
    await b.close();
    return true;
  } catch (err) {
    if (!isPlaywrightBrowserMissing(err)) throw err;
    console.error(`[worker] ${PLAYWRIGHT_INSTALL_HINT}`);
    await logWorkerError(PLAYWRIGHT_INSTALL_HINT);
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dorme em fatias curtas; aborta se Sistema pausar (ativo=false). */
async function sleepUnlessColetaAtiva(ms, where = "espera") {
  const step = Math.min(pausePollMs, ms);
  let left = ms;
  while (left > 0) {
    if (!(await isColetaAtiva(supabase))) {
      throw new ColetaPausadaError(where);
    }
    const chunk = Math.min(step, left);
    await sleep(chunk);
    left -= chunk;
  }
}

function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function nextPollDelayMs() {
  if (lastCycleHadError) {
    const sec = Math.max(5, errorRetrySec);
    return sec * 1000;
  }
  const jitter = Math.max(0, pollJitterSec);
  const minSec = Math.max(30, pollSec - jitter);
  const maxSec = pollSec + jitter;
  return randomInt(minSec, maxSec) * 1000;
}

if (!supabaseUrl || !serviceKey) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (raiz do repo).");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  realtime: { transport: ws },
});

let browser = null;
let context = null;
let scrapePage = null;
let browserStartedAt = 0;
let cycleCount = 0;
let lastCycleHadError = false;
/** Round-robin: indice do proximo jogo na fila ao vivo. */
let roundRobinIndex = 0;
/** event_id -> { attempts, status, error, line, odd, checkedAt } */
const workerGameState = new Map();
/** true enquanto coleta pausada; usado para ciclo imediato ao religar. */
let coletaWasPaused = true;

async function isBrowserHealthy() {
  if (!browser || !context) return false;
  try {
    if (typeof browser.isConnected === "function" && !browser.isConnected()) {
      return false;
    }
    await context.pages();
    return true;
  } catch {
    return false;
  }
}

async function discardDeadBrowser(reason) {
  scrapePage = null;
  const dead = browser;
  browser = null;
  context = null;
  browserStartedAt = 0;
  try {
    await dead?.close();
  } catch {
    /* ignore */
  }
}

async function ensureBrowser(epoch = null) {
  await assertNaoPausado(supabase, "chrome-abrir");
  if (browser && !(await isBrowserHealthy())) {
    await discardDeadBrowser("stale-ref");
  }
  if (!browser) {
    const b = await createBetanoBrowser({ headless });
    browser = b.browser;
    context = b.context;
    browserStartedAt = Date.now();
    console.log(
      `[worker] Chrome iniciado (${headless ? "headless" : "headed"}) ` +
        `source=${htmlSource}` +
        (b.persistent ? " profile=persistente" : "") +
        ` aba unica ate ${restartEveryMin}min`,
    );
  }
}

/** Reutiliza a mesma aba entre jogos; so recria apos reinicio do Chrome. */
async function ensureScrapePage(epoch = null) {
  await ensureBrowser(epoch);
  if (scrapePage && !scrapePage.isClosed()) {
    return scrapePage;
  }
  let open = [];
  try {
    open = (context.pages() ?? []).filter((p) => !p.isClosed());
  } catch (err) {
    await discardDeadBrowser("pages-failed");
    await ensureBrowser();
    open = [];
  }
  try {
    scrapePage = open[0] ?? await context.newPage();
  } catch (err) {
    await discardDeadBrowser("newPage-failed");
    await ensureBrowser();
    scrapePage = await context.newPage();
  }
  await setupPageRoutes(scrapePage);
  if (open.length === 0) {
    console.log("[worker] aba de scrape aberta (reutilizada entre jogos)");
  }
  return scrapePage;
}

async function clearScrapePageCache() {
  if (!scrapePage || scrapePage.isClosed() || !context) return;
  try {
    await clearBrowserCache(scrapePage, context);
    console.log("[worker] cache de rede limpo");
  } catch {
    /* ignore */
  }
}

function shouldRestartBrowser() {
  if (!browser) return false;
  if (restartEveryCycles > 0 && cycleCount > 0 && cycleCount % restartEveryCycles === 0) {
    return true;
  }
  if (restartEveryMin > 0 && browserStartedAt > 0) {
    const ageMs = Date.now() - browserStartedAt;
    if (ageMs >= restartEveryMin * 60 * 1000) return true;
  }
  return false;
}

async function resetBrowser(reason = "error") {
  scrapePage = null;
  try {
    const pages = context ? await context.pages() : [];
    for (const p of pages) {
      try {
        await p.close();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  try {
    await browser?.close();
  } catch {
    /* ignore */
  }
  browser = null;
  context = null;
  browserStartedAt = 0;
  if (reason) {
    console.log(`[worker] Chrome encerrado (${reason})`);
  }
}

async function restartBrowser(reason, { clearCache = true } = {}) {
  if (clearCache) await clearScrapePageCache();
  await resetBrowser(null);
  await ensureBrowser();
  await ensureScrapePage();
  console.log(`[worker] Chrome reiniciado (${reason})`);
}

/** Recupera sem fechar a janela se o Chrome ainda estiver vivo. */
async function recoverBrowserAfterError(reason) {
  scrapePage = null;
  const healthy = await isBrowserHealthy();
  if (healthy) {
    try {
      await ensureScrapePage();
      console.log(`[worker] Chrome mantido aberto — aba recriada (${reason})`);
      return;
    } catch (err) {
    }
  }
  try {
    await discardDeadBrowser(`recover-${reason}`);
    await ensureBrowser();
    await ensureScrapePage();
    console.log(`[worker] Chrome recuperado (${reason})`);
  } catch (err) {
    console.error(`[worker] falha ao recuperar Chrome (${reason}):`, err?.message ?? err);
    await discardDeadBrowser(reason);
    try {
      await ensureBrowser();
      await ensureScrapePage();
      console.log(`[worker] Chrome recuperado na 2a tentativa (${reason})`);
    } catch (err2) {
      console.error(`[worker] 2a tentativa falhou (${reason}):`, err2?.message ?? err2);
    }
  }
}

async function fetchWorkerQueue() {
  const { data, error } = await supabase
    .from("futebol_mercado_gols_05")
    .select(
      "event_id,betano_url,home,away,resultado,last_minute,live_score,hctg_fetched_at",
    )
    .eq("is_live", true)
    .in("resultado", WORKER_QUEUE_RESULTADOS)
    .order("last_minute", { ascending: false, nullsFirst: false })
    .order("event_id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function syncWorkerStateWithQueue(queue) {
  const ids = new Set(queue.map((r) => String(r.event_id)));
  for (const id of workerGameState.keys()) {
    if (!ids.has(id)) workerGameState.delete(id);
  }
  if (!queue.length) {
    roundRobinIndex = 0;
    return;
  }
  roundRobinIndex =
    ((roundRobinIndex % queue.length) + queue.length) % queue.length;
}

function getWorkerGameState(eventId) {
  const id = String(eventId);
  if (!workerGameState.has(id)) {
    workerGameState.set(id, {
      attempts: 0,
      status: "waiting",
      error: null,
      line: null,
      odd: null,
      checkedAt: null,
    });
  }
  return workerGameState.get(id);
}

function formatHctgLineLabel(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function buildWorkerQueueMessage(queue, checkingEventId) {
  const gameLines = queue.map((row) => {
    const label = matchLabel(row.home, row.away);
    const id = String(row.event_id);
    const st = workerGameState.get(id) || { status: "waiting", attempts: 0 };
    const checking = checkingEventId != null && id === String(checkingEventId);
    if (checking) {
      const att =
        st.attempts > 0 ? ` (${st.attempts}/${maxHctgAttempts})` : "";
      return `${label} - Verificando...${att}`;
    }
    if (st.status === "ok" && st.line != null && st.odd != null) {
      return `${label} - V +${formatHctgLineLabel(st.line)} (${formatOddFixed2(st.odd)})`;
    }
    if (st.status === "error" || st.attempts >= maxHctgAttempts) {
      return `${label} - X ${st.error || "Erro HCTG"}`;
    }
    if (st.attempts > 0) {
      return `${label} - Verificando... (${st.attempts}/${maxHctgAttempts})`;
    }
    return `${label} - — aguardando`;
  });

  const checkingRow = checkingEventId
    ? queue.find((r) => String(r.event_id) === String(checkingEventId))
    : null;
  const checkingLabel = checkingRow
    ? matchLabel(checkingRow.home, checkingRow.away)
    : null;

  return [
    "Worker HCTG — fila ao vivo",
    `Jogos: ${queue.length}`,
    checkingLabel
      ? `Verificando: ${checkingLabel}`
      : queue.length
        ? `Proximo: ${roundRobinIndex + 1}/${queue.length}`
        : "—",
    "_______________________________________________________",
    ...(gameLines.length ? gameLines : ["(nenhum jogo ao vivo na fila)"]),
  ].join("\n");
}

async function publishWorkerQueue(epoch, queue, checkingEventId = null) {
  const games = queue.map((row) => {
    const id = String(row.event_id);
    const st = workerGameState.get(id) || getWorkerGameState(id);
    return {
      event_id: id,
      label: matchLabel(row.home, row.away),
      resultado: row.resultado,
      last_minute: row.last_minute,
      checking: checkingEventId != null && id === String(checkingEventId),
      attempts: st.attempts,
      status: st.status,
      error: st.error,
      line: st.line,
      odd: st.odd,
      checked_at: st.checkedAt,
    };
  });

  await insertSistemaLog(supabase, {
    level: "info",
    source: workerSource,
    action: "hctg_worker_fila",
    message: buildWorkerQueueMessage(queue, checkingEventId),
    payload: {
      cycle: cycleCount,
      epoch,
      total: queue.length,
      round_robin_index: roundRobinIndex,
      checking_event_id: checkingEventId,
      max_attempts: maxHctgAttempts,
      games,
    },
  });
}

async function logScrapeAbort(where, epoch, extra = {}) {
  const st = await readColetaState(supabase);
  const pausado = st?.ativo !== true;
  const epochMudou =
    !pausado && epoch != null && String(st?.data_atualizacao) !== String(epoch);
  const message = pausado
    ? `Scrape abortado — sistema pausado (${where})`
    : epochMudou
      ? `Scrape abortado — sessao reiniciada no painel (${where})`
      : `Scrape abortado (${where})`;
  try {
    await insertSistemaLog(supabase, {
      level: "warn",
      source: workerSource,
      action: "coleta_abortada",
      message,
      event_id: extra.event_id ?? null,
      match_label: extra.match_label ?? null,
      payload: { where, pausado, epochMudou, epoch, dbEpoch: st?.data_atualizacao ?? null },
    });
  } catch {
    /* ignore */
  }
}

async function scrapeWithTimeout(p, eventId, slug, epoch) {
  let timer;
  let pauseIv;
  try {
    const pauseWatch = new Promise((_, reject) => {
      pauseIv = setInterval(async () => {
        const st = await readColetaState(supabase);
        if (st?.ativo === true) return;
        clearInterval(pauseIv);
        pauseIv = null;
        scrapePage = null;
        try {
          await p.close();
        } catch {
          /* interrompe goto */
        }
        reject(new ColetaPausadaError(`chrome-${eventId}`));
      }, pausePollMs);
    });
    return await Promise.race([
      scrapeHctgOnPage(p, eventId, slug),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`scrape timeout ${scrapeTimeoutMs}ms`)),
          scrapeTimeoutMs,
        );
      }),
      pauseWatch,
    ]);
  } finally {
    clearTimeout(timer);
    if (pauseIv) clearInterval(pauseIv);
  }
}

function formatOddFixed2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Menor linha Over HCTG valida para o placar (linha absoluta Mais de X,X). */
function minOverHctgLine(lines, goalsTotal = null) {
  const pool =
    goalsTotal != null && Number.isFinite(goalsTotal)
      ? trimHctgLinesForMatch(lines ?? [], goalsTotal)
      : (lines ?? []);
  const withOver = pool
    .filter((l) => l && l.over != null && Number.isFinite(Number(l.line)))
    .slice()
    .sort((a, b) => Number(a.line) - Number(b.line));
  return withOver[0] ?? null;
}

function hctgOddsLogMessage(lines, goalsTotal = null) {
  const best = minOverHctgLine(lines, goalsTotal);
  if (!best) return "Total de Gols: sem linha Over";
  const lineLabel = Number(best.line).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
  return `Total de Gols: +${lineLabel} (${formatOddFixed2(best.over)})`;
}

async function persistHctg(row, snap, epoch) {
  await assertNaoPausado(supabase, `persist-${row.event_id}`);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("futebol_mercado_gols_05")
    .update({
      hctg_lines: snap.lines,
      hctg_source: snap.source,
      hctg_fetched_at: nowIso,
      updated_at: nowIso,
    })
    .eq("event_id", row.event_id)
    .in("resultado", WORKER_QUEUE_RESULTADOS)
    .select("event_id");

  if (error) throw error;
  if (!data?.length) {
    console.log(`[worker] ${row.event_id} ignorado pos-scrape (ja win/loss/excluido)`);
  }
}

async function insertWorkerLog(epoch, entry) {
  await assertNaoPausado(supabase, `log-${entry.action || "sistema"}`);
  await insertSistemaLog(supabase, entry);
}

async function closeChromeIfPausado() {
  if (await isColetaAtiva(supabase)) return false;
  if (browser) {
    await resetBrowser("pausado");
    console.log("[worker] Chrome encerrado — sistema pausado");
  }
  return true;
}

async function runCycle() {
  cycleCount += 1;

  let epoch;
  try {
    epoch = await beginColetaEpoch(supabase);
  } catch {
    await closeChromeIfPausado();
    console.log(
      `[worker] ${new Date().toISOString()} sistema pausado — ciclo ${cycleCount} ignorado`,
    );
    return;
  }

  if (shouldRestartBrowser()) {
    await restartBrowser(
      restartEveryCycles > 0 && cycleCount % restartEveryCycles === 0
        ? `ciclo-${cycleCount}`
        : `idade-${restartEveryMin}min`,
    );
  }

  let queue;
  try {
    queue = await fetchWorkerQueue();
  } catch (err) {
    console.error("[worker] fila:", err?.message ?? err);
    lastCycleHadError = true;
    return;
  }

  syncWorkerStateWithQueue(queue);

  if (!queue.length) {
    console.log(`[worker] ciclo ${cycleCount} — fila vazia (sem jogos ao vivo)`);
    await publishWorkerQueue(epoch, [], null);
    lastCycleHadError = false;
    return;
  }

  const idx = roundRobinIndex % queue.length;
  const row = queue[idx];
  const eventId = String(row.event_id);
  const st = getWorkerGameState(eventId);

  console.log(
    `[worker] ciclo ${cycleCount}: jogo ${idx + 1}/${queue.length} — ${row.home} x ${row.away}`,
  );

  await publishWorkerQueue(epoch, queue, eventId);

  try {
    await ensureBrowser(epoch);
  } catch (err) {
    if (err instanceof ColetaPausadaError) {
      await closeChromeIfPausado();
      await logScrapeAbort(err.message, epoch);
      return;
    }
    const msg = String(err?.message ?? err);
    lastCycleHadError = true;
    if (isPlaywrightBrowserMissing(err)) {
      console.error(`[worker] ${PLAYWRIGHT_INSTALL_HINT}`);
      await logWorkerError(PLAYWRIGHT_INSTALL_HINT, epoch);
    } else {
      console.error(`[worker] FALHA ao abrir Chrome: ${msg}`);
      await logWorkerError(`FALHA ao abrir Chrome: ${msg}`, epoch);
    }
    return;
  }

  const slug = slugFromBetanoUrl(row.betano_url);
  const t0 = Date.now();
  let scrapeOk = false;

  if (!slug) {
    st.attempts += 1;
    st.error = "sem slug em betano_url";
    if (st.attempts >= maxHctgAttempts) st.status = "error";
    console.warn(`[worker] ${eventId} sem slug em betano_url`);
  } else {
    try {
      await assertNaoPausado(supabase, `chrome-${eventId}`);
      const p = await ensureScrapePage(epoch);
      const snap = await scrapeWithTimeout(p, eventId, slug, epoch);
      await assertNaoPausado(supabase, `pos-chrome-${eventId}`);
      const label = matchLabel(row.home, row.away);

      if (!snap.lines.length) {
        const blocked = snap.betanoBlocked === true;
        const ageGated = snap.ageGated === true;
        const failMsg = blocked
          ? "Splash Screen Betano"
          : ageGated
            ? "Modal +18 nao fechou"
            : "Total de Gols NÃO ENCONTRADOS";
        st.attempts += 1;
        st.error = failMsg;
        if (st.attempts >= maxHctgAttempts) st.status = "error";
        console.warn(
          `[worker] ${eventId} ${row.home} x ${row.away} — 0 linhas ` +
            (blocked ? "(splash/verificacao Betano) " : "") +
            (ageGated ? "(modal +18 nao fechou) " : "") +
            `(golsTab=${snap.golsTab} markets=${snap.marketsReady} ` +
            `${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        );
        await insertWorkerLog(epoch, {
          level: blocked || ageGated ? "error" : "warn",
          source: workerSource,
          action: blocked ? "hctg_bloqueado" : ageGated ? "hctg_age_gate" : "hctg_falha",
          message: blocked
            ? "Playwright preso na Splash Screen — clique SIM (+18) na janela do worker e aguarde carregar"
            : ageGated
              ? "Modal +18 nao fechou (SIM)"
              : "Total de Gols NÃO ENCONTRADOS",
          event_id: eventId,
          match_label: label,
          duration_ms: Date.now() - t0,
          payload: {
            golsTab: snap.golsTab,
            marketsReady: snap.marketsReady,
            betanoBlocked: blocked,
            ageGated,
            attempt: st.attempts,
            max_attempts: maxHctgAttempts,
          },
        });
      } else {
        const goalsTotal =
          snap.goalsTotal ??
          goalsTotalFromScoreText(snap.scoreText) ??
          goalsTotalFromScoreText(row.live_score);
        const lines =
          goalsTotal != null
            ? trimHctgLinesForMatch(snap.lines, goalsTotal)
            : snap.lines;
        const best = minOverHctgLine(lines, goalsTotal);
        if (!best) {
          st.attempts += 1;
          st.error = "sem linha Over HCTG";
          if (st.attempts >= maxHctgAttempts) st.status = "error";
          await insertWorkerLog(epoch, {
            level: "warn",
            source: workerSource,
            action: "hctg_falha",
            message: "Total de Gols NÃO ENCONTRADOS",
            event_id: eventId,
            match_label: label,
            duration_ms: Date.now() - t0,
            payload: {
              line_count: lines.length,
              attempt: st.attempts,
              max_attempts: maxHctgAttempts,
            },
          });
        } else {
          await persistHctg(row, { ...snap, lines, goalsTotal }, epoch);
          st.status = "ok";
          st.attempts = 0;
          st.error = null;
          st.line = best.line;
          st.odd = best.over;
          st.checkedAt = new Date().toISOString();
          scrapeOk = true;
          await insertWorkerLog(epoch, {
            source: workerSource,
            action: "hctg_odds",
            message: hctgOddsLogMessage(lines, goalsTotal),
            event_id: eventId,
            match_label: label,
            duration_ms: Date.now() - t0,
            payload: {
              line_count: lines.length,
              min_over_line: best,
              lines,
              scoreText: snap.scoreText ?? row.live_score ?? null,
              goalsTotal,
            },
          });
          console.log(
            `[worker] OK ${eventId} ${row.home} x ${row.away} — ${lines.length} linhas em ${((Date.now() - t0) / 1000).toFixed(1)}s`,
          );
          console.log(formatLinesTable(lines));
        }
      }
    } catch (err) {
      if (err instanceof ColetaPausadaError) {
        console.log(`[worker] ${err.message}`);
        await logScrapeAbort(err.message, epoch, {
          event_id: eventId,
          match_label: matchLabel(row.home, row.away),
        });
        await closeChromeIfPausado();
        return;
      }
      if (!(await isColetaAtiva(supabase)) || (await closeChromeIfPausado())) {
        console.log(`[worker] erro ignorado — sistema pausado`);
        return;
      }
      const errMsg = String(err?.message ?? err);
      if (
        /browser has been closed|Target page, context or browser/i.test(errMsg) &&
        !(await isColetaAtiva(supabase))
      ) {
        console.log(`[worker] scrape abortado — sistema pausado`);
        await closeChromeIfPausado();
        return;
      }
      st.attempts += 1;
      st.error = errMsg.slice(0, 120);
      if (st.attempts >= maxHctgAttempts) st.status = "error";
      console.error(`[worker] ERRO ${eventId}:`, errMsg);
      await insertWorkerLog(epoch, {
        level: "error",
        source: workerSource,
        action: "erro",
        message: `Erro HCTG: ${err?.message ?? err}`,
        event_id: eventId,
        match_label: matchLabel(row.home, row.away),
        duration_ms: Date.now() - t0,
        payload: { attempt: st.attempts, max_attempts: maxHctgAttempts },
      });
      await recoverBrowserAfterError("erro-jogo");
    }
  }

  roundRobinIndex = (idx + 1) % queue.length;
  await publishWorkerQueue(epoch, queue, null);
  lastCycleHadError = !scrapeOk && st.attempts >= maxHctgAttempts;
}

async function shutdown() {
  await resetBrowser("shutdown");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(
  `[worker] mode=${workerSource} html=${htmlSource} headless=${headless} ` +
    `poll=${pollSec}s±${pollJitterSec}s round-robin=1 ` +
    `max_attempts=${maxHctgAttempts} ` +
    `restart=${restartEveryCycles > 0 ? `${restartEveryCycles}ciclo|` : ""}${restartEveryMin}min ` +
    `aba=unica cache=${restartEveryMin}min erro-retry=${errorRetrySec}s ` +
    `routes=none ` +
    `fila=${WORKER_QUEUE_RESULTADOS.join(",")} url=${supabaseUrl}`,
);

async function scheduleNextCycle() {
  const ativo = await isColetaAtiva(supabase);
  const justResumed = ativo && coletaWasPaused;
  coletaWasPaused = !ativo;
  const delayMs = !ativo
    ? Math.max(5, pausePollSec) * 1000
    : justResumed
      ? 0
      : nextPollDelayMs();

  if (justResumed) {
    console.log("[worker] sistema religado — ciclo imediato");
  } else if (ativo) {
    console.log(`[worker] proximo ciclo em ${(delayMs / 1000).toFixed(0)}s`);
  } else {
    console.log(`[worker] sistema pausado — proxima verificacao em ${(delayMs / 1000).toFixed(0)}s`);
    await closeChromeIfPausado();
  }

  setTimeout(async () => {
    try {
      await runCycle();
    } catch (e) {
      if (e instanceof ColetaPausadaError) {
        console.log(`[worker] ${e.message}`);
        await closeChromeIfPausado();
      } else {
        console.error("[worker] ciclo:", e?.message ?? e);
        lastCycleHadError = true;
        if (await isColetaAtiva(supabase)) {
          await insertSistemaLog(supabase, {
            level: "error",
            source: workerSource,
            action: "erro",
            message: `Erro no ciclo worker: ${e?.message ?? e}`,
          });
        }
        await recoverBrowserAfterError("ciclo-erro");
      }
    }
    scheduleNextCycle();
  }, delayMs);
}

async function startPolling() {
  if (!(await ensurePlaywrightChromiumInstalled())) {
    console.error("[worker] Encerrando — instale Chromium e reinicie o worker.");
    process.exit(1);
  }
  const ativoInicio = await isColetaAtiva(supabase);
  if (!ativoInicio) {
    coletaWasPaused = true;
    const delayMs = Math.max(5, pausePollSec) * 1000;
    console.log(`[worker] sistema pausado — primeira verificacao em ${(delayMs / 1000).toFixed(0)}s`);
    setTimeout(() => scheduleNextCycle(), delayMs);
    return;
  }
  coletaWasPaused = false;
  await runCycle();
  scheduleNextCycle();
}

if (process.argv.includes("--once")) {
  if (!(await ensurePlaywrightChromiumInstalled())) {
    process.exit(1);
  }
  await runCycle();
  await shutdown();
} else {
  await startPolling();
}

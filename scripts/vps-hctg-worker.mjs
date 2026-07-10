#!/usr/bin/env node
/**
 * Worker HCTG HTML (VPS legado ou PC local / IP residencial).
 *
 * So scrape jogos watching | sem_linha_05. Nunca pending (captura +0,5 feita na Edge).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Opcional: HCTG_POLL_SEC=90, HCTG_POLL_JITTER_SEC=25,
 *   HCTG_MAX_PER_CYCLE=6, HCTG_MAX_PER_CYCLE_BUSY=14, HCTG_BUSY_THRESHOLD=15,
 *   HCTG_FETCH_POOL=64, HCTG_DELAY_MIN_SEC=2, HCTG_DELAY_MAX_SEC=5,
 *   HCTG_BROWSER_RESTART_CYCLES=10, HCTG_BROWSER_RESTART_MIN=45,
 *   HCTG_MEM_LOG_EVERY=5,
 *   HCTG_WORKER_SOURCE=vps-worker|local-worker,
 *   HCTG_HTML_SOURCE=html-dom-vps|html-dom-local,
 *   HCTG_HEADLESS=0|1
 *
 * Linux VPS: xvfb-run -a node vps-hctg-worker.mjs
 * Windows PC: .\scripts\run-local-hctg-worker.ps1
 */
import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
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
import { formatLinesTable } from "./lib/betano-hctg-html.mjs";
import { insertSistemaLog, matchLabel } from "./lib/sistema-log.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const WORKER_RESULTADOS = ["watching", "sem_linha_05"];

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
const maxPerCycle = Number(process.env.HCTG_MAX_PER_CYCLE || "6");
const maxPerCycleBusy = Number(process.env.HCTG_MAX_PER_CYCLE_BUSY || "14");
const busyThreshold = Number(process.env.HCTG_BUSY_THRESHOLD || "15");
const fetchPool = Number(process.env.HCTG_FETCH_POOL || "64");
const delayMinSec = Number(process.env.HCTG_DELAY_MIN_SEC || "2");
const delayMaxSec = Number(process.env.HCTG_DELAY_MAX_SEC || "5");
const restartEveryCycles = Number(process.env.HCTG_BROWSER_RESTART_CYCLES || "10");
const restartEveryMin = Number(process.env.HCTG_BROWSER_RESTART_MIN || "45");
const memLogEvery = Number(process.env.HCTG_MEM_LOG_EVERY || "5");
const workerSource = (process.env.HCTG_WORKER_SOURCE || "vps-worker").trim() || "vps-worker";
const htmlSource = (process.env.HCTG_HTML_SOURCE || "html-dom-vps").trim() || "html-dom-vps";
const headless = (process.env.HCTG_HEADLESS || "0").trim() === "1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** Fisher-Yates — ordem diferente a cada ciclo. */
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nextPollDelayMs() {
  const jitter = Math.max(0, pollJitterSec);
  const minSec = Math.max(30, pollSec - jitter);
  const maxSec = pollSec + jitter;
  return randomInt(minSec, maxSec) * 1000;
}

function delayBetweenPagesMs() {
  const minMs = Math.max(500, delayMinSec * 1000);
  const maxMs = Math.max(minMs, delayMaxSec * 1000);
  return randomInt(minMs, maxMs);
}

function cycleCap(backlog) {
  if (backlog >= busyThreshold) {
    return Math.min(maxPerCycleBusy, backlog);
  }
  return Math.min(maxPerCycle, backlog);
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
let browserStartedAt = 0;
let cycleCount = 0;

function chromeRssMb() {
  if (process.platform !== "linux") return null;
  try {
    const out = execSync(
      "ps -o rss= -C chromium 2>/dev/null | awk '{s+=$1} END {print s+0}'",
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    const kb = Number(out);
    return Number.isFinite(kb) && kb > 0 ? Math.round(kb / 1024) : null;
  } catch {
    return null;
  }
}

async function logWorkerMemory(reason) {
  const mem = process.memoryUsage();
  const chromeMb = chromeRssMb();
  const uptimeMin = browserStartedAt
    ? Math.round((Date.now() - browserStartedAt) / 60000)
    : 0;
  const msg =
    `RAM node=${Math.round(mem.rss / 1024 / 1024)}MB` +
    ` chrome=${chromeMb ?? "?"}MB` +
    ` ciclo=${cycleCount} uptime=${uptimeMin}min`;
  console.log(`[worker] mem (${reason}): ${msg}`);
  await insertSistemaLog(supabase, {
    source: workerSource,
    action: "worker_mem",
    message: msg,
    payload: {
      reason,
      cycle: cycleCount,
      node_rss_mb: Math.round(mem.rss / 1024 / 1024),
      node_heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
      chrome_rss_mb: chromeMb,
      browser_uptime_min: uptimeMin,
    },
  });
}

async function ensureBrowser() {
  if (!browser) {
    const b = await createBetanoBrowser({ headless });
    browser = b.browser;
    context = b.context;
    browserStartedAt = Date.now();
    console.log(
      `[worker] Chrome iniciado (${headless ? "headless" : "headed"}) ` +
        `source=${htmlSource}` +
        (b.persistent ? " profile=persistente" : ""),
    );
  }
}

async function newScrapePage() {
  await ensureBrowser();
  const p = await context.newPage();
  await setupPageRoutes(p);
  return p;
}

async function closeScrapePage(p) {
  try {
    await clearBrowserCache(p, context);
  } catch {
    /* ignore */
  }
  try {
    await p.close();
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

async function restartBrowser(reason) {
  await resetBrowser(null);
  await ensureBrowser();
  await logWorkerMemory(`restart:${reason}`);
}

function eligibleQuery() {
  const staleBefore = new Date(Date.now() - pollSec * 1000).toISOString();
  return supabase
    .from("futebol_mercado_gols_05")
    .select("event_id,betano_url,home,away,resultado,hctg_fetched_at", { count: "exact" })
    .eq("is_live", true)
    .in("resultado", WORKER_RESULTADOS)
    .or(`hctg_fetched_at.is.null,hctg_fetched_at.lt.${staleBefore}`);
}

async function fetchTargets() {
  const { data, error, count } = await eligibleQuery().limit(fetchPool);
  if (error) throw error;

  const pool = data ?? [];
  const backlog = count ?? pool.length;
  const cap = cycleCap(backlog);
  const targets = shuffle(pool).slice(0, cap);

  if (targets.length) {
    console.log(
      `[worker] fila: ${backlog} elegivel(is), cap ciclo=${cap}` +
        (backlog >= busyThreshold ? " (modo pico)" : ""),
    );
  }

  return targets;
}

const SCRAPE_TIMEOUT_MS = Number(process.env.HCTG_SCRAPE_TIMEOUT_MS || "120000");

async function scrapeWithTimeout(p, eventId, slug) {
  let timer;
  try {
    return await Promise.race([
      scrapeHctgOnPage(p, eventId, slug),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`scrape timeout ${SCRAPE_TIMEOUT_MS}ms`)),
          SCRAPE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
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

/** Menor linha Over HCTG (mais perto do +0,5). */
function minOverHctgLine(lines) {
  const withOver = (lines ?? [])
    .filter((l) => l && l.over != null && Number.isFinite(Number(l.line)))
    .slice()
    .sort((a, b) => Number(a.line) - Number(b.line));
  return withOver[0] ?? null;
}

function hctgOddsLogMessage(lines) {
  const best = minOverHctgLine(lines);
  if (!best) return "Total de Gols: sem linha Over";
  const lineLabel = Number(best.line).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  });
  return `Total de Gols: +${lineLabel} (${formatOddFixed2(best.over)})`;
}

async function persistHctg(row, snap) {
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
    .in("resultado", WORKER_RESULTADOS)
    .select("event_id");

  if (error) throw error;
  if (!data?.length) {
    console.log(`[worker] ${row.event_id} ignorado pos-scrape (ja pending/win/loss)`);
  }
}

async function runCycle() {
  cycleCount += 1;

  if (shouldRestartBrowser()) {
    await restartBrowser(
      restartEveryCycles > 0 && cycleCount % restartEveryCycles === 0
        ? `ciclo-${cycleCount}`
        : `idade-${restartEveryMin}min`,
    );
  }

  if (memLogEvery > 0 && cycleCount % memLogEvery === 0) {
    await logWorkerMemory("periodico");
  }

  const targets = await fetchTargets();
  if (!targets.length) {
    console.log(`[worker] ${new Date().toISOString()} nenhum jogo para HCTG`);
    return;
  }

  const order = targets.map((r) => r.event_id).join(", ");
  console.log(`[worker] ciclo ${cycleCount}: ${targets.length} jogo(s), ordem: ${order}`);

  await ensureBrowser();

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    if (i > 0) {
      const waitMs = delayBetweenPagesMs();
      console.log(`[worker] pausa ${(waitMs / 1000).toFixed(1)}s antes do proximo jogo`);
      await sleep(waitMs);
    }

    const eventId = String(row.event_id);
    const slug = slugFromBetanoUrl(row.betano_url);
    if (!slug) {
      console.warn(`[worker] ${eventId} sem slug em betano_url`);
      continue;
    }

    const t0 = Date.now();
    const p = await newScrapePage();
    try {
      const snap = await scrapeWithTimeout(p, eventId, slug);
      const label = matchLabel(row.home, row.away);
      if (!snap.lines.length) {
        const blocked = snap.betanoBlocked === true;
        const ageGated = snap.ageGated === true;
        console.warn(
          `[worker] ${eventId} ${row.home} x ${row.away} — 0 linhas ` +
            (blocked ? "(Betano splash/bloqueio IP) " : "") +
            (ageGated ? "(modal +18 nao fechou) " : "") +
            `(golsTab=${snap.golsTab} markets=${snap.marketsReady} ` +
            `${((Date.now() - t0) / 1000).toFixed(1)}s)`,
        );
        await insertSistemaLog(supabase, {
          level: blocked || ageGated ? "error" : "warn",
          source: workerSource,
          action: blocked ? "hctg_bloqueado" : ageGated ? "hctg_age_gate" : "hctg_falha",
          message: blocked
            ? "Betano bloqueou IP (splash screen) — use IP residencial (PC local) ou VPS BR"
            : ageGated
            ? "Modal +18 nao fechou (SIM)"
            : `HCTG sem linhas (golsTab=${snap.golsTab}, markets=${snap.marketsReady})`,
          event_id: eventId,
          match_label: label,
          duration_ms: Date.now() - t0,
          payload: {
            golsTab: snap.golsTab,
            marketsReady: snap.marketsReady,
            betanoBlocked: blocked,
            ageGated,
          },
        });
        continue;
      }
      await persistHctg(row, snap);
      await insertSistemaLog(supabase, {
        source: workerSource,
        action: "hctg_odds",
        message: hctgOddsLogMessage(snap.lines),
        event_id: eventId,
        match_label: label,
        duration_ms: Date.now() - t0,
        payload: {
          line_count: snap.lines.length,
          min_over_line: minOverHctgLine(snap.lines),
          lines: snap.lines,
        },
      });
      console.log(
        `[worker] OK ${eventId} ${row.home} x ${row.away} — ${snap.lines.length} linhas em ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      console.log(formatLinesTable(snap.lines));
    } catch (err) {
      console.error(`[worker] ERRO ${eventId}:`, err?.message ?? err);
      await insertSistemaLog(supabase, {
        level: "error",
        source: workerSource,
        action: "erro",
        message: `Erro HCTG: ${err?.message ?? err}`,
        event_id: eventId,
        match_label: matchLabel(row.home, row.away),
        duration_ms: Date.now() - t0,
      });
      await resetBrowser("erro");
    } finally {
      await closeScrapePage(p);
    }
  }
}

async function shutdown() {
  await resetBrowser("shutdown");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(
  `[worker] mode=${workerSource} html=${htmlSource} headless=${headless} ` +
    `poll=${pollSec}s±${pollJitterSec}s cap=${maxPerCycle}/${maxPerCycleBusy} ` +
    `busy>=${busyThreshold} pool=${fetchPool} delay=${delayMinSec}-${delayMaxSec}s ` +
    `restart=${restartEveryCycles}ciclo|${restartEveryMin}min memLog=${memLogEvery} ` +
    `resultados=${WORKER_RESULTADOS.join(",")} url=${supabaseUrl}`,
);

function scheduleNextCycle() {
  const delayMs = nextPollDelayMs();
  console.log(`[worker] proximo ciclo em ${(delayMs / 1000).toFixed(0)}s`);
  setTimeout(async () => {
    try {
      await runCycle();
    } catch (e) {
      console.error("[worker] ciclo:", e?.message ?? e);
      await insertSistemaLog(supabase, {
        level: "error",
        source: workerSource,
        action: "erro",
        message: `Erro no ciclo worker: ${e?.message ?? e}`,
      });
      await resetBrowser("ciclo-erro");
    }
    scheduleNextCycle();
  }, delayMs);
}

await runCycle();

if (process.argv.includes("--once")) {
  await shutdown();
} else {
  scheduleNextCycle();
}

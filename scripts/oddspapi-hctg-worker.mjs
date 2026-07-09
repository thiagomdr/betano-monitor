/**
 * Worker HCTG via OddsPapi WebSocket → grava hctg_lines no Supabase.
 *
 * Requer:
 *   ODDSPAPI_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   cd scripts
 *   node oddspapi-hctg-worker.mjs
 *
 * Fluxo:
 *   1) Carrega catalogo markets (totals)
 *   2) Conecta WS (v5 preferido, v4 fallback)
 *   3) A cada flush, cruza fixtures com jogos watching/pending (betradarMatchId)
 *   4) Upsert hctg_lines / hctg_source=oddspapi-ws
 *
 * Edge betano-futebol-live continua so lendo hctg_* do BD (nao gera odds).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";
import {
  applyV5OddsUpdate,
  BOOKMAKER_SLUG,
  extractHctgLinesFromBookmakerMarkets,
  hctgLinesFromV5State,
  loadTotalsMarketCatalog,
  ODDSPAPI_WS_V4,
  ODDSPAPI_WS_V5,
  SOCCER_SPORT_ID,
  trimLinesNearScore,
} from "./lib/oddspapi-hctg.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const apiKey = process.env.ODDSPAPI_API_KEY?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!apiKey || !supabaseUrl || !serviceKey) {
  console.error("Faltam ODDSPAPI_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const FLUSH_MS = Number(process.env.ODDSPAPI_FLUSH_MS || "15000");
const RECONNECT_MS = Number(process.env.ODDSPAPI_RECONNECT_MS || "5000");

const supabase = createClient(supabaseUrl, serviceKey);
const catalog = await loadTotalsMarketCatalog(apiKey);
console.log(`[oddspapi] catalogo totals: ${catalog.size} mercados`);

/** @type {Map<string, Map<string, object>>} */
const v5State = new Map();
/** @type {Map<string, object>} */
const v4Odds = new Map();
/** @type {Map<string, number>} fixtureId → betradar */
const fixtureBetradar = new Map();
/** @type {Map<number, string>} betradar → fixtureId */
const betradarToFixture = new Map();

function rememberBetradar(fixtureId, br) {
  if (fixtureId == null || br == null) return;
  const fid = String(fixtureId);
  const n = Number(br);
  if (!Number.isFinite(n)) return;
  fixtureBetradar.set(fid, n);
  betradarToFixture.set(n, fid);
}

function linesForFixture(fixtureId) {
  if (v5State.has(fixtureId)) {
    return hctgLinesFromV5State(v5State.get(fixtureId), catalog);
  }
  const blob = v4Odds.get(fixtureId);
  if (!blob) return [];
  const markets =
    blob?.[BOOKMAKER_SLUG]?.markets ??
    blob?.betano?.markets ??
    blob?.markets;
  return extractHctgLinesFromBookmakerMarkets(markets, catalog);
}

async function loadMercadoQueue() {
  const { data, error } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id,home,away,live_score,resultado,betano_url")
    .eq("is_live", true)
    .in("resultado", ["watching", "pending"]);
  if (error) throw error;

  const eventIds = (data ?? []).map((r) => String(r.event_id));
  /** @type {Map<string, string|null>} event → betradar */
  const brByEvent = new Map();
  if (eventIds.length) {
    const { data: hist } = await supabase
      .from("futebol_historico_jogos")
      .select("event_id,betradar_match_id")
      .in("event_id", eventIds);
    for (const h of hist ?? []) {
      brByEvent.set(String(h.event_id), h.betradar_match_id != null ? String(h.betradar_match_id) : null);
    }
  }

  return (data ?? []).map((r) => ({
    event_id: String(r.event_id),
    home: r.home,
    away: r.away,
    live_score: r.live_score,
    betradar_id: brByEvent.get(String(r.event_id)) ?? null,
  }));
}

function goalsFromScore(score) {
  if (!score || typeof score !== "string") return 0;
  const m = score.match(/(\d+)\s*[-:x]\s*(\d+)/i);
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]);
}

async function flushToSupabase() {
  const queue = await loadMercadoQueue();
  let updated = 0;
  let missingMap = 0;
  let missingOdds = 0;

  for (const row of queue) {
    if (!row.betradar_id) {
      missingMap += 1;
      continue;
    }
    const br = Number(row.betradar_id);
    const fixtureId = betradarToFixture.get(br);
    if (!fixtureId) {
      missingMap += 1;
      continue;
    }
    const goalsTotal = goalsFromScore(row.live_score);
    const lines = trimLinesNearScore(linesForFixture(fixtureId), goalsTotal, 3);
    if (!lines.length) {
      missingOdds += 1;
      continue;
    }
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("futebol_mercado_gols_05")
      .update({
        hctg_lines: lines,
        hctg_source: "oddspapi-ws",
        hctg_fetched_at: nowIso,
        updated_at: nowIso,
      })
      .eq("event_id", row.event_id)
      .in("resultado", ["watching", "pending"]);
    if (!error) {
      updated += 1;
      console.log(
        `[flush] ${row.home} x ${row.away} | ${row.live_score} |`,
        lines.map((l) => `+${l.line}(${l.over})`).join(" "),
      );
    }
  }

  console.log(
    `[flush] updated=${updated} missingMap=${missingMap} missingOdds=${missingOdds} ` +
      `fixturesTracked=${fixtureBetradar.size}`,
  );
}

function handleV5Message(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.type === "login_ok") {
    console.log("[ws] login_ok", msg.access ?? "");
    return;
  }
  if (msg.type === "login_error" || msg.type === "error") {
    console.error("[ws] error", JSON.stringify(msg).slice(0, 400));
    return;
  }
  if (msg.channel === "fixtures" && msg.payload) {
    const p = msg.payload;
    rememberBetradar(p.fixtureId, p.betradarId ?? p.externalProviders?.betradarId);
    return;
  }
  if (msg.channel === "odds" && msg.payload) {
    applyV5OddsUpdate(v5State, msg.payload);
    rememberBetradar(msg.payload.fixtureId, msg.payload.betradarId);
  }
}

function handleV4Message(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  rememberBetradar(msg.fixtureId, msg.betradarId);
  if (msg.bookmakerOdds && msg.fixtureId) {
    const odds = msg.bookmakerOdds;
    if (odds[BOOKMAKER_SLUG] || odds.betano) {
      v4Odds.set(String(msg.fixtureId), odds);
    }
  }
}

function connectOnce() {
  return new Promise((resolve, reject) => {
    const tryV5 = () => {
      const ws = new WebSocket(ODDSPAPI_WS_V5);
      let done = false;
      const failTimer = setTimeout(() => {
        if (!done) {
          done = true;
          try {
            ws.close();
          } catch {
            /* */
          }
          console.warn("[ws] v5 timeout → v4");
          tryV4();
        }
      }, 12000);

      ws.on("open", () => {
        ws.send(JSON.stringify({
          type: "login",
          apiKey,
          receiveType: "json",
          channels: ["odds", "fixtures"],
          sportIds: [SOCCER_SPORT_ID],
          bookmakers: [BOOKMAKER_SLUG, "betano"],
        }));
      });
      ws.on("message", (data) => {
        handleV5Message(data);
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === "login_ok" && !done) {
            done = true;
            clearTimeout(failTimer);
            resolve({ ws, version: "v5" });
          }
          if ((msg.type === "login_error" || msg.type === "error") && !done) {
            done = true;
            clearTimeout(failTimer);
            try {
              ws.close();
            } catch {
              /* */
            }
            console.warn("[ws] v5 login falhou → v4");
            tryV4();
          }
        } catch {
          /* */
        }
      });
      ws.on("error", () => {
        if (!done) {
          done = true;
          clearTimeout(failTimer);
          tryV4();
        }
      });
    };

    const tryV4 = () => {
      const url = `${ODDSPAPI_WS_V4}?apiKey=${encodeURIComponent(apiKey)}`;
      const ws = new WebSocket(url);
      ws.on("open", () => resolve({ ws, version: "v4" }));
      ws.on("message", handleV4Message);
      ws.on("error", (err) => reject(err));
    };

    tryV5();
  });
}

async function mainLoop() {
  for (;;) {
    try {
      const { ws, version } = await connectOnce();
      console.log(`[ws] conectado ${version}`);
      const flushTimer = setInterval(() => {
        flushToSupabase().catch((e) => console.error("[flush]", e.message));
      }, FLUSH_MS);

      await new Promise((resolve) => {
        ws.on("close", () => {
          clearInterval(flushTimer);
          console.warn("[ws] closed");
          resolve();
        });
        ws.on("error", (err) => {
          console.error("[ws] error", err.message);
        });
      });
    } catch (err) {
      console.error("[ws] connect fail", err.message);
    }
    console.log(`[ws] reconnect em ${RECONNECT_MS}ms`);
    await new Promise((r) => setTimeout(r, RECONNECT_MS));
  }
}

mainLoop();

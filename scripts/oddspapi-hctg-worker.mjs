/**
 * Worker HCTG via OddsPapi → grava hctg_lines no Supabase.
 *
 * Plano atual do usuario:
 *   - REST `bookmaker=betano` OK (varias linhas Over/Under)
 *   - `betano.bet.br` RESTRICTED
 *   - WebSocket: apiKey inactive / 403 (sem B2B)
 *
 * Por isso o modo padrao e POLLING REST (nao WebSocket).
 *
 * Requer no .env:
 *   ODDSPAPI_API_KEY
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   cd scripts
 *   node oddspapi-hctg-worker.mjs
 *
 * Opcional:
 *   ODDSPAPI_BOOKMAKER=betano
 *   ODDSPAPI_POLL_SEC=90
 *   ODDSPAPI_MODE=rest|ws|auto   (default rest)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  BOOKMAKER_SLUG,
  extractHctgLinesFromBookmakerMarkets,
  fetchBetanoOddsByTournaments,
  indexFixturesByBetradar,
  listLiveSoccerTournaments,
  loadTotalsMarketCatalog,
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

const POLL_SEC = Math.max(30, Number(process.env.ODDSPAPI_POLL_SEC || "90") || 90);
const MODE = (process.env.ODDSPAPI_MODE || "rest").toLowerCase();

const supabase = createClient(supabaseUrl, serviceKey);
console.log(`[oddspapi] bookmaker=${BOOKMAKER_SLUG} mode=${MODE} poll=${POLL_SEC}s`);

const catalog = await loadTotalsMarketCatalog(apiKey);
console.log(`[oddspapi] catalogo totals: ${catalog.size} mercados`);
if (!catalog.size) {
  console.error("Catalogo vazio — abortando.");
  process.exit(1);
}

function goalsFromScore(score) {
  if (!score || typeof score !== "string") return 0;
  const m = score.match(/(\d+)\s*[-:x]\s*(\d+)/i);
  if (!m) return 0;
  return Number(m[1]) + Number(m[2]);
}

async function loadMercadoQueue() {
  const { data, error } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id,home,away,live_score,resultado")
    .eq("is_live", true)
    .in("resultado", ["watching", "pending"]);
  if (error) throw error;

  const eventIds = (data ?? []).map((r) => String(r.event_id));
  /** @type {Map<string, string|null>} */
  const brByEvent = new Map();
  if (eventIds.length) {
    const { data: hist } = await supabase
      .from("futebol_historico_jogos")
      .select("event_id,betradar_match_id")
      .in("event_id", eventIds);
    for (const h of hist ?? []) {
      brByEvent.set(
        String(h.event_id),
        h.betradar_match_id != null ? String(h.betradar_match_id) : null,
      );
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

async function persistLines(eventId, lines) {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("futebol_mercado_gols_05")
    .update({
      hctg_lines: lines,
      hctg_source: "oddspapi-rest",
      hctg_fetched_at: nowIso,
      updated_at: nowIso,
    })
    .eq("event_id", eventId)
    .in("resultado", ["watching", "pending"]);
  return !error;
}

async function pollOnce() {
  const queue = await loadMercadoQueue();
  console.log(`[poll] mercado watching/pending: ${queue.length}`);
  if (!queue.length) return;

  const liveTournaments = await listLiveSoccerTournaments(apiKey);
  const tournamentIds = liveTournaments.map((t) => t.tournamentId).filter(Boolean);
  console.log(`[poll] torneios live: ${tournamentIds.length}`);
  if (!tournamentIds.length) {
    console.warn("[poll] nenhum torneio live na OddsPapi agora");
    return;
  }

  const fixtures = await fetchBetanoOddsByTournaments(apiKey, tournamentIds);
  const byBr = indexFixturesByBetradar(fixtures, BOOKMAKER_SLUG);
  console.log(`[poll] fixtures Betano com markets: ${byBr.size}`);

  let updated = 0;
  let missingMap = 0;
  let missingOdds = 0;

  for (const row of queue) {
    if (!row.betradar_id) {
      missingMap += 1;
      continue;
    }
    const fixture = byBr.get(String(row.betradar_id));
    if (!fixture) {
      missingMap += 1;
      continue;
    }
    const markets =
      fixture.bookmakerOdds?.[BOOKMAKER_SLUG]?.markets ??
      fixture.bookmakerOdds?.betano?.markets;
    const goalsTotal = goalsFromScore(row.live_score);
    const lines = trimLinesNearScore(
      extractHctgLinesFromBookmakerMarkets(markets, catalog),
      goalsTotal,
      3,
    );
    if (!lines.length) {
      missingOdds += 1;
      continue;
    }
    const ok = await persistLines(row.event_id, lines);
    if (ok) {
      updated += 1;
      console.log(
        `[ok] ${row.home} x ${row.away} | ${row.live_score} |`,
        lines.map((l) => `+${l.line}(${l.over})`).join(" "),
      );
    }
  }

  console.log(
    `[poll] updated=${updated} missingMap=${missingMap} missingOdds=${missingOdds}`,
  );
}

async function main() {
  if (MODE === "ws") {
    console.error(
      "WebSocket nao disponivel neste plano (apiKey inactive / 403). Use ODDSPAPI_MODE=rest",
    );
    process.exit(1);
  }

  for (;;) {
    const started = Date.now();
    try {
      await pollOnce();
    } catch (err) {
      console.error("[poll] erro:", err.message || err);
    }
    const elapsed = Date.now() - started;
    const wait = Math.max(5000, POLL_SEC * 1000 - elapsed);
    console.log(`[poll] proximo ciclo em ${Math.round(wait / 1000)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

main();

/**
 * Simula appendMercadoElevatedOddsLog para jogos watching (debug Estratégia +0,5).
 * Escreve NDJSON em debug-8438b2.log e atualiza elevated_odds_log no Supabase.
 */
import { readFileSync, appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "debug-8438b2.log");

for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

function dbg(payload) {
  appendFileSync(logPath, JSON.stringify({ sessionId: "8438b2", ...payload, timestamp: Date.now() }) + "\n");
}

function goalsTotalFromScoreText(score) {
  const m = String(score ?? "").match(/(\d+)\s*[-:x]\s*(\d+)/i);
  if (!m) return 0;
  return parseInt(m[1], 10) + parseInt(m[2], 10);
}

function minHctgOverLine(lines) {
  const overs = lines.filter((l) => l.over != null).map((l) => l.line);
  return overs.length ? Math.min(...overs) : null;
}

function needLineOverFromHctg(lines, goalsTotal) {
  const needLine = goalsTotal + 0.5;
  const hit = lines.find((l) =>
    Math.abs(l.line - needLine) < 0.01 && l.over != null && l.over >= 1.01
  );
  return hit ? { line: hit.line, odd: hit.over } : null;
}

function collectHctgMinOverForLog(lines, goalsTotal) {
  const needHit = needLineOverFromHctg(lines, goalsTotal);
  if (needHit) return { ...needHit, remaining: 0.5 };
  const minLine = minHctgOverLine(lines);
  if (minLine == null) return null;
  const hit = lines.find((l) => l.over != null && Math.abs(l.line - minLine) < 0.01);
  if (!hit?.over) return null;
  return { line: minLine, odd: hit.over, remaining: Math.round((minLine - goalsTotal) * 10) / 10 };
}

function parseElevatedOddsLog(raw) {
  return Array.isArray(raw) ? raw : [];
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: rows } = await sb
  .from("futebol_mercado_gols_05")
  .select("event_id,home,away,elevated_odds_log,hctg_lines,live_score,last_minute,resultado")
  .eq("resultado", "watching")
  .limit(10);

dbg({ location: "test-estrategia-05-elevated-log.mjs", message: "start", hypothesisId: "H1", data: { count: rows?.length ?? 0 } });

let updated = 0;
for (const row of rows ?? []) {
  const lines = Array.isArray(row.hctg_lines) ? row.hctg_lines : [];
  if (!lines.length) continue;
  const goalsTotal = goalsTotalFromScoreText(row.live_score);
  const snapshot = collectHctgMinOverForLog(lines, goalsTotal);
  dbg({
    location: "test-estrategia-05-elevated-log.mjs",
    message: snapshot ? "snapshot" : "skip no snapshot",
    hypothesisId: "H1",
    data: { eventId: row.event_id, match: `${row.home} x ${row.away}`, goalsTotal, snapshot, prevLog: parseElevatedOddsLog(row.elevated_odds_log).length },
  });
  if (!snapshot) continue;

  const log = parseElevatedOddsLog(row.elevated_odds_log);
  const last = log[log.length - 1];
  if (last && Math.abs(last.line - snapshot.line) < 0.01) continue;

  const nowIso = new Date().toISOString();
  log.push({
    at: nowIso,
    minute: row.last_minute,
    score: row.live_score ?? "—",
    line: snapshot.line,
    odd: snapshot.odd,
    remaining: snapshot.remaining,
  });

  const { error } = await sb.from("futebol_mercado_gols_05").update({
    elevated_odds_log: log,
    updated_at: nowIso,
  }).eq("event_id", row.event_id);

  dbg({
    location: "test-estrategia-05-elevated-log.mjs",
    message: error ? "update error" : "updated",
    hypothesisId: "H1",
    data: { eventId: row.event_id, logLen: log.length, error: error?.message ?? null },
  });
  if (!error) updated += 1;
}

console.log(`Updated ${updated} watching rows. Log: ${logPath}`);
dbg({ location: "test-estrategia-05-elevated-log.mjs", message: "done", hypothesisId: "H1", data: { updated } });

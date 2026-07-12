#!/usr/bin/env node
/**
 * Smoke / versão de teste — Favorito 1X2 + print do odd inicial.
 *
 * Uso (na pasta scripts, com .env na raiz):
 *   node test-favorito-smoke.mjs                 # checklist (somente leitura)
 *   node test-favorito-smoke.mjs --coleta on     # liga futebol_live_coleta_config
 *   node test-favorito-smoke.mjs --coleta off
 *   node test-favorito-smoke.mjs --capture       # print do 1º watching sem screenshot
 *   node test-favorito-smoke.mjs --capture 8849… # print de um event_id
 *   node test-favorito-smoke.mjs --cleanup-shots # apaga prints de linhas settled (orfãos)
 *
 * Requer: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 * Capture: Playwright Chromium (mesmo do worker HCTG)
 */
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchFavoritoScreenshotPending,
  runFavoritoScreenshotOnce,
} from "./lib/favorito-odd-screenshot.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUCKET = "betano-screenshot-debug";

function loadDotEnv() {
  const envPath = join(__dirname, "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("Falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env");
    process.exit(2);
  }
  return createClient(url, key);
}

function parseArgs(argv) {
  const out = { coleta: null, capture: false, captureId: null, cleanupShots: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--coleta") {
      out.coleta = String(argv[++i] || "").toLowerCase();
    } else if (a === "--capture") {
      out.capture = true;
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        out.captureId = String(next);
        i += 1;
      }
    } else if (a === "--cleanup-shots") {
      out.cleanupShots = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    }
  }
  return out;
}

function fmt(v) {
  if (v == null) return "—";
  return String(v);
}

async function printChecklist(supabase) {
  console.log("\n=== Favorito 1X2 — checklist de teste ===\n");

  const { data: coleta } = await supabase
    .from("futebol_live_coleta_config")
    .select("ativo,last_run_at,data_atualizacao")
    .eq("id", "default")
    .maybeSingle();

  const ativo = coleta?.ativo === true;
  console.log(`1) Coleta (Edge+worker): ${ativo ? "LIGADA" : "PAUSADA"}`);
  console.log(`   last_run_at: ${fmt(coleta?.last_run_at)}`);
  if (!ativo) {
    console.log("   → Ligue no painel ou: node test-favorito-smoke.mjs --coleta on");
  }

  const { data: watching, error: wErr } = await supabase
    .from("futebol_favorito_drift")
    .select(
      "event_id,home,away,favorito_nome,odd_inicial,minuto_inicial,odd_max,screenshot_url,screenshot_path,first_seen_at,betano_url",
    )
    .eq("status", "watching")
    .order("first_seen_at", { ascending: false })
    .limit(30);
  if (wErr) throw wErr;

  const withShot = (watching ?? []).filter((r) => r.screenshot_url);
  const pending = (watching ?? []).filter((r) => !r.screenshot_url);

  console.log(`\n2) Watching: ${watching?.length ?? 0}  |  print OK: ${withShot.length}  |  print pendente: ${pending.length}`);
  for (const r of watching ?? []) {
    const shot = r.screenshot_url ? "PRINT_OK" : "PENDENTE";
    console.log(
      `   [${shot}] ${r.event_id}  ${r.home} x ${r.away}  fav=${r.favorito_nome}  ini=${r.odd_inicial}  min=${fmt(r.minuto_inicial)}'  max=${r.odd_max}`,
    );
    if (r.screenshot_url) console.log(`            ${r.screenshot_url}`);
  }

  const { data: settled } = await supabase
    .from("futebol_favorito_drift")
    .select("event_id,favorito_venceu,screenshot_url,settled_at")
    .eq("status", "settled")
    .order("settled_at", { ascending: false })
    .limit(10);

  const settledWithShot = (settled ?? []).filter((r) => r.screenshot_url);
  console.log(`\n3) Settled recentes: ${settled?.length ?? 0} (amostra)`);
  console.log(`   Com print ainda (deveria ser 0 apos settle): ${settledWithShot.length}`);
  for (const r of settled ?? []) {
    const v =
      r.favorito_venceu === true ? "venceu" : r.favorito_venceu === false ? "perdeu" : "empate/?";
    console.log(`   ${r.event_id}  ${v}  shot=${r.screenshot_url ? "AINDA_TEM" : "limpo"}`);
  }

  console.log("\n4) Como testar o print:");
  console.log("   node test-favorito-smoke.mjs --capture");
  console.log("   (ou deixe o worker Kubmix/local com coleta LIGADA capturar sozinho)\n");

  const openMax = process.env.FAVORITO_OPEN_MAX_MINUTE || "(Edge default 5)";
  console.log(`5) Abertura de amostra: minuto ≤ FAVORITO_OPEN_MAX_MINUTE=${openMax}`);
  console.log("   Secret Edge: supabase secrets set FAVORITO_OPEN_MAX_MINUTE=90  (só teste)\n");

  return { ativo, watching: watching ?? [], pending, withShot };
}

async function setColeta(supabase, on) {
  const ativo = on === "on" || on === "1" || on === "true";
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("futebol_live_coleta_config")
    .update({ ativo, data_atualizacao: now })
    .eq("id", "default");
  if (error) throw error;
  console.log(`Coleta ${ativo ? "LIGADA" : "PAUSADA"} (data_atualizacao=${now})`);
}

async function captureOne(supabase, eventId) {
  let id = eventId;
  if (!id) {
    const pending = await fetchFavoritoScreenshotPending(1);
    if (!pending.length) {
      console.log("Nenhum watching sem print. Abra um favorito (Edge) primeiro.");
      return 1;
    }
    id = pending[0].event_id;
    console.log(`Capturando pendente: ${id} ${pending[0].home} x ${pending[0].away}`);
  } else {
    console.log(`Capturando event_id=${id}`);
  }

  const result = await runFavoritoScreenshotOnce(id);
  if (!result) {
    console.error("Falha: screenshot nao gravado (splash/redirect/slug).");
    return 1;
  }
  console.log("OK path:", result.path);
  console.log("OK url:", result.url);

  // Releitura BD
  const { data } = await supabase
    .from("futebol_favorito_drift")
    .select("event_id,screenshot_url,screenshot_path,screenshot_captured_at")
    .eq("event_id", String(id))
    .maybeSingle();
  console.log("BD:", data);
  return 0;
}

async function cleanupSettledShots(supabase) {
  const { data: rows, error } = await supabase
    .from("futebol_favorito_drift")
    .select("event_id,screenshot_path")
    .eq("status", "settled")
    .not("screenshot_path", "is", null);
  if (error) throw error;
  if (!rows?.length) {
    console.log("Nenhum settled com screenshot_path — nada a limpar.");
    return 0;
  }
  let n = 0;
  for (const row of rows) {
    const path = String(row.screenshot_path);
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([path]);
    if (rmErr) console.warn(`storage remove ${path}:`, rmErr.message);
    await supabase
      .from("futebol_favorito_drift")
      .update({
        screenshot_path: null,
        screenshot_url: null,
        screenshot_captured_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", row.event_id);
    n += 1;
    console.log(`limpo ${row.event_id} ${path}`);
  }
  console.log(`Cleanup: ${n} arquivo(s).`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Uso:
  node test-favorito-smoke.mjs
  node test-favorito-smoke.mjs --coleta on|off
  node test-favorito-smoke.mjs --capture [eventId]
  node test-favorito-smoke.mjs --cleanup-shots`);
    process.exit(0);
  }

  const supabase = supabaseAdmin();

  if (args.coleta === "on" || args.coleta === "off") {
    await setColeta(supabase, args.coleta);
  } else if (args.coleta != null) {
    console.error("--coleta precisa ser on|off");
    process.exit(2);
  }

  if (args.cleanupShots) {
    process.exit(await cleanupSettledShots(supabase));
  }

  if (args.capture) {
    process.exit(await captureOne(supabase, args.captureId));
  }

  await printChecklist(supabase);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

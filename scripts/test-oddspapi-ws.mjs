/**
 * Teste OddsPapi WebSocket — Total de Gols Betano BR.
 *
 * Uso:
 *   cd scripts
 *   # no .env da raiz: ODDSPAPI_API_KEY=...
 *   node test-oddspapi-ws.mjs
 *   node test-oddspapi-ws.mjs --betradar 12345678
 *   node test-oddspapi-ws.mjs --seconds 45
 *
 * Tenta v5 (login JSON) e, se falhar, v4 (query apiKey).
 * Nao grava no Supabase — so imprime no console para validar odds.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import {
  applyV5OddsUpdate,
  BOOKMAKER_SLUG,
  extractHctgLinesFromBookmakerMarkets,
  hctgLinesFromV5State,
  loadTotalsMarketCatalog,
  ODDSPAPI_REST,
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
if (!apiKey) {
  console.error("Defina ODDSPAPI_API_KEY no .env (raiz do projeto).");
  process.exit(1);
}

const args = process.argv.slice(2);
const secondsIdx = args.indexOf("--seconds");
const seconds = secondsIdx >= 0 ? Number(args[secondsIdx + 1]) || 30 : 30;
const brIdx = args.indexOf("--betradar");
const filterBetradar = brIdx >= 0 ? String(args[brIdx + 1] || "") : "";

console.log("Carregando catalogo de mercados totals...");
const catalog = await loadTotalsMarketCatalog(apiKey);
console.log(`Catalogo: ${catalog.size} mercados Over/Under fulltime (.5)`);
if (catalog.size === 0) {
  console.error("Nenhum mercado totals no catalogo — verifique o plano/API key.");
  process.exit(1);
}
const sampleHc = [...catalog.values()].slice(0, 8).map((m) => m.handicap);
console.log("Handicaps amostra:", sampleHc.join(", "));

/** @type {Map<string, Map<string, object>>} */
const v5State = new Map();
/** @type {Map<string, object>} fixtureId → last v4 bookmakerOdds blob */
const v4Odds = new Map();
/** @type {Map<string, number>} fixtureId → betradarId */
const fixtureBetradar = new Map();

function printSummary(label) {
  console.log(`\n=== ${label} ===`);
  const fixtureIds = new Set([...v5State.keys(), ...v4Odds.keys()]);
  if (!fixtureIds.size) {
    console.log("(nenhum update de odds ainda)");
    return;
  }
  let shown = 0;
  for (const fid of fixtureIds) {
    if (filterBetradar) {
      const br = fixtureBetradar.get(fid);
      if (br != null && String(br) !== filterBetradar) continue;
    }
    let lines = [];
    if (v5State.has(fid)) {
      lines = hctgLinesFromV5State(v5State.get(fid), catalog);
    }
    if (!lines.length && v4Odds.has(fid)) {
      const blob = v4Odds.get(fid);
      const markets =
        blob?.[BOOKMAKER_SLUG]?.markets ??
        blob?.betano?.markets ??
        blob?.markets;
      lines = extractHctgLinesFromBookmakerMarkets(markets, catalog);
    }
    const trimmed = trimLinesNearScore(lines, 0, 5);
    const br = fixtureBetradar.get(fid) ?? "?";
    console.log(
      `${fid} betradar=${br} lines=${trimmed.length}`,
      trimmed.map((l) => `+${l.line}(${l.over ?? "—"}/${l.under ?? "—"})`).join(" "),
    );
    shown += 1;
    if (shown >= 12) break;
  }
  if (!shown) console.log("(nenhum fixture bateu o filtro)");
}

function handleV4Message(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.fixtureId && msg.betradarId != null) {
    fixtureBetradar.set(String(msg.fixtureId), Number(msg.betradarId));
  }
  const odds = msg.bookmakerOdds;
  if (!odds || !msg.fixtureId) return;
  const hasBetano = odds[BOOKMAKER_SLUG] || odds.betano;
  if (!hasBetano) return;
  v4Odds.set(String(msg.fixtureId), odds);
}

function handleV5Message(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.type === "login_ok" || msg.type === "login_error" || msg.type === "error") {
    console.log("[v5 control]", msg.type, JSON.stringify(msg).slice(0, 300));
    return;
  }
  if (msg.channel === "fixtures" && msg.payload) {
    const p = msg.payload;
    const fid = String(p.fixtureId ?? "");
    const br = p.betradarId ?? p.externalProviders?.betradarId;
    if (fid && br != null) fixtureBetradar.set(fid, Number(br));
    return;
  }
  if (msg.channel === "odds" && msg.payload) {
    applyV5OddsUpdate(v5State, msg.payload);
  }
}

function connectV5() {
  return new Promise((resolve, reject) => {
    console.log("\nConectando v5:", ODDSPAPI_WS_V5);
    const ws = new WebSocket(ODDSPAPI_WS_V5);
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          /* */
        }
        reject(new Error("v5 timeout sem login_ok"));
      }
    }, 15000);

    ws.on("open", () => {
      const login = {
        type: "login",
        apiKey,
        receiveType: "json",
        channels: ["odds", "fixtures"],
        sportIds: [SOCCER_SPORT_ID],
        bookmakers: [BOOKMAKER_SLUG, "betano"],
      };
      ws.send(JSON.stringify(login));
      console.log("login v5 enviado (soccer + betano.bet.br)");
    });

    ws.on("message", (data) => {
      handleV5Message(data);
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "login_ok" && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(ws);
        }
        if ((msg.type === "login_error" || msg.type === "error") && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`v5 ${msg.type}: ${JSON.stringify(msg).slice(0, 200)}`));
        }
      } catch {
        /* */
      }
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("v5 closed before login_ok"));
      }
    });
  });
}

function connectV4() {
  return new Promise((resolve, reject) => {
    const url = `${ODDSPAPI_WS_V4}?apiKey=${encodeURIComponent(apiKey)}`;
    console.log("\nConectando v4:", ODDSPAPI_WS_V4);
    const ws = new WebSocket(url);
    let opened = false;
    const timer = setTimeout(() => {
      if (!opened) {
        try {
          ws.close();
        } catch {
          /* */
        }
        reject(new Error("v4 timeout"));
      }
    }, 15000);

    ws.on("open", () => {
      opened = true;
      clearTimeout(timer);
      console.log("v4 aberto (stream one-way)");
      resolve(ws);
    });
    ws.on("message", handleV4Message);
    ws.on("error", (err) => {
      if (!opened) {
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

// Smoke REST: um GET odds com bookmaker (gasta 1 credito)
async function smokeRest() {
  const url =
    `${ODDSPAPI_REST}/odds-by-tournaments?bookmaker=${encodeURIComponent(BOOKMAKER_SLUG)}` +
    `&sportId=${SOCCER_SPORT_ID}&apiKey=${encodeURIComponent(apiKey)}`;
  console.log("\nSmoke REST odds-by-tournaments (pode falhar se plano nao incluir)...");
  try {
    const res = await fetch(url);
    console.log("REST status", res.status);
    if (!res.ok) {
      console.log((await res.text()).slice(0, 300));
      return;
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.data ?? [];
    console.log("fixtures:", list.length);
    const withOdds = list.filter((f) => f.bookmakerOdds?.[BOOKMAKER_SLUG] || f.bookmakerOdds?.betano);
    console.log("com Betano BR:", withOdds.length);
    for (const f of withOdds.slice(0, 3)) {
      const markets =
        f.bookmakerOdds?.[BOOKMAKER_SLUG]?.markets ??
        f.bookmakerOdds?.betano?.markets;
      const lines = extractHctgLinesFromBookmakerMarkets(markets, catalog);
      const br = f.externalProviders?.betradarId ?? f.betradarId;
      console.log(
        f.fixtureId,
        "betradar",
        br,
        trimLinesNearScore(lines, 0, 5)
          .map((l) => `+${l.line}(${l.over})`)
          .join(" "),
      );
    }
  } catch (err) {
    console.log("REST smoke erro:", err.message);
  }
}

await smokeRest();

let ws;
try {
  ws = await connectV5();
} catch (err) {
  console.warn("v5 falhou:", err.message);
  console.warn("Tentando v4 (plano B2B / contato OddsPapi)...");
  try {
    ws = await connectV4();
  } catch (err2) {
    console.error("v4 tambem falhou:", err2.message);
    console.error(
      "\nProvavel: WebSocket so no plano B2B. Confirme no painel OddsPapi se live WS esta ativo.",
    );
    process.exit(1);
  }
}

const interval = setInterval(() => printSummary("parcial"), 10000);
setTimeout(() => {
  clearInterval(interval);
  printSummary("final");
  try {
    ws.close();
  } catch {
    /* */
  }
  process.exit(0);
}, seconds * 1000);

console.log(`Escutando ${seconds}s... (Ctrl+C para parar)`);

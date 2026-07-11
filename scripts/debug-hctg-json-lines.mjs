/**
 * Debug: quantas linhas HCTG o JSON Betano traz (global / eventId / markets-offers).
 * Uso: node debug-hctg-json-lines.mjs [eventId]
 */
import {
  extractMatchTotalGoalsLines,
  isMatchTotalGoalsHctgMarket,
} from "./lib/betano-hctg-json.mjs";

const BETANO = "https://www.betano.bet.br";
const OVERVIEW =
  `${BETANO}/danae-webapi/api/live/overview/latest` +
  `?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8`;

const eventId = process.argv[2] || "88623254";
const headers = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${BETANO}/live/`,
  "Accept-Language": "pt-BR,pt;q=0.9",
  Origin: BETANO,
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  console.log(`HTTP ${res.status} ${url.slice(0, 100)}`);
  if (!res.ok) {
    const t = await res.text();
    console.log(t.slice(0, 200));
    return null;
  }
  return res.json();
}

function eventOf(data) {
  if (!data?.events) return null;
  return data.events[eventId] ?? data.events[Number(eventId)] ?? null;
}

function listHctgMarkets(data, label) {
  if (!data) return;
  const markets = data.markets ?? {};
  const ev = eventOf(data);
  const midList = new Set((ev?.marketIdList ?? []).map(String));
  const hits = [];
  for (const [mid, m] of Object.entries(markets)) {
    if (!m || !isMatchTotalGoalsHctgMarket(m)) continue;
    hits.push({
      mid,
      name: String(m.name ?? ""),
      inList: midList.has(mid),
      eventId: String(m.eventId ?? m.eventID ?? ""),
      selections: (m.selectionIdList ?? []).length,
    });
  }
  console.log(`\n${label}: ${hits.length} mercado(s) HCTG validado(s)`);
  for (const h of hits) console.log(h);
}

function countOverSelections(data, label) {
  if (!data?.selections) return;
  const lines = new Set();
  let overs = 0;
  for (const sel of Object.values(data.selections)) {
    const n = String(sel?.name ?? "").toLowerCase();
    if (!n.includes("mais") && !n.includes("over")) continue;
    const m = n.match(/(\d+[.,]\d+|\d+)/);
    if (!m) continue;
    const line = parseFloat(m[1].replace(",", "."));
    if (line >= 0.5 && line <= 25) {
      overs += 1;
      lines.add(line);
    }
  }
  console.log(
    `${label}: ${overs} seleções Over, linhas únicas:`,
    [...lines].sort((a, b) => a - b),
  );
}

function walkOffersHctg(node, depth = 0, found = []) {
  if (depth > 14 || node == null) return found;
  if (Array.isArray(node)) {
    for (const item of node) walkOffersHctg(item, depth + 1, found);
    return found;
  }
  if (typeof node !== "object") return found;
  const type = String(node.type ?? "");
  const name = String(node.name ?? "");
  if (type === "HCTG" || /total de gols/i.test(name)) {
    const sels = Array.isArray(node.selections) ? node.selections.length : 0;
    found.push({ type, name, selections: sels });
  }
  for (const v of Object.values(node)) walkOffersHctg(v, depth + 1, found);
  return found;
}

const global = await fetchJson(OVERVIEW);
const scoped = await fetchJson(`${OVERVIEW}&eventId=${encodeURIComponent(eventId)}`);
const offers = await fetchJson(`${BETANO}/api/event/markets-offers/${eventId}`);
const liveEvent = await fetchJson(
  `${BETANO}/danae-webapi/api/live/events/${eventId}?queryLanguageId=5&queryOperatorId=8`,
);

for (const [label, data] of [
  ["global", global],
  ["scoped", scoped],
  ["live/events", liveEvent],
]) {
  listHctgMarkets(data, label);
  countOverSelections(data, label);
  const ev = eventOf(data) ?? data?.event ?? data;
  if (ev && data?.markets) {
    const goalsTotal = 1;
    const snap = extractMatchTotalGoalsLines(eventId, ev, data, goalsTotal);
    console.log(`${label} extractMatchTotalGoalsLines:`, snap.lines);
  }
}

if (offers) {
  const found = walkOffersHctg(offers);
  console.log(`\nmarkets-offers: ${found.length} nós HCTG/total de gols`);
  for (const f of found.slice(0, 20)) console.log(f);
}

/**
 * Fetch + parse HCTG do danae-webapi (porta simplificada de hctg-match-totals.ts).
 */

const BETANO_BASE = "https://www.betano.bet.br";
const OVERVIEW_URL =
  `${BETANO_BASE}/danae-webapi/api/live/overview/latest` +
  `?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8`;

const EXCLUDE_NAME = [
  "tempo", "half", "intervalo", "periodo", "period",
  "1o ", "2o ", "1 tempo", "2 tempo", "1°", "2°",
  "proximo", "próximo", "next goal", "qual equipe", "which team",
  "equipe", "team total", "jogador", "player",
  "escanteio", "corner", "cartao", "cartão", "card",
];

function toNum(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normName(rec) {
  return String(rec.name ?? rec.typeName ?? rec.marketType ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isMatchTotalGoalsHctgMarket(rec) {
  if (String(rec.type ?? "") !== "HCTG") return false;
  const name = normName(rec);
  if (!name.includes("total") && !name.includes("gols") && !name.includes("goals")) {
    return false;
  }
  for (const ex of EXCLUDE_NAME) {
    if (name.includes(ex)) return false;
  }
  if (name === "total de gols" || name === "total goals") return true;
  if (name.startsWith("total de gols") || name.startsWith("total goals")) {
    if (name.includes("alternativ")) return true;
    if (name.length > 18) return false;
    return true;
  }
  return false;
}

function isBettable(sel) {
  const status = String(sel.status ?? sel.tradingStatus ?? sel.state ?? "").toLowerCase();
  if (status.includes("suspend") || status.includes("closed") || status.includes("inactive")) {
    return false;
  }
  if (sel.isSuspended === true || sel.suspended === true || sel.enabled === false) {
    return false;
  }
  return true;
}

function parseLineFromName(text) {
  const t = String(text).toLowerCase();
  if (!t.includes("menos") && !t.includes("mais") && !t.includes("under") && !t.includes("over")) {
    return null;
  }
  const m = t.match(/(\d+[.,]\d+|\d+)/);
  return m ? toNum(m[1].replace(",", ".")) : null;
}

function pickOverOdd(mid, markets, selections) {
  const rec = markets[mid];
  if (!rec || !Array.isArray(rec.selectionIdList)) return null;
  for (const sid of rec.selectionIdList) {
    const sel = selections[String(sid)];
    if (!sel) continue;
    const name = String(sel.name ?? sel.shortName ?? "").toLowerCase();
    if (name.includes("mais") || name.includes("over")) {
      return toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
    }
  }
  return null;
}

function marketHandicap(mid, markets) {
  const rec = markets[mid];
  if (!rec) return null;
  return toNum(rec.handicap ?? rec.line ?? rec.points);
}

function orphanMatchesEvent(rec, eventId, zoneId) {
  const meid = String(rec.eventId ?? rec.eventID ?? "");
  if (meid && meid !== eventId) return false;
  const mz = String(rec.zoneId ?? "");
  if (zoneId && mz && mz !== zoneId && meid !== eventId) return false;
  return true;
}

function selectionSide(sel) {
  const sname = String(sel.name ?? sel.shortName ?? sel.fullName ?? "").toLowerCase();
  if (sname.includes("under") || sname.includes("menos") || sname === "below") return "under";
  if (sname.includes("over") || sname.includes("mais") || sname === "above") return "over";
  return null;
}

function collectProvenSelectionIds(event, markets) {
  const ids = new Set();
  const marketIdList = Array.isArray(event.marketIdList) ? event.marketIdList.map(String) : [];
  for (const mid of marketIdList) {
    const rec = markets[mid];
    if (!rec || !Array.isArray(rec.selectionIdList)) continue;
    for (const sid of rec.selectionIdList) ids.add(String(sid));
  }
  return ids;
}

function collectMarketIds(eventId, event, markets) {
  const marketIdList = Array.isArray(event.marketIdList) ? event.marketIdList.map(String) : [];
  const ids = [];
  for (const mid of marketIdList) {
    const rec = markets[mid];
    if (rec && isMatchTotalGoalsHctgMarket(rec)) ids.push(mid);
  }
  for (const [mid, market] of Object.entries(markets)) {
    if (marketIdList.includes(mid)) continue;
    if (!isMatchTotalGoalsHctgMarket(market)) continue;
    if (String(market.eventId ?? market.eventID ?? "") !== eventId) continue;
    ids.push(mid);
  }
  return ids;
}

function absorbSelection(sid, markets, selections, byLine) {
  const sel = selections[sid];
  if (!sel || !isBettable(sel)) return;
  const side = selectionSide(sel);
  if (!side) return;
  const mid = String(sel.marketId ?? "");
  const marketLine = mid ? marketHandicap(mid, markets) : null;
  let line = toNum(sel.handicap ?? sel.line ?? sel.points);
  if (line == null) line = parseLineFromName(String(sel.name ?? sel.shortName ?? ""));
  if (line == null) line = marketLine;
  const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
  if (line == null || price == null || price < 1.01 || price > 100) return;
  const bucket = byLine.get(line) ?? {};
  if (side === "over") bucket.over = price;
  if (side === "under") bucket.under = price;
  byLine.set(line, bucket);
}

function absorbMarket(mid, markets, selections, byLine) {
  const rec = markets[mid];
  if (!rec) return;
  const selIds = Array.isArray(rec.selectionIdList)
    ? rec.selectionIdList.map(String)
    : Object.keys(selections).filter((sid) => String(selections[sid]?.marketId ?? "") === mid);
  for (const sid of selIds) absorbSelection(sid, markets, selections, byLine);
}

function monotonicityScore(pair, byLine) {
  let score = 0;
  for (const [line, bucket] of byLine.entries()) {
    if (Math.abs(line - pair.line) < 0.01) continue;
    if (bucket.over != null) {
      if (line < pair.line && pair.over <= bucket.over) score -= 10;
      if (line > pair.line && pair.over >= bucket.over) score -= 10;
      if (line < pair.line && pair.over > bucket.over) score += 2;
      if (line > pair.line && pair.over < bucket.over) score += 2;
    }
    if (bucket.under != null && pair.under != null) {
      if (line < pair.line && pair.under <= bucket.under) score -= 5;
      if (line > pair.line && pair.under >= bucket.under) score -= 5;
    }
  }
  if (pair.under == null) score -= 3;
  return score;
}

function supplementByMonotonicity(selections, goalsTotal, byLine) {
  for (const targetLine of [goalsTotal + 0.5, goalsTotal + 1.5, goalsTotal + 2.5]) {
    const existing = byLine.get(targetLine);
    if (existing?.over != null && existing?.under != null) continue;
    const pairs = [];
    const overs = [];
    const unders = [];
    for (const sel of Object.values(selections)) {
      if (!sel || !isBettable(sel)) continue;
      const side = selectionSide(sel);
      if (!side) continue;
      let line = toNum(sel.handicap ?? sel.line ?? sel.points);
      if (line == null) line = parseLineFromName(String(sel.name ?? sel.shortName ?? ""));
      if (line == null || Math.abs(line - targetLine) > 0.01) continue;
      const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
      if (price == null || price < 1.01 || price > 100) continue;
      if (side === "over") overs.push(price);
      else unders.push(price);
    }
    for (const over of overs) {
      for (const under of unders.length ? unders : [null]) {
        pairs.push({ line: targetLine, over, under });
      }
    }
    if (!pairs.length) continue;
    pairs.sort((a, b) => {
      const scoreDiff = monotonicityScore(b, byLine) - monotonicityScore(a, byLine);
      if (scoreDiff !== 0) return scoreDiff;
      const refLines = [...byLine.keys()].filter((l) => byLine.get(l)?.over != null);
      const ref = refLines.length ? Math.min(...refLines) : targetLine;
      if (targetLine > ref) return b.over - a.over;
      if (targetLine < ref) return a.over - b.over;
      return b.over - a.over;
    });
    const best = pairs[0];
    if (monotonicityScore(best, byLine) < 0) continue;
    const bucket = byLine.get(targetLine) ?? {};
    if (bucket.over == null) bucket.over = best.over;
    if (bucket.under == null && best.under != null) bucket.under = best.under;
    byLine.set(targetLine, bucket);
  }
}

export function extractMatchTotalGoalsLines(eventId, event, overview, goalsTotal) {
  const markets = overview.markets ?? {};
  const selections = overview.selections ?? {};
  const marketIds = collectMarketIds(eventId, event, markets);
  const provenSelIds = collectProvenSelectionIds(event, markets);
  const byLine = new Map();
  for (const mid of marketIds) absorbMarket(mid, markets, selections, byLine);
  for (const sid of provenSelIds) absorbSelection(sid, markets, selections, byLine);
  supplementByMonotonicity(selections, goalsTotal, byLine);
  const lines = [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, bucket]) => ({
      line,
      over: bucket.over ?? null,
      under: bucket.under ?? null,
    }));
  return { lines, marketIds, source: "json-parser" };
}

/** Hibrido: usa selectionIds do HTML para lookup no JSON (vinculo provado). */
export function extractFromHtmlSelectionIds(selectionIds, overview) {
  const selections = overview.selections ?? {};
  const byLine = new Map();
  const used = [];

  for (const sid of selectionIds) {
    const sel = selections[String(sid)];
    if (!sel || !isBettable(sel)) continue;
    const sname = String(sel.name ?? sel.shortName ?? sel.fullName ?? "").toLowerCase();
    const isUnder = sname.includes("under") || sname.includes("menos") || sname === "below";
    const isOver = sname.includes("over") || sname.includes("mais") || sname === "above";
    if (!isUnder && !isOver) continue;
    let line = toNum(sel.handicap ?? sel.line ?? sel.points);
    if (line == null) line = parseLineFromName(sname);
    const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
    if (line == null || price == null) continue;
    const bucket = byLine.get(line) ?? {};
    if (isOver) bucket.over = price;
    if (isUnder) bucket.under = price;
    byLine.set(line, bucket);
    used.push({ selectionId: String(sid), line, side: isOver ? "over" : "under", odd: price });
  }

  const lines = [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([line, bucket]) => ({
      line,
      over: bucket.over ?? null,
      under: bucket.under ?? null,
    }));
  return { lines, used, source: "json-by-selnid" };
}

export async function fetchEventOverview(eventId, slug) {
  const referer = `${BETANO_BASE}/live/${slug}/${eventId}/`;
  const url = `${OVERVIEW_URL}&eventId=${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Referer: referer,
    },
  });
  if (!res.ok) throw new Error(`overview HTTP ${res.status}`);
  const data = await res.json();
  const event = data.events?.[eventId] ?? data.events?.[Number(eventId)];
  if (!event) throw new Error(`evento ${eventId} nao encontrado no overview`);
  const score = event.liveData?.score ?? {};
  const goalsTotal = Number(score.home ?? 0) + Number(score.away ?? 0);
  return { overview: data, event, goalsTotal, referer };
}

export function linesRoughlyEqual(a, b, tol = 0.02) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].line - b[i].line) > 0.01) return false;
    for (const side of ["over", "under"]) {
      const av = a[i][side];
      const bv = b[i][side];
      if (av == null && bv == null) continue;
      if (av == null || bv == null) return false;
      if (Math.abs(av - bv) > tol) return false;
    }
  }
  return true;
}

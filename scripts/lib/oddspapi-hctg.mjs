/**
 * OddsPapi → linhas HCTG (Total de Gols / Over-Under fulltime).
 * marketType "totals" + period fulltime/result + handicap .5
 */

export const ODDSPAPI_REST = "https://api.oddspapi.io/v4";
export const ODDSPAPI_WS_V4 = "wss://api.oddspapi.io/v4/ws";
export const ODDSPAPI_WS_V5 = "wss://v5.oddspapi.io/ws";
/** Plano free/comum: `betano`. `betano.bet.br` costuma vir RESTRICTED_ACCESS. */
export const BOOKMAKER_SLUG = process.env.ODDSPAPI_BOOKMAKER?.trim() || "betano";
export const SOCCER_SPORT_ID = 10;

/**
 * @typedef {{ line: number, over: number|null, under: number|null, marketId?: string }} HctgLine
 */

/**
 * Carrega mapa marketId → { handicap, marketType, period, overOutcomeId, underOutcomeId }
 * @param {string} apiKey
 */
export async function loadTotalsMarketCatalog(apiKey) {
  const url =
    `${ODDSPAPI_REST}/markets?sportId=${SOCCER_SPORT_ID}&language=en&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`markets HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const markets = await res.json();
  /** @type {Map<number, { handicap: number, name: string, overId: number|null, underId: number|null }>} */
  const byId = new Map();
  for (const m of markets ?? []) {
    const type = String(m.marketType ?? "").toLowerCase();
    const period = String(m.period ?? "").toLowerCase();
    const name = String(m.marketName ?? m.marketNameShort ?? "").toLowerCase();
    if (type !== "totals" && !name.includes("over under") && !name.includes("total")) {
      continue;
    }
    if (
      period &&
      period !== "fulltime" &&
      period !== "result" &&
      period !== "ft" &&
      !period.includes("full")
    ) {
      // ignora 1H / 2H / corners etc. se period vier preenchido
      if (
        period.includes("half") || period.includes("1st") || period.includes("2nd") ||
        period.includes("corner") || period.includes("card")
      ) {
        continue;
      }
    }
    if (
      name.includes("corner") || name.includes("card") || name.includes("team") ||
      name.includes("1st") || name.includes("2nd") || name.includes("half")
    ) {
      continue;
    }
    const hc = Number(m.handicap);
    if (!Number.isFinite(hc) || hc < 0.5 || hc > 12.5) continue;
    if (Math.abs(hc % 1 - 0.5) > 0.01) continue;

    let overId = null;
    let underId = null;
    for (const o of m.outcomes ?? []) {
      const on = String(o.outcomeName ?? "").toLowerCase();
      if (on === "over" || on === "o" || on.includes("over")) overId = o.outcomeId;
      if (on === "under" || on === "u" || on.includes("under")) underId = o.outcomeId;
    }
    byId.set(Number(m.marketId), {
      handicap: hc,
      name: String(m.marketName ?? ""),
      overId,
      underId,
    });
  }
  return byId;
}

/**
 * Extrai linhas Over/Under de um bloco bookmakerOdds[slug].markets
 * @param {Record<string, unknown>} marketsObj
 * @param {Map<number, { handicap: number, overId: number|null, underId: number|null }>} catalog
 * @returns {HctgLine[]}
 */
export function extractHctgLinesFromBookmakerMarkets(marketsObj, catalog) {
  /** @type {Map<number, HctgLine>} */
  const byLine = new Map();
  if (!marketsObj || typeof marketsObj !== "object") return [];

  for (const [midStr, market] of Object.entries(marketsObj)) {
    const mid = Number(midStr);
    const meta = catalog.get(mid);
    if (!meta) continue;
    const outcomes = market?.outcomes ?? {};
    let over = null;
    let under = null;

    for (const [oidStr, outcome] of Object.entries(outcomes)) {
      const oid = Number(oidStr);
      const player = outcome?.players?.["0"] ?? outcome?.players?.[0] ?? null;
      if (!player || player.active === false) continue;
      const price = Number(player.price);
      if (!Number.isFinite(price) || price < 1.01) continue;

      const bookOut = String(player.bookmakerOutcomeId ?? "").toLowerCase();
      const isOver =
        (meta.overId != null && oid === meta.overId) ||
        bookOut.includes("over") ||
        bookOut.endsWith("/over");
      const isUnder =
        (meta.underId != null && oid === meta.underId) ||
        bookOut.includes("under") ||
        bookOut.endsWith("/under");

      if (isOver) over = price;
      else if (isUnder) under = price;
    }

    if (over == null && under == null) continue;
    const line = meta.handicap;
    const prev = byLine.get(line) ?? { line, over: null, under: null, marketId: String(mid) };
    if (over != null) prev.over = over;
    if (under != null) prev.under = under;
    byLine.set(line, prev);
  }

  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/**
 * Aplica update parcial do canal odds (v5) ao estado por fixture.
 * @param {Map<string, Map<string, object>>} state fixtureId → oddsId → outcome
 * @param {object} payload
 */
export function applyV5OddsUpdate(state, payload) {
  const fixtureId = String(payload?.fixtureId ?? "");
  if (!fixtureId) return;
  if (!state.has(fixtureId)) state.set(fixtureId, new Map());
  const bucket = state.get(fixtureId);
  const odds = payload?.odds ?? {};
  for (const [bookmaker, entries] of Object.entries(odds)) {
    if (bookmaker !== BOOKMAKER_SLUG && bookmaker !== "betano") continue;
    for (const [oddsId, outcome] of Object.entries(entries ?? {})) {
      bucket.set(oddsId, { ...outcome, bookmaker });
    }
  }
}

/**
 * Converte estado v5 (mapa de outcomes) + catalog → HctgLine[]
 */
export function hctgLinesFromV5State(outcomeMap, catalog) {
  /** @type {Map<number, HctgLine>} */
  const byLine = new Map();
  for (const outcome of outcomeMap.values()) {
    if (outcome.active === false || outcome.marketActive === false) continue;
    const mid = Number(outcome.marketId);
    const meta = catalog.get(mid);
    if (!meta) continue;
    const price = Number(outcome.price);
    if (!Number.isFinite(price) || price < 1.01) continue;
    const oid = Number(outcome.outcomeId);
    const bookOut = String(outcome.bookmakerOutcomeId ?? "").toLowerCase();
    const isOver =
      (meta.overId != null && oid === meta.overId) ||
      bookOut.includes("over");
    const isUnder =
      (meta.underId != null && oid === meta.underId) ||
      bookOut.includes("under");
    if (!isOver && !isUnder) continue;
    const line = meta.handicap;
    const prev = byLine.get(line) ?? {
      line,
      over: null,
      under: null,
      marketId: String(mid),
    };
    if (isOver) prev.over = price;
    if (isUnder) prev.under = price;
    byLine.set(line, prev);
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Mantém até 3 linhas a partir do placar (need, need+1, need+2). */
export function trimLinesNearScore(lines, goalsTotal, max = 3) {
  const need = goalsTotal + 0.5;
  const cleaned = lines
    .filter((l) => l.line + 0.01 >= need && l.over != null)
    .sort((a, b) => a.line - b.line);
  const priority = [need, need + 1, need + 2];
  const picked = [];
  for (const t of priority) {
    const hit = cleaned.find((l) => Math.abs(l.line - t) < 0.01);
    if (hit && !picked.includes(hit)) picked.push(hit);
  }
  for (const l of cleaned) {
    if (picked.length >= max) break;
    if (!picked.includes(l)) picked.push(l);
  }
  return picked.sort((a, b) => a.line - b.line);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data, text };
}

/** Lista torneios de futebol com jogos ao vivo. */
export async function listLiveSoccerTournaments(apiKey) {
  const url =
    `${ODDSPAPI_REST}/tournaments?sportId=${SOCCER_SPORT_ID}` +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  const { ok, status, data, text } = await fetchJson(url);
  if (!ok) throw new Error(`tournaments HTTP ${status}: ${String(text).slice(0, 200)}`);
  const list = Array.isArray(data) ? data : data?.data ?? [];
  return list.filter((t) => Number(t.liveFixtures ?? 0) > 0);
}

/**
 * Busca odds Betano por torneios (chunks para nao estourar URL/rate limit).
 * @returns {Promise<Array<object>>}
 */
export async function fetchBetanoOddsByTournaments(apiKey, tournamentIds, opts = {}) {
  const bookmaker = opts.bookmaker || BOOKMAKER_SLUG;
  const chunkSize = Math.min(opts.chunkSize ?? 5, 5);
  const gapMs = opts.gapMs ?? 1100;
  const out = [];
  for (let i = 0; i < tournamentIds.length; i += chunkSize) {
    const chunk = tournamentIds.slice(i, i + chunkSize);
    const url =
      `${ODDSPAPI_REST}/odds-by-tournaments` +
      `?bookmaker=${encodeURIComponent(bookmaker)}` +
      `&tournamentIds=${chunk.join(",")}` +
      `&language=en&verbosity=3` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
    const { ok, status, data, text } = await fetchJson(url);
    if (status === 429) {
      await sleep(2000);
      i -= chunkSize;
      continue;
    }
    if (status === 404) {
      // chunk sem fixtures para este bookmaker
      if (i + chunkSize < tournamentIds.length) await sleep(gapMs);
      continue;
    }
    if (!ok) {
      throw new Error(`odds-by-tournaments HTTP ${status}: ${String(text).slice(0, 220)}`);
    }
    const list = Array.isArray(data) ? data : data?.data ?? [];
    out.push(...list);
    if (i + chunkSize < tournamentIds.length) await sleep(gapMs);
  }
  return out;
}

/** Indexa fixtures OddsPapi por betradarId. */
export function indexFixturesByBetradar(fixtures, bookmaker = BOOKMAKER_SLUG) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const f of fixtures ?? []) {
    const br = f?.externalProviders?.betradarId ?? f?.betradarId;
    if (br == null) continue;
    const odds = f.bookmakerOdds?.[bookmaker] ?? f.bookmakerOdds?.betano;
    if (!odds?.markets) continue;
    map.set(String(br), f);
  }
  return map;
}

/**
 * Resolve fixture OddsPapi por betradarId (REST v4 fixtures/live ou odds).
 */
export async function findFixtureByBetradarId(apiKey, betradarId) {
  const id = String(betradarId);
  const urls = [
    `${ODDSPAPI_REST}/fixtures?betradarId=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
    `${ODDSPAPI_REST}/fixture?betradarId=${encodeURIComponent(id)}&apiKey=${encodeURIComponent(apiKey)}`,
  ];
  for (const url of urls) {
    try {
      const { ok, data } = await fetchJson(url);
      if (!ok) continue;
      const list = Array.isArray(data) ? data : data?.data ?? (data?.fixtureId ? [data] : []);
      const hit = list.find((f) =>
        String(f.betradarId ?? f.externalProviders?.betradarId ?? "") === id
      );
      if (hit) return hit;
    } catch {
      // next
    }
  }
  return null;
}

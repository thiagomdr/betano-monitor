/**
 * Total de Gols (HCTG) do jogo inteiro — JSON overview?eventId= + HTML DOM (ScrapingBee).
 * Vinculo provado: marketIdList + selectionIdList + eventId no mercado.
 * Linhas faltantes: pares soltos com validacao de monotonicidade (sem odd-ancora).
 */

import { extractMatchTotalGoalsFromHtml } from "./betano-hctg-html.ts";

export type Json = Record<string, unknown>;

export type HctgLine = {
  line: number;
  over: number | null;
  under: number | null;
  selectionIds?: { over?: string; under?: string };
  marketId?: string;
};

export type HctgSnapshot = {
  lines: HctgLine[];
  source: string;
  marketIds: string[];
  selectionIds?: string[];
};

type LineBucket = {
  over?: number;
  under?: number;
  selectionIds?: { over?: string; under?: string };
  marketId?: string;
};

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalizeMarketName(rec: Json): string {
  const raw = String(rec.name ?? rec.typeName ?? rec.marketType ?? "");
  return raw.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function parseGoalLineFromSelectionName(text: string): number | null {
  const t = String(text).toLowerCase();
  if (
    !t.includes("menos") && !t.includes("mais") && !t.includes("under") &&
    !t.includes("over")
  ) {
    return null;
  }
  const m = t.match(/(\d+[.,]\d+|\d+)/);
  if (!m) return null;
  return toNum(m[1].replace(",", "."));
}

function selectionSide(sel: Json): "over" | "under" | null {
  const sname = String(sel.name ?? sel.shortName ?? sel.fullName ?? "").toLowerCase();
  if (sname.includes("under") || sname.includes("menos") || sname === "below") {
    return "under";
  }
  if (sname.includes("over") || sname.includes("mais") || sname === "above") {
    return "over";
  }
  return null;
}

function selectionLine(sel: Json, marketLine: number | null): number | null {
  let line = toNum(sel.handicap ?? sel.line ?? sel.points);
  if (line == null) {
    line = parseGoalLineFromSelectionName(
      String(sel.name ?? sel.shortName ?? sel.fullName ?? ""),
    );
  }
  if (line == null) line = marketLine;
  return line;
}

/** Mercado HCTG "Total de Gols" do jogo inteiro (nao 1 tempo, time, proximo gol). */
export function isMatchTotalGoalsHctgMarket(rec: Json): boolean {
  if (String(rec.type ?? "") !== "HCTG") return false;

  const name = normalizeMarketName(rec);

  const exclude = [
    "tempo", "half", "intervalo", "periodo", "period",
    "1o ", "2o ", "1 tempo", "2 tempo", "1°", "2°",
    "proximo", "próximo", "next goal", "qual equipe", "which team",
    "equipe", "team total", "jogador", "player",
    "escanteio", "corner", "cartao", "cartão", "card",
  ];
  for (const ex of exclude) {
    if (name.includes(ex)) return false;
  }

  // Nome vazio / generico: ainda pode ser Total de Gols (comum em offers)
  if (!name || name === "hctg") return true;

  if (name.includes("total") || name.includes("gols") || name.includes("goals")) {
    if (name.includes("alternativ")) return true;
    if (name === "total de gols" || name === "total goals") return true;
    if (name.startsWith("total de gols") || name.startsWith("total goals")) return true;
    // "gols" sozinho / "total gols" etc.
    if (!name.includes("casa") && !name.includes("fora") && !name.includes("home") &&
      !name.includes("away")) {
      return true;
    }
  }

  // Mercado HCTG sem nome descritivo mas com handicap de linha de gols
  const hc = toNum(rec.handicap ?? rec.line ?? rec.points);
  if (hc != null && hc >= 0.5 && hc <= 20.5 && Math.abs(hc % 1 - 0.5) < 0.01) {
    return true;
  }

  return false;
}

export function isSelectionBettable(sel: Json): boolean {
  const status = String(sel.status ?? sel.tradingStatus ?? sel.state ?? "").toLowerCase();
  if (status.includes("suspend") || status.includes("closed") || status.includes("inactive")) {
    return false;
  }
  if (sel.isSuspended === true || sel.suspended === true || sel.enabled === false) {
    return false;
  }
  return true;
}

function marketHandicap(mid: string, markets: Json): number | null {
  const rec = asRecord(markets[mid]);
  if (!rec) return null;
  return toNum(rec.handicap ?? rec.line ?? rec.points);
}

/** IDs de selecoes referenciadas em qualquer mercado do marketIdList do evento. */
function collectProvenSelectionIds(event: Json, markets: Json): Set<string> {
  const ids = new Set<string>();
  const marketIdList = Array.isArray(event.marketIdList)
    ? event.marketIdList.map(String)
    : [];
  for (const mid of marketIdList) {
    const rec = asRecord(markets[mid]);
    if (!rec || !Array.isArray(rec.selectionIdList)) continue;
    for (const sid of rec.selectionIdList) ids.add(String(sid));
  }
  return ids;
}

/** Mercados HCTG com eventId explicito igual ao evento. */
function collectStrictEventHctgMarketIds(
  eventId: string,
  event: Json,
  markets: Json,
): string[] {
  const marketIdList = new Set(
    Array.isArray(event.marketIdList) ? event.marketIdList.map(String) : [],
  );
  const ids: string[] = [];
  for (const [mid, market] of Object.entries(markets)) {
    if (marketIdList.has(mid)) continue;
    const rec = asRecord(market);
    if (!rec || !isMatchTotalGoalsHctgMarket(rec)) continue;
    const meid = String(rec.eventId ?? rec.eventID ?? "");
    if (meid !== eventId) continue;
    ids.push(mid);
  }
  return ids;
}

function collectEventHctgMarketIds(
  eventId: string,
  event: Json,
  markets: Json,
): string[] {
  const marketIdList = Array.isArray(event.marketIdList)
    ? event.marketIdList.map(String)
    : [];
  const ids: string[] = [];
  for (const mid of marketIdList) {
    const rec = asRecord(markets[mid]);
    if (rec && isMatchTotalGoalsHctgMarket(rec)) ids.push(mid);
  }
  for (const mid of collectStrictEventHctgMarketIds(eventId, event, markets)) {
    if (!ids.includes(mid)) ids.push(mid);
  }
  return ids;
}

function absorbSelectionIntoBucket(
  sid: string,
  markets: Json,
  selections: Json,
  byLine: Map<number, LineBucket>,
): void {
  const sel = asRecord(selections[sid]);
  if (!sel || !isSelectionBettable(sel)) return;

  const side = selectionSide(sel);
  if (!side) return;

  const mid = String(sel.marketId ?? "");
  const marketLine = mid ? marketHandicap(mid, markets) : null;
  const line = selectionLine(sel, marketLine);
  const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
  if (line == null || price == null || price < 1.01 || price > 100) return;

  const bucket = byLine.get(line) ?? {};
  if (side === "over") {
    bucket.over = price;
    bucket.selectionIds = { ...bucket.selectionIds, over: sid };
  } else {
    bucket.under = price;
    bucket.selectionIds = { ...bucket.selectionIds, under: sid };
  }
  if (mid) bucket.marketId = mid;
  byLine.set(line, bucket);
}

function absorbMarketIntoLines(
  mid: string,
  markets: Json,
  selections: Json,
  byLine: Map<number, LineBucket>,
): void {
  const rec = asRecord(markets[mid]);
  if (!rec) return;

  const marketLine = marketHandicap(mid, markets);
  const selIds = Array.isArray(rec.selectionIdList)
    ? rec.selectionIdList.map(String)
    : Object.keys(selections).filter((sid) =>
      String(asRecord(selections[sid])?.marketId ?? "") === mid
    );

  for (const sid of selIds) {
    absorbSelectionIntoBucket(sid, markets, selections, byLine);
  }

  for (const sid of selIds) {
    const sel = asRecord(selections[sid]);
    if (!sel) continue;
    const line = selectionLine(sel, marketLine);
    if (line == null) continue;
    const bucket = byLine.get(line);
    if (bucket) bucket.marketId = mid;
  }
}

type LoosePair = {
  line: number;
  over: number;
  under: number | null;
  overSid?: string;
  underSid?: string;
  marketId?: string;
};

function collectLoosePairsAtLine(
  selections: Json,
  targetLine: number,
): LoosePair[] {
  const overs: Array<{ price: number; sid: string; marketId?: string }> = [];
  const unders: Array<{ price: number; sid: string; marketId?: string }> = [];

  for (const [sid, sel] of Object.entries(selections)) {
    const rec = asRecord(sel);
    if (!rec || !isSelectionBettable(rec)) continue;
    const side = selectionSide(rec);
    if (!side) continue;
    const line = selectionLine(rec, null);
    if (line == null || Math.abs(line - targetLine) > 0.01) continue;
    const price = toNum(rec.price ?? rec.odds ?? rec.decimalOdds);
    if (price == null || price < 1.01 || price > 100) continue;
    const mid = String(rec.marketId ?? "") || undefined;
    const entry = { price, sid, marketId: mid };
    if (side === "over") overs.push(entry);
    else unders.push(entry);
  }

  const pairs: LoosePair[] = [];
  const usedUnder = new Set<string>();

  for (const o of overs) {
    let underMatch = o.marketId
      ? unders.find((u) => u.marketId === o.marketId)
      : undefined;
    if (!underMatch) {
      underMatch = unders.find((u) => !usedUnder.has(u.sid));
    }
    if (underMatch) usedUnder.add(underMatch.sid);
    pairs.push({
      line: targetLine,
      over: o.price,
      under: underMatch?.price ?? null,
      overSid: o.sid,
      underSid: underMatch?.sid,
      marketId: o.marketId ?? underMatch?.marketId,
    });
  }

  return pairs;
}

/** Over maior em linha maior; Under menor em linha maior (mercado de gols tipico). */
function monotonicityScore(
  pair: LoosePair,
  byLine: Map<number, LineBucket>,
): number {
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
      if (line < pair.line && pair.under > bucket.under) score += 1;
      if (line > pair.line && pair.under < bucket.under) score += 1;
    }
  }
  if (pair.under == null) score -= 3;
  return score;
}

function supplementByMonotonicity(
  selections: Json,
  goalsTotal: number,
  byLine: Map<number, LineBucket>,
): void {
  const targetLines = [
    goalsTotal + 0.5,
    goalsTotal + 1.5,
    goalsTotal + 2.5,
  ];

  for (const targetLine of targetLines) {
    const existing = byLine.get(targetLine);
    if (existing?.over != null && existing?.under != null) continue;

    const pairs = collectLoosePairsAtLine(selections, targetLine);
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
    if (bucket.over == null) {
      bucket.over = best.over;
      bucket.selectionIds = { ...bucket.selectionIds, over: best.overSid };
    }
    if (bucket.under == null && best.under != null) {
      bucket.under = best.under;
      bucket.selectionIds = { ...bucket.selectionIds, under: best.underSid };
    }
    if (best.marketId) bucket.marketId = best.marketId;
    byLine.set(targetLine, bucket);
  }
}

function linesFromBucketMap(byLine: Map<number, LineBucket>): HctgLine[] {
  const lines: HctgLine[] = [];
  for (const [line, bucket] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    if (bucket.over != null || bucket.under != null) {
      lines.push({
        line,
        over: bucket.over ?? null,
        under: bucket.under ?? null,
        selectionIds: bucket.selectionIds,
        marketId: bucket.marketId,
      });
    }
  }
  return lines;
}

/** Lookup por selectionIds (equivalente ao data-selnid do HTML). */
export function extractFromSelectionIds(
  selectionIds: string[],
  overview: Json,
): HctgSnapshot {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const byLine = new Map<number, LineBucket>();
  const marketIds = new Set<string>();

  for (const sid of selectionIds) {
    absorbSelectionIntoBucket(sid, markets, selections, byLine);
    const sel = asRecord(selections[sid]);
    const mid = String(sel?.marketId ?? "");
    if (mid) marketIds.add(mid);
  }

  return {
    lines: linesFromBucketMap(byLine),
    source: "json-by-selection-id",
    marketIds: [...marketIds],
    selectionIds,
  };
}

/**
 * Total de Gols da aba Ao Vivo (overview/latest) — mesma fonte que betano.bet.br/live/.
 * So mercados HCTG do marketIdList do evento (ou eventId explicito no mercado).
 * Sem fetch por evento, sem selecoes orfas, sem monotonicidade.
 */
export function extractLiveTabTotalGoalsSnapshot(
  eventId: string,
  event: Json,
  overview: Json,
): HctgSnapshot {
  return extractProvenEventHctgSnapshot(eventId, event, overview, "live-overview");
}

/**
 * Mercados HCTG do evento + selecoes ligadas ao marketIdList (vinculo provado).
 * Sem monotonicidade / selecoes orfas.
 * @param opts.trustAllHctgMarkets — overview?eventId= (payload ja filtrado pelo evento)
 */
export function extractProvenEventHctgSnapshot(
  eventId: string,
  event: Json,
  overview: Json,
  source = "live-overview-proven",
  opts?: { trustAllHctgMarkets?: boolean },
): HctgSnapshot {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const marketIds = opts?.trustAllHctgMarkets
    ? Object.entries(markets)
      .filter(([, market]) => {
        const rec = asRecord(market);
        return !!rec && isMatchTotalGoalsHctgMarket(rec);
      })
      .map(([mid]) => mid)
    : collectEventHctgMarketIds(eventId, event, markets);
  const provenSelIds = collectProvenSelectionIds(event, markets);

  const byLine = new Map<number, LineBucket>();
  for (const mid of marketIds) {
    absorbMarketIntoLines(mid, markets, selections, byLine);
  }
  for (const sid of provenSelIds) {
    absorbSelectionIntoBucket(sid, markets, selections, byLine);
  }

  // No overview escopado, tambem absorve selecoes de mercados HCTG ja coletados
  // e qualquer selecao Over/Under de gols ligada a esses marketIds.
  if (opts?.trustAllHctgMarkets) {
    for (const [sid, sel] of Object.entries(selections)) {
      const rec = asRecord(sel);
      if (!rec) continue;
      const mid = String(rec.marketId ?? "");
      if (mid && marketIds.includes(mid)) {
        absorbSelectionIntoBucket(sid, markets, selections, byLine);
      }
    }
  }

  const lines = linesFromBucketMap(byLine);
  const marketIdsFromLines = [...new Set(lines.map((l) => l.marketId).filter(Boolean))];

  return {
    lines,
    source: lines.length ? source : "none",
    marketIds: marketIdsFromLines.length ? marketIdsFromLines : marketIds,
    selectionIds: [...provenSelIds],
  };
}

/** Mescla mercados/selecoes de um overview escopado (overview?eventId=) no global. */
export function mergeOverviewHctgPayload(global: Json, scoped: Json): Json {
  const gMarkets = asRecord(global.markets) ?? {};
  const sMarkets = asRecord(scoped.markets) ?? {};
  const gSelections = asRecord(global.selections) ?? {};
  const sSelections = asRecord(scoped.selections) ?? {};
  return {
    ...global,
    markets: { ...gMarkets, ...sMarkets },
    selections: { ...gSelections, ...sSelections },
  };
}

export function hctgOverLineCount(snap: HctgSnapshot): number {
  return snap.lines.filter((l) => l.over != null && l.over >= 1.01).length;
}

/** Mantem so linhas de gols plausiveis perto do placar (evita 52.5 etc.). */
export function trimHctgLinesForMatch(
  lines: HctgLine[],
  goalsTotal: number,
  maxLines = 3,
): HctgLine[] {
  const need = goalsTotal + 0.5;
  const cleaned = lines
    .filter((l) =>
      l.line >= 0.5 &&
      l.line <= 12.5 &&
      Math.abs(l.line % 1 - 0.5) < 0.01 &&
      (l.over != null || l.under != null)
    )
    .filter((l) => l.line + 0.01 >= need)
    .sort((a, b) => a.line - b.line);

  // Descarta Over com monotonicidade invertida (linha maior com odd Over maior)
  const withOver = cleaned.filter((l) => l.over != null);
  const mono: HctgLine[] = [];
  for (const line of withOver) {
    const prev = mono[mono.length - 1];
    if (prev?.over != null && line.over != null && line.over > prev.over + 0.01) {
      // Odd Over sobe com a linha = suspeito; pula esta linha
      continue;
    }
    mono.push(line);
  }
  const undersOnly = cleaned.filter((l) => l.over == null && l.under != null);
  const merged = [...mono, ...undersOnly].sort((a, b) => a.line - b.line);

  if (merged.length <= maxLines) return merged;

  const priority = [need, need + 1, need + 2];
  const picked: HctgLine[] = [];
  for (const target of priority) {
    const hit = merged.find((l) =>
      Math.abs(l.line - target) < 0.01 && !picked.includes(l)
    );
    if (hit) picked.push(hit);
  }
  for (const line of merged) {
    if (picked.length >= maxLines) break;
    if (!picked.includes(line)) picked.push(line);
  }
  return picked.sort((a, b) => a.line - b.line);
}

/** Faltam linhas Over tipicas (+0,5 / +1,5 / +2,5 a partir do placar). */
export function hctgNeedsEventDeepFetch(
  snap: HctgSnapshot,
  goalsTotal: number,
  minOverLines = 3,
): boolean {
  if (hctgOverLineCount(snap) >= minOverLines) return false;
  const need = [goalsTotal + 0.5, goalsTotal + 1.5, goalsTotal + 2.5];
  const have = need.filter((line) =>
    snap.lines.some((l) =>
      Math.abs(l.line - line) < 0.01 && l.over != null && l.over >= 1.01
    )
  );
  return have.length < Math.min(minOverLines, need.length);
}

/** Total de Gols: mercados provados + selecoes do marketIdList + monotonicidade. */
export function extractMatchTotalGoalsLines(
  eventId: string,
  event: Json,
  overview: Json,
  goalsTotal: number,
): HctgSnapshot {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const marketIds = collectEventHctgMarketIds(eventId, event, markets);
  const provenSelIds = collectProvenSelectionIds(event, markets);

  const byLine = new Map<number, LineBucket>();

  for (const mid of marketIds) {
    absorbMarketIntoLines(mid, markets, selections, byLine);
  }

  for (const sid of provenSelIds) {
    absorbSelectionIntoBucket(sid, markets, selections, byLine);
  }

  supplementByMonotonicity(selections, goalsTotal, byLine);

  return {
    lines: linesFromBucketMap(byLine),
    source: "overview-eventId",
    marketIds,
    selectionIds: [...provenSelIds],
  };
}

export function absorbOffersMarkets(data: unknown): { markets: Json; selections: Json } {
  const markets: Json = {};
  const selections: Json = {};

  const absorbSelection = (s: Json, marketId?: string) => {
    const id = s.id ?? s.selectionId;
    if (id == null) return;
    const sid = String(id);
    const enriched = marketId && !s.marketId
      ? { ...s, marketId }
      : s;
    selections[sid] = enriched;
  };

  const absorbMarket = (m: Json) => {
    const id = String(m.id ?? "");
    if (!id) return;
    const sels = m.selections;
    const selectionIdList = Array.isArray(m.selectionIdList)
      ? m.selectionIdList.map(String)
      : [];
    if (Array.isArray(sels)) {
      for (const item of sels) {
        const s = asRecord(item);
        if (!s) continue;
        absorbSelection(s, id);
        const sid = String(s.id ?? s.selectionId ?? "");
        if (sid && !selectionIdList.includes(sid)) selectionIdList.push(sid);
      }
    }
    markets[id] = {
      ...m,
      selectionIdList: selectionIdList.length
        ? selectionIdList
        : m.selectionIdList,
    };
  };

  const walk = (node: unknown, depth = 0) => {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;

    const type = String(obj.type ?? "");
    const name = String(obj.name ?? "").toLowerCase();
    if (type === "HCTG" || name.includes("total de gols") || name.includes("total goals")) {
      absorbMarket(obj);
    }

    if (Array.isArray(obj.selections)) {
      for (const item of obj.selections) {
        const s = asRecord(item);
        if (s) absorbSelection(s);
      }
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };

  walk(data);
  return { markets, selections };
}

/** Mescla mercados HCTG aninhados de markets-offers no overview. */
export function mergeOffersIntoOverview(overview: Json, offersData: unknown): Json {
  const extra = absorbOffersMarkets(offersData);
  return mergeOverviewHctgPayload(overview, extra);
}

/**
 * Extrai Total de Gols direto do payload markets-offers / live/events
 * (mercados HCTG aninhados, sem depender de marketIdList/eventId).
 */
export function extractOffersHctgSnapshot(offersData: unknown): HctgSnapshot {
  const { markets, selections } = absorbOffersMarkets(offersData);
  const byLine = new Map<number, LineBucket>();
  const marketIds: string[] = [];

  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec || !isMatchTotalGoalsHctgMarket(rec)) continue;
    marketIds.push(mid);
    absorbMarketIntoLines(mid, markets, selections, byLine);
  }

  // Fallback: selecoes soltas no payload (sem mercado tipado)
  if (byLine.size === 0) {
    for (const sid of Object.keys(selections)) {
      absorbSelectionIntoBucket(sid, markets, selections, byLine);
    }
  }

  // Ultimo recurso: varre o JSON inteiro por "Mais de / Menos de X.5"
  if (byLine.size < 3) {
    harvestNamedGoalTotalsFromTree(offersData, byLine);
  }

  const lines = linesFromBucketMap(byLine);
  return {
    lines,
    source: lines.length ? "markets-offers" : "none",
    marketIds,
  };
}

function harvestNamedGoalTotalsFromTree(
  node: unknown,
  byLine: Map<number, LineBucket>,
  depth = 0,
): void {
  if (depth > 16 || node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) harvestNamedGoalTotalsFromTree(item, byLine, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const obj = asRecord(node);
  if (!obj) return;

  const name = String(obj.name ?? obj.shortName ?? obj.fullName ?? "");
  // Exige texto tipico de Total de Gols (evita cartoes/escanteios/outros)
  if (!/mais de|menos de/i.test(name)) {
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") {
        harvestNamedGoalTotalsFromTree(value, byLine, depth + 1);
      }
    }
    return;
  }

  const side = selectionSide(obj);
  const line = selectionLine(obj, null);
  const price = toNum(obj.price ?? obj.odds ?? obj.decimalOdds);
  if (
    side && line != null && price != null && price >= 1.01 && price <= 100 &&
    line >= 0.5 && line <= 12.5 && Math.abs(line % 1 - 0.5) < 0.01
  ) {
    const bucket = byLine.get(line) ?? {};
    if (side === "over" && bucket.over == null) bucket.over = price;
    if (side === "under" && bucket.under == null) bucket.under = price;
    const sid = obj.id ?? obj.selectionId;
    if (sid != null) {
      bucket.selectionIds = {
        ...bucket.selectionIds,
        [side]: String(sid),
      };
    }
    byLine.set(line, bucket);
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      harvestNamedGoalTotalsFromTree(value, byLine, depth + 1);
    }
  }
}

/** Conta nos HCTG / selecoes Over no payload (diagnostico). */
export function summarizeOffersHctgPayload(offersData: unknown): {
  hctgMarkets: number;
  overSelections: number;
  extractedOvers: number;
} {
  const snap = extractOffersHctgSnapshot(offersData);
  const { markets, selections } = absorbOffersMarkets(offersData);
  let hctgMarkets = 0;
  for (const market of Object.values(markets)) {
    const rec = asRecord(market);
    if (rec && isMatchTotalGoalsHctgMarket(rec)) hctgMarkets += 1;
  }
  let overSelections = 0;
  for (const sel of Object.values(selections)) {
    const rec = asRecord(sel);
    if (!rec) continue;
    if (selectionSide(rec) === "over") overSelections += 1;
  }
  return {
    hctgMarkets,
    overSelections,
    extractedOvers: hctgOverLineCount(snap),
  };
}

/** Over +0,5 real = linha absoluta placar+0,5 presente e apostavel no snapshot HCTG. */
export function canCaptureNeedLineFromHctg(
  lines: HctgLine[],
  goalsTotal: number,
): boolean {
  const needLine = goalsTotal + 0.5;
  return lines.some((l) =>
    Math.abs(l.line - needLine) < 0.01 &&
    l.over != null &&
    l.over >= 1.01
  );
}

export function needLineOverFromHctg(
  lines: HctgLine[],
  goalsTotal: number,
): { line: number; odd: number } | null {
  const needLine = goalsTotal + 0.5;
  const hit = lines.find((l) =>
    Math.abs(l.line - needLine) < 0.01 &&
    l.over != null &&
    l.over >= 1.01
  );
  if (!hit || hit.over == null) return null;
  return { line: hit.line, odd: hit.over };
}

export function minHctgOverLine(lines: HctgLine[]): number | null {
  const overs = lines.filter((l) => l.over != null).map((l) => l.line);
  if (!overs.length) return null;
  return Math.min(...overs);
}

export function parseHctgLinesFromDb(raw: unknown): HctgLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) =>
    e && typeof e === "object" &&
    typeof (e as HctgLine).line === "number" &&
    ((e as HctgLine).over == null || typeof (e as HctgLine).over === "number") &&
    ((e as HctgLine).under == null || typeof (e as HctgLine).under === "number")
  ) as HctgLine[];
}

/** Hibrido: selectionIds do HTML + JSON overview (vinculo provado). */
export function extractFromHtmlSelectionIds(
  selectionIds: string[],
  overview: Json,
): HctgSnapshot {
  const selections = asRecord(overview.selections) ?? {};
  const markets = asRecord(overview.markets) ?? {};
  const byLine = new Map<number, LineBucket>();

  for (const sid of selectionIds) {
    absorbSelectionIntoBucket(sid, markets, selections, byLine);
  }

  return {
    lines: linesFromBucketMap(byLine),
    source: "json-by-selnid",
    marketIds: [],
    selectionIds: [...selectionIds],
  };
}

function hctgSnapshotScore(lines: HctgLine[], goalsTotal: number): number {
  let score = lines.length * 10;
  if (canCaptureNeedLineFromHctg(lines, goalsTotal)) score += 1000;
  score += lines.filter((l) => l.over != null && l.under != null).length * 5;
  return score;
}

export function pickBetterHctgSnapshot(
  primary: HctgSnapshot,
  secondary: HctgSnapshot,
  goalsTotal: number,
): HctgSnapshot {
  const a = hctgSnapshotScore(primary.lines, goalsTotal);
  const b = hctgSnapshotScore(secondary.lines, goalsTotal);
  if (b > a) return secondary;
  if (b < a) return primary;
  return secondary.lines.length > primary.lines.length ? secondary : primary;
}

export type FetchHctgOpts = {
  overviewUrl: string;
  betanoBase: string;
  fetchJson: (url: string, referer: string) => Promise<unknown>;
  fetchHtml?: (pageUrl: string, referer: string) => Promise<string>;
  eventId: string;
  event: Json;
  goalsTotal: number;
  referer: string;
  pageUrl?: string;
};

/** Legado: busca HTML renderizado (VPS/ScrapingBee). Producao usa extractLiveTabTotalGoalsSnapshot. */
export async function fetchMatchTotalGoalsSnapshot(
  opts: FetchHctgOpts,
): Promise<HctgSnapshot> {
  const { fetchHtml, referer, pageUrl } = opts;

  if (!fetchHtml || !pageUrl) {
    return { lines: [], source: "none", marketIds: [] };
  }

  try {
    const html = await fetchHtml(pageUrl, referer);
    const htmlSnap = extractMatchTotalGoalsFromHtml(html);
    if (htmlSnap.lines.length > 0) {
      return {
        lines: htmlSnap.lines,
        source: "html-dom+browser-proxy",
        marketIds: [],
        selectionIds: htmlSnap.selectionIds,
      };
    }
  } catch {
    // falha HTML
  }

  return { lines: [], source: "none", marketIds: [] };
}

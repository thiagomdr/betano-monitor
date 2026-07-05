/**
 * Coleta futebol ao vivo da Betano (danae-webapi) a partir da nuvem Supabase.
 * Sem cookie de conta — apenas endpoints publicos.
 *
 * POST/GET /functions/v1/betano-futebol-live
 * Header opcional: x-cron-secret (se CRON_SECRET estiver definido)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const BETANO_BASE = "https://www.betano.bet.br";
const OVERVIEW_URL =
  `${BETANO_BASE}/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8`;
const MIN_MINUTE_DEFAULT = 85;
const USER_AGENT =
  "Mozilla/5.0 (compatible; BetanoMonitor/1.0; +https://supabase.com)";

type Json = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function betanoGet(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: `${BETANO_BASE}/live/`,
      Origin: BETANO_BASE,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Betano HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

function eventsMap(overview: Json): Json {
  const events = overview.events;
  if (Array.isArray(events)) {
    const map: Json = {};
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const id = rec.id ?? rec.eventId;
      if (id != null) map[String(id)] = rec;
    }
    return map;
  }
  return asRecord(events) ?? {};
}

function leaguesMap(overview: Json): Json {
  return asRecord(overview.leagues) ?? asRecord(overview.leaguesById) ?? {};
}

function isFootballEvent(event: Json, overview: Json): boolean {
  if (event.isOutrightEvent === true) return false;
  const participants = event.participants;
  if (!Array.isArray(participants) || participants.length < 2) return false;

  const names = participants
    .map((p) => String(asRecord(p)?.name ?? ""))
    .join(" ")
    .toLowerCase();
  if (names.includes("esports") || names.includes("e-sports")) return false;

  const sportId = event.sportId ?? event.sportTypeId;
  if (sportId === 1 || sportId === "1" || sportId === "FOOT") return true;

  const sportKey = String(event.sportKey ?? event.sport ?? "").toUpperCase();
  if (sportKey === "FOOT" || sportKey.includes("FOOTBALL") || sportKey.includes("SOCCER")) {
    return true;
  }

  const leagueId = event.leagueId ?? event.competitionId;
  const sports = asRecord(overview.sports);
  const byId = asRecord(sports?.byId);
  const foot = asRecord(byId?.FOOT);
  const leagueIds = foot?.leagueIdList;
  if (leagueId != null && Array.isArray(leagueIds)) {
    return leagueIds.map(String).includes(String(leagueId));
  }

  // fallback: se overview so lista futebol no FOOT zone lists
  const byIdLeague = asRecord(sports?.byIdLeagueIdList);
  const footLeagues = byIdLeague?.FOOT;
  if (leagueId != null && Array.isArray(footLeagues)) {
    return footLeagues.map(String).includes(String(leagueId));
  }

  return false;
}

function extractMinute(event: Json): number | null {
  const direct = toInt(
    event.minute ??
      event.matchMinute ??
      event.elapsed ??
      event.totalElapsedMinutes ??
      event.time ??
      event.gameTime,
  );
  if (direct != null) return direct;

  const seconds = toInt(
    event.totalElapsedSeconds ??
      event.elapsedSeconds ??
      event.matchTimeInSeconds ??
      event.seconds,
  );
  if (seconds != null) return Math.floor(seconds / 60);

  const liveData = asRecord(event.liveData) ?? asRecord(event.live) ??
    asRecord(event.match) ?? asRecord(event.game);
  if (liveData) {
    const m = toInt(
      liveData.minute ??
        liveData.elapsed ??
        liveData.matchMinute ??
        liveData.time ??
        liveData.gameMinute,
    );
    if (m != null) return m;
    const liveClock = asRecord(liveData.clock);
    const s = toInt(
      liveData.totalElapsedSeconds ??
        liveData.elapsedSeconds ??
        liveData.seconds ??
        liveClock?.secondsSinceStart ??
        liveClock?.seconds,
    );
    if (s != null) return Math.floor(s / 60);
  }

  const clock = asRecord(event.clock) ?? asRecord(event.matchClock) ??
    asRecord(liveData?.clock);
  if (clock) {
    const m = toInt(clock.minute ?? clock.elapsed ?? clock.minutes);
    if (m != null) return m;
    const s = toInt(
      clock.secondsSinceStart ??
        clock.seconds ??
        clock.playedSeconds ??
        clock.totalSeconds,
    );
    if (s != null) return Math.floor(s / 60);
  }

  const status = asRecord(event.matchStatus) ?? asRecord(event.status) ??
    asRecord(event.eventStatus);
  if (status) {
    const m = toInt(status.minute ?? status.elapsed ?? status.time);
    if (m != null) return m;
    // "87:12" / "87'"
    const desc = String(status.description ?? status.name ?? status.short ?? "");
    const mm = desc.match(/(\d{1,3})\s*[:'′]/);
    if (mm) return toInt(mm[1]);
  }

  // campos soltos tipo "87:00"
  for (const key of ["matchTime", "displayTime", "timeDescription", "periodDescription"]) {
    const text = event[key];
    if (typeof text === "string") {
      const mm = text.match(/(\d{1,3})\s*[:'′]/);
      if (mm) return toInt(mm[1]);
    }
  }

  return null;
}

function extractInjuryTime(event: Json): number | null {
  return toInt(
    event.injuryTime ??
      event.additionalTime ??
      event.extraTime ??
      asRecord(event.clock)?.injuryTime ??
      asRecord(event.liveData)?.injuryTime,
  );
}

function extractScore(event: Json): { home: number | null; away: number | null; text: string } {
  const scoreObj = asRecord(event.score) ?? asRecord(event.scores) ??
    asRecord(asRecord(event.liveData)?.score);
  let home = toInt(scoreObj?.home ?? scoreObj?.Home);
  let away = toInt(scoreObj?.away ?? scoreObj?.Away);

  if (home == null || away == null) {
    const results = event.results ?? event.result;
    if (Array.isArray(results) && results.length >= 2) {
      home = toInt(asRecord(results[0])?.value ?? results[0]);
      away = toInt(asRecord(results[1])?.value ?? results[1]);
    }
  }

  if ((home == null || away == null) && typeof event.score === "string") {
    const m = String(event.score).match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) {
      home = toInt(m[1]);
      away = toInt(m[2]);
    }
  }

  const text = home != null && away != null ? `${home}-${away}` : "—";
  return { home, away, text };
}

function extractTeams(event: Json): { home: string | null; away: string | null } {
  const participants = event.participants ?? event.teams;
  if (Array.isArray(participants) && participants.length >= 2) {
    let home: string | null = null;
    let away: string | null = null;
    for (const p of participants) {
      const rec = asRecord(p);
      if (!rec) continue;
      const name = String(rec.name ?? rec.participantName ?? rec.shortName ?? "");
      const isHome = rec.isHome === true || rec.side === "home" || rec.venueRole === "Home";
      const isAway = rec.isHome === false || rec.side === "away" || rec.venueRole === "Away";
      if (isHome) home = name || home;
      else if (isAway) away = name || away;
    }
    if (!home) home = String(asRecord(participants[0])?.name ?? "") || null;
    if (!away) away = String(asRecord(participants[1])?.name ?? "") || null;
    return { home, away };
  }

  return {
    home: event.home != null ? String(event.home) : (asRecord(event.homeTeam)?.name as string) ?? null,
    away: event.away != null ? String(event.away) : (asRecord(event.awayTeam)?.name as string) ?? null,
  };
}

function extractLeague(event: Json, leagues: Json): { league: string | null; country: string | null } {
  const leagueId = event.leagueId ?? event.competitionId;
  const leagueRec = leagueId != null ? asRecord(leagues[String(leagueId)]) : null;
  return {
    league: leagueRec?.name != null
      ? String(leagueRec.name)
      : event.leagueName != null
      ? String(event.leagueName)
      : null,
    country: leagueRec?.regionName != null
      ? String(leagueRec.regionName)
      : leagueRec?.country != null
      ? String(leagueRec.country)
      : null,
  };
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function betanoUrl(eventId: string, home: string | null, away: string | null): string {
  const slug = [home, away].filter(Boolean).map((s) => slugify(String(s))).join("-") || "evento";
  return `${BETANO_BASE}/live/${slug}/${eventId}/`;
}

function extractMlOdds(
  eventId: string,
  overview: Json,
): { home: number | null; draw: number | null; away: number | null } {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const event = asRecord(eventsMap(overview)[eventId]);
  const marketIds: string[] = [];

  if (Array.isArray(event?.marketIdList)) {
    marketIds.push(...event.marketIdList.map(String));
  }
  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec) continue;
    if (String(rec.eventId ?? rec.eventID ?? "") === eventId) marketIds.push(mid);
  }

  for (const mid of marketIds) {
    const market = asRecord(markets[mid]);
    if (!market) continue;
    const name = String(market.name ?? market.typeName ?? market.marketType ?? "").toLowerCase();
    const typeId = String(market.typeId ?? market.marketTypeId ?? "");
    const is1x2 =
      name.includes("resultado") ||
      name.includes("1x2") ||
      name === "ml" ||
      typeId === "1" ||
      typeId === "100";
    if (!is1x2) continue;

    const selIds = Array.isArray(market.selectionIdList)
      ? market.selectionIdList.map(String)
      : Object.keys(selections).filter((sid) => {
        const s = asRecord(selections[sid]);
        return s && String(s.marketId ?? "") === mid;
      });

    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const sid of selIds) {
      const sel = asRecord(selections[sid]);
      if (!sel) continue;
      const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
      const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
      const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
      if (sname === "x" || sname.includes("empate") || stype.includes("draw")) draw = price;
      else if (sname === "1" || stype.includes("home") || sel.isHome === true) home = price;
      else if (sname === "2" || stype.includes("away") || sel.isHome === false) away = price;
    }
    if (home != null || draw != null || away != null) return { home, draw, away };
  }

  return { home: null, draw: null, away: null };
}

/** Totais Under/Over: slot 0/1/2 = +0.5 / +1.5 / +2.5 gols a partir do placar atual. */
type TotalsOdds = {
  under_0_line: number | null;
  under_0_odd: number | null;
  under_1_line: number | null;
  under_1_odd: number | null;
  under_2_line: number | null;
  under_2_odd: number | null;
  over_0_line: number | null;
  over_0_odd: number | null;
  over_1_line: number | null;
  over_1_odd: number | null;
  over_2_line: number | null;
  over_2_odd: number | null;
};

type OddSlot = { line: number | null; odd: number | null; kind: "absolute" | "remaining" | null };

const EMPTY_TOTALS_ODDS: TotalsOdds = {
  under_0_line: null,
  under_0_odd: null,
  under_1_line: null,
  under_1_odd: null,
  under_2_line: null,
  under_2_odd: null,
  over_0_line: null,
  over_0_odd: null,
  over_1_line: null,
  over_1_odd: null,
  over_2_line: null,
  over_2_odd: null,
};

const REMAINING_LINES = [0.5, 1.5, 2.5];

function parseLineFromText(text: string): number | null {
  const m = String(text).match(/(\d+[.,]\d+|\d+)/);
  if (!m) return null;
  return toNum(m[1].replace(",", "."));
}

/** Mapeia linha Betano (absoluta ou gols restantes) para slot 0/1/2. */
function slotForLine(
  selLine: number,
  goalsTotal: number,
): { slot: number; kind: "absolute" | "remaining" } | null {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(selLine - (goalsTotal + REMAINING_LINES[i])) < 0.01) {
      return { slot: i, kind: "absolute" };
    }
  }
  for (let i = 0; i < 3; i++) {
    if (Math.abs(selLine - REMAINING_LINES[i]) < 0.01) {
      return { slot: i, kind: "remaining" };
    }
  }
  return null;
}

function assignOddSlot(
  slots: OddSlot[],
  slot: number,
  line: number,
  odd: number,
  kind: "absolute" | "remaining",
) {
  const cur = slots[slot];
  if (cur.odd == null) {
    slots[slot] = { line, odd, kind };
    return;
  }
  if (cur.kind === "remaining" && kind === "absolute") {
    slots[slot] = { line, odd, kind };
  }
}

function slotsToTotalsOdds(
  underSlots: OddSlot[],
  overSlots: OddSlot[],
  goalsTotal: number,
): TotalsOdds {
  const canonicalLines = REMAINING_LINES.map((r) => goalsTotal + r);
  const pick = (slots: OddSlot[], i: number) => ({
    line: slots[i].odd != null ? canonicalLines[i] : null,
    odd: slots[i].odd,
  });
  let t: TotalsOdds = {
    under_0_line: pick(underSlots, 0).line,
    under_0_odd: pick(underSlots, 0).odd,
    under_1_line: pick(underSlots, 1).line,
    under_1_odd: pick(underSlots, 1).odd,
    under_2_line: pick(underSlots, 2).line,
    under_2_odd: pick(underSlots, 2).odd,
    over_0_line: pick(overSlots, 0).line,
    over_0_odd: pick(overSlots, 0).odd,
    over_1_line: pick(overSlots, 1).line,
    over_1_odd: pick(overSlots, 1).odd,
    over_2_line: pick(overSlots, 2).line,
    over_2_odd: pick(overSlots, 2).odd,
  };
  t = fixTotalsOddsMonotonicity(t);
  return t;
}

/** Under mais restrito = odd maior; Over mais restrito = odd maior. Corrige inversao 0↔1. */
function fixTotalsOddsMonotonicity(t: TotalsOdds): TotalsOdds {
  const out = { ...t };
  const swapUnder = (a: 0 | 1, b: 1 | 2) => {
    const oa = out[`under_${a}_odd` as keyof TotalsOdds] as number | null;
    const ob = out[`under_${b}_odd` as keyof TotalsOdds] as number | null;
    if (oa == null || ob == null || oa >= ob) return;
    const la = out[`under_${a}_line` as keyof TotalsOdds] as number | null;
    const lb = out[`under_${b}_line` as keyof TotalsOdds] as number | null;
    (out as Record<string, number | null>)[`under_${a}_odd`] = ob;
    (out as Record<string, number | null>)[`under_${b}_odd`] = oa;
    (out as Record<string, number | null>)[`under_${a}_line`] = lb;
    (out as Record<string, number | null>)[`under_${b}_line`] = la;
  };
  const swapOver = (a: 0 | 1, b: 1 | 2) => {
    const oa = out[`over_${a}_odd` as keyof TotalsOdds] as number | null;
    const ob = out[`over_${b}_odd` as keyof TotalsOdds] as number | null;
    if (oa == null || ob == null || oa <= ob) return;
    const la = out[`over_${a}_line` as keyof TotalsOdds] as number | null;
    const lb = out[`over_${b}_line` as keyof TotalsOdds] as number | null;
    (out as Record<string, number | null>)[`over_${a}_odd`] = ob;
    (out as Record<string, number | null>)[`over_${b}_odd`] = oa;
    (out as Record<string, number | null>)[`over_${a}_line`] = lb;
    (out as Record<string, number | null>)[`over_${b}_line`] = la;
  };
  swapUnder(0, 1);
  swapUnder(1, 2);
  swapOver(0, 1);
  swapOver(1, 2);
  return out;
}

function extractTotalsOdds(
  eventId: string,
  event: Json,
  overview: Json,
  goalsTotal: number,
): TotalsOdds {
  const underSlots: OddSlot[] = [
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
  ];
  const overSlots: OddSlot[] = [
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
  ];

  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};

  const marketIds = new Set<string>();
  if (Array.isArray(event.marketIdList)) {
    for (const id of event.marketIdList) marketIds.add(String(id));
  }
  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec) continue;
    if (String(rec.eventId ?? rec.eventID ?? "") === eventId) marketIds.add(mid);
  }

  const considerMarket = (mid: string, rec: Json) => {
    const name = String(rec.name ?? rec.typeName ?? rec.marketType ?? "").toLowerCase();
    const typeName = String(rec.typeName ?? "").toLowerCase();
    const looksTotal =
      name.includes("total") ||
      name.includes("gols") ||
      name.includes("over") ||
      name.includes("under") ||
      name.includes("mais") ||
      name.includes("menos") ||
      typeName.includes("total");
    const marketLine = toNum(rec.handicap ?? rec.line ?? rec.points);
    const selIds = Array.isArray(rec.selectionIdList)
      ? rec.selectionIdList.map(String)
      : Object.keys(selections).filter((sid) => String(asRecord(selections[sid])?.marketId ?? "") === mid);

    for (const sid of selIds) {
      const sel = asRecord(selections[sid]);
      if (!sel) continue;
      const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
      const isUnder =
        sname.includes("under") ||
        sname.includes("menos") ||
        sname === "below" ||
        sname.startsWith("u ") ||
        sname.startsWith("u(");
      const isOver =
        sname.includes("over") ||
        sname.includes("mais") ||
        sname === "above" ||
        sname.startsWith("o ") ||
        sname.startsWith("o(");
      if (!isUnder && !isOver && !looksTotal) continue;

      const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
      let selLine = toNum(sel.handicap ?? sel.line ?? sel.points) ?? marketLine;
      if (selLine == null) selLine = parseLineFromText(sname);
      if (price == null || selLine == null) continue;

      const mapped = slotForLine(selLine, goalsTotal);
      if (!mapped) continue;

      if (isUnder) assignOddSlot(underSlots, mapped.slot, selLine, price, mapped.kind);
      if (isOver) assignOddSlot(overSlots, mapped.slot, selLine, price, mapped.kind);
    }
  };

  for (const mid of marketIds) {
    const rec = asRecord(markets[mid]);
    if (rec) considerMarket(mid, rec);
  }

  if (underSlots.every((f) => f.odd == null) && overSlots.every((f) => f.odd == null)) {
    for (const [mid, market] of Object.entries(markets)) {
      const rec = asRecord(market);
      if (!rec) continue;
      considerMarket(mid, rec);
    }
  }

  return slotsToTotalsOdds(underSlots, overSlots, goalsTotal);
}

/** Under por gols restantes: linhas +0.5, +1.5, +2.5. */
function extractUnderGoalsRemaining(
  eventId: string,
  event: Json,
  overview: Json,
  goalsTotal: number,
): Pick<
  TotalsOdds,
  "under_0_line" | "under_0_odd" | "under_1_line" | "under_1_odd" | "under_2_line" | "under_2_odd"
> {
  const t = extractTotalsOdds(eventId, event, overview, goalsTotal);
  return {
    under_0_line: t.under_0_line,
    under_0_odd: t.under_0_odd,
    under_1_line: t.under_1_line,
    under_1_odd: t.under_1_odd,
    under_2_line: t.under_2_line,
    under_2_odd: t.under_2_odd,
  };
}

function hasAnyTotalsOdds(t: TotalsOdds): boolean {
  return [
    t.under_0_odd, t.under_1_odd, t.under_2_odd,
    t.over_0_odd, t.over_1_odd, t.over_2_odd,
  ].some((v) => v != null);
}

/** Busca mercados extras do evento (totais Under/Over) quando o overview nao traz. */
async function fetchEventTotalsOdds(
  eventId: string,
  goalsTotal: number,
): Promise<TotalsOdds> {
  const urls = [
    `${BETANO_BASE}/api/event/markets-offers/${eventId}`,
    `${BETANO_BASE}/danae-webapi/api/live/events/${eventId}?queryLanguageId=5&queryOperatorId=8`,
  ];

  for (const url of urls) {
    try {
      const data = await betanoGet(url);
      const rec = asRecord(data) ?? {};
      const markets = asRecord(rec.markets) ?? asRecord(asRecord(rec.data)?.markets) ?? {};
      const selections = asRecord(rec.selections) ?? asRecord(asRecord(rec.data)?.selections) ?? {};
      const fakeOverview = { markets, selections };
      const fromStruct = extractTotalsOdds(
        eventId,
        { marketIdList: Object.keys(markets) },
        fakeOverview,
        goalsTotal,
      );
      if (hasAnyTotalsOdds(fromStruct)) return fromStruct;
    } catch {
      // tenta proximo
    }
  }

  return EMPTY_TOTALS_ODDS;
}

async function fetchEventUnderOdds(
  eventId: string,
  goalsTotal: number,
): Promise<Pick<
  TotalsOdds,
  "under_0_line" | "under_0_odd" | "under_1_line" | "under_1_odd" | "under_2_line" | "under_2_odd"
>> {
  const t = await fetchEventTotalsOdds(eventId, goalsTotal);
  return {
    under_0_line: t.under_0_line,
    under_0_odd: t.under_0_odd,
    under_1_line: t.under_1_line,
    under_1_odd: t.under_1_odd,
    under_2_line: t.under_2_line,
    under_2_odd: t.under_2_odd,
  };
}

const SPORTRADAR_STATS =
  "https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_details";

type TeamStats = {
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_shots_total: number | null;
  away_shots_total: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_goal_kicks: number | null;
  away_goal_kicks: number | null;
  available: boolean;
  raw: Json;
};

function emptyStats(): TeamStats {
  return {
    home_shots_on_target: null,
    away_shots_on_target: null,
    home_shots_total: null,
    away_shots_total: null,
    home_corners: null,
    away_corners: null,
    home_goal_kicks: null,
    away_goal_kicks: null,
    available: false,
    raw: {},
  };
}

function pairFromValues(
  values: Json,
  ...keys: string[]
): { home: number | null; away: number | null } {
  for (const key of keys) {
    const rec = asRecord(values[key]);
    if (!rec) continue;
    const value = asRecord(rec.value) ?? rec;
    const home = toInt(value.home ?? value.Home);
    const away = toInt(value.away ?? value.Away);
    if (home != null || away != null) return { home, away };
  }
  return { home: null, away: null };
}

/** Stats via Sportradar (betradarMatchId da Betano). */
async function tryFetchStats(betradarMatchId: string | number | null): Promise<TeamStats> {
  if (betradarMatchId == null || betradarMatchId === "") {
    return { ...emptyStats(), raw: { error: "sem betradarMatchId" } };
  }

  const urls = [
    `${SPORTRADAR_STATS}/${betradarMatchId}`,
    `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_detailsextended/${betradarMatchId}`,
  ];

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.betano.bet.br/",
          Origin: "https://www.betano.bet.br",
        },
      });
      if (!res.ok) {
        errors.push(`${url} HTTP ${res.status}`);
        continue;
      }
      const data = asRecord(await res.json());
      const doc0 = Array.isArray(data?.doc) ? data.doc[0] : null;
      const doc = asRecord(doc0);
      // exception payload
      if (String(doc?.event ?? "") === "exception") {
        errors.push(`${url} exception`);
        continue;
      }
      const payload = asRecord(doc?.data) ?? {};
      const values = asRecord(payload.values) ?? {};
      if (Object.keys(values).length === 0) {
        errors.push(`${url} sem values`);
        continue;
      }

      // Codigos Sportradar: 125 shots on target, 124 corners, 121 goal kicks, goalattempts total
      const sot = pairFromValues(values, "125", "shotsonperiod");
      const total = pairFromValues(values, "goalattempts", "goalattemptsperiod");
      const corners = pairFromValues(values, "124", "1634");
      const gk = pairFromValues(values, "121", "goalkicksperiod");

      const available = [sot, total, corners, gk].some((p) => p.home != null || p.away != null);
      return {
        home_shots_on_target: sot.home,
        away_shots_on_target: sot.away,
        home_shots_total: total.home,
        away_shots_total: total.away,
        home_corners: corners.home,
        away_corners: corners.away,
        home_goal_kicks: gk.home,
        away_goal_kicks: gk.away,
        available,
        raw: { betradarMatchId, url, valuesKeys: Object.keys(values).slice(0, 30) },
      };
    } catch (err) {
      errors.push(`${url} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ...emptyStats(), raw: { betradarMatchId, errors } };
}

type GoalEvent = {
  event_id: string;
  sportradar_goal_id: string | null;
  minute: number;
  team: string | null;
  team_side: string | null;
  player: string | null;
  score_home: number | null;
  score_away: number | null;
};

function goalRowFromEvent(g: GoalEvent) {
  return {
    event_id: g.event_id,
    sportradar_goal_id: g.sportradar_goal_id,
    minute: g.minute,
    team: g.team,
    team_side: g.team_side ?? "unk",
    player: g.player,
    score_home: g.score_home,
    score_away: g.score_away,
  };
}

function dedupeGoals(goals: GoalEvent[]): GoalEvent[] {
  const seen = new Set<string>();
  return goals.filter((g) => {
    const key = g.sportradar_goal_id
      ? `sr:${g.sportradar_goal_id}`
      : `${g.minute}|${g.team_side ?? ""}|${g.score_home ?? ""}-${g.score_away ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function syncGoalsIntegrity(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<string> {
  const expected = (homeScore ?? 0) + (awayScore ?? 0);
  const { count } = await supabase
    .from("futebol_historico_gols")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  const recorded = count ?? 0;
  let status = "ok";
  if (expected === 0 && recorded === 0) status = "ok";
  else if (recorded === 0) status = "missing";
  else if (recorded < expected) status = "partial";
  else if (recorded > expected) status = "mismatch";
  else status = "ok";

  await supabase
    .from("futebol_historico_jogos")
    .update({
      goals_expected: expected,
      goals_recorded: recorded,
      goals_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);

  return status;
}

function extractBetradarMatchId(event: Json): string | null {
  const direct =
    event.betradarMatchId ??
      event.betradarId ??
      event.betRadarMatchId ??
      event.sportradarMatchId ??
      event.statsId;
  if (direct != null && direct !== "") return String(direct);

  const liveData = asRecord(event.liveData) ?? asRecord(event.live);
  const fromLive =
    liveData?.betradarMatchId ?? liveData?.betradarId ?? liveData?.sportradarMatchId;
  if (fromLive != null && fromLive !== "") return String(fromLive);

  const providers = asRecord(event.providerIds) ?? asRecord(event.externalIds);
  if (providers?.betradar != null && providers.betradar !== "") {
    return String(providers.betradar);
  }
  return null;
}

function inferGoalsFromScoreDelta(
  eventId: string,
  prevHome: number,
  prevAway: number,
  currHome: number,
  currAway: number,
  minute: number | null,
  homeName: string | null,
  awayName: string | null,
): GoalEvent[] {
  if (minute == null) return [];
  const goals: GoalEvent[] = [];
  const homeDelta = Math.max(0, currHome - prevHome);
  const awayDelta = Math.max(0, currAway - prevAway);

  for (let i = 0; i < homeDelta; i++) {
    goals.push({
      event_id: eventId,
      sportradar_goal_id: null,
      minute,
      team: homeName,
      team_side: "home",
      player: null,
      score_home: prevHome + i + 1,
      score_away: prevAway,
    });
  }
  for (let i = 0; i < awayDelta; i++) {
    goals.push({
      event_id: eventId,
      sportradar_goal_id: null,
      minute,
      team: awayName,
      team_side: "away",
      player: null,
      score_home: currHome,
      score_away: prevAway + i + 1,
    });
  }
  return goals;
}

async function persistEventGoals(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  timelineGoals: GoalEvent[],
  inferredGoals: GoalEvent[],
  homeScore: number | null,
  awayScore: number | null,
): Promise<{ saved: number; source: string; status: string }> {
  let merged: GoalEvent[];
  let source = "none";

  if (timelineGoals.length > 0) {
    merged = dedupeGoals(timelineGoals);
    source = "timeline";
  } else {
    const { data: existing } = await supabase
      .from("futebol_historico_gols")
      .select("event_id,sportradar_goal_id,minute,team,team_side,player,score_home,score_away")
      .eq("event_id", eventId);
    const existingGoals = (existing ?? []) as GoalEvent[];
    merged = dedupeGoals([...existingGoals, ...inferredGoals]);
    if (inferredGoals.length > 0) source = existingGoals.length > 0 ? "inferred+existing" : "inferred";
    else if (existingGoals.length > 0) source = "preserved";
  }

  let saved = 0;
  const upsertErrors: string[] = [];
  if (merged.length > 0) {
    for (const g of merged) {
      const row = goalRowFromEvent(g);
      if (g.sportradar_goal_id) {
        const { error } = await supabase
          .from("futebol_historico_gols")
          .upsert(row, { onConflict: "event_id,sportradar_goal_id" });
        if (!error) saved += 1;
        else {
          console.error("upsert sportradar goal", eventId, error.message);
          upsertErrors.push(error.message);
        }
      } else {
        const { error } = await supabase
          .from("futebol_historico_gols")
          .upsert(row, { onConflict: "event_id,minute,team_side,score_home,score_away" });
        if (!error) saved += 1;
        else {
          console.error("upsert placar goal", eventId, error.message);
          upsertErrors.push(error.message);
        }
      }
    }

    if (source === "timeline") {
      const srIds = merged.map((g) => g.sportradar_goal_id).filter(Boolean) as string[];
      if (srIds.length > 0) {
        const quoted = srIds.map((id) => `"${id}"`).join(",");
        await supabase
          .from("futebol_historico_gols")
          .delete()
          .eq("event_id", eventId)
          .not("sportradar_goal_id", "in", `(${quoted})`);
      }
    }
  }

  const status = await syncGoalsIntegrity(supabase, eventId, homeScore, awayScore);
  const goalsTotal = (homeScore ?? 0) + (awayScore ?? 0);
  if (merged.length === 0) {
    return { saved: 0, source: goalsTotal > 0 ? "missing" : "none", status };
  }
  return { saved, source, status };
}

function inferGoalsFromFinalScore(
  eventId: string,
  homeScore: number,
  awayScore: number,
  homeName: string | null,
  awayName: string | null,
  minute: number = 90,
): GoalEvent[] {
  return inferGoalsFromScoreDelta(eventId, 0, 0, homeScore, awayScore, minute, homeName, awayName);
}

async function reconcileHistoricGoals(
  supabase: ReturnType<typeof createClient>,
  limit = 120,
): Promise<{ backfilled: number; fixed: number; scanned: number }> {
  const { data: games } = await supabase
    .from("futebol_historico_jogos")
    .select("event_id,home,away,home_score,away_score,betradar_match_id,last_minute,goals_status,goals_recorded")
    .eq("is_live", false)
    .or("goals_status.neq.ok,goals_status.is.null,goals_status.eq.unknown")
    .order("finished_at", { ascending: false })
    .limit(limit);

  let backfilled = 0;
  let fixed = 0;
  let scanned = 0;

  for (const game of games ?? []) {
    scanned += 1;
    const home = game.home_score ?? 0;
    const away = game.away_score ?? 0;
    const expected = home + away;
    if (expected <= 0) {
      await syncGoalsIntegrity(supabase, game.event_id, home, away);
      continue;
    }

    const needsWork =
      game.goals_status === "missing" ||
      game.goals_status === "partial" ||
      game.goals_status === "mismatch" ||
      game.goals_status === "unknown" ||
      game.goals_status == null ||
      (game.goals_recorded ?? 0) < expected ||
      (game.goals_recorded ?? 0) > expected;

    if (!needsWork) continue;

    if (game.goals_status === "mismatch" || (game.goals_recorded ?? 0) > expected) {
      await supabase.from("futebol_historico_gols").delete().eq("event_id", game.event_id);
    }

    const timelineResult = await fetchGoalsTimeline(
      game.event_id,
      game.betradar_match_id,
      game.home,
      game.away,
    );
    let goals = timelineResult.goals;
    if (goals.length === 0) {
      goals = inferGoalsFromFinalScore(
        game.event_id,
        home,
        away,
        game.home,
        game.away,
        game.last_minute ?? 90,
      );
    }
    if (goals.length === 0) {
      await syncGoalsIntegrity(supabase, game.event_id, home, away);
      continue;
    }

    const persist = await persistEventGoals(
      supabase,
      game.event_id,
      goals,
      [],
      home,
      away,
    );
    if (persist.status === "ok") fixed += 1;
    else if (persist.saved > 0) backfilled += 1;
  }

  return { backfilled, fixed, scanned };
}

/** Gols com minuto via Sportradar match_timeline. */
async function fetchGoalsTimeline(
  eventId: string,
  betradarMatchId: string | number | null,
  homeName: string | null,
  awayName: string | null,
): Promise<{ goals: GoalEvent[]; eventsTotal: number }> {
  if (betradarMatchId == null || betradarMatchId === "") {
    return { goals: [], eventsTotal: 0 };
  }

  const url =
    `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_timeline/${betradarMatchId}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.betano.bet.br/",
      },
    });
    if (!res.ok) return { goals: [], eventsTotal: 0 };
    const data = asRecord(await res.json());
    const doc0 = Array.isArray(data?.doc) ? asRecord(data.doc[0]) : null;
    if (String(doc0?.event ?? "") === "exception") return { goals: [], eventsTotal: 0 };
    const payload = asRecord(doc0?.data) ?? {};
    const events = payload.events ?? payload.event ?? payload.timeline;
    if (!Array.isArray(events)) return { goals: [], eventsTotal: 0 };

    const goals: GoalEvent[] = [];
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const type = String(rec.type ?? "").toLowerCase();
      const typeId = toInt(rec.typeid ?? rec._typeid ?? rec.type_id);
      const docType = String(rec._doctype ?? "").toLowerCase();
      // BD-first: aceita apenas eventos Sportradar tipados como gol
      const isGoal =
        docType === "goal" ||
        type === "goal" ||
        typeId === 30 ||
        String(rec._typeid ?? "") === "30";
      if (!isGoal) continue;
      if (Number(rec.disabled ?? 0) !== 0) continue;

      let minute: number | null = null;
      const timeField = toInt(rec.time);
      const secondsField = toInt(rec.seconds);
      if (timeField != null && timeField >= 0) {
        minute = timeField;
      } else {
        minute = toInt(
          rec.minute ??
            rec.matchtime ??
            asRecord(rec.timeinfo)?.played ??
            rec.m,
        );
        if ((minute == null || minute < 0) && secondsField != null && secondsField >= 0) {
          minute = Math.floor(secondsField / 60);
        }
      }
      if (minute == null || minute < 0) continue;

      let teamSide: string | null = null;
      const teamField = rec.team ?? rec.side ?? rec.teams;
      if (typeof teamField === "string") {
        const t = teamField.toLowerCase();
        if (t === "home" || t === "1" || t.includes("home")) teamSide = "home";
        else if (t === "away" || t === "2" || t.includes("away")) teamSide = "away";
      } else if (asRecord(teamField)) {
        const tr = asRecord(teamField)!;
        const side = String(tr.side ?? tr.qualifier ?? tr.name ?? "").toLowerCase();
        if (side === "home" || side.includes("home")) teamSide = "home";
        else if (side === "away" || side.includes("away")) teamSide = "away";
      }

      const player = rec.player != null
        ? String(asRecord(rec.player)?.name ?? rec.player)
        : rec.scorer != null
        ? String(asRecord(rec.scorer)?.name ?? rec.scorer)
        : null;

      const teamName = teamSide === "home"
        ? homeName
        : teamSide === "away"
        ? awayName
        : player;

      const result = asRecord(rec.result) ?? asRecord(rec.score);
      const srId = rec._id != null ? String(rec._id) : null;
      goals.push({
        event_id: eventId,
        sportradar_goal_id: srId,
        minute,
        team: teamName,
        team_side: teamSide,
        player,
        score_home: toInt(result?.home),
        score_away: toInt(result?.away),
      });
    }

    return { goals: dedupeGoals(goals), eventsTotal: events.length };
  } catch {
    return { goals: [], eventsTotal: 0 };
  }
}

function pressureLabel(pressure: number, thresholds: [number, number]): string {
  const [low, mid] = thresholds;
  if (pressure <= low) return "pressao baixa";
  if (pressure <= mid) return "pressao media";
  return "pressao alta";
}

function buildSignal(row: {
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_goal_kicks: number | null;
  away_goal_kicks: number | null;
}): string {
  const { minute, home_score, away_score } = row;
  const hasStats = row.home_shots_on_target != null || row.away_shots_on_target != null ||
    row.home_corners != null || row.away_corners != null ||
    row.home_goal_kicks != null || row.away_goal_kicks != null;

  if (minute == null) return "sem minuto";

  // Antes dos 85': estudo (stats disponiveis para acompanhar)
  if (minute < MIN_MINUTE_DEFAULT) {
    const sotH = row.home_shots_on_target ?? "-";
    const sotA = row.away_shots_on_target ?? "-";
    const cH = row.home_corners ?? "-";
    const cA = row.away_corners ?? "-";
    const gkH = row.home_goal_kicks ?? "-";
    const gkA = row.away_goal_kicks ?? "-";
    if (!hasStats) return `em estudo (${minute}') · stats indisponiveis`;
    return `em estudo (${minute}') · SOT ${sotH}-${sotA} · esc ${cH}-${cA} · meta ${gkH}-${gkA}`;
  }

  if (home_score == null || away_score == null) return "sem placar";

  if (home_score > away_score) {
    const tSot = row.away_shots_on_target ?? 0;
    const tCorners = row.away_corners ?? 0;
    if (!hasStats) return "manter placar (casa) · stats indisponiveis — conferir Betano";
    const risk = pressureLabel(tSot * 2 + tCorners, [4, 10]);
    return `manter placar (casa) · ${risk} no lider (perdedor SOT ${tSot}/esc ${tCorners})`;
  }
  if (away_score > home_score) {
    const tSot = row.home_shots_on_target ?? 0;
    const tCorners = row.home_corners ?? 0;
    if (!hasStats) return "manter placar (fora) · stats indisponiveis — conferir Betano";
    const risk = pressureLabel(tSot * 2 + tCorners, [4, 10]);
    return `manter placar (fora) · ${risk} no lider (perdedor SOT ${tSot}/esc ${tCorners})`;
  }

  const shots = (row.home_shots_on_target ?? 0) + (row.away_shots_on_target ?? 0);
  const corners = (row.home_corners ?? 0) + (row.away_corners ?? 0);
  if (!hasStats) return "manter empate · stats indisponiveis — conferir Betano";
  const risk = pressureLabel(shots * 2 + corners, [8, 16]);
  return `manter empate · ${risk} (SOT ${shots}, esc ${corners})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const header = req.headers.get("x-cron-secret");
    if (header !== cronSecret) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "missing supabase env" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const notes: string[] = [
    "Coleta via Edge Function (IP nuvem Supabase), sem cookie de conta.",
    "Lista todos os jogos live da Betano (futebol real).",
    "Stats: Sportradar match_details (chutes a gol, escanteios, tiros de meta).",
    "Sinal 'manter placar' so a partir dos 85'; antes disso: em estudo.",
    "Historico: jogos monitorados + gols com minuto (filtro por gol a partir de X').",
  ];

  try {
    const overview = asRecord(await betanoGet(OVERVIEW_URL));
    if (!overview) throw new Error("overview invalido");

    const events = eventsMap(overview);
    const leagues = leaguesMap(overview);
    const allEvents = Object.entries(events);
    const football = allEvents.filter(([, ev]) => isFootballEvent(asRecord(ev) ?? {}, overview));

    // Todos os jogos live (para estudar antes dos 85')
    const candidates: Array<Json & { event_id: string }> = [];
    for (const [id, raw] of football) {
      const event = asRecord(raw);
      if (!event) continue;
      candidates.push({ ...event, event_id: id });
    }

    const rows = [];
    let readyCount = 0;
    let statsOk = 0;
    let goalsSaved = 0;
    let goalsTimelineOk = 0;
    let goalsTimelineEmpty = 0;
    let goalsInferred = 0;
    let goalsMissing = 0;
    const liveIds: string[] = [];

    for (const event of candidates) {
      const eventId = String(event.event_id);
      const teams = extractTeams(event);
      const score = extractScore(event);
      const league = extractLeague(event, leagues);
      const minute = extractMinute(event);
      const injury = extractInjuryTime(event);
      const ml = extractMlOdds(eventId, overview);
      const goalsTotal = (score.home ?? 0) + (score.away ?? 0);
      let totals = extractTotalsOdds(eventId, event, overview, goalsTotal);
      if (!hasAnyTotalsOdds(totals)) {
        totals = await fetchEventTotalsOdds(eventId, goalsTotal);
      }
      const under = totals;

      const betradarId = extractBetradarMatchId(event);
      const stats = await tryFetchStats(
        betradarId != null ? String(betradarId) : null,
      );
      if (stats.available) statsOk += 1;

      const rowBase = {
        minute,
        home_score: score.home,
        away_score: score.away,
        home_shots_on_target: stats.home_shots_on_target,
        away_shots_on_target: stats.away_shots_on_target,
        home_corners: stats.home_corners,
        away_corners: stats.away_corners,
        home_goal_kicks: stats.home_goal_kicks,
        away_goal_kicks: stats.away_goal_kicks,
      };

      const signal = buildSignal(rowBase);
      if (minute != null && minute >= MIN_MINUTE_DEFAULT) readyCount += 1;

      const url = betanoUrl(eventId, teams.home, teams.away);
      liveIds.push(eventId);

      rows.push({
        event_id: eventId,
        home: teams.home,
        away: teams.away,
        league: league.league,
        country: league.country,
        minute,
        injury_time: injury,
        home_score: score.home,
        away_score: score.away,
        score: score.text,
        home_shots_on_target: stats.home_shots_on_target,
        away_shots_on_target: stats.away_shots_on_target,
        home_shots_total: stats.home_shots_total,
        away_shots_total: stats.away_shots_total,
        home_corners: stats.home_corners,
        away_corners: stats.away_corners,
        home_goal_kicks: stats.home_goal_kicks,
        away_goal_kicks: stats.away_goal_kicks,
        ml_home: ml.home,
        ml_draw: ml.draw,
        ml_away: ml.away,
        under_line: under.under_0_line,
        under_odd: under.under_0_odd,
        under_0_line: under.under_0_line,
        under_0_odd: under.under_0_odd,
        under_1_line: under.under_1_line,
        under_1_odd: under.under_1_odd,
        under_2_line: under.under_2_line,
        under_2_odd: under.under_2_odd,
        over_0_line: totals.over_0_line,
        over_0_odd: totals.over_0_odd,
        over_1_line: totals.over_1_line,
        over_1_odd: totals.over_1_odd,
        over_2_line: totals.over_2_line,
        over_2_odd: totals.over_2_odd,
        signal,
        betano_url: url,
        stats_available: stats.available,
        raw: {
          event,
          betradarMatchId: betradarId,
          stats: stats.raw,
        },
        updated_at: new Date().toISOString(),
      });

      // Historico persistente (nao apaga quando o jogo sai do live)
      const nowIso = new Date().toISOString();

      const { data: prevGame } = await supabase
        .from("futebol_historico_jogos")
        .select("home_score,away_score,odds_85_captured_at")
        .eq("event_id", eventId)
        .maybeSingle();
      const prevHome = prevGame?.home_score ?? 0;
      const prevAway = prevGame?.away_score ?? 0;
      const currHome = score.home ?? 0;
      const currAway = score.away ?? 0;

      const shotsSum =
        stats.home_shots_on_target != null || stats.away_shots_on_target != null
          ? (stats.home_shots_on_target ?? 0) + (stats.away_shots_on_target ?? 0)
          : null;
      const cornersSum =
        stats.home_corners != null || stats.away_corners != null
          ? (stats.home_corners ?? 0) + (stats.away_corners ?? 0)
          : null;
      const kicksSum =
        stats.home_goal_kicks != null || stats.away_goal_kicks != null
          ? (stats.home_goal_kicks ?? 0) + (stats.away_goal_kicks ?? 0)
          : null;
      const cteSum =
        shotsSum != null || cornersSum != null || kicksSum != null
          ? (shotsSum ?? 0) + (cornersSum ?? 0) + (kicksSum ?? 0)
          : null;

      await supabase.from("futebol_historico_jogos").upsert({
        event_id: eventId,
        betradar_match_id: betradarId != null ? String(betradarId) : null,
        home: teams.home,
        away: teams.away,
        league: league.league,
        country: league.country,
        home_score: score.home,
        away_score: score.away,
        score: score.text,
        last_minute: minute,
        shots_on_target: shotsSum,
        corners: cornersSum,
        goal_kicks: kicksSum,
        cte: cteSum,
        is_live: true,
        betano_url: url,
        last_seen_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: "event_id" });

      // Congela odds aos 85' (primeira coleta >= 85); nao altera depois
      if (
        minute != null &&
        minute >= MIN_MINUTE_DEFAULT &&
        !prevGame?.odds_85_captured_at
      ) {
        let snap = totals;
        if (!hasAnyTotalsOdds(snap)) {
          snap = await fetchEventTotalsOdds(eventId, goalsTotal);
        }
        await supabase
          .from("futebol_historico_jogos")
          .update({
            odd_under_05: snap.under_0_odd,
            odd_under_15: snap.under_1_odd,
            odd_under_25: snap.under_2_odd,
            odd_over_05: snap.over_0_odd,
            odd_over_15: snap.over_1_odd,
            odd_over_25: snap.over_2_odd,
            odd_under_05_line: snap.under_0_line,
            odd_under_15_line: snap.under_1_line,
            odd_under_25_line: snap.under_2_line,
            odd_over_05_line: snap.over_0_line,
            odd_over_15_line: snap.over_1_line,
            odd_over_25_line: snap.over_2_line,
            odds_85_minute: minute,
            odds_85_score: score.text,
            odds_85_captured_at: nowIso,
          })
          .eq("event_id", eventId)
          .is("odds_85_captured_at", null);
      }

      const timelineResult = await fetchGoalsTimeline(
        eventId,
        betradarId != null ? String(betradarId) : null,
        teams.home,
        teams.away,
      );
      const timelineGoals = timelineResult.goals;
      if (timelineGoals.length > 0) goalsTimelineOk += 1;
      else if (betradarId != null && goalsTotal > 0) goalsTimelineEmpty += 1;

      const inferredGoals = inferGoalsFromScoreDelta(
        eventId,
        prevHome,
        prevAway,
        currHome,
        currAway,
        minute,
        teams.home,
        teams.away,
      );
      if (inferredGoals.length > 0) goalsInferred += inferredGoals.length;

      const persist = await persistEventGoals(
        supabase,
        eventId,
        timelineGoals,
        inferredGoals,
        score.home,
        score.away,
      );
      if (persist.saved > 0) goalsSaved += persist.saved;
      if (persist.source === "missing" || persist.status === "missing" || persist.status === "partial") {
        goalsMissing += 1;
      }
    }

    const reconcile = await reconcileHistoricGoals(supabase, 120);

    // jogos que sairam do live: marca is_live=false
    if (liveIds.length > 0) {
      await supabase
        .from("futebol_historico_jogos")
        .update({
          is_live: false,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("is_live", true)
        .not("event_id", "in", `(${liveIds.join(",")})`);
    }

    rows.sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0));

    // substitui snapshot: remove jogos que sairam da janela
    const keepIds = rows.map((r) => r.event_id);
    if (keepIds.length > 0) {
      await supabase.from("futebol_live_rows").upsert(rows, { onConflict: "event_id" });
      await supabase
        .from("futebol_live_rows")
        .delete()
        .not("event_id", "in", `(${keepIds.join(",")})`);
    } else {
      // delete all rows
      await supabase.from("futebol_live_rows").delete().gte("updated_at", "1970-01-01");
    }

    await supabase.from("futebol_live_meta").upsert({
      id: 1,
      source: "betano-danae+sportradar",
      fetched_at: new Date().toISOString(),
      live_total: football.length,
      candidates: readyCount,
      total: rows.length,
      notes: [
        ...notes,
        `Stats ok em ${statsOk}/${rows.length} jogos.`,
        `Prontos para manter placar (>=85'): ${readyCount}.`,
        `Gols gravados no historico nesta rodada: ${goalsSaved}.`,
        `Gols timeline ok: ${goalsTimelineOk}, timeline vazia c/ placar: ${goalsTimelineEmpty}, inferidos: ${goalsInferred}, sem gols c/ placar: ${goalsMissing}.`,
        `Reconciliacao historico: ${reconcile.scanned} analisados, ${reconcile.fixed} ok, ${reconcile.backfilled} parcial/missing.`,
      ],
      last_error: null,
      updated_at: new Date().toISOString(),
    });

    await supabase.from("futebol_live_coleta_config").update({
      last_run_at: new Date().toISOString(),
      last_saved_count: rows.length,
      last_error: null,
      data_atualizacao: new Date().toISOString(),
    }).eq("id", "default");

    return jsonResponse({
      ok: true,
      live_total: football.length,
      ready_85: readyCount,
      stats_ok: statsOk,
      total: rows.length,
      sample: rows.slice(0, 5).map((r) => ({
        home: r.home,
        away: r.away,
        minute: r.minute,
        score: r.score,
        sot: `${r.home_shots_on_target}-${r.away_shots_on_target}`,
        corners: `${r.home_corners}-${r.away_corners}`,
        goal_kicks: `${r.home_goal_kicks}-${r.away_goal_kicks}`,
        odd0: r.under_0_odd,
        odd1: r.under_1_odd,
        odd2: r.under_2_odd,
        signal: r.signal,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("futebol_live_meta").upsert({
      id: 1,
      source: "betano-danae",
      last_error: message,
      updated_at: new Date().toISOString(),
    });
    await supabase.from("futebol_live_coleta_config").update({
      last_error: message,
      data_atualizacao: new Date().toISOString(),
    }).eq("id", "default");
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

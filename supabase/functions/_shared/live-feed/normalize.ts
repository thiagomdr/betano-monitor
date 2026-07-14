/**
 * Normalize a Danae-style live overview JSON into provider-agnostic drafts.
 * Host/brand names stay outside this module (env wiring lives in the Edge fn).
 */

import type {
  EventDraft,
  EventStatus,
  Json,
  MarketDraft,
  MarketKey,
  MarketStatus,
  SelectionDraft,
  SelectionKey,
} from "./types.ts";
import { isLowPriorityCompetition } from "./league-priority.ts";

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
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

/** Arena odds = feed × (1 - 14.5%). Applied at persist time so picks/settle match the UI. */
export const ARENA_ODDS_HAIRCUT = 0.145;
export const ARENA_ODDS_FACTOR = 1 - ARENA_ODDS_HAIRCUT;

export function applyArenaOdd(price: number): number {
  const cut = price * ARENA_ODDS_FACTOR;
  const rounded = Math.round(cut * 100) / 100;
  return Math.max(1.01, rounded);
}

function eventsMap(overview: Json): Json {
  const events = overview.events;
  if (Array.isArray(events)) {
    const out: Json = {};
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const id = rec.id ?? rec.eventId;
      if (id != null) out[String(id)] = rec;
    }
    return out;
  }
  return asRecord(events) ?? {};
}

function leaguesMap(overview: Json): Json {
  return asRecord(overview.leagues) ?? asRecord(overview.leaguesById) ?? {};
}

function regionsMap(overview: Json): Json {
  return asRecord(overview.regions) ??
    asRecord(overview.regionsById) ??
    asRecord(overview.countries) ??
    {};
}

function extractCountry(
  event: Json,
  league: Json | null,
  overview: Json,
): string | null {
  const direct = [
    event.regionName,
    event.countryName,
    event.country,
    event.region,
    league?.regionName,
    league?.country,
    league?.region,
    league?.areaName,
    league?.locationName,
    league?.parentName,
  ];
  for (const v of direct) {
    if (v != null && String(v).trim()) return String(v).trim();
  }

  const regionId = league?.regionId ?? league?.countryId ?? league?.areaId ??
    event.regionId ?? event.countryId;
  if (regionId != null) {
    const regions = regionsMap(overview);
    const rec = asRecord(regions[String(regionId)]);
    if (rec) {
      const name = rec.name ?? rec.shortName ?? rec.regionName;
      if (name != null && String(name).trim()) return String(name).trim();
    }
  }

  // Reverse lookup: region whose leagueIdList contains this league
  const leagueId = league?.id ?? event.leagueId ?? event.competitionId;
  if (leagueId != null) {
    const regions = regionsMap(overview);
    const lid = String(leagueId);
    for (const recVal of Object.values(regions)) {
      const rec = asRecord(recVal);
      if (!rec) continue;
      const list = rec.leagueIdList ?? rec.leagueIds ?? rec.competitionIdList;
      if (!Array.isArray(list)) continue;
      if (list.map(String).includes(lid)) {
        const name = rec.name ?? rec.shortName ?? rec.regionName;
        if (name != null && String(name).trim()) return String(name).trim();
      }
    }

    // sports.byId.FOOT sometimes has region → leagues nesting
    const sports = asRecord(overview.sports);
    const byId = asRecord(sports?.byId);
    const foot = asRecord(byId?.FOOT);
    const regionIds = foot?.regionIdList ?? foot?.regionIds;
    if (Array.isArray(regionIds)) {
      const regions2 = regionsMap(overview);
      for (const rid of regionIds) {
        const rec = asRecord(regions2[String(rid)]);
        if (!rec) continue;
        const list = rec.leagueIdList ?? rec.leagueIds;
        if (Array.isArray(list) && list.map(String).includes(lid)) {
          const name = rec.name ?? rec.shortName;
          if (name != null && String(name).trim()) return String(name).trim();
        }
      }
    }
  }

  // Some overviews nest region on league.region object
  const nested = asRecord(league?.regionObj) ??
    (typeof league?.region === "object" ? asRecord(league.region) : null);
  if (nested) {
    const name = nested.name ?? nested.shortName ?? nested.regionName;
    if (name != null && String(name).trim()) return String(name).trim();
  }

  return null;
}

function isEsportsSportCode(code: unknown): boolean {
  const k = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!k) return false;
  // Feed uses ESPS (4-letter); also cover full/hyphenated variants.
  return (
    k === "ESPS" ||
    k === "ESPORT" ||
    k === "ESPORTS" ||
    k.startsWith("ESPORT") ||
    k.includes("ESPORT")
  );
}

function isVirtualOrEsportsEvent(event: Json, leagueName: string | null): boolean {
  const sportId = String(event.sportId ?? event.sportTypeId ?? "").toUpperCase();
  if (sportId === "VRTS" || sportId === "VIRTUAL" || sportId === "VIRT") return true;
  if (isEsportsSportCode(sportId)) return true;

  const sportKey = String(event.sportKey ?? event.sport ?? "").toUpperCase();
  if (
    sportKey.includes("VIRTUAL") || sportKey.includes("VRTS") ||
    isEsportsSportCode(sportKey) || sportKey.includes("E-SPORT")
  ) {
    return true;
  }

  const participants = Array.isArray(event.participants)
    ? event.participants.map((p) => {
      const rec = asRecord(p);
      return String(rec?.name ?? rec?.participantName ?? rec?.shortName ?? "");
    }).join(" ")
    : "";

  const blob = [
    leagueName,
    event.leagueName,
    event.name,
    event.eventName,
    event.home,
    event.away,
    participants,
    asRecord(event.league)?.name,
    asRecord(event.competition)?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    blob.includes("virtual") ||
    blob.includes("virtuais") ||
    blob.includes("esports") ||
    blob.includes("e-sports") ||
    blob.includes("e sports") ||
    blob.includes("esport battle") ||
    blob.includes("simulado") ||
    /\bgaming\b/.test(blob)
  ) {
    return true;
  }

  // Operator e-sports / short-format sims (FIFA Battle, NBA 2K, etc.)
  if (
    blob.includes("minutos de jogo") ||
    blob.includes("minutes of play") ||
    blob.includes("nba 2k") ||
    blob.includes("eadriatic") ||
    blob.includes("h2h gg") ||
    blob.includes("gt leagues") ||
    blob.includes("king growth") ||
    /\bbattle\b/.test(blob)
  ) {
    return true;
  }

  return false;
}

/** All real live 2-way events except virtual + esports. */
function isEligibleLiveEvent(
  event: Json,
  _overview: Json,
  leagueName: string | null = null,
): boolean {
  if (event.isOutrightEvent === true) return false;
  const participants = event.participants;
  if (!Array.isArray(participants) || participants.length < 2) return false;
  if (isVirtualOrEsportsEvent(event, leagueName)) return false;
  return true;
}

const SPORT_CODE_MAP: Record<string, string> = {
  "1": "football",
  FOOT: "football",
  FOOTBALL: "football",
  SOCCER: "football",
  BASK: "basketball",
  BK: "basketball",
  BASKETBALL: "basketball",
  TENN: "tennis",
  TENNIS: "tennis",
  VOLL: "volleyball",
  VOLLEY: "volleyball",
  VOLLEYBALL: "volleyball",
  ICEH: "hockey",
  HOCKEY: "hockey",
  IH: "hockey",
  HAND: "handball",
  HANDBALL: "handball",
  BASE: "baseball",
  BASEBALL: "baseball",
  AMFB: "american_football",
  AF: "american_football",
  RUGBY: "rugby",
  RUGU: "rugby",
  TABLE: "table_tennis",
  TABL: "table_tennis",
  TT: "table_tennis",
  BADM: "badminton",
  BADMINTON: "badminton",
  DART: "darts",
  DARTS: "darts",
  SNOOK: "snooker",
  SNOOKER: "snooker",
  BOX: "boxing",
  BOXING: "boxing",
  MMA: "mma",
  FUTSAL: "futsal",
  FUTS: "futsal",
};

function extractSport(event: Json, overview: Json, league: Json | null): string {
  const raw = event.sportId ?? event.sportTypeId ?? event.sportKey ?? event.sport;
  if (raw != null && String(raw).trim()) {
    const key = String(raw).toUpperCase().trim();
    if (SPORT_CODE_MAP[key]) return SPORT_CODE_MAP[key];
    const lower = key.toLowerCase();
    if (lower.includes("foot") || lower.includes("soccer")) return "football";
    if (lower.includes("basket")) return "basketball";
    if (lower.includes("tennis") && !lower.includes("table")) return "tennis";
    if (lower.includes("table") || lower === "tabl") return "table_tennis";
    if (lower.includes("badm")) return "badminton";
    if (lower.includes("volley")) return "volleyball";
    if (lower.includes("hockey") || lower.includes("ice")) return "hockey";
    if (lower.includes("hand")) return "handball";
    if (lower.includes("baseball")) return "baseball";
    if (lower.includes("rugby")) return "rugby";
    if (lower.includes("futsal")) return "futsal";
    // Prefer humanized code over opaque ids
    if (!/^\d+$/.test(key)) return lower.replace(/[^a-z0-9]+/g, "_");
  }

  const leagueId = event.leagueId ?? event.competitionId;
  const sports = asRecord(overview.sports);
  const byId = asRecord(sports?.byId);
  if (leagueId != null && byId) {
    for (const [sportCode, sportVal] of Object.entries(byId)) {
      const rec = asRecord(sportVal);
      const list = rec?.leagueIdList;
      if (Array.isArray(list) && list.map(String).includes(String(leagueId))) {
        const mapped = SPORT_CODE_MAP[String(sportCode).toUpperCase()];
        if (mapped) return mapped;
        return String(sportCode).toLowerCase();
      }
    }
  }

  const byIdLeague = asRecord(sports?.byIdLeagueIdList);
  if (leagueId != null && byIdLeague) {
    for (const [sportCode, list] of Object.entries(byIdLeague)) {
      if (Array.isArray(list) && list.map(String).includes(String(leagueId))) {
        const mapped = SPORT_CODE_MAP[String(sportCode).toUpperCase()];
        if (mapped) return mapped;
        return String(sportCode).toLowerCase();
      }
    }
  }

  const leagueSport = league?.sportId ?? league?.sportKey ?? league?.sport;
  if (leagueSport != null) {
    const mapped = SPORT_CODE_MAP[String(leagueSport).toUpperCase()];
    if (mapped) return mapped;
  }

  return "other";
}

function extractTeams(event: Json): { home: string; away: string } {
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
    return { home: home || "Casa", away: away || "Fora" };
  }
  const home =
    event.home != null
      ? String(event.home)
      : String(asRecord(event.homeTeam)?.name ?? "Casa");
  const away =
    event.away != null
      ? String(event.away)
      : String(asRecord(event.awayTeam)?.name ?? "Fora");
  return { home, away };
}

function extractScore(event: Json): { home: number | null; away: number | null } {
  const liveData = asRecord(event.liveData) ?? asRecord(event.live) ?? asRecord(event.liveDataDTO);
  let home = toInt(
    event.homeScore ??
      liveData?.homeScore ??
      asRecord(liveData?.score)?.home ??
      asRecord(event.score)?.home ??
      asRecord(event.results)?.home,
  );
  let away = toInt(
    event.awayScore ??
      liveData?.awayScore ??
      asRecord(liveData?.score)?.away ??
      asRecord(event.score)?.away ??
      asRecord(event.results)?.away,
  );
  if ((home == null || away == null) && typeof event.score === "string") {
    const m = String(event.score).match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) {
      home = toInt(m[1]);
      away = toInt(m[2]);
    }
  }
  return { home, away };
}

function parseClockToMinute(value: unknown): number | null {
  const n = toInt(value);
  if (n != null) return n;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const m = trimmed.match(/^(\d{1,3})\s*(?:[':]|\s|$)/);
    if (m) return Number(m[1]);
  }
  return null;
}

function extractMinute(event: Json): number | null {
  const direct = parseClockToMinute(
    event.minute ??
      event.matchMinute ??
      event.elapsed ??
      event.totalElapsedMinutes ??
      event.time ??
      event.gameTime ??
      event.clock,
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
    asRecord(event.liveDataDTO) ?? asRecord(event.match) ?? asRecord(event.game);
  if (liveData) {
    const m = parseClockToMinute(
      liveData.minute ??
        liveData.elapsed ??
        liveData.matchMinute ??
        liveData.time ??
        liveData.gameMinute ??
        liveData.matchTime ??
        liveData.clock,
    );
    if (m != null) return m;

    const liveClock = asRecord(liveData.clock);
    const clockMin = parseClockToMinute(
      liveClock?.minute ?? liveClock?.minutes ?? liveClock?.displayTime,
    );
    if (clockMin != null) return clockMin;

    const s = toInt(
      liveData.totalElapsedSeconds ??
        liveData.elapsedSeconds ??
        liveData.seconds ??
        liveClock?.secondsSinceStart ??
        liveClock?.seconds,
    );
    if (s != null) return Math.floor(s / 60);
  }

  return null;
}

function marketSuspended(market: Json): boolean {
  const mStatus = String(market.status ?? market.tradingStatus ?? market.marketStatus ?? "")
    .toLowerCase();
  return (
    market.suspended === true ||
    market.isSuspended === true ||
    mStatus.includes("suspend") ||
    mStatus === "closed" ||
    mStatus === "settled" ||
    mStatus === "deactivated"
  );
}

function selectionSuspended(sel: Json): boolean {
  const sStatus = String(sel.status ?? sel.tradingStatus ?? "").toLowerCase();
  return (
    sel.suspended === true ||
    sel.isSuspended === true ||
    sStatus.includes("suspend") ||
    sStatus === "closed" ||
    sStatus === "settled"
  );
}

function statusFromMarket(market: Json): MarketStatus {
  return marketSuspended(market) ? "suspended" : "open";
}

function eventStatus(event: Json): EventStatus {
  const st = String(event.status ?? event.eventStatus ?? event.tradingStatus ?? "")
    .toLowerCase();
  if (st.includes("suspend")) return "suspended";
  if (st.includes("cancel")) return "cancelled";
  if (st.includes("finish") || st.includes("ended") || st === "closed" || st === "ft") {
    return "finished";
  }
  const isLive = event.isLive === true || event.live === true || st === "live" || st === "";
  return isLive ? "live" : "live";
}

function extractBetradarId(event: Json): string | null {
  const liveData = asRecord(event.liveData) ?? asRecord(event.liveDataDTO);
  const providers = asRecord(event.externalProviders) ?? asRecord(event.providers);
  const raw =
    event.betradarMatchId ??
    event.betradarId ??
    event.sportradarMatchId ??
    liveData?.betradarMatchId ??
    liveData?.betradarId ??
    liveData?.sportradarMatchId ??
    providers?.betradar;
  if (raw == null || raw === "") return null;
  return String(raw);
}

function marketIdsForEvent(
  eventId: string,
  event: Json,
  overview: Json,
  opts: { allMarkets?: boolean } = {},
): string[] {
  const markets = asRecord(overview.markets) ?? {};
  if (opts.allMarkets) return Object.keys(markets);

  const ids = new Set<string>();
  if (Array.isArray(event.marketIdList)) {
    for (const id of event.marketIdList) ids.add(String(id));
  }
  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec) continue;
    if (String(rec.eventId ?? rec.eventID ?? "") === eventId) ids.add(mid);
  }
  return [...ids];
}

function selectionIds(marketId: string, market: Json, selections: Json): string[] {
  if (Array.isArray(market.selectionIdList)) {
    return market.selectionIdList.map(String);
  }
  return Object.keys(selections).filter((sid) => {
    const s = asRecord(selections[sid]);
    return s && String(s.marketId ?? "") === marketId;
  });
}

function lineFromText(...parts: unknown[]): number | null {
  for (const part of parts) {
    const m = String(part ?? "").match(/(\d+[.,]\d+|\d+)/);
    if (!m) continue;
    const line = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(line) && line > 0) return line;
  }
  return null;
}

function classifyMarket(
  market: Json,
  sampleSels: Json[] = [],
): { key: MarketKey; line: number | null } | null {
  const name = String(market.name ?? market.typeName ?? market.marketType ?? "").toLowerCase();
  const typeId = String(market.typeId ?? market.marketTypeId ?? "");
  const typeCode = String(market.type ?? market.typeName ?? "").toLowerCase();
  const combined = `${name} ${String(market.typeName ?? "").toLowerCase()} ${typeCode}`;

  if (
    combined.includes("escanteio") || combined.includes("corner") ||
    combined.includes("cartão") || combined.includes("cartao") ||
    (combined.includes("card") && !combined.includes("discard"))
  ) {
    return null;
  }

  // Prefer absolute match totals; skip "remaining goals" markets.
  if (
    combined.includes("restante") || combined.includes("remaining") ||
    combined.includes("rest of") || combined.includes("restantes")
  ) {
    return null;
  }

  const is1x2 =
    name.includes("resultado") ||
    name.includes("1x2") ||
    name.includes("moneyline") ||
    name.includes("money line") ||
    name.includes("vencedor") ||
    name.includes("match winner") ||
    name.includes("to win") ||
    name === "ml" ||
    typeCode === "ml" ||
    typeId === "1" ||
    typeId === "100";
  if (
    is1x2 &&
    !combined.includes("dupla") &&
    !combined.includes("double") &&
    !combined.includes("handicap")
  ) {
    return { key: "1x2", line: null };
  }

  if (
    combined.includes("ambas as equipes") ||
    combined.includes("ambas equipes") ||
    (combined.includes("ambas") && combined.includes("marcam")) ||
    combined.includes("btts") ||
    combined.includes("both teams") ||
    combined.includes("gg/ng")
  ) {
    return { key: "btts", line: null };
  }

  if (
    combined.includes("chance dupla") ||
    combined.includes("double chance") ||
    combined.includes("empate anula")
  ) {
    return { key: "double_chance", line: null };
  }

  const looksTotal =
    combined.includes("total") ||
    combined.includes("mais/menos") ||
    combined.includes("over/under") ||
    combined.includes("over under") ||
    combined.includes("mais de") ||
    combined.includes("menos de") ||
    typeId === "13" ||
    typeCode === "hctg" ||
    typeCode.startsWith("ou") ||
    /^ou\b/i.test(typeCode);
  const totalSubject =
    combined.includes("gol") ||
    combined.includes("goal") ||
    combined.includes("ponto") ||
    combined.includes("point") ||
    combined.includes("run") ||
    combined.includes("game") ||
    combined.includes("set") ||
    combined.includes("jogo") ||
    combined.includes("mais") ||
    combined.includes("menos") ||
    looksTotal;

  if (looksTotal && totalSubject) {
    let line = toNum(market.handicap ?? market.line ?? market.points);
    if (line == null) {
      line = lineFromText(market.name, market.shortName, ...sampleSels.map((s) => s.name));
    }
    if (line != null && line > 0) {
      return { key: "total", line };
    }
  }

  // Two-way mais/menos selections without a clear market title
  if (sampleSels.length >= 2) {
    const names = sampleSels.map((s) => String(s.name ?? "").toLowerCase());
    const hasOver = names.some((n) => n.includes("mais") || n.includes("over") || n.startsWith("+"));
    const hasUnder = names.some((n) => n.includes("menos") || n.includes("under") || n.startsWith("-"));
    if (hasOver && hasUnder) {
      const line = toNum(market.handicap ?? market.line ?? market.points) ??
        lineFromText(...sampleSels.map((s) => s.name));
      if (line != null && line > 0) return { key: "total", line };
    }
  }

  return null;
}

function map1x2Key(sel: Json): SelectionKey | null {
  const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
  const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
  if (sname === "x" || sname.includes("empate") || stype.includes("draw")) return "draw";
  if (
    sname === "1" || stype === "home" || stype.includes("home") ||
    stype.includes("player1") || sname.includes("player 1") ||
    sel.isHome === true
  ) {
    return "home";
  }
  if (
    sname === "2" || stype === "away" || stype.includes("away") ||
    stype.includes("player2") || sname.includes("player 2") ||
    sel.isAway === true
  ) {
    return "away";
  }
  return null;
}

function mapBttsKey(sel: Json): SelectionKey | null {
  const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
  if (sname === "sim" || sname === "yes" || sname === "gg" || sname.includes("sim")) return "yes";
  if (sname === "não" || sname === "nao" || sname === "no" || sname === "ng") return "no";
  const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
  if (stype.includes("yes") || stype === "gg") return "yes";
  if (stype.includes("no") || stype === "ng") return "no";
  return null;
}

function mapDoubleChanceKey(sel: Json): SelectionKey | null {
  const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase().replace(/\s+/g, "");
  if (sname === "1x" || sname.includes("1x") || sname.includes("casaouempate")) return "1x";
  if (sname === "x2" || sname.includes("x2") || sname.includes("empateoufora")) return "x2";
  if (sname === "12" || sname.includes("12") || sname.includes("casaoufora")) return "12";
  return null;
}

function mapTotalKey(sel: Json): SelectionKey | null {
  const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
  const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
  if (
    sname.includes("mais") || sname.includes("over") || sname.startsWith("+") ||
    stype.includes("over")
  ) return "over";
  if (
    sname.includes("menos") || sname.includes("under") || sname.startsWith("-") ||
    stype.includes("under")
  ) return "under";
  return null;
}

function buildSelections(
  marketKey: MarketKey,
  marketId: string,
  market: Json,
  selectionsRoot: Json,
): SelectionDraft[] {
  const out: SelectionDraft[] = [];
  const seen = new Set<string>();
  const pending: { sel: Json; sid: string; price: number }[] = [];

  const candidates: { sel: Json; sid: string }[] = [];
  for (const sid of selectionIds(marketId, market, selectionsRoot)) {
    const sel = asRecord(selectionsRoot[sid]);
    if (sel) candidates.push({ sel, sid });
  }
  if (Array.isArray(market.selections)) {
    for (const item of market.selections) {
      const sel = asRecord(item);
      if (!sel) continue;
      const sid = String(sel.id ?? sel.selectionId ?? `${marketId}-${candidates.length}`);
      candidates.push({ sel, sid });
    }
  }

  for (const { sel, sid } of candidates) {
    const price = toNum(
      sel.price ?? sel.odds ?? sel.decimalOdds ??
        asRecord(sel.odds)?.decimal ?? asRecord(sel.price)?.decimal,
    );
    if (price == null || !(price >= 1.01)) continue;

    let key: SelectionKey | null = null;
    if (marketKey === "1x2") key = map1x2Key(sel);
    else if (marketKey === "btts") key = mapBttsKey(sel);
    else if (marketKey === "double_chance") key = mapDoubleChanceKey(sel);
    else if (marketKey === "total") key = mapTotalKey(sel);

    if (!key) {
      if (marketKey === "1x2") pending.push({ sel, sid, price });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      selection_key: key,
      odd: applyArenaOdd(price),
      status: selectionSuspended(sel) ? "suspended" : "open",
      provider_selection_id: sid,
    });
  }

  // Tennis / named ML: map leftover 2-way sides by order when home/away keys missing.
  if (marketKey === "1x2" && pending.length && !seen.has("home") && !seen.has("away")) {
    const ordered = pending.slice(0, 2);
    const keys: SelectionKey[] = ["home", "away"];
    ordered.forEach((item, i) => {
      const key = keys[i];
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push({
        selection_key: key,
        odd: applyArenaOdd(item.price),
        status: selectionSuspended(item.sel) ? "suspended" : "open",
        provider_selection_id: item.sid,
      });
    });
  }

  return out;
}

function allowsFootballExclusiveMarkets(sport: string): boolean {
  const s = String(sport || "").toLowerCase();
  return s === "football" || s === "futsal" || s === "soccer";
}

function buildMarketsForEvent(
  eventId: string,
  event: Json,
  overview: Json,
  opts: { maxTotals?: number; allMarkets?: boolean; sport?: string } = {},
): MarketDraft[] {
  const marketsRoot = asRecord(overview.markets) ?? {};
  const selectionsRoot = asRecord(overview.selections) ?? {};
  const drafts: MarketDraft[] = [];
  const seen = new Set<string>();
  const maxTotals = opts.maxTotals ?? 4;
  const sport = opts.sport || "other";
  const footExclusive = allowsFootballExclusiveMarkets(sport);

  for (const mid of marketIdsForEvent(eventId, event, overview, {
    allMarkets: opts.allMarkets,
  })) {
    const market = asRecord(marketsRoot[mid]);
    if (!market) continue;

    const sampleSels: Json[] = [];
    for (const sid of selectionIds(mid, market, selectionsRoot)) {
      const sel = asRecord(selectionsRoot[sid]);
      if (sel) sampleSels.push(sel);
    }
    // Nested selections still on the market object (offers tree)
    if (Array.isArray(market.selections)) {
      for (const item of market.selections) {
        const s = asRecord(item);
        if (s) sampleSels.push(s);
      }
    }

    const classified = classifyMarket(market, sampleSels);
    if (!classified) continue;
    if (
      !footExclusive &&
      (classified.key === "btts" || classified.key === "double_chance")
    ) {
      continue;
    }

    const selections = buildSelections(
      classified.key,
      mid,
      market,
      selectionsRoot,
    );
    if (!selections.length) continue;

    if (classified.key === "1x2") {
      const hasHome = selections.some((s) => s.selection_key === "home");
      const hasAway = selections.some((s) => s.selection_key === "away");
      if (!hasHome || !hasAway) continue;
    }
    if (classified.key === "btts" && selections.length < 2) continue;
    if (classified.key === "total" && selections.length < 2) continue;

    const uniq = `${classified.key}:${classified.line ?? "null"}`;
    if (seen.has(uniq)) continue;
    seen.add(uniq);

    drafts.push({
      market_key: classified.key,
      line: classified.line,
      status: statusFromMarket(market),
      provider_market_id: mid,
      selections,
    });
  }

  const totals = drafts.filter((d) => d.market_key === "total");
  if (totals.length > maxTotals) {
    const goals =
      (toInt(asRecord(event.results)?.home ?? event.homeScore) ?? 0) +
      (toInt(asRecord(event.results)?.away ?? event.awayScore) ?? 0);
    const need = goals + 0.5;
    totals.sort((a, b) => Math.abs((a.line ?? 99) - need) - Math.abs((b.line ?? 99) - need));
    const keep = new Set(totals.slice(0, maxTotals).map((t) => t.line));
    return drafts.filter((d) => d.market_key !== "total" || keep.has(d.line));
  }

  return drafts;
}

/** Tennis/racket: keep match-level game totals; drop micro set/point OU ladders. */
function refineTotalsForSport(
  drafts: MarketDraft[],
  sport: string,
  maxTotals: number,
): MarketDraft[] {
  if (allowsFootballExclusiveMarkets(sport)) return drafts;
  const s = String(sport || "").toLowerCase();
  const isRacket = s === "tennis" || s === "table_tennis" || s === "badminton";
  if (!isRacket) return drafts;

  const others = drafts.filter((d) => d.market_key !== "total");
  let totals = drafts.filter((d) => d.market_key === "total" && d.line != null);
  // Match total games usually 10.5+; 0.5–9.5 are mostly set/game micro markets.
  const matchLevel = totals.filter((t) => (t.line as number) >= 10.5);
  if (matchLevel.length >= 2) totals = matchLevel;
  totals.sort((a, b) => (a.line as number) - (b.line as number));
  if (totals.length > maxTotals) {
    const mid = Math.floor(totals.length / 2);
    const half = Math.floor(maxTotals / 2);
    const start = Math.max(0, mid - half);
    totals = totals.slice(start, start + maxTotals);
  }
  return [...others, ...totals];
}

/**
 * Markets for one event from a scoped overview (`…&eventId=`) and/or merged offers.
 * Skips catalog eligibility — the event is already in the Arena.
 */
export function extractScopedEventMarkets(
  overviewRaw: unknown,
  providerEventId: string,
  opts: { maxTotals?: number; allMarkets?: boolean; sport?: string } = {},
): MarketDraft[] {
  const overview = asRecord(overviewRaw);
  if (!overview) return [];

  const events = eventsMap(overview);
  const want = String(providerEventId);
  let event = asRecord(events[want] ?? events[Number(want)]);
  let resolvedId = want;

  if (!event) {
    const keys = Object.keys(events);
    if (keys.length === 1) {
      resolvedId = keys[0];
      event = asRecord(events[resolvedId]);
    }
  }
  if (!event) {
    // Offers-only payload: synthesize a stub event so we can still classify markets
    if (opts.allMarkets && Object.keys(asRecord(overview.markets) ?? {}).length) {
      event = { id: want, marketIdList: Object.keys(asRecord(overview.markets) ?? {}) };
      resolvedId = want;
    } else {
      return [];
    }
  }

  const sport = opts.sport || extractSport(event, overview, null) || "other";

  return refineTotalsForSport(
    buildMarketsForEvent(resolvedId, event, overview, {
      maxTotals: opts.maxTotals ?? 8,
      allMarkets: opts.allMarkets === true,
      sport,
    }),
    sport,
    opts.maxTotals ?? 4,
  );
}

/**
 * Convert overview payload into EventDraft[].
 */
export function normalizeOverview(overviewRaw: unknown): EventDraft[] {
  const overview = asRecord(overviewRaw);
  if (!overview) return [];

  const events = eventsMap(overview);
  const leagues = leaguesMap(overview);
  const out: EventDraft[] = [];

  for (const [eventId, eventVal] of Object.entries(events)) {
    const event = asRecord(eventVal);
    if (!event) continue;
    const leagueId = event.leagueId ?? event.competitionId ?? event.leagueID;
    const league = leagueId != null ? asRecord(leagues[String(leagueId)]) : null;
    const leagueName = league
      ? String(league.name ?? league.shortName ?? "")
      : String(event.leagueName ?? "");
    const countryName = extractCountry(event, league, overview);

    if (!isEligibleLiveEvent(event, overview, leagueName || null)) continue;

    const teams = extractTeams(event);
    const score = extractScore(event);
    const minute = extractMinute(event);
    const sport = extractSport(event, overview, league);

    if (
      isLowPriorityCompetition({
        league: leagueName,
        country: countryName,
        sport,
      })
    ) {
      continue;
    }

    const markets = refineTotalsForSport(
      buildMarketsForEvent(eventId, event, overview, { sport, maxTotals: 4 }),
      sport,
      4,
    );
    if (!markets.length) continue;

    out.push({
      provider_event_id: eventId,
      sport,
      league: leagueName || null,
      league_id: leagueId != null ? String(leagueId) : null,
      country: countryName,
      home: teams.home,
      away: teams.away,
      minute,
      home_score: score.home,
      away_score: score.away,
      status: eventStatus(event),
      betradar_id: extractBetradarId(event),
      markets,
      raw: {
        provider_event_id: eventId,
        sport,
        league_id: leagueId != null ? String(leagueId) : null,
        country: countryName,
        minute,
        home_score: score.home,
        away_score: score.away,
        arena_odds_haircut: ARENA_ODDS_HAIRCUT,
      },
    });
  }

  return out;
}

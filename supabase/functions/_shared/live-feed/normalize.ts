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

function isFootballEvent(event: Json, overview: Json): boolean {
  if (event.isOutrightEvent === true) return false;
  const participants = event.participants;
  if (!Array.isArray(participants) || participants.length < 2) return false;

  // Tipster Arena: keep FOOT esports (more live inventory); still drop pure other sports.
  // Virtual football uses sportId VRTS and is excluded below.

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

  const byIdLeague = asRecord(sports?.byIdLeagueIdList);
  const footLeagues = byIdLeague?.FOOT;
  if (leagueId != null && Array.isArray(footLeagues)) {
    return footLeagues.map(String).includes(String(leagueId));
  }

  return false;
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

function extractMinute(event: Json): number | null {
  const direct = toInt(
    event.minute ?? event.matchMinute ?? event.elapsed ?? event.totalElapsedMinutes,
  );
  if (direct != null) return direct;
  const liveData = asRecord(event.liveData) ?? asRecord(event.live) ?? asRecord(event.liveDataDTO);
  return toInt(liveData?.minute ?? liveData?.matchTime ?? liveData?.matchMinute);
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

function marketIdsForEvent(eventId: string, event: Json, overview: Json): string[] {
  const markets = asRecord(overview.markets) ?? {};
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

function classifyMarket(market: Json): { key: MarketKey; line: number | null } | null {
  const name = String(market.name ?? market.typeName ?? market.marketType ?? "").toLowerCase();
  const typeId = String(market.typeId ?? market.marketTypeId ?? "");
  const combined = `${name} ${String(market.typeName ?? "").toLowerCase()}`;

  if (
    combined.includes("escanteio") || combined.includes("corner") ||
    combined.includes("cartão") || combined.includes("cartao") || combined.includes("card")
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
    name === "ml" ||
    typeId === "1" ||
    typeId === "100";
  if (is1x2 && !combined.includes("dupla") && !combined.includes("double")) {
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

  if (
    (combined.includes("total") || combined.includes("gols") || combined.includes("goal")) &&
    (combined.includes("gol") || combined.includes("goal") || combined.includes("gols") ||
      combined.includes("mais") || combined.includes("menos"))
  ) {
    const line = toNum(market.handicap ?? market.line ?? market.points);
    if (line != null && line > 0) {
      return { key: "total", line };
    }
  }

  return null;
}

function map1x2Key(sel: Json): SelectionKey | null {
  const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
  const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
  if (sname === "x" || sname.includes("empate") || stype.includes("draw")) return "draw";
  if (sname === "1" || stype === "home" || stype.includes("home") || sel.isHome === true) {
    return "home";
  }
  if (sname === "2" || stype === "away" || stype.includes("away") || sel.isAway === true) {
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
  for (const sid of selectionIds(marketId, market, selectionsRoot)) {
    const sel = asRecord(selectionsRoot[sid]);
    if (!sel) continue;
    const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
    if (price == null || !(price >= 1.01)) continue;

    let key: SelectionKey | null = null;
    if (marketKey === "1x2") key = map1x2Key(sel);
    else if (marketKey === "btts") key = mapBttsKey(sel);
    else if (marketKey === "double_chance") key = mapDoubleChanceKey(sel);
    else if (marketKey === "total") key = mapTotalKey(sel);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      selection_key: key,
      odd: price,
      status: selectionSuspended(sel) ? "suspended" : "open",
      provider_selection_id: sid,
    });
  }
  return out;
}

function buildMarketsForEvent(
  eventId: string,
  event: Json,
  overview: Json,
): MarketDraft[] {
  const marketsRoot = asRecord(overview.markets) ?? {};
  const selectionsRoot = asRecord(overview.selections) ?? {};
  const drafts: MarketDraft[] = [];
  const seen = new Set<string>();

  for (const mid of marketIdsForEvent(eventId, event, overview)) {
    const market = asRecord(marketsRoot[mid]);
    if (!market) continue;
    const classified = classifyMarket(market);
    if (!classified) continue;

    const selections = buildSelections(
      classified.key,
      mid,
      market,
      selectionsRoot,
    );
    if (!selections.length) continue;

    // For totals, keep one primary line closest to current goals + 0.5 if many lines exist —
    // we still store all absolute lines separately via unique (market_key, line).
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

  // Cap totals lines per event to avoid flooding UI (prefer mid lines)
  const totals = drafts.filter((d) => d.market_key === "total");
  if (totals.length > 4) {
    const goals =
      (toInt(asRecord(event.results)?.home ?? event.homeScore) ?? 0) +
      (toInt(asRecord(event.results)?.away ?? event.awayScore) ?? 0);
    const need = goals + 0.5;
    totals.sort((a, b) => Math.abs((a.line ?? 99) - need) - Math.abs((b.line ?? 99) - need));
    const keep = new Set(totals.slice(0, 4).map((t) => t.line));
    return drafts.filter((d) => d.market_key !== "total" || keep.has(d.line));
  }

  return drafts;
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
    if (!isFootballEvent(event, overview)) continue;

    const teams = extractTeams(event);
    const score = extractScore(event);
    const minute = extractMinute(event);

    const leagueId = event.leagueId ?? event.competitionId ?? event.leagueID;
    const league = leagueId != null ? asRecord(leagues[String(leagueId)]) : null;
    const leagueName = league
      ? String(league.name ?? league.shortName ?? "")
      : String(event.leagueName ?? "");

    const markets = buildMarketsForEvent(eventId, event, overview);
    if (!markets.length) continue;

    out.push({
      provider_event_id: eventId,
      sport: "football",
      league: leagueName || null,
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
        minute,
        home_score: score.home,
        away_score: score.away,
      },
    });
  }

  return out;
}

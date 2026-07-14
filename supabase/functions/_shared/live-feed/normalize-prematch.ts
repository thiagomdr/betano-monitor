/**
 * Normalize Betano-style prematch "hot trending" payloads into EventDraft[].
 * Source shape: /api/sports/{SPORT}/hot/trending/leagues/.../events
 */

import type {
  EventDraft,
  Json,
  MarketDraft,
  MarketKey,
  SelectionDraft,
  SelectionKey,
} from "./types.ts";
import { applyArenaOdd, ARENA_ODDS_HAIRCUT } from "./normalize.ts";
import { isLowPriorityCompetition } from "./league-priority.ts";

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const SPORT_MAP: Record<string, string> = {
  FOOT: "football",
  BASK: "basketball",
  TENN: "tennis",
  VOLL: "volleyball",
  ICEH: "hockey",
  HAND: "handball",
  TABL: "table_tennis",
  BADM: "badminton",
  FUTS: "futsal",
  BASE: "baseball",
  AMFB: "american_football",
  RUGU: "rugby",
  DART: "darts",
  SNOOK: "snooker",
  BOX: "boxing",
  MMAF: "mma",
  MMA: "mma",
};

export const PREMATCH_SPORT_CODES = [
  "FOOT", "BASK", "TENN", "VOLL", "ICEH", "HAND", "TABL", "FUTS", "BASE",
] as const;

function mapSport(code: unknown): string {
  const key = String(code ?? "").toUpperCase();
  return SPORT_MAP[key] || key.toLowerCase() || "other";
}

function isEsportsSportCode(code: unknown): boolean {
  const k = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!k) return false;
  return (
    k === "ESPS" ||
    k === "ESPORT" ||
    k === "ESPORTS" ||
    k.startsWith("ESPORT") ||
    k.includes("ESPORT")
  );
}

function isEsportsBlob(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("esports") || t.includes("e-sports") || t.includes("virtual") ||
    t.includes("virtuais") || t.includes("minutos de jogo") || t.includes("nba 2k") ||
    t.includes("eadriatic") || t.includes("king growth") ||
    /\bgaming\b/.test(t) || /\bbattle\b/.test(t)
  );
}

function splitHomeAway(name: string): { home: string; away: string } {
  const parts = String(name || "").split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return { home: parts[0].trim() || "Casa", away: parts.slice(1).join(" - ").trim() || "Fora" };
  }
  return { home: String(name || "Casa"), away: "Fora" };
}

function parseTotalLine(market: Json, sels: Json[]): number | null {
  const handicap = toNum(market.handicap);
  if (handicap != null && handicap > 0) return handicap;
  for (const s of sels) {
    const n = String(s.name ?? s.fullName ?? "");
    const m = n.match(/(\d+(?:[.,]\d+)?)/);
    if (m) {
      const line = Number(String(m[1]).replace(",", "."));
      if (Number.isFinite(line) && line > 0) return line;
    }
  }
  return null;
}

function map1x2(sel: Json): SelectionKey | null {
  const n = String(sel.name ?? "").toLowerCase().trim();
  if (n === "x" || n.includes("empate")) return "draw";
  if (n === "1") return "home";
  if (n === "2") return "away";
  return null;
}

function mapBtts(sel: Json): SelectionKey | null {
  const n = String(sel.name ?? "").toLowerCase();
  if (n === "sim" || n === "yes") return "yes";
  if (n === "não" || n === "nao" || n === "no") return "no";
  return null;
}

function mapDc(sel: Json): SelectionKey | null {
  const n = String(sel.name ?? "").toLowerCase().replace(/\s+/g, "");
  if (n === "1x") return "1x";
  if (n === "x2") return "x2";
  if (n === "12") return "12";
  return null;
}

function mapTotal(sel: Json): SelectionKey | null {
  const n = String(sel.name ?? "").toLowerCase();
  if (n.includes("mais") || n.includes("over") || n.startsWith("+")) return "over";
  if (n.includes("menos") || n.includes("under") || n.startsWith("-")) return "under";
  return null;
}

function classifyPrematchMarket(market: Json): { key: MarketKey; line: number | null } | null {
  const name = String(market.name ?? "").toLowerCase();
  const type = String(market.type ?? "").toUpperCase();
  const typeId = Number(market.typeId ?? 0);
  if (name.includes("superodds") || name.includes("super odds")) return null;
  if (
    name.includes("escanteio") || name.includes("corner") ||
    name.includes("cartao") || name.includes("cartão") ||
    name.includes("1° tempo") || name.includes("1º tempo") || name.includes("1o tempo") ||
    name.includes("2° tempo") || name.includes("2º tempo") ||
    type === "OUH1" || type === "OUH2" || type === "CNOU"
  ) {
    return null;
  }

  const sels = Array.isArray(market.selections) ? market.selections.map(asRecord).filter(Boolean) as Json[] : [];

  if (type === "MRES" || typeId === 1 || (name.includes("resultado") && !name.includes("dupla"))) {
    return { key: "1x2", line: null };
  }
  if (type === "BTSC" || typeId === 15 || (name.includes("ambas") && name.includes("marc"))) {
    return { key: "btts", line: null };
  }
  if (type === "DBLC" || typeId === 9 || name.includes("chance dupla")) {
    return { key: "double_chance", line: null };
  }
  if (type === "HCTG" || typeId === 13 || (name.includes("total") && name.includes("gol"))) {
    const line = parseTotalLine(market, sels);
    if (line != null) return { key: "total", line };
  }
  // Basketball / general match totals
  if (type.startsWith("OU") && (name.includes("total") || name.includes("pontos"))) {
    const line = parseTotalLine(market, sels);
    if (line != null) return { key: "total", line };
  }
  return null;
}

function buildMarkets(event: Json): MarketDraft[] {
  const raw = Array.isArray(event.markets) ? event.markets : [];
  const drafts: MarketDraft[] = [];
  const seen = new Set<string>();

  for (const mVal of raw) {
    const market = asRecord(mVal);
    if (!market) continue;
    const classified = classifyPrematchMarket(market);
    if (!classified) continue;
    const selsRaw = Array.isArray(market.selections) ? market.selections : [];
    const selections: SelectionDraft[] = [];
    const seenSel = new Set<string>();

    for (const sVal of selsRaw) {
      const sel = asRecord(sVal);
      if (!sel) continue;
      const price = toNum(sel.price ?? sel.odds);
      if (price == null || price < 1.01) continue;
      let key: SelectionKey | null = null;
      if (classified.key === "1x2") key = map1x2(sel);
      else if (classified.key === "btts") key = mapBtts(sel);
      else if (classified.key === "double_chance") key = mapDc(sel);
      else if (classified.key === "total") key = mapTotal(sel);
      if (!key || seenSel.has(key)) continue;
      seenSel.add(key);
      selections.push({
        selection_key: key,
        odd: applyArenaOdd(price),
        status: "open",
        provider_selection_id: sel.id != null ? String(sel.id) : null,
      });
    }

    if (classified.key === "1x2") {
      const hasHome = selections.some((s) => s.selection_key === "home");
      const hasAway = selections.some((s) => s.selection_key === "away");
      if (!hasHome || !hasAway) continue;
    } else if (selections.length < 2) {
      continue;
    }

    const uniq = `${classified.key}:${classified.line ?? "null"}`;
    if (seen.has(uniq)) continue;
    seen.add(uniq);
    drafts.push({
      market_key: classified.key,
      line: classified.line,
      status: "open",
      provider_market_id: market.id != null ? String(market.id) : null,
      selections,
    });
  }
  return drafts;
}

export function normalizePrematchEvents(rawEvents: unknown[], sportHint?: string): EventDraft[] {
  const out: EventDraft[] = [];
  const now = Date.now();
  const maxAheadMs = 14 * 24 * 60 * 60 * 1000; // 14 days

  for (const item of rawEvents) {
    const event = asRecord(item);
    if (!event) continue;

    const id = event.id != null ? String(event.id) : "";
    if (!id) continue;

    const leagueName = String(event.leagueName ?? event.league ?? "") || null;
    const regionName = String(event.regionName ?? event.country ?? "") || null;
    if (isEsportsSportCode(event.sportId ?? sportHint)) continue;
    const sport = mapSport(event.sportId ?? sportHint);
    const blob = `${leagueName || ""} ${regionName || ""} ${event.name || ""} ${event.shortName || ""}`;
    if (isEsportsBlob(blob)) continue;
    if (isLowPriorityCompetition({ league: leagueName, country: regionName, sport })) continue;

    const startMs = toNum(event.startTime);
    if (startMs == null) continue;
    if (startMs < now - 30 * 60 * 1000) continue; // started >30m ago
    if (startMs > now + maxAheadMs) continue;

    const name = String(event.name ?? event.shortName ?? "");
    let home = "";
    let away = "";
    if (Array.isArray(event.participants) && event.participants.length >= 2) {
      home = String(asRecord(event.participants[0])?.name ?? asRecord(event.participants[0])?.shortName ?? "");
      away = String(asRecord(event.participants[1])?.name ?? asRecord(event.participants[1])?.shortName ?? "");
    }
    if (!home || !away) {
      const split = splitHomeAway(name);
      home = home || split.home;
      away = away || split.away;
    }

    const markets = buildMarkets(event);
    if (!markets.length) continue;

    const startsAt = new Date(startMs).toISOString();
    out.push({
      provider_event_id: id,
      sport,
      league: leagueName,
      league_id: event.leagueId != null ? String(event.leagueId) : null,
      country: regionName,
      home,
      away,
      minute: null,
      home_score: null,
      away_score: null,
      starts_at: startsAt,
      status: "scheduled",
      betradar_id: event.betRadarId != null
        ? String(event.betRadarId)
        : (event.betradarId != null ? String(event.betradarId) : null),
      markets,
      raw: {
        provider_event_id: id,
        sport,
        starts_at: startsAt,
        arena_odds_haircut: ARENA_ODDS_HAIRCUT,
        source: "prematch-hot",
      },
    });
  }
  return out;
}

export function extractLeaguesFromHotPayload(
  payload: unknown,
  sport = "football",
): { id: string; name: string; url: string; regionName: string }[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  const leagues = data?.leagues;
  if (!Array.isArray(leagues)) return [];
  const out: { id: string; name: string; url: string; regionName: string }[] = [];
  for (const item of leagues) {
    const rec = asRecord(item);
    if (!rec?.id) continue;
    const name = String(rec.name ?? "");
    const regionName = String(rec.regionName ?? "");
    if (isEsportsBlob(`${name} ${regionName}`)) continue;
    if (isLowPriorityCompetition({ league: name, country: regionName, sport })) continue;
    const url = String(rec.url ?? "");
    out.push({
      id: String(rec.id),
      name,
      regionName,
      url: url || `/api/sports/${sport.toUpperCase()}/hot/trending/leagues/${rec.id}/events`,
    });
  }
  return out;
}

export function extractEventsFromLeaguePayload(payload: unknown): unknown[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data) ?? root;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(root?.events)) return root.events as unknown[];
  return [];
}

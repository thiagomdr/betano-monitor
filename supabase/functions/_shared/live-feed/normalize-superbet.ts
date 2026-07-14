/**
 * Normalize SuperBet offer-event JSON into Arena market drafts (probe / compare).
 * Odds on each row already carry marketName / name / info.
 */
import type { EventDraft, Json, MarketDraft, SelectionDraft, SelectionKey } from "./types.ts";
import { applyArenaOdd } from "./normalize.ts";

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

/** Last decimal/int in "2-9.5" / "18.5" / "-3.5-2". */
export function parseSuperbetLine(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "0") return null;
  const parts = s.split("-").filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const n = Number(String(parts[i]).replace(",", "."));
    if (Number.isFinite(n) && Math.abs(n) > 0) return Math.abs(n);
  }
  const m = s.match(/(\d+[.,]\d+|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function outcomeIsOver(name: string, info: string, code: string): boolean {
  const t = `${name} ${info} ${code}`.toLowerCase();
  return t.includes("mais") || t.includes("over") || t.startsWith("+");
}

function outcomeIsUnder(name: string, info: string, code: string): boolean {
  const t = `${name} ${info} ${code}`.toLowerCase();
  return t.includes("menos") || t.includes("under") || t.startsWith("-");
}

function classifySuperbetOdd(odd: Json): {
  key: "1x2" | "total" | null;
  selection: SelectionKey | null;
  line: number | null;
} {
  const marketName = String(odd.marketName ?? "").toLowerCase();
  const name = String(odd.name ?? "");
  const info = String(odd.info ?? "");
  const code = String(odd.code ?? "");
  const marketId = Number(odd.marketId);

  // Match winner (tennis 2-way)
  if (
    marketId === 521 ||
    marketName.includes("vencedor da partida") ||
    marketName.includes("match winner") ||
    marketName === "vencedor"
  ) {
    if (name === "1" || code === "1" || /vence$/i.test(info) && !info.toLowerCase().includes("yuki") && code === "1") {
      return { key: "1x2", selection: "home", line: null };
    }
    if (name === "2" || code === "2") {
      return { key: "1x2", selection: "away", line: null };
    }
    // Fall back by order later
    return { key: "1x2", selection: null, line: null };
  }

  // Match total games (prefer 1002); set totals 524 only if line parses cleanly to a single total
  const isTotal =
    marketId === 1002 ||
    marketId === 524 ||
    marketId === 999 ||
    marketName.includes("total") ||
    outcomeIsOver(name, info, code) ||
    outcomeIsUnder(name, info, code);

  if (isTotal && (outcomeIsOver(name, info, code) || outcomeIsUnder(name, info, code))) {
    // Skip set-prefixed lines like "2-9.5" for market 524 in probe match-total column —
    // keep them as totals with the game-line number so UI can show Total.
    const line = parseSuperbetLine(odd.specialBetValue ?? odd.showSpecialBetValue);
    if (line == null) return { key: null, selection: null, line: null };
    // Prefer full-match totals (plain 18.5) — skip multi-segment set lines when marketId=524
    const raw = String(odd.specialBetValue ?? odd.showSpecialBetValue ?? "");
    if (marketId === 524 && raw.includes("-")) {
      // still usable as total line = last number
    }
    const selection: SelectionKey = outcomeIsOver(name, info, code) ? "over" : "under";
    return { key: "total", selection, line };
  }

  return { key: null, selection: null, line: null };
}

function splitMatchName(name: string): { home: string; away: string } {
  const raw = String(name || "");
  const parts = raw.split(/[·•|]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { home: parts[0], away: parts.slice(1).join(" · ") };
  const dash = raw.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { home: dash[0].trim(), away: dash.slice(1).join(" - ").trim() };
  return { home: raw || "Casa", away: "Fora" };
}

export function normalizeSuperbetEvent(
  eventRaw: unknown,
  opts: { maxTotals?: number } = {},
): EventDraft | null {
  const root = asRecord(eventRaw);
  if (!root) return null;

  // API returns { data: [ event ] } or the event itself
  let event = root;
  if (Array.isArray(root.data) && root.data[0]) {
    event = asRecord(root.data[0]) ?? root;
  } else if (asRecord(root.data)) {
    event = asRecord(root.data) ?? root;
  }

  const offerId = event.offerId ?? event.eventId ?? event.id;
  if (offerId == null) return null;

  const teams = splitMatchName(String(event.matchName ?? ""));
  const meta = asRecord(event.metadata) ?? {};
  const odds = Array.isArray(event.odds) ? event.odds : [];

  type Bucket = {
    market_key: "1x2" | "total";
    line: number | null;
    selections: Map<SelectionKey, SelectionDraft>;
  };
  const buckets = new Map<string, Bucket>();

  for (const item of odds) {
    const odd = asRecord(item);
    if (!odd) continue;
    if (String(odd.status ?? "active").toLowerCase() !== "active") continue;
    const price = toNum(odd.price);
    if (price == null || !(price >= 1.01)) continue;

    const classified = classifySuperbetOdd(odd);
    if (!classified.key) continue;

    let sel = classified.selection;
    const uniq = `${classified.key}:${classified.line ?? "null"}`;
    if (!buckets.has(uniq)) {
      buckets.set(uniq, {
        market_key: classified.key,
        line: classified.line,
        selections: new Map(),
      });
    }
    const bucket = buckets.get(uniq)!;

    if (classified.key === "1x2" && !sel) {
      // Assign by code/order
      if (String(odd.name ?? odd.code) === "1") sel = "home";
      else if (String(odd.name ?? odd.code) === "2") sel = "away";
      else if (!bucket.selections.has("home")) sel = "home";
      else if (!bucket.selections.has("away")) sel = "away";
    }
    if (!sel) continue;
    if (bucket.selections.has(sel)) continue;

    bucket.selections.set(sel, {
      selection_key: sel,
      odd: applyArenaOdd(price),
      status: "open",
      provider_selection_id: String(odd.uuid ?? odd.outcomeId ?? ""),
    });
  }

  let markets: MarketDraft[] = [];
  for (const b of buckets.values()) {
    const selections = [...b.selections.values()];
    if (b.market_key === "1x2") {
      const hasHome = selections.some((s) => s.selection_key === "home");
      const hasAway = selections.some((s) => s.selection_key === "away");
      if (!hasHome || !hasAway) continue;
    }
    if (b.market_key === "total" && selections.length < 2) continue;
    markets.push({
      market_key: b.market_key,
      line: b.line,
      status: "open",
      provider_market_id: `sb-${b.market_key}-${b.line ?? "ml"}`,
      selections,
    });
  }

  const maxTotals = opts.maxTotals ?? 4;
  let totals = markets.filter((m) => m.market_key === "total" && m.line != null);
  const others = markets.filter((m) => m.market_key !== "total");
  const matchLevel = totals.filter((t) => (t.line as number) >= 10.5);
  if (matchLevel.length >= 2) totals = matchLevel;
  totals.sort((a, b) => (a.line as number) - (b.line as number));
  if (totals.length > maxTotals) {
    const mid = Math.floor(totals.length / 2);
    const half = Math.floor(maxTotals / 2);
    totals = totals.slice(Math.max(0, mid - half), Math.max(0, mid - half) + maxTotals);
  }
  markets = [...others, ...totals];

  const homeScore = toNum(meta.homeTeamScore);
  const awayScore = toNum(meta.awayTeamScore);

  return {
    provider_event_id: `sb:${offerId}`,
    sport: Number(event.sportId) === 2 ? "tennis" : "other",
    league: event.tournamentId != null ? `SuperBet ${event.tournamentId}` : "SuperBet",
    league_id: event.tournamentId != null ? String(event.tournamentId) : null,
    country: "Probe",
    home: teams.home,
    away: teams.away,
    minute: null,
    home_score: homeScore != null ? Math.trunc(homeScore) : null,
    away_score: awayScore != null ? Math.trunc(awayScore) : null,
    status: "live",
    betradar_id: null,
    markets,
    raw: {
      source: "superbet-probe",
      offer_id: String(offerId),
      match_status: meta.matchStatusLabel ?? meta.periodStatus ?? null,
      game_score: `${meta.homeTeamGameScore ?? ""}-${meta.awayTeamGameScore ?? ""}`,
      market_count: event.marketCount ?? markets.length,
      odds_count: odds.length,
    },
  };
}

export type SuperbetOfferChip = {
  label: string;
  odd: number;
  status: "open" | "suspended";
};

export type SuperbetOfferGroup = {
  title: string;
  market_id: number | null;
  line: string | null;
  selections: SuperbetOfferChip[];
};

function marketDisplayPriority(marketId: number, marketName: string): number {
  const n = marketName.toLowerCase();
  if (marketId === 521) return 0;
  if (marketId === 1002) return 1;
  if (marketId === 520) return 2;
  if (marketId === 200776) return 3;
  if (marketId === 517) return 4;
  if (/^vencedor da partida/.test(n)) return 0;
  if (n === "total de games") return 1;
  if (n === "handicap de game") return 2;
  if (n === "handicap de sets") return 3;
  if (n === "resultado correto") return 4;
  if (/set decisivo|tiebreak/.test(n) && !/game/.test(n)) return 5;
  if (/^\d/.test(n) && /set/.test(n) && /total de games/.test(n) && !/-/.test(n.split(" ")[0] || "")) return 10;
  if (/vencedor & total/.test(n)) return 20;
  if (/ponto x|pontos exatos|chegar em 40|game x - resultado|ponto \d/.test(n)) return 240;
  if (/game \d|game x/.test(n)) return 180;
  return 100;
}

function chipLabelFromOdd(odd: Json, home: string, away: string): string {
  const name = String(odd.name ?? "").trim();
  const info = String(odd.info ?? "").trim();
  const code = String(odd.code ?? "").trim();
  const sbv = String(odd.specialBetValue ?? odd.showSpecialBetValue ?? "").trim();
  if (name === "1" || code === "1") return home.split(" ")[0] || "1";
  if (name === "2" || code === "2") return away.split(" ")[0] || "2";
  if (/^mais de/i.test(name)) {
    const line = parseSuperbetLine(sbv) ?? parseSuperbetLine(name);
    return line != null ? `+${String(line).replace(".", ",")}` : name;
  }
  if (/^menos de/i.test(name)) {
    const line = parseSuperbetLine(sbv) ?? parseSuperbetLine(name);
    return line != null ? `−${String(line).replace(".", ",")}` : name;
  }
  if (/^(sim|não|nao)$/i.test(name)) return name;
  // Player + handicap in name: "Jan Choinski (0.5)"
  if (/\([+-]?\d/.test(name)) return name.length > 42 ? name.slice(0, 40) + "…" : name;
  if (info && info.length <= 48 && !/^vence$/i.test(info)) return info;
  if (name) return name.length > 42 ? name.slice(0, 40) + "…" : name;
  return info || code || "?";
}

/**
 * Group all active SuperBet odds into UI-ready market columns (Tênis 2 catalog).
 * Does not map to Arena market_key — display / probe only.
 */
export function extractSuperbetOfferGroups(
  eventRaw: unknown,
  opts: { maxGroups?: number; maxPerGroup?: number } = {},
): {
  groups: SuperbetOfferGroup[];
  odds_total: number;
  odds_active: number;
  shown_odds: number;
} {
  const maxGroups = opts.maxGroups ?? 36;
  const maxPerGroup = opts.maxPerGroup ?? 10;
  const root = asRecord(eventRaw);
  if (!root) {
    return { groups: [], odds_total: 0, odds_active: 0, shown_odds: 0 };
  }
  let event = root;
  if (Array.isArray(root.data) && root.data[0]) {
    event = asRecord(root.data[0]) ?? root;
  } else if (asRecord(root.data)) {
    event = asRecord(root.data) ?? root;
  }
  const teams = splitMatchName(String(event.matchName ?? ""));
  const odds = Array.isArray(event.odds) ? event.odds : [];
  const oddsTotal = odds.length;
  type Bucket = {
    title: string;
    market_id: number | null;
    line: string | null;
    priority: number;
    selections: SuperbetOfferChip[];
    seen: Set<string>;
  };
  const buckets = new Map<string, Bucket>();
  let oddsActive = 0;

  for (const item of odds) {
    const odd = asRecord(item);
    if (!odd) continue;
    if (String(odd.status ?? "active").toLowerCase() !== "active") continue;
    const price = toNum(odd.price);
    if (price == null || !(price >= 1.01)) continue;
    oddsActive += 1;

    const marketId = toNum(odd.marketId);
    const marketName = String(odd.marketName ?? "Mercado").trim() || "Mercado";
    const sbv = String(odd.specialBetValue ?? "").trim();
    const showSbv = String(odd.showSpecialBetValue ?? "").trim();
    const lineKey = sbv && sbv !== "0" ? sbv : (showSbv && showSbv !== "0" ? showSbv : "");
    // One column per marketName + line (handicap/total ladders stay readable)
    const uniq = `${marketId ?? "x"}::${marketName}::${lineKey}`;
    if (!buckets.has(uniq)) {
      const lineLabel = lineKey && !/^\d+$/.test(lineKey) ? lineKey : (lineKey || null);
      let title = marketName;
      if (lineKey && /total|handicap/i.test(marketName) && !title.includes(lineKey)) {
        const pretty = lineKey.includes("-") ? lineKey : lineKey;
        title = `${marketName} (${pretty})`;
      }
      buckets.set(uniq, {
        title,
        market_id: marketId,
        line: lineKey || null,
        priority: marketDisplayPriority(marketId ?? 0, marketName),
        selections: [],
        seen: new Set(),
      });
    }
    const bucket = buckets.get(uniq)!;
    const label = chipLabelFromOdd(odd, teams.home, teams.away);
    const dedupe = `${label}|${price}`;
    if (bucket.seen.has(dedupe)) continue;
    bucket.seen.add(dedupe);
    if (bucket.selections.length >= maxPerGroup) continue;
    bucket.selections.push({
      label,
      odd: applyArenaOdd(price),
      status: "open",
    });
  }

  const ranked = [...buckets.values()]
    .filter((b) => b.selections.length > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.title.localeCompare(b.title, "pt-BR");
    })
    .slice(0, maxGroups);

  const groups: SuperbetOfferGroup[] = ranked.map((b) => ({
    title: b.title,
    market_id: b.market_id,
    line: b.line,
    selections: b.selections,
  }));
  const shown = groups.reduce((n, g) => n + g.selections.length, 0);
  return { groups, odds_total: oddsTotal, odds_active: oddsActive, shown_odds: shown };
}

export function normalizeNameKey(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function namesLikelyMatch(
  aHome: string,
  aAway: string,
  bHome: string,
  bAway: string,
): boolean {
  const ah = normalizeNameKey(aHome);
  const aa = normalizeNameKey(aAway);
  const bh = normalizeNameKey(bHome);
  const ba = normalizeNameKey(bAway);
  if (!ah || !aa || !bh || !ba) return false;
  const direct =
    (ah.includes(bh) || bh.includes(ah)) && (aa.includes(ba) || ba.includes(aa));
  const swapped =
    (ah.includes(ba) || ba.includes(ah)) && (aa.includes(bh) || bh.includes(aa));
  return direct || swapped;
}

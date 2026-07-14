/**
 * Sportradar GISMO helpers (public CDN — same scheme as Betano stats).
 */
import { nameTokens, normalizeNameKey } from "./match-events.ts";

const GISMO_MATCH_INFO =
  "https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_info";

export type GismoValidation = {
  ok: boolean;
  reason: string;
  sr_home: string | null;
  sr_away: string | null;
  sport_name: string | null;
  match_status: string | null;
  raw_teams?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown>
    : null;
}

function overlapRatio(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

export function teamsCompatible(
  home: string,
  away: string,
  srHome: string,
  srAway: string,
): { ok: boolean; mode: "direct" | "swapped" | "none"; score: number } {
  const direct = (overlapRatio(home, srHome) + overlapRatio(away, srAway)) / 2;
  const swapped = (overlapRatio(home, srAway) + overlapRatio(away, srHome)) / 2;
  if (direct >= 0.45 && direct >= swapped) {
    return { ok: true, mode: "direct", score: direct };
  }
  if (swapped >= 0.45) {
    return { ok: true, mode: "swapped", score: swapped };
  }
  return { ok: false, mode: "none", score: Math.max(direct, swapped) };
}

export async function fetchGismoMatchInfo(
  betradarId: string,
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const url = `${GISMO_MATCH_INFO}/${encodeURIComponent(betradarId)}`;
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": Deno.env.get("LIVE_FEED_USER_AGENT") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: Deno.env.get("LIVE_FEED_REFERER") || "https://www.betano.bet.br/",
    Origin: Deno.env.get("LIVE_FEED_ORIGIN") || "https://www.betano.bet.br",
  };
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: text.slice(0, 160) };
    }
    if (text.trimStart().startsWith("<")) {
      return { ok: false, status: res.status, data: null, error: "html_splash" };
    }
    return { ok: true, status: res.status, data: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function validateAgainstGismo(
  home: string,
  away: string,
  gismoPayload: unknown,
): GismoValidation {
  const root = asRecord(gismoPayload);
  const doc0 = Array.isArray(root?.doc) ? asRecord(root.doc[0]) : null;
  if (!doc0) {
    return {
      ok: false,
      reason: "no_doc",
      sr_home: null,
      sr_away: null,
      sport_name: null,
      match_status: null,
    };
  }
  if (String(doc0.event ?? "") === "exception") {
    return {
      ok: false,
      reason: "gismo_exception",
      sr_home: null,
      sr_away: null,
      sport_name: null,
      match_status: null,
    };
  }
  const data = asRecord(doc0.data) ?? {};
  const match = asRecord(data.match) ?? {};
  const teamsWrap = asRecord(match.teams);
  const homeRec = asRecord(teamsWrap?.home);
  const awayRec = asRecord(teamsWrap?.away);
  const srHome = String(homeRec?.name ?? homeRec?.mediumname ?? "");
  const srAway = String(awayRec?.name ?? awayRec?.mediumname ?? "");
  const sport = asRecord(data.sport);
  const status = asRecord(match.status) ?? asRecord(match.matchstatus);

  if (!srHome || !srAway) {
    return {
      ok: false,
      reason: "missing_sr_teams",
      sr_home: srHome || null,
      sr_away: srAway || null,
      sport_name: sport?.name != null ? String(sport.name) : null,
      match_status: status?.name != null ? String(status.name) : null,
      raw_teams: match.teams,
    };
  }

  const compat = teamsCompatible(home, away, srHome, srAway);
  if (!compat.ok) {
    return {
      ok: false,
      reason: `teams_mismatch:${compat.score.toFixed(2)}`,
      sr_home: srHome,
      sr_away: srAway,
      sport_name: sport?.name != null ? String(sport.name) : null,
      match_status: status?.name != null ? String(status.name) : null,
    };
  }

  return {
    ok: true,
    reason: `ok_${compat.mode}:${compat.score.toFixed(2)}`,
    sr_home: srHome,
    sr_away: srAway,
    sport_name: sport?.name != null ? String(sport.name) : null,
    match_status: status?.name != null ? String(status.name) : null,
  };
}

/** Soft check used in logs only */
export function formatNamePair(home: string, away: string): string {
  return `${normalizeNameKey(home)} x ${normalizeNameKey(away)}`;
}

export type GismoLiveState = {
  home_score: number | null;
  away_score: number | null;
  status_label: string | null;
  status_id: number | null;
  phase: "scheduled" | "live" | "finished" | "unknown";
  winner: string | null;
};

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Extract score + phase from GISMO match_info payload.
 * Football/tennis: match.result.home/away (goals or sets won).
 */
export function extractLiveState(gismoPayload: unknown): GismoLiveState {
  const root = asRecord(gismoPayload);
  const doc0 = Array.isArray(root?.doc) ? asRecord(root.doc[0]) : null;
  const data = asRecord(doc0?.data) ?? {};
  const match = asRecord(data.match) ?? {};
  const result = asRecord(match.result) ?? {};
  const status = asRecord(match.status) ?? asRecord(match.matchstatus) ?? {};
  const statusLabel = status.name != null ? String(status.name) : null;
  const statusId = toInt(status._id ?? status.id);
  const home = toInt(result.home);
  const away = toInt(result.away);
  const winner = result.winner != null ? String(result.winner) : null;

  const label = (statusLabel || "").toLowerCase();
  let phase: GismoLiveState["phase"] = "unknown";
  if (
    statusId === 100 || statusId === 80 || statusId === 90 ||
    label.includes("ended") || label.includes("finished") ||
    label.includes("after") || label === "ended" || label.includes("aet") ||
    label.includes("penalties")
  ) {
    phase = "finished";
  } else if (
    statusId === 0 || label.includes("not started") || label.includes("ns") ||
    label.includes("to start") || label.includes("scheduled")
  ) {
    phase = "scheduled";
  } else if (statusLabel) {
    phase = "live";
  }

  // Winner present with scores often means finished for tennis too
  if (winner && home != null && away != null && phase === "unknown") {
    phase = "finished";
  }

  return {
    home_score: home,
    away_score: away,
    status_label: statusLabel,
    status_id: statusId,
    phase,
    winner,
  };
}

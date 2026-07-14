/**
 * Arena Tipster — prematch bridge Betano ↔ SuperBet + Sportradar GISMO validation.
 *
 * 1) Load Betano scheduled events with betradar_id (DB; optional hot feed refresh).
 * 2) Load SuperBet offerState=prematch (with betradar when present).
 * 3) Deterministic match (same betradar_id or name+time).
 * 4) Validate each betradar_id via GISMO match_info (teams must match).
 * 5) Upsert tipster_event_links + tipster_validation_logs.
 *
 * POST/GET /functions/v1/tipster-prematch-bridge
 * Header: x-cron-secret (when CRON_SECRET is set)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  type MatchSide,
  matchBetanoSuperbet,
  normalizeSportKey,
  sportFromSuperbetId,
} from "../_shared/live-feed/match-events.ts";
import {
  fetchGismoMatchInfo,
  formatNamePair,
  validateAgainstGismo,
} from "../_shared/live-feed/sportradar-gismo.ts";
import {
  PREMATCH_SPORT_CODES,
  extractEventsFromLeaguePayload,
  extractLeaguesFromHotPayload,
  normalizePrematchEvents,
} from "../_shared/live-feed/normalize-prematch.ts";

const DEFAULT_SUPERBET =
  "https://production-superbet-offer-br.freetls.fastly.net/v2/pt-BR";
const MAX_GISMO = 80;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function superbetBase(): string {
  return (Deno.env.get("SUPERBET_OFFER_BASE") || DEFAULT_SUPERBET).replace(/\/$/, "");
}

function feedHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent": Deno.env.get("LIVE_FEED_USER_AGENT") ||
      "Mozilla/5.0 (compatible; TipsterArena/1.0)",
    "Accept-Language": "pt-BR,pt;q=0.9",
    ...extra,
  };
}

function splitMatchName(name: string): { home: string; away: string } {
  const raw = String(name || "");
  const parts = raw.split(/[·•|]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { home: parts[0], away: parts.slice(1).join(" · ") };
  const dash = raw.split(/\s+[-–—]\s+/);
  if (dash.length >= 2) return { home: dash[0].trim(), away: dash.slice(1).join(" - ").trim() };
  return { home: raw || "Casa", away: "Fora" };
}

async function fetchSuperbetPrematch(): Promise<MatchSide[]> {
  const start = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const sd =
    `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}` +
    `+${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}:00`;
  const url =
    `${superbetBase()}/events/by-date?offerState=prematch&startDate=${sd}`;
  const res = await fetch(url, {
    headers: feedHeaders({
      Origin: "https://superbet.bet.br",
      Referer: "https://superbet.bet.br/",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`superbet_prematch HTTP ${res.status}: ${text.slice(0, 160)}`);
  const json = JSON.parse(text) as { data?: unknown[] };
  const rows = Array.isArray(json.data) ? json.data : [];
  const out: MatchSide[] = [];
  for (const row of rows) {
    const rec = row && typeof row === "object" ? row as Record<string, unknown> : null;
    if (!rec) continue;
    const offerId = String(rec.offerId ?? rec.eventId ?? "");
    if (!offerId) continue;
    const meta = rec.metadata && typeof rec.metadata === "object"
      ? rec.metadata as Record<string, unknown>
      : {};
    const br = rec.betradarId != null
      ? String(rec.betradarId)
      : (meta.brId != null ? String(meta.brId) : null);
    const teams = splitMatchName(String(rec.matchName ?? ""));
    let starts: string | null = null;
    if (rec.utcDate) starts = new Date(String(rec.utcDate)).toISOString();
    else if (rec.matchTimestamp != null) {
      const ms = Number(rec.matchTimestamp);
      if (Number.isFinite(ms)) starts = new Date(ms).toISOString();
    }
    out.push({
      provider: "superbet",
      provider_event_id: offerId,
      sport: sportFromSuperbetId(rec.sportId),
      home: teams.home,
      away: teams.away,
      starts_at: starts,
      betradar_id: br && br !== "0" ? br : null,
      league: rec.tournamentId != null ? `Torneio ${rec.tournamentId}` : null,
    });
  }
  return out;
}

async function fetchBetanoPrematchFromFeed(): Promise<MatchSide[]> {
  const base = (Deno.env.get("LIVE_FEED_BASE_URL") || "").replace(/\/$/, "");
  if (!base) return [];
  const origin = Deno.env.get("LIVE_FEED_ORIGIN") || base;
  const referer = Deno.env.get("LIVE_FEED_PREMATCH_REFERER") ||
    `${origin.replace(/\/$/, "")}/sport/futebol/`;
  const headers = feedHeaders({
    Origin: origin.replace(/\/$/, ""),
    Referer: referer,
  });
  const maxLeagues = Number(Deno.env.get("PREMATCH_MAX_LEAGUES") || 10);

  const out: MatchSide[] = [];
  for (const code of PREMATCH_SPORT_CODES) {
    const hotRes = await fetch(
      `${base}/api/sports/${code}/hot/trending/leagues?req=s,stnf,c,mb`,
      { headers },
    );
    if (!hotRes.ok) continue;
    const hotJson = await hotRes.json();
    const leagues = extractLeaguesFromHotPayload(hotJson, code.toLowerCase())
      .slice(0, maxLeagues);
    for (const league of leagues) {
      let evPath = league.url;
      if (!evPath.startsWith("http")) {
        evPath = `${base}${evPath.startsWith("/") ? "" : "/"}${evPath}`;
      }
      if (!evPath.includes("?")) evPath = `${evPath}?req=s,stnf,c,mb`;
      const evRes = await fetch(evPath, { headers });
      if (!evRes.ok) continue;
      const evJson = await evRes.json();
      const events = extractEventsFromLeaguePayload(evJson);
      const drafts = normalizePrematchEvents(events, code);
      for (const d of drafts) {
        if (!d.betradar_id) continue;
        out.push({
          provider: "betano",
          provider_event_id: d.provider_event_id,
          sport: d.sport,
          home: d.home,
          away: d.away,
          starts_at: d.starts_at ?? null,
          betradar_id: d.betradar_id,
          league: d.league,
        });
      }
    }
  }
  return out;
}

async function loadBetanoFromDb(
  supabase: ReturnType<typeof createClient>,
): Promise<{ sides: MatchSide[]; idByProvider: Map<string, string> }> {
  const { data, error } = await supabase
    .from("live_events")
    .select("id,provider_event_id,sport,home,away,starts_at,betradar_id,league")
    .eq("status", "scheduled")
    .not("betradar_id", "is", null)
    .limit(2000);
  if (error) throw error;
  const idByProvider = new Map<string, string>();
  const sides: MatchSide[] = [];
  for (const row of data || []) {
    idByProvider.set(String(row.provider_event_id), String(row.id));
    sides.push({
      provider: "betano",
      provider_event_id: String(row.provider_event_id),
      sport: normalizeSportKey(String(row.sport || "other")),
      home: String(row.home),
      away: String(row.away),
      starts_at: row.starts_at ? String(row.starts_at) : null,
      betradar_id: row.betradar_id ? String(row.betradar_id) : null,
      league: row.league != null ? String(row.league) : null,
    });
  }
  return { sides, idByProvider };
}

async function logValidation(
  supabase: ReturnType<typeof createClient>,
  row: {
    action: string;
    status: string;
    betradar_id?: string | null;
    betano_provider_event_id?: string | null;
    superbet_offer_id?: string | null;
    link_id?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("tipster_validation_logs").insert({
    action: row.action,
    status: row.status,
    betradar_id: row.betradar_id ?? null,
    betano_provider_event_id: row.betano_provider_event_id ?? null,
    superbet_offer_id: row.superbet_offer_id ?? null,
    link_id: row.link_id ?? null,
    detail: row.detail ?? {},
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const got = req.headers.get("x-cron-secret") || "";
    if (got !== cronSecret) return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "missing supabase env" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  const includeFeed = body.betano_from === "feed" || body.betano_from === "both" ||
    body.include_betano_feed === true;

  try {
    const fromDb = await loadBetanoFromDb(supabase);
    let betano = fromDb.sides;
    const idByProvider = fromDb.idByProvider;

    if (includeFeed || betano.length === 0) {
      try {
        const feedSides = await fetchBetanoPrematchFromFeed();
        const seen = new Set(betano.map((b) => b.provider_event_id));
        for (const s of feedSides) {
          if (seen.has(s.provider_event_id)) continue;
          betano.push(s);
          seen.add(s.provider_event_id);
        }
        await logValidation(supabase, {
          action: "betano_feed_load",
          status: "ok",
          detail: { n: feedSides.length, db_n: fromDb.sides.length },
        });
      } catch (err) {
        await logValidation(supabase, {
          action: "betano_feed_load",
          status: "error",
          detail: { error: err instanceof Error ? err.message : String(err) },
        });
      }
    }

    const superbet = await fetchSuperbetPrematch();
    await logValidation(supabase, {
      action: "superbet_prematch_load",
      status: "ok",
      detail: {
        n: superbet.length,
        with_br: superbet.filter((s) => s.betradar_id).length,
      },
    });

    const { pairs, ambiguous } = matchBetanoSuperbet(betano, superbet);
    for (const a of ambiguous) {
      await logValidation(supabase, {
        action: "match_pair",
        status: "ambiguous",
        betano_provider_event_id: a.betano_id,
        detail: { candidates: a.candidates },
      });
    }

    let linked = 0;
    let validated = 0;
    let rejected = 0;
    let gismoCalls = 0;

    for (const pair of pairs) {
      gismoCalls += 1;
      if (gismoCalls > MAX_GISMO) {
        await logValidation(supabase, {
          action: "sr_validate",
          status: "skipped_cap",
          betradar_id: pair.betradar_id,
          betano_provider_event_id: pair.betano.provider_event_id,
          superbet_offer_id: pair.superbet.provider_event_id,
          detail: { max: MAX_GISMO },
        });
        continue;
      }

      const gismo = await fetchGismoMatchInfo(pair.betradar_id);
      if (!gismo.ok) {
        rejected += 1;
        await logValidation(supabase, {
          action: "sr_validate",
          status: "error",
          betradar_id: pair.betradar_id,
          betano_provider_event_id: pair.betano.provider_event_id,
          superbet_offer_id: pair.superbet.provider_event_id,
          detail: { http: gismo.status, error: gismo.error },
        });
        await supabase.from("tipster_event_links").upsert(
          {
            sport: normalizeSportKey(pair.betano.sport),
            home: pair.betano.home,
            away: pair.betano.away,
            starts_at: pair.betano.starts_at || pair.superbet.starts_at,
            betradar_id: pair.betradar_id,
            betano_provider_event_id: pair.betano.provider_event_id,
            superbet_offer_id: pair.superbet.provider_event_id,
            live_event_id: idByProvider.get(pair.betano.provider_event_id) ?? null,
            match_score: pair.score,
            match_method: pair.method,
            status: "sr_rejected",
            sr_validated_at: null,
            raw: { gismo_error: gismo.error },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "betradar_id" },
        );
        continue;
      }

      const check = validateAgainstGismo(
        pair.betano.home,
        pair.betano.away,
        gismo.data,
      );

      const status = check.ok ? "sr_validated" : "sr_rejected";
      if (check.ok) validated += 1;
      else rejected += 1;

      const { data: linkRow, error: linkErr } = await supabase
        .from("tipster_event_links")
        .upsert(
          {
            sport: normalizeSportKey(pair.betano.sport),
            home: pair.betano.home,
            away: pair.betano.away,
            starts_at: pair.betano.starts_at || pair.superbet.starts_at,
            betradar_id: pair.betradar_id,
            betano_provider_event_id: pair.betano.provider_event_id,
            superbet_offer_id: pair.superbet.provider_event_id,
            live_event_id: idByProvider.get(pair.betano.provider_event_id) ?? null,
            match_score: pair.score,
            match_method: pair.method,
            status,
            sr_validated_at: check.ok ? new Date().toISOString() : null,
            sr_home: check.sr_home,
            sr_away: check.sr_away,
            raw: {
              method: pair.method,
              score: pair.score,
              sr_reason: check.reason,
              sr_status: check.match_status,
              sr_sport: check.sport_name,
              names: formatNamePair(pair.betano.home, pair.betano.away),
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "betradar_id" },
        )
        .select("id")
        .maybeSingle();

      if (linkErr) {
        await logValidation(supabase, {
          action: "link_upsert",
          status: "error",
          betradar_id: pair.betradar_id,
          detail: { error: linkErr.message },
        });
        continue;
      }

      linked += 1;
      await logValidation(supabase, {
        action: "sr_validate",
        status: check.ok ? "ok" : "reject",
        betradar_id: pair.betradar_id,
        betano_provider_event_id: pair.betano.provider_event_id,
        superbet_offer_id: pair.superbet.provider_event_id,
        link_id: linkRow?.id ?? null,
        detail: {
          method: pair.method,
          match_score: pair.score,
          reason: check.reason,
          sr_home: check.sr_home,
          sr_away: check.sr_away,
          betano: formatNamePair(pair.betano.home, pair.betano.away),
          superbet: formatNamePair(pair.superbet.home, pair.superbet.away),
        },
      });
    }

    await supabase.from("tipster_bridge_meta").upsert({
      id: 1,
      fetched_at: new Date().toISOString(),
      betano_n: betano.length,
      superbet_n: superbet.length,
      linked_n: linked,
      validated_n: validated,
      rejected_n: rejected,
      last_error: null,
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      betano_n: betano.length,
      superbet_n: superbet.length,
      pairs: pairs.length,
      ambiguous: ambiguous.length,
      linked,
      validated,
      rejected,
      gismo_calls: Math.min(gismoCalls, MAX_GISMO),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-prematch-bridge", message);
    await supabase.from("tipster_bridge_meta").upsert({
      id: 1,
      last_error: message,
      updated_at: new Date().toISOString(),
    });
    await logValidation(supabase, {
      action: "bridge_run",
      status: "error",
      detail: { error: message },
    });
    return jsonResponse({ error: message }, 502);
  }
});

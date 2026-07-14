/**
 * Tipster Arena — prematch catalog collector (hot trending leagues).
 *
 * Fetches /api/sports/{CODE}/hot/trending/leagues (+ /events per league),
 * applies arena odds haircut + low-tier filters, upserts status=scheduled.
 *
 * POST/GET /functions/v1/tipster-prematch-collector
 * Header: x-cron-secret (when CRON_SECRET is set)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { EventDraft } from "../_shared/live-feed/types.ts";
import {
  PREMATCH_SPORT_CODES,
  extractEventsFromLeaguePayload,
  extractLeaguesFromHotPayload,
  normalizePrematchEvents,
} from "../_shared/live-feed/normalize-prematch.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function feedBase(): string {
  const base = (Deno.env.get("LIVE_FEED_BASE_URL") || "").replace(/\/$/, "");
  if (!base) throw new Error("LIVE_FEED_BASE_URL is required");
  return base;
}

async function feedGet(path: string): Promise<unknown> {
  const base = feedBase();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const origin = Deno.env.get("LIVE_FEED_ORIGIN") || base;
  const referer = Deno.env.get("LIVE_FEED_PREMATCH_REFERER") ||
    `${origin.replace(/\/$/, "")}/sport/futebol/`;
  const ua = Deno.env.get("LIVE_FEED_USER_AGENT") ||
    "Mozilla/5.0 (compatible; TipsterArena/1.0)";

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": ua,
    "Accept-Language": "pt-BR,pt;q=0.9",
    Referer: referer,
    Origin: origin.replace(/\/$/, ""),
  };

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`prematch HTTP ${res.status} ${path}: ${text.slice(0, 180)}`);
  }
  return await res.json();
}

async function upsertCatalog(
  supabase: ReturnType<typeof createClient>,
  drafts: EventDraft[],
): Promise<{ events: number; markets: number; selections: number }> {
  let markets = 0;
  let selections = 0;
  const seenProviderIds = new Set<string>();

  for (const draft of drafts) {
    seenProviderIds.add(draft.provider_event_id);

    const { data: evRow, error: evErr } = await supabase
      .from("live_events")
      .upsert(
        {
          provider_event_id: draft.provider_event_id,
          sport: draft.sport,
          league: draft.league,
          league_id: draft.league_id,
          country: draft.country,
          home: draft.home,
          away: draft.away,
          minute: null,
          home_score: draft.home_score,
          away_score: draft.away_score,
          starts_at: draft.starts_at ?? null,
          status: "scheduled",
          betradar_id: draft.betradar_id,
          event_url: null,
          raw: draft.raw ?? {},
          updated_at: new Date().toISOString(),
          finished_at: null,
        },
        { onConflict: "provider_event_id" },
      )
      .select("id")
      .single();

    if (evErr || !evRow) {
      console.error("upsert live_events prematch", draft.provider_event_id, evErr?.message);
      continue;
    }

    const eventId = evRow.id as string;

    for (const m of draft.markets) {
      let marketId: string | null = null;

      let q = supabase
        .from("live_markets")
        .select("id")
        .eq("event_id", eventId)
        .eq("market_key", m.market_key);
      q = m.line == null ? q.is("line", null) : q.eq("line", m.line);
      const { data: existing } = await q.maybeSingle();

      if (existing?.id) {
        marketId = existing.id as string;
        await supabase.from("live_markets").update({
          status: m.status,
          provider_market_id: m.provider_market_id ?? null,
          updated_at: new Date().toISOString(),
        }).eq("id", marketId);
      } else {
        const { data: inserted, error: mErr } = await supabase
          .from("live_markets")
          .insert({
            event_id: eventId,
            market_key: m.market_key,
            line: m.line,
            status: m.status,
            provider_market_id: m.provider_market_id ?? null,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (mErr || !inserted) {
          console.error("insert live_markets prematch", mErr?.message);
          continue;
        }
        marketId = inserted.id as string;
      }

      if (!marketId) continue;
      markets += 1;

      for (const s of m.selections) {
        const { error: sErr } = await supabase.from("live_selections").upsert(
          {
            market_id: marketId,
            selection_key: s.selection_key,
            odd: s.odd,
            status: s.status,
            provider_selection_id: s.provider_selection_id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "market_id,selection_key" },
        );
        if (sErr) {
          console.error("upsert live_selections prematch", sErr.message);
          continue;
        }
        selections += 1;
      }
    }
  }

  // Drop scheduled events missing from this prematch pass (do not touch live).
  const { data: scheduledRows } = await supabase
    .from("live_events")
    .select("id,provider_event_id,status")
    .eq("status", "scheduled");

  for (const row of scheduledRows ?? []) {
    if (seenProviderIds.has(String(row.provider_event_id))) continue;
    await supabase
      .from("live_events")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "scheduled");
  }

  return { events: drafts.length, markets, selections };
}

function sportLabelFromCode(code: string): string {
  const map: Record<string, string> = {
    FOOT: "football", BASK: "basketball", TENN: "tennis", VOLL: "volleyball",
    ICEH: "hockey", HAND: "handball", TABL: "table_tennis", FUTS: "futsal", BASE: "baseball",
  };
  return map[code] || code.toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type, x-cron-secret",
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

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const maxLeaguesPerSport = Number(Deno.env.get("PREMATCH_MAX_LEAGUES") || 10);
  const sportsEnv = Deno.env.get("PREMATCH_SPORTS");
  const sports = (sportsEnv
    ? sportsEnv.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...PREMATCH_SPORT_CODES]);

  try {
    const allDrafts: EventDraft[] = [];
    const notes: string[] = [];

    for (const code of sports) {
      try {
        const leaguesPath =
          `/api/sports/${code}/hot/trending/leagues?req=s,stnf,c,mb`;
        const leaguesPayload = await feedGet(leaguesPath);
        const leagues = extractLeaguesFromHotPayload(
          leaguesPayload,
          sportLabelFromCode(code),
        ).slice(0, maxLeaguesPerSport);
        notes.push(`${code}:leagues=${leagues.length}`);

        for (const league of leagues) {
          const eventsPath = league.url.includes("?")
            ? league.url
            : `${league.url}?req=s,stnf,c,mb`;
          try {
            const eventsPayload = await feedGet(eventsPath);
            const rawEvents = extractEventsFromLeaguePayload(eventsPayload);
            const drafts = normalizePrematchEvents(rawEvents, code);
            allDrafts.push(...drafts);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("prematch league", code, league.id, message);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("prematch sport", code, message);
        notes.push(`${code}:err`);
      }
    }

    // Dedupe by provider id (first wins)
    const byId = new Map<string, EventDraft>();
    for (const d of allDrafts) {
      if (!byId.has(d.provider_event_id)) byId.set(d.provider_event_id, d);
    }
    const drafts = [...byId.values()];
    const counts = await upsertCatalog(supabase, drafts);

    await supabase.from("tipster_prematch_meta").upsert({
      id: 1,
      fetched_at: new Date().toISOString(),
      scheduled_total: counts.events,
      markets_total: counts.markets,
      last_error: null,
      notes: [...notes, `selections=${counts.selections}`],
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      ...counts,
      sports: sports.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-prematch-collector", message);
    await supabase.from("tipster_prematch_meta").upsert({
      id: 1,
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    });
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

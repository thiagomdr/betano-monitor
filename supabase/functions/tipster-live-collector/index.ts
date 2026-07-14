/**
 * Tipster Arena — live catalog collector.
 * Fetches overview JSON from LIVE_FEED_* env and upserts live_events/markets/selections.
 *
 * POST/GET /functions/v1/tipster-live-collector
 * Header: x-cron-secret (when CRON_SECRET is set)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeOverview } from "../_shared/live-feed/normalize.ts";
import type { EventDraft } from "../_shared/live-feed/types.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function feedOverviewUrl(): string {
  const base = (Deno.env.get("LIVE_FEED_BASE_URL") || "").replace(/\/$/, "");
  const path = Deno.env.get("LIVE_FEED_OVERVIEW_PATH") || "";
  if (!base || !path) {
    throw new Error("LIVE_FEED_BASE_URL and LIVE_FEED_OVERVIEW_PATH are required");
  }
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function fetchOverview(): Promise<unknown> {
  const url = feedOverviewUrl();
  const origin = Deno.env.get("LIVE_FEED_ORIGIN") || Deno.env.get("LIVE_FEED_BASE_URL") || "";
  const referer = Deno.env.get("LIVE_FEED_REFERER") ||
    (origin ? `${origin.replace(/\/$/, "")}/live/` : "");
  const ua = Deno.env.get("LIVE_FEED_USER_AGENT") ||
    "Mozilla/5.0 (compatible; TipsterArena/1.0)";

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": ua,
    "Accept-Language": "pt-BR,pt;q=0.9",
  };
  if (referer) headers.Referer = referer;
  if (origin) headers.Origin = origin.replace(/\/$/, "");

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`live_feed HTTP ${res.status}: ${text.slice(0, 200)}`);
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
          home: draft.home,
          away: draft.away,
          minute: draft.minute,
          home_score: draft.home_score,
          away_score: draft.away_score,
          status: draft.status,
          betradar_id: draft.betradar_id,
          raw: draft.raw ?? {},
          updated_at: new Date().toISOString(),
          finished_at: draft.status === "finished" ? new Date().toISOString() : null,
        },
        { onConflict: "provider_event_id" },
      )
      .select("id")
      .single();

    if (evErr || !evRow) {
      console.error("upsert live_events", draft.provider_event_id, evErr?.message);
      continue;
    }

    const eventId = evRow.id as string;

    for (const m of draft.markets) {
      // PostgREST unique nulls: use sentinel lookup then upsert
      let marketId: string | null = null;

      let q = supabase
        .from("live_markets")
        .select("id")
        .eq("event_id", eventId)
        .eq("market_key", m.market_key);
      q = m.line == null ? q.is("line", null) : q.eq("line", m.line);
      const { data: existing } = await q.maybeSingle();

      if (existing?.id) {
        const { data: updated, error } = await supabase
          .from("live_markets")
          .update({
            status: m.status,
            provider_market_id: m.provider_market_id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (error) {
          console.error("update live_markets", error.message);
          continue;
        }
        marketId = updated.id;
      } else {
        const { data: inserted, error } = await supabase
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
        if (error) {
          console.error("insert live_markets", error.message);
          continue;
        }
        marketId = inserted.id;
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
          console.error("upsert live_selections", sErr.message);
          continue;
        }
        selections += 1;
      }
    }
  }

  // Mark events missing from feed as finished (grace left to settler if still open picks)
  const { data: liveRows } = await supabase
    .from("live_events")
    .select("id,provider_event_id,status")
    .eq("status", "live");

  for (const row of liveRows ?? []) {
    if (seenProviderIds.has(String(row.provider_event_id))) continue;
    await supabase
      .from("live_events")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  return { events: drafts.length, markets, selections };
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

  try {
    const overview = await fetchOverview();
    const drafts = normalizeOverview(overview);
    const counts = await upsertCatalog(supabase, drafts);

    await supabase.from("tipster_live_meta").upsert({
      id: 1,
      fetched_at: new Date().toISOString(),
      live_total: counts.events,
      markets_total: counts.markets,
      last_error: null,
      notes: [`selections=${counts.selections}`],
      updated_at: new Date().toISOString(),
    });

    return jsonResponse({
      ok: true,
      ...counts,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-live-collector", message);
    await supabase.from("tipster_live_meta").upsert({
      id: 1,
      last_error: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    });
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

/**
 * Tipster Arena — lazy event markets (on "+" expand).
 * Fetches scoped overview + markets-offers for one event and upserts markets.
 *
 * POST /functions/v1/tipster-event-markets
 * Body: { event_id?: uuid, provider_event_id?: string }
 * Auth: Supabase JWT (logged-in tipster)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { extractScopedEventMarkets } from "../_shared/live-feed/normalize.ts";
import { mergeOffersIntoOverview } from "../_shared/live-feed/offers.ts";
import type { Json, MarketDraft } from "../_shared/live-feed/types.ts";

const CACHE_TTL_MS = 90_000;
const cache = new Map<string, { at: number; body: unknown }>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

function feedOverviewUrl(): string {
  const base = (Deno.env.get("LIVE_FEED_BASE_URL") || "").replace(/\/$/, "");
  const path = Deno.env.get("LIVE_FEED_OVERVIEW_PATH") || "";
  if (!base || !path) {
    throw new Error("LIVE_FEED_BASE_URL and LIVE_FEED_OVERVIEW_PATH are required");
  }
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function resolvePathTemplate(template: string, providerEventId: string): string {
  const path = template
    .replaceAll("{id}", encodeURIComponent(providerEventId))
    .replaceAll("{eventId}", encodeURIComponent(providerEventId));
  if (path.startsWith("http")) return path;
  const base = (Deno.env.get("LIVE_FEED_BASE_URL") || "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function feedEventUrl(providerEventId: string): string {
  const template = Deno.env.get("LIVE_FEED_EVENT_PATH") || "";
  if (template.trim()) return resolvePathTemplate(template, providerEventId);
  const overview = feedOverviewUrl();
  const sep = overview.includes("?") ? "&" : "?";
  return `${overview}${sep}eventId=${encodeURIComponent(providerEventId)}`;
}

function feedOffersUrl(providerEventId: string): string {
  const template = Deno.env.get("LIVE_FEED_MARKETS_OFFERS_PATH") ||
    "/api/event/markets-offers/{id}";
  return resolvePathTemplate(template, providerEventId);
}

function feedHeaders(providerEventId: string): Record<string, string> {
  const origin = Deno.env.get("LIVE_FEED_ORIGIN") || Deno.env.get("LIVE_FEED_BASE_URL") || "";
  const refererBase = Deno.env.get("LIVE_FEED_REFERER") ||
    (origin ? `${origin.replace(/\/$/, "")}/live/` : "");
  // Prefer event page referer — some feeds gate markets-offers on it
  const referer = refererBase.includes("/live")
    ? `${origin.replace(/\/$/, "")}/live/x/${providerEventId}/`
    : refererBase;
  const ua = Deno.env.get("LIVE_FEED_USER_AGENT") ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": ua,
    "Accept-Language": "pt-BR,pt;q=0.9",
  };
  if (referer) headers.Referer = referer;
  if (origin) headers.Origin = origin.replace(/\/$/, "");
  return headers;
}

async function fetchFeedJson(
  url: string,
  providerEventId: string,
): Promise<{ ok: boolean; status: number; data: unknown | null; error?: string }> {
  const res = await fetch(url, { headers: feedHeaders(providerEventId) });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, data: null, error: text.slice(0, 180) };
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    return { ok: false, status: res.status, data: null, error: "html_splash" };
  }
  try {
    return { ok: true, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, error: "invalid_json" };
  }
}

async function loadAllEventMarkets(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
): Promise<unknown[]> {
  const { data: markets } = await supabase
    .from("live_markets")
    .select("id,event_id,market_key,line,status")
    .eq("event_id", eventId);
  if (!markets?.length) return [];

  const ids = markets.map((m) => m.id);
  const { data: selections } = await supabase
    .from("live_selections")
    .select("market_id,selection_key,odd,status")
    .in("market_id", ids);

  const byMkt = new Map<string, unknown[]>();
  for (const s of selections || []) {
    const mid = String(s.market_id);
    if (!byMkt.has(mid)) byMkt.set(mid, []);
    byMkt.get(mid)!.push(s);
  }
  return markets.map((m) => ({
    ...m,
    selections: byMkt.get(String(m.id)) || [],
  }));
}

async function upsertEventMarkets(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  drafts: MarketDraft[],
): Promise<{ marketCount: number; selectionCount: number }> {
  let marketCount = 0;
  let selectionCount = 0;

  for (const m of drafts) {
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
      if (error || !updated) {
        console.error("update live_markets", error?.message);
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
      if (error || !inserted) {
        console.error("insert live_markets", error?.message);
        continue;
      }
      marketId = inserted.id;
    }

    if (!marketId) continue;
    marketCount += 1;

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
      selectionCount += 1;
    }
  }

  return { marketCount, selectionCount };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST only" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return jsonResponse({ error: "missing supabase env" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const eventId = body.event_id != null ? String(body.event_id) : "";
  let providerEventId = body.provider_event_id != null ? String(body.provider_event_id) : "";

  const admin = createClient(supabaseUrl, serviceKey);

  if (!providerEventId && eventId) {
    const { data: row } = await admin
      .from("live_events")
      .select("id,provider_event_id,status,sport")
      .eq("id", eventId)
      .maybeSingle();
    if (!row) return jsonResponse({ error: "event_not_found" }, 404);
    providerEventId = String(row.provider_event_id);
  }

  if (!providerEventId) {
    return jsonResponse({ error: "provider_event_id_required" }, 400);
  }

  let resolvedEventId = eventId;
  let eventSport = "other";
  {
    const { data: row } = await admin
      .from("live_events")
      .select("id,sport")
      .eq(resolvedEventId ? "id" : "provider_event_id", resolvedEventId || providerEventId)
      .maybeSingle();
    if (!row && !resolvedEventId) {
      return jsonResponse({ error: "event_not_found" }, 404);
    }
    if (row) {
      resolvedEventId = String(row.id);
      eventSport = String(row.sport || "other");
    }
  }

  const cached = cache.get(providerEventId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse({ ...cached.body as object, cached: true });
  }

  try {
    const [scopedRes, offersRes] = await Promise.all([
      fetchFeedJson(feedEventUrl(providerEventId), providerEventId),
      fetchFeedJson(feedOffersUrl(providerEventId), providerEventId),
    ]);

    let overview: Json = asRecord(scopedRes.data) ?? {
      events: {},
      markets: {},
      selections: {},
    };
    const usedOffers = !!offersRes.ok && offersRes.data != null;
    if (usedOffers) {
      overview = mergeOffersIntoOverview(overview, offersRes.data);
    }

    if (!scopedRes.ok && !usedOffers) {
      throw new Error(
        `feed_unavailable scoped=${scopedRes.status}/${scopedRes.error || "?"} offers=${offersRes.status}/${offersRes.error || "?"}`,
      );
    }

    const drafts = extractScopedEventMarkets(overview, providerEventId, {
      maxTotals: 4,
      allMarkets: usedOffers,
      sport: eventSport,
    });

    // Replace total lines so detail fetch does not accumulate stale OU ladders
    await admin
      .from("live_markets")
      .delete()
      .eq("event_id", resolvedEventId)
      .eq("market_key", "total");

    const { marketCount, selectionCount } = await upsertEventMarkets(
      admin,
      resolvedEventId,
      drafts,
    );

    // Drop football-only markets wrongly persisted for tennis / other sports
    const footOnly = ["btts", "double_chance"];
    const sportLc = eventSport.toLowerCase();
    const isFoot = sportLc === "football" || sportLc === "futsal" || sportLc === "soccer";
    if (!isFoot) {
      await admin
        .from("live_markets")
        .delete()
        .eq("event_id", resolvedEventId)
        .in("market_key", footOnly);
    }

    const markets = await loadAllEventMarkets(admin, resolvedEventId);

    const payload = {
      ok: true,
      event_id: resolvedEventId,
      provider_event_id: providerEventId,
      sport: eventSport,
      markets,
      market_count: marketCount,
      selection_count: selectionCount,
      draft_count: drafts.length,
      purged_football_mkts: !isFoot,
      sources: {
        scoped: scopedRes.ok,
        offers: usedOffers,
        scoped_status: scopedRes.status,
        offers_status: offersRes.status,
        offers_error: usedOffers ? null : (offersRes.error || null),
      },
      cached: false,
    };
    cache.set(providerEventId, { at: Date.now(), body: payload });
    return jsonResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-event-markets", providerEventId, message);
    return jsonResponse({ error: message }, 502);
  }
});

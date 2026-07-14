/**
 * Tipster Arena — SuperBet live tennis catalog ("Tênis 2").
 * Lists live tennis from SuperBet offer JSON and hydrates full event odds.
 *
 * POST /functions/v1/tipster-superbet-live
 * Body: { sport_id?: number }  // default 2 = tennis
 * Auth: Supabase JWT
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  extractSuperbetOfferGroups,
  normalizeSuperbetEvent,
} from "../_shared/live-feed/normalize-superbet.ts";

const CACHE_TTL_MS = 45_000;
const MAX_EVENTS = 24;
const CONCURRENCY = 6;
let catalogCache: { at: number; body: unknown; key: string } | null = null;

const DEFAULT_OFFER_BASE =
  "https://production-superbet-offer-br.freetls.fastly.net/v2/pt-BR";

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

function offerBase(): string {
  return (Deno.env.get("SUPERBET_OFFER_BASE") || DEFAULT_OFFER_BASE).replace(/\/$/, "");
}

function feedHeaders(): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "User-Agent": Deno.env.get("LIVE_FEED_USER_AGENT") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
    Origin: "https://superbet.bet.br",
    Referer: "https://superbet.bet.br/ao-vivo/",
  };
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const res = await fetch(url, { headers: feedHeaders() });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, data: null, error: text.slice(0, 180) };
  if (text.trimStart().startsWith("<")) {
    return { ok: false, status: res.status, data: null, error: "html_splash" };
  }
  try {
    return { ok: true, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, error: "invalid_json" };
  }
}

function liveStartDateParam(): string {
  const start = new Date(Date.now() - 8 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}` +
    `+${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}:00`
  );
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
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
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: "missing supabase env" }, 500);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData.user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const sportId = Number(body.sport_id ?? 2) || 2;
  const cacheKey = `sport:${sportId}`;

  if (catalogCache && catalogCache.key === cacheKey && Date.now() - catalogCache.at < CACHE_TTL_MS) {
    return jsonResponse({ ...catalogCache.body as object, cached: true });
  }

  try {
    const listUrl =
      `${offerBase()}/events/by-date?currentStatus=active&offerState=live&startDate=${liveStartDateParam()}`;
    const listRes = await fetchJson(listUrl);
    if (!listRes.ok) {
      return jsonResponse({
        ok: false,
        error: `list_http_${listRes.status}`,
        detail: listRes.error,
      }, 502);
    }

    const root = listRes.data as { data?: unknown[] };
    const rows = Array.isArray(root.data) ? root.data : [];
    const tennisRows = rows
      .filter((r) => {
        const rec = r && typeof r === "object" ? r as Record<string, unknown> : null;
        return rec && Number(rec.sportId) === sportId;
      })
      .slice(0, MAX_EVENTS);

    const offerIds = tennisRows.map((r) => {
      const rec = r as Record<string, unknown>;
      return String(rec.offerId ?? rec.eventId ?? "");
    }).filter(Boolean);

    const hydrated = await mapPool(offerIds, CONCURRENCY, async (offerId) => {
      const evRes = await fetchJson(`${offerBase()}/events/${encodeURIComponent(offerId)}`);
      if (!evRes.ok) return null;
      const draft = normalizeSuperbetEvent(evRes.data, { maxTotals: 4 });
      if (!draft) return null;
      const offerPack = extractSuperbetOfferGroups(evRes.data, {
        maxGroups: 36,
        maxPerGroup: 10,
      });
      const meta = draft.raw || {};
      return {
        id: draft.provider_event_id,
        provider_event_id: draft.provider_event_id,
        sport: "tennis_sb",
        league: draft.league_id ? `Torneio ${draft.league_id}` : "SuperBet",
        country: "Ao vivo",
        home: draft.home,
        away: draft.away,
        home_score: draft.home_score,
        away_score: draft.away_score,
        minute: null,
        status: "live",
        starts_at: null,
        meta: {
          match_status: meta.match_status ?? null,
          game_score: meta.game_score ?? null,
          odds_count: offerPack.odds_total,
          odds_active: offerPack.odds_active,
          shown_odds: offerPack.shown_odds,
          shown_groups: offerPack.groups.length,
          market_count: meta.market_count ?? null,
          offer_id: meta.offer_id ?? offerId,
          source: "superbet-live",
        },
        offer_groups: offerPack.groups,
        markets: draft.markets.map((m) => ({
          id: m.provider_market_id,
          event_id: draft.provider_event_id,
          market_key: m.market_key,
          line: m.line,
          status: m.status,
          selections: m.selections.map((s) => ({
            market_id: m.provider_market_id,
            selection_key: s.selection_key,
            odd: s.odd,
            status: s.status,
          })),
        })),
      };
    });

    const events = hydrated.filter(Boolean);
    const payload = {
      ok: true,
      source: "superbet",
      sport_id: sportId,
      listed: offerIds.length,
      events,
      cached: false,
      fetched_at: new Date().toISOString(),
    };
    catalogCache = { at: Date.now(), body: payload, key: cacheKey };
    return jsonResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-superbet-live", message);
    return jsonResponse({ error: message }, 502);
  }
});

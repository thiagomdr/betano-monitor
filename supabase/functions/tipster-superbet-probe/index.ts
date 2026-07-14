/**
 * Tipster Arena — SuperBet probe (side-by-side compare on "+" expand).
 * Does NOT replace the main feed; returns normalized markets for UI compare only.
 *
 * POST /functions/v1/tipster-superbet-probe
 * Body: { offer_id?: string, home?: string, away?: string }
 * Auth: Supabase JWT
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  namesLikelyMatch,
  normalizeSuperbetEvent,
} from "../_shared/live-feed/normalize-superbet.ts";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

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
    Referer: "https://superbet.bet.br/",
  };
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const res = await fetch(url, { headers: feedHeaders() });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, data: null, error: text.slice(0, 180) };
  }
  if (text.trimStart().startsWith("<")) {
    return { ok: false, status: res.status, data: null, error: "html_splash" };
  }
  try {
    return { ok: true, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, data: null, error: "invalid_json" };
  }
}

function draftToUi(draft: NonNullable<ReturnType<typeof normalizeSuperbetEvent>>) {
  return {
    provider_event_id: draft.provider_event_id,
    sport: draft.sport,
    home: draft.home,
    away: draft.away,
    home_score: draft.home_score,
    away_score: draft.away_score,
    league: draft.league,
    meta: draft.raw,
    markets: draft.markets.map((m) => ({
      id: m.provider_market_id,
      event_id: null,
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

  let offerId = body.offer_id != null ? String(body.offer_id).trim() : "";
  // Default probe game from the SuperBet comparison request
  if (!offerId && !body.home && !body.away) offerId = "14030958";

  const home = body.home != null ? String(body.home) : "";
  const away = body.away != null ? String(body.away) : "";
  const cacheKey = offerId || `name:${home}|${away}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse({ ...cached.body as object, cached: true });
  }

  try {
    if (!offerId && home && away) {
      // Live list — find matching match name
      const now = new Date();
      const start = new Date(now.getTime() - 6 * 3600_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const startDate =
        `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-${pad(start.getUTCDate())}` +
        `+${pad(start.getUTCHours())}:${pad(start.getUTCMinutes())}:00`;
      const listUrl =
        `${offerBase()}/events/by-date?currentStatus=active&offerState=live&startDate=${startDate}`;
      const listRes = await fetchJson(listUrl);
      if (listRes.ok && listRes.data) {
        const root = listRes.data as { data?: unknown[] };
        const rows = Array.isArray(root.data) ? root.data : [];
        for (const row of rows) {
          const draft = normalizeSuperbetEvent({ data: [row] });
          if (!draft) continue;
          if (namesLikelyMatch(home, away, draft.home, draft.away)) {
            offerId = String(draft.provider_event_id.replace(/^sb:/, ""));
            break;
          }
        }
      }
    }

    if (!offerId) {
      return jsonResponse({
        ok: false,
        error: "offer_not_found",
        hint: "Pass offer_id or home/away matching a live SuperBet event",
      }, 404);
    }

    const evRes = await fetchJson(`${offerBase()}/events/${encodeURIComponent(offerId)}`);
    if (!evRes.ok) {
      return jsonResponse({
        ok: false,
        error: `superbet_http_${evRes.status}`,
        detail: evRes.error,
      }, 502);
    }

    const draft = normalizeSuperbetEvent(evRes.data, { maxTotals: 6 });
    if (!draft) {
      return jsonResponse({ ok: false, error: "normalize_failed" }, 502);
    }

    const matched = home && away
      ? namesLikelyMatch(home, away, draft.home, draft.away)
      : true;

    const payload = {
      ok: true,
      source: "superbet",
      matched,
      offer_id: offerId,
      event: draftToUi(draft),
      cached: false,
    };
    cache.set(cacheKey, { at: Date.now(), body: payload });
    if (offerId) cache.set(offerId, { at: Date.now(), body: payload });
    return jsonResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-superbet-probe", message);
    return jsonResponse({ error: message }, 502);
  }
});

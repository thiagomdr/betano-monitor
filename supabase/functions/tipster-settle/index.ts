/**
 * Tipster Arena — settle open picks for finished events.
 *
 * POST/GET /functions/v1/tipster-settle
 * Body (optional force for tests):
 *   { "force_event_id": "<uuid>", "home_score": 2, "away_score": 1 }
 * Header: x-cron-secret (when CRON_SECRET is set)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { settlePick } from "../_shared/live-feed/settle-rules.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

type ForceBody = {
  force_event_id?: string;
  home_score?: number;
  away_score?: number;
};

async function settleEventPicks(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  homeScore: number,
  awayScore: number,
): Promise<{ settled: number; details: unknown[] }> {
  const { data: picks, error } = await supabase
    .from("picks")
    .select("id,market_key,selection_key,line,odd_snapshot,status")
    .eq("event_id", eventId)
    .eq("status", "open");

  if (error) throw new Error(error.message);

  const details: unknown[] = [];
  let settled = 0;

  for (const pick of picks ?? []) {
    let mktQuery = supabase
      .from("live_markets")
      .select("status")
      .eq("event_id", eventId)
      .eq("market_key", pick.market_key);
    mktQuery = pick.line == null
      ? mktQuery.is("line", null)
      : mktQuery.eq("line", pick.line);
    const { data: mkt } = await mktQuery.maybeSingle();

    const result = settlePick({
      market_key: pick.market_key,
      selection_key: pick.selection_key,
      line: pick.line,
      odd_snapshot: Number(pick.odd_snapshot),
      home_score: homeScore,
      away_score: awayScore,
      market_status: mkt?.status ?? null,
    });

    const { error: upErr } = await supabase
      .from("picks")
      .update({
        status: result.status,
        pnl_u: result.pnl_u,
        settled_at: new Date().toISOString(),
      })
      .eq("id", pick.id)
      .eq("status", "open");

    if (upErr) {
      details.push({ pick_id: pick.id, error: upErr.message });
      continue;
    }
    settled += 1;
    details.push({
      pick_id: pick.id,
      status: result.status,
      pnl_u: result.pnl_u,
      reason: result.reason,
    });
  }

  return { settled, details };
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

  let body: ForceBody = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  try {
    // Dev/test override
    if (body.force_event_id) {
      const hs = Number(body.home_score);
      const as_ = Number(body.away_score);
      if (!Number.isFinite(hs) || !Number.isFinite(as_)) {
        return jsonResponse({ error: "force requires home_score and away_score" }, 400);
      }

      await supabase
        .from("live_events")
        .update({
          home_score: hs,
          away_score: as_,
          status: "finished",
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.force_event_id);

      const result = await settleEventPicks(supabase, body.force_event_id, hs, as_);
      return jsonResponse({ ok: true, mode: "force", ...result });
    }

    // Natural settle: finished events with open picks
    const { data: events, error } = await supabase
      .from("live_events")
      .select("id,home_score,away_score,status")
      .eq("status", "finished");

    if (error) throw new Error(error.message);

    let totalSettled = 0;
    const perEvent: unknown[] = [];

    for (const ev of events ?? []) {
      if (ev.home_score == null || ev.away_score == null) continue;

      const { count } = await supabase
        .from("picks")
        .select("id", { count: "exact", head: true })
        .eq("event_id", ev.id)
        .eq("status", "open");
      if (!count) continue;

      const result = await settleEventPicks(
        supabase,
        ev.id,
        Number(ev.home_score),
        Number(ev.away_score),
      );
      totalSettled += result.settled;
      perEvent.push({ event_id: ev.id, ...result });
    }

    return jsonResponse({
      ok: true,
      mode: "auto",
      settled: totalSettled,
      events: perEvent.length,
      details: perEvent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-settle", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

/**
 * Arena Tipster — sync placar/status for sr_validated links via Sportradar GISMO.
 * Marks live_events finished when GISMO says ended, so tipster-settle can liquidate picks.
 *
 * POST/GET /functions/v1/tipster-link-sync
 * Header: x-cron-secret (when CRON_SECRET is set)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  extractLiveState,
  fetchGismoMatchInfo,
} from "../_shared/live-feed/sportradar-gismo.ts";

const MAX_LINKS = 60;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
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
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: links, error } = await supabase
      .from("tipster_event_links")
      .select(
        "id,betradar_id,betano_provider_event_id,superbet_offer_id,live_event_id,status,home,away,starts_at,last_score_home,last_score_away",
      )
      .in("status", ["sr_validated", "live"])
      .order("starts_at", { ascending: true, nullsFirst: false })
      .limit(MAX_LINKS);

    if (error) throw new Error(error.message);

    let scanned = 0;
    let liveN = 0;
    let finishedN = 0;
    let errors = 0;

    for (const link of links || []) {
      scanned += 1;
      const br = String(link.betradar_id || "");
      if (!br) continue;

      const gismo = await fetchGismoMatchInfo(br);
      if (!gismo.ok) {
        errors += 1;
        await logValidation(supabase, {
          action: "link_sync",
          status: "error",
          betradar_id: br,
          betano_provider_event_id: link.betano_provider_event_id,
          superbet_offer_id: link.superbet_offer_id,
          link_id: link.id,
          detail: { http: gismo.status, error: gismo.error },
        });
        continue;
      }

      const state = extractLiveState(gismo.data);
      let nextStatus = String(link.status);
      if (state.phase === "finished") nextStatus = "finished";
      else if (state.phase === "live") nextStatus = "live";
      else if (state.phase === "scheduled") nextStatus = "sr_validated";

      const nowIso = new Date().toISOString();
      await supabase.from("tipster_event_links").update({
        status: nextStatus,
        last_score_home: state.home_score,
        last_score_away: state.away_score,
        raw: {
          sync: {
            at: nowIso,
            phase: state.phase,
            status_label: state.status_label,
            status_id: state.status_id,
            winner: state.winner,
          },
        },
        updated_at: nowIso,
      }).eq("id", link.id);

      if (link.live_event_id && state.home_score != null && state.away_score != null) {
        const evPatch: Record<string, unknown> = {
          home_score: state.home_score,
          away_score: state.away_score,
          updated_at: nowIso,
        };
        if (nextStatus === "live") evPatch.status = "live";
        if (nextStatus === "finished") {
          evPatch.status = "finished";
          evPatch.finished_at = nowIso;
        }
        await supabase.from("live_events").update(evPatch).eq("id", link.live_event_id);
      }

      if (nextStatus === "live") liveN += 1;
      if (nextStatus === "finished") finishedN += 1;

      const scoreChanged =
        link.last_score_home !== state.home_score ||
        link.last_score_away !== state.away_score ||
        link.status !== nextStatus;

      if (scoreChanged) {
        await logValidation(supabase, {
          action: "link_sync",
          status: nextStatus === "finished" ? "finished" : "ok",
          betradar_id: br,
          betano_provider_event_id: link.betano_provider_event_id,
          superbet_offer_id: link.superbet_offer_id,
          link_id: link.id,
          detail: {
            phase: state.phase,
            home_score: state.home_score,
            away_score: state.away_score,
            status_label: state.status_label,
            prev_status: link.status,
            next_status: nextStatus,
            live_event_id: link.live_event_id,
          },
        });
      }
    }

    await logValidation(supabase, {
      action: "link_sync_run",
      status: "ok",
      detail: { scanned, live: liveN, finished: finishedN, errors },
    });

    return jsonResponse({
      ok: true,
      scanned,
      live: liveN,
      finished: finishedN,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("tipster-link-sync", message);
    await logValidation(supabase, {
      action: "link_sync_run",
      status: "error",
      detail: { error: message },
    });
    return jsonResponse({ error: message }, 502);
  }
});

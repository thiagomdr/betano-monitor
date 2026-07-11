/**
 * Worker de lembretes Telegram (15s x 4 ticks por invocacao, ate 5 min apos captura).
 * POST /functions/v1/telegram-reminder
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runTelegramReminderWorker } from "../_shared/telegram-capture-notify.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
    return jsonResponse({ error: "misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const result = await runTelegramReminderWorker(supabase);
  return jsonResponse({ ok: true, ...result });
});

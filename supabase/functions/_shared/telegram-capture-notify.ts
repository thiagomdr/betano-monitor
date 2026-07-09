import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { insertSistemaLog, matchLabel } from "./sistema-log.ts";

export type TelegramCaptureRow = {
  event_id: string;
  home: string | null;
  away: string | null;
  over_05_line: number | null;
  over_05_odd: number | null;
  betano_url: string | null;
};

export type TelegramSettleRow = {
  event_id: string;
  home: string | null;
  away: string | null;
  over_05_odd: number | null;
  gol_green_minute: number | null;
  placar_final: string | null;
  resultado: string;
  betano_url: string | null;
};

const CAPTURE_SELECT =
  "event_id,home,away,over_05_line,over_05_odd,betano_url,telegram_capture_sent_at,telegram_confirmacao,captured_at";

const TELEGRAM_SETTLE_SELECT =
  "event_id,home,away,over_05_odd,gol_green_minute,placar_final,resultado,betano_url,telegram_settle_notified_at,telegram_confirmacao";

function formatTelegramOdd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function buildCaptureMessage(row: TelegramCaptureRow): string {
  const teams = `${row.home ?? "—"} x ${row.away ?? "—"}`;
  const odd = formatTelegramOdd(row.over_05_odd);
  return `${teams} / +0,5 ODD ${odd}`;
}

/** Teclado inline: link do jogo + confirmar ODD + recusar ODD. */
export function buildCaptureInlineKeyboard(
  eventId: string,
  betanoUrl: string | null,
): { text: string; callback_data?: string; url?: string }[][] {
  const row: { text: string; callback_data?: string; url?: string }[] = [];
  if (betanoUrl) {
    row.push({ text: "🔗", url: betanoUrl });
  }
  row.push(
    { text: "✓", callback_data: `cap_ok:${eventId}` },
    { text: "✗", callback_data: `cap_bad:${eventId}` },
  );
  return [row];
}

export function telegramNotifyEnabled(): boolean {
  return Deno.env.get("TELEGRAM_NOTIFY_CAPTURE") === "1"
    && !!Deno.env.get("TELEGRAM_BOT_TOKEN")
    && !!Deno.env.get("TELEGRAM_CHAT_ID");
}

/** Uma oferta por jogo: mensagem curta + link + confirmar/recusar aposta simulada. */
export async function notifyTelegramCaptureOffer(
  supabase: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  if (!telegramNotifyEnabled()) return false;

  const nowIso = new Date().toISOString();
  const { data: row, error: claimError } = await supabase
    .from("futebol_mercado_gols_05")
    .update({ telegram_capture_sent_at: nowIso, updated_at: nowIso })
    .eq("event_id", eventId)
    .is("telegram_capture_sent_at", null)
    .not("captured_at", "is", null)
    .select(CAPTURE_SELECT)
    .maybeSingle();

  if (claimError) {
    console.error("telegram capture claim error", claimError);
    await insertSistemaLog(supabase, {
      level: "error",
      source: "telegram-capture",
      action: "erro",
      message: `Falha ao reservar envio Telegram (captura): ${claimError.message}`,
      event_id: eventId,
    });
    return false;
  }
  if (!row) return false;

  const captureRow = row as TelegramCaptureRow;
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const text = buildCaptureMessage(captureRow);
  const inlineKeyboard = buildCaptureInlineKeyboard(eventId, captureRow.betano_url);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [inlineKeyboard] },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("telegram capture notify failed", res.status, errText);
      await insertSistemaLog(supabase, {
        level: "error",
        source: "telegram-capture",
        action: "erro",
        message: `Telegram captura falhou (HTTP ${res.status})`,
        event_id: eventId,
        match_label: matchLabel(captureRow.home, captureRow.away),
        payload: { status: res.status, body: errText.slice(0, 300) },
      });
      await supabase.from("futebol_mercado_gols_05").update({
        telegram_capture_sent_at: null,
        updated_at: new Date().toISOString(),
      }).eq("event_id", eventId).eq("telegram_capture_sent_at", nowIso);
      return false;
    }
    const payload = await res.json() as { result?: { message_id?: number } };
    const messageId = payload.result?.message_id;
    if (messageId != null) {
      await supabase.from("futebol_mercado_gols_05").update({
        telegram_message_id: messageId,
        updated_at: new Date().toISOString(),
      }).eq("event_id", eventId);
    }
    await insertSistemaLog(supabase, {
      source: "telegram-capture",
      action: "telegram_captura",
      message: "Notificou captura +0,5 no Telegram",
      event_id: eventId,
      match_label: matchLabel(captureRow.home, captureRow.away),
      payload: { over_05_odd: captureRow.over_05_odd },
    });
    return true;
  } catch (err) {
    console.error("telegram capture notify error", err);
    await insertSistemaLog(supabase, {
      level: "error",
      source: "telegram-capture",
      action: "erro",
      message: `Erro ao notificar captura no Telegram: ${err instanceof Error ? err.message : String(err)}`,
      event_id: eventId,
      match_label: matchLabel(captureRow.home, captureRow.away),
    });
    await supabase.from("futebol_mercado_gols_05").update({
      telegram_capture_sent_at: null,
      updated_at: new Date().toISOString(),
    }).eq("event_id", eventId).eq("telegram_capture_sent_at", nowIso);
    return false;
  }
}

function buildSettleMessage(row: TelegramSettleRow): string {
  const isWin = row.resultado === "win";
  const teams = `${row.home ?? "—"} x ${row.away ?? "—"}`;
  const odd = formatTelegramOdd(row.over_05_odd);
  if (isWin) {
    const gol = row.gol_green_minute != null ? ` (${row.gol_green_minute}')` : "";
    return `GREEN — ${teams} — +0,5 @ ${odd}${gol}`;
  }
  return `RED — ${teams} — +0,5 @ ${odd} | ${row.placar_final ?? "—"}`;
}

export async function notifyTelegramSettleOnce(
  supabase: SupabaseClient,
  eventId: string,
): Promise<boolean> {
  if (!telegramNotifyEnabled()) return false;

  const nowIso = new Date().toISOString();
  const { data: row, error: claimError } = await supabase
    .from("futebol_mercado_gols_05")
    .update({ telegram_settle_notified_at: nowIso, updated_at: nowIso })
    .eq("event_id", eventId)
    .eq("telegram_confirmacao", "confirmada")
    .in("resultado", ["win", "loss"])
    .is("telegram_settle_notified_at", null)
    .select(TELEGRAM_SETTLE_SELECT)
    .maybeSingle();

  if (claimError) {
    console.error("telegram settle claim error", claimError);
    await insertSistemaLog(supabase, {
      level: "error",
      source: "telegram-settle",
      action: "erro",
      message: `Falha ao reservar envio Telegram (liquidacao): ${claimError.message}`,
      event_id: eventId,
    });
    return false;
  }
  if (!row) return false;

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const settleRow = row as TelegramSettleRow;
  const text = buildSettleMessage(settleRow);
  const inlineKeyboard: { text: string; url?: string }[][] = [];
  if (settleRow.betano_url) {
    inlineKeyboard.push([{ text: "🔗", url: settleRow.betano_url }]);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...(inlineKeyboard.length ? { reply_markup: { inline_keyboard: inlineKeyboard } } : {}),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error("telegram settle notify failed", res.status, errText);
      await insertSistemaLog(supabase, {
        level: "error",
        source: "telegram-settle",
        action: "erro",
        message: `Telegram liquidacao falhou (HTTP ${res.status})`,
        event_id: eventId,
        match_label: matchLabel(settleRow.home, settleRow.away),
        payload: { status: res.status, resultado: settleRow.resultado },
      });
      await supabase.from("futebol_mercado_gols_05").update({
        telegram_settle_notified_at: null,
        updated_at: new Date().toISOString(),
      }).eq("event_id", eventId).eq("telegram_settle_notified_at", nowIso);
      return false;
    }
    await insertSistemaLog(supabase, {
      source: "telegram-settle",
      action: "telegram_settle",
      message: settleRow.resultado === "win"
        ? "Notificou GREEN no Telegram"
        : "Notificou RED no Telegram",
      event_id: eventId,
      match_label: matchLabel(settleRow.home, settleRow.away),
      payload: {
        resultado: settleRow.resultado,
        placar_final: settleRow.placar_final,
        gol_green_minute: settleRow.gol_green_minute,
      },
    });
    return true;
  } catch (err) {
    console.error("telegram settle notify error", err);
    await insertSistemaLog(supabase, {
      level: "error",
      source: "telegram-settle",
      action: "erro",
      message: `Erro ao notificar liquidacao no Telegram: ${err instanceof Error ? err.message : String(err)}`,
      event_id: eventId,
      match_label: matchLabel(settleRow.home, settleRow.away),
    });
    await supabase.from("futebol_mercado_gols_05").update({
      telegram_settle_notified_at: null,
      updated_at: new Date().toISOString(),
    }).eq("event_id", eventId).eq("telegram_settle_notified_at", nowIso);
    return false;
  }
}

export async function processPendingTelegramReminders(
  _supabase: SupabaseClient,
): Promise<number> {
  return 0;
}

export async function runTelegramReminderWorker(
  supabase: SupabaseClient,
): Promise<{ sent: number; ticks: number }> {
  return { sent: 0, ticks: 0 };
}

export function scheduleTelegramReminderWorker(_supabase: SupabaseClient): void {
  // lembretes desligados — uma oferta por jogo
}

export async function processPendingTelegramSettlements(
  supabase: SupabaseClient,
): Promise<number> {
  if (!telegramNotifyEnabled()) return 0;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id")
    .in("resultado", ["win", "loss"])
    .eq("telegram_confirmacao", "confirmada")
    .is("telegram_settle_notified_at", null)
    .gte("settled_at", since)
    .limit(20);

  if (error) {
    console.error("telegram settle query error", error);
    return 0;
  }

  let sent = 0;
  for (const row of rows ?? []) {
    if (await notifyTelegramSettleOnce(supabase, String(row.event_id))) sent += 1;
  }
  return sent;
}

export async function pingTelegramReminderFunction(): Promise<void> {
  // noop
}

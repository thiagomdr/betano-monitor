/**
 * Webhook Telegram: botoes Correto / Erro nas notificacoes de captura +0,5.
 * POST /functions/v1/telegram-webhook?secret=...
 *
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { insertSistemaLog } from "../_shared/sistema-log.ts";

type TelegramCallbackQuery = {
  id: string;
  from: { id: number };
  data?: string;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

type TelegramUpdate = {
  callback_query?: TelegramCallbackQuery;
};

async function telegramApi(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`telegram ${method} failed`, res.status, await res.text());
  }
}

function parseCallbackData(data: string | undefined): { status: "confirmada" | "recusada"; eventId: string } | null {
  if (!data) return null;
  const m = data.match(/^cap_(ok|bad):(.+)$/);
  if (!m) return null;
  return {
    status: m[1] === "ok" ? "confirmada" : "recusada",
    eventId: m[2],
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("ok", { status: 200 });
  }

  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const urlSecret = new URL(req.url).searchParams.get("secret");
  if (!expectedSecret || urlSecret !== expectedSecret) {
    return new Response("forbidden", { status: 403 });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const allowedChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !allowedChatId || !supabaseUrl || !serviceKey) {
    console.error("telegram-webhook missing env");
    return new Response("misconfigured", { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const cq = update.callback_query;
  if (!cq?.data || !cq.message) {
    return new Response("ok", { status: 200 });
  }

  if (String(cq.message.chat.id) !== String(allowedChatId)) {
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "Chat nao autorizado.",
      show_alert: true,
    });
    return new Response("ok", { status: 200 });
  }

  const parsed = parseCallbackData(cq.data);
  if (!parsed) {
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: "Acao desconhecida.",
    });
    return new Response("ok", { status: 200 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const nowIso = new Date().toISOString();
  const { data: row, error } = await supabase
    .from("futebol_mercado_gols_05")
    .update({
      telegram_confirmacao: parsed.status,
      telegram_confirmado_em: nowIso,
      telegram_confirmado_por: cq.from.id,
      telegram_message_id: cq.message.message_id,
      updated_at: nowIso,
    })
    .eq("event_id", parsed.eventId)
    .is("telegram_confirmacao", null)
    .select("event_id,telegram_confirmacao")
    .maybeSingle();

  if (error || !row) {
    const { data: existing } = await supabase
      .from("futebol_mercado_gols_05")
      .select("telegram_confirmacao")
      .eq("event_id", parsed.eventId)
      .maybeSingle();
    const msg = existing?.telegram_confirmacao
      ? "Aposta ja respondida neste jogo."
      : "Jogo nao encontrado no banco.";
    await telegramApi(token, "answerCallbackQuery", {
      callback_query_id: cq.id,
      text: msg,
      show_alert: true,
    });
    return new Response("ok", { status: 200 });
  }

  const label = parsed.status === "confirmada"
    ? "ODD confere com a pagina"
    : "ODD nao confere com a pagina";
  const icon = parsed.status === "confirmada" ? "✓" : "✗";
  const baseText = cq.message.text ?? "";
  const suffix = `\n\n${icon} ${label}`;
  const newText = baseText.includes("ODD confere") || baseText.includes("ODD nao confere")
    ? baseText
    : `${baseText}${suffix}`;

  await telegramApi(token, "answerCallbackQuery", {
    callback_query_id: cq.id,
    text: label,
  });
  await telegramApi(token, "editMessageText", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: newText,
    disable_web_page_preview: false,
  });
  await telegramApi(token, "editMessageReplyMarkup", {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    reply_markup: { inline_keyboard: [] },
  });

  await insertSistemaLog(supabase, {
    source: "telegram-webhook",
    action: "telegram_validacao",
    message: parsed.status === "confirmada"
      ? "Usuario confirmou ODD no Telegram"
      : "Usuario recusou ODD no Telegram",
    event_id: parsed.eventId,
    payload: { telegram_confirmacao: parsed.status, user_id: cq.from.id },
  });

  return new Response("ok", { status: 200 });
});

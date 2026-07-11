/**
 * POST /functions/v1/telegram-test — envia mensagem demo de captura +0,5.
 * Usa secrets TELEGRAM_* do projeto (sem gravar no BD).
 */
import {
  buildCaptureInlineKeyboard,
  buildCaptureMessage,
  telegramNotifyEnabled,
} from "../_shared/telegram-capture-notify.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (!telegramNotifyEnabled()) {
    return Response.json({
      ok: false,
      error: "Telegram desligado. Configure TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_NOTIFY_CAPTURE=1",
    }, { status: 503 });
  }

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID")!;
  const demo = {
    event_id: "telegram-test",
    home: "Flamengo",
    away: "Palmeiras",
    over_05_line: 0.5,
    over_05_odd: 1.85,
    betano_url: "https://www.betano.bet.br/live/",
  };

  const text = `${buildCaptureMessage(demo)} (TESTE)`;
  const inlineKeyboard = buildCaptureInlineKeyboard(demo.event_id, demo.betano_url);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: inlineKeyboard },
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    return Response.json({ ok: false, status: res.status, body }, { status: 502 });
  }

  return Response.json({ ok: true, text, telegram: JSON.parse(body) });
});

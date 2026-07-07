# Supabase — Mercado de Gols +0,5 (Betano)

Coleta na nuvem (Edge Function `betano-futebol-live`), sem IP local.

## Deploy

```powershell
npx supabase link --project-ref mddortcbebtkopeanrhu
npx supabase db query --linked -f supabase/migrations/<migration>.sql
npx supabase functions deploy betano-futebol-live --no-verify-jwt
```

## Teste

```powershell
powershell -File scripts/invoke-cron.ps1
```

## Telegram (captura +0,5)

Notifica no Telegram cada captura real da linha Over +0,5 (`captured_at`).

1. Crie o bot em [@BotFather](https://t.me/BotFather) e envie `/start` ao bot.
2. Configure secrets:

```powershell
$env:TELEGRAM_BOT_TOKEN="seu-token-do-botfather"
powershell -File scripts/setup-telegram.ps1
npx supabase functions deploy betano-futebol-live --no-verify-jwt
```

Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_NOTIFY_CAPTURE=1` (use `0` para desligar).

**Nunca commite o token.** Se vazar, revogue em `/revoke` no BotFather.

## Tabelas usadas pela coleta

- `futebol_mercado_gols_05` — mercado +0,5 (fonte do painel)
- `futebol_historico_jogos` / `futebol_historico_gols` — placar e gols
- `futebol_live_meta` — meta da ultima rodada
- `futebol_live_coleta_config` — cron

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

## Painel (login obrigatorio)

Dados do mercado so com **Supabase Auth** (JWT). Anon key sozinha nao le tabelas.

1. Aplique a migration `20260719010000_futebol_panel_auth_only.sql`
2. Crie o usuario:

```powershell
powershell -File scripts/setup-panel-auth.ps1 -Email "seu@email.com" -Password "sua-senha-forte"
```

3. No Dashboard: **Authentication** → desative **Enable sign ups** (opcional, so voce entra)
4. Publique `web/` no GitHub Pages

O painel pede email/senha antes de carregar jogos.

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

Botoes na mesma linha: **🔗** (link do jogo) **✓** (ODD confere) **✗** (ODD nao confere).

Formato: `Time 1 x Time 2 / +0,5 ODD 1.85`

Teste demo (Edge Function):

```powershell
powershell -File scripts/verify-telegram.ps1
# ou POST /functions/v1/telegram-test
```

Se retornar `bot was blocked by the user`, abra o bot no Telegram e envie `/start` de novo.

```powershell
powershell -File scripts/setup-telegram-webhook.ps1
npx supabase functions deploy telegram-webhook --no-verify-jwt
npx supabase functions deploy telegram-reminder --no-verify-jwt
npx supabase db query --linked -f supabase/migrations/20260718220000_futebol_mercado_telegram_confirm.sql
npx supabase db query --linked -f supabase/migrations/20260718230000_futebol_mercado_telegram_reminder.sql
npx supabase db query --linked -f supabase/migrations/20260718230100_futebol_telegram_reminder_cron.sql
```

**Nunca commite o token.** Se vazar, revogue em `/revoke` no BotFather.

## ScrapingBee (deep fetch HCTG com IP Brasil)

Quando o overview global nao traz todas as linhas de Total de Gols, a Edge Function pode chamar a API Betano via **ScrapingBee** (proxy BR). Sem VM, sem SSH.

1. Crie conta em [scrapingbee.com](https://www.scrapingbee.com/) e copie a API key.
2. Configure secrets:

```powershell
powershell -File scripts/setup-scrapingbee.ps1 -ApiKey "SUA_CHAVE"
npx supabase functions deploy betano-futebol-live --no-verify-jwt
```

Secrets opcionais: `SCRAPINGBEE_COUNTRY` (default `br`), `SCRAPINGBEE_MAX_PER_RUN` (default `6`), `SCRAPINGBEE_PREMIUM=1` (proxy premium, mais creditos).

Teste local antes do deploy:

```powershell
cd scripts
$env:SCRAPINGBEE_API_KEY="..."
# JSON via overview?eventId=
node test-scrapingbee-hctg.mjs 88494497 suica-colombia
# HTML via pagina + aba Gols (render_js, ~5 creditos/request)
node test-scrapingbee-hctg.mjs 88494497 suica-colombia --html-only
```

Deep fetch: JSON primeiro; se linhas incompletas, HTML aba Gols (`html-dom+browser-proxy`). So roda em jogos `watching` / `sem_linha_05` (para apos captura `pending`).

## Limpeza legado (CasinoScores / Sic Bo)

Se o banco ainda tiver tabelas antigas (`sic_bo_*`, `lightning_storm_*`, `casinoscores_coleta_config`, `futebol_live_rows`):

```powershell
npx supabase db query --linked -f supabase/migrations/20260718280000_betano_monitor_legacy_cleanup.sql
```

Ver `supabase/migrations/README.md` para o mapa de migrations.

## Tabelas usadas pela coleta

- `futebol_mercado_gols_05` — mercado +0,5 (fonte do painel)
- `futebol_historico_jogos` / `futebol_historico_gols` — placar e gols
- `futebol_live_meta` — meta da ultima rodada
- `futebol_live_coleta_config` — cron

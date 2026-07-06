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

## Tabelas usadas pela coleta

- `futebol_mercado_gols_05` — mercado +0,5 (fonte do painel)
- `futebol_historico_jogos` / `futebol_historico_gols` — placar e gols
- `futebol_live_meta` — meta da ultima rodada
- `futebol_live_coleta_config` — cron

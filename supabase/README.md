# Supabase — Futebol Live Betano

Coleta na nuvem (Edge Function), sem IP local.

## Deploy

```powershell
supabase link --project-ref mddortcbebtkopeanrhu
supabase db push
supabase functions deploy betano-futebol-live --no-verify-jwt
```

## Teste

```powershell
curl -X POST "https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-futebol-live"
```

## Tabelas

- `futebol_live_rows`
- `futebol_live_meta`
- `futebol_live_coleta_config`

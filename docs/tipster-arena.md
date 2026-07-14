# Tipster Arena (paper trading)

Terminal de apostas simuladas + ranking de tipsters. Isolado do monitor Mercado +0,5 / HCTG / Favorito 1X2.

## O que o MVP faz

1. Collector periodico grava jogos/odds live (`live_events`, `live_markets`, `live_selections`)
2. Tipster autenticado faz pick de **1 unidade** (`place_pick` — odd snapshot no servidor)
3. Settler liquida picks em eventos `finished` (ou force no teste)
4. Ranking por `pnl_u` (`v_tipster_ranking`)

Mercados v1: `1x2`, `total` (linha absoluta), `btts`, `double_chance`.

## Deploy

```powershell
# 1) Migration
npx supabase db query --linked -f supabase/migrations/20260723120000_tipster_arena.sql

# 2) Secrets do live feed (NAO commitar valores)
npx supabase secrets set LIVE_FEED_BASE_URL="https://<host-do-feed>"
npx supabase secrets set LIVE_FEED_OVERVIEW_PATH="/caminho/do/overview?..."
npx supabase secrets set LIVE_FEED_ORIGIN="https://<host-do-feed>"
npx supabase secrets set LIVE_FEED_REFERER="https://<host-do-feed>/live/"
# opcional:
# npx supabase secrets set LIVE_FEED_USER_AGENT="Mozilla/5.0 ..."
# npx supabase secrets set CRON_SECRET="..."

# 3) Edge functions
npx supabase functions deploy tipster-live-collector --no-verify-jwt
npx supabase functions deploy tipster-settle --no-verify-jwt

# 4) Apontar cron (URLs do projeto)
powershell -File scripts/setup-tipster-arena.ps1
```

## Variaveis de ambiente

| Variavel | Obrigatorio | Descricao |
|---|---|---|
| `LIVE_FEED_BASE_URL` | sim | Base HTTPS do provedor de odds live |
| `LIVE_FEED_OVERVIEW_PATH` | sim | Path (+ query) do overview JSON |
| `LIVE_FEED_ORIGIN` | recomendado | Header `Origin` |
| `LIVE_FEED_REFERER` | recomendado | Header `Referer` |
| `LIVE_FEED_USER_AGENT` | nao | Default `TipsterArena/1.0` |
| `CRON_SECRET` | recomendado | Exige header `x-cron-secret` nas Edges |
| `SUPABASE_URL` / `SERVICE_ROLE` | automatico | Persistencia nas Edges |

Nao documente hostnames de marca em issues/PRs publicos; trate o feed como `live_feed` generico.

## UI

Arquivo: `web/tipster.html` (Auth + abas Terminal / Meus picks / Ranking).

```powershell
powershell -File scripts/serve-monitor.ps1
# abrir http://localhost:<porta>/tipster.html
```

Usuario: o mesmo Auth do painel (`scripts/setup-panel-auth.ps1`) ou novo tipster no Dashboard.

## Teste

```powershell
powershell -File scripts/test-tipster-arena.ps1
```

Fluxo manual:

1. Login na UI → pick em um jogo live
2. Anote o `event_id` (script lista a amostra)
3. Force settle:

```powershell
powershell -File scripts/test-tipster-arena.ps1 -SkipInvoke -ForceSettle -EventId "<uuid>" -HomeScore 2 -AwayScore 1
```

4. Confira PnL: GREEN = `odd_snapshot - 1`; RED = `-1`; void = `0`

## Arquivos

| Path | Papel |
|---|---|
| `supabase/migrations/20260723120000_tipster_arena.sql` | Tabelas, RLS, RPC, cron |
| `supabase/functions/_shared/live-feed/` | Normalize + settle rules |
| `supabase/functions/tipster-live-collector/` | Upsert catalogo |
| `supabase/functions/tipster-settle/` | Liquidacao |
| `web/tipster.html` | Terminal |
| `scripts/test-tipster-arena.ps1` | Checklist |

## Fora de escopo (v1)

Pix/assinatura real, arb multi-casa, scrape HTML, todos os mercados do feed, auto-bet em casa real.

# Tipster Arena (paper trading)

Projeto vigente: catálogo **Betano + SuperBet**, matching determinístico,
validação **Sportradar GISMO** (`betradar_id`), picks paper, ranking.

Monitor legado Mercado +0,5 / HCTG / Favorito **não é prioridade**.

## Fonte da verdade

PostgreSQL (Supabase): `live_events`, `tipster_event_links`, `tipster_validation_logs`,
`picks`, ranking.

Odds Arena = feed × **0,855**.

## Matching pré-jogo (fase atual)

1. Coleta Betano pré (`tipster-prematch-collector`) → `live_events` `scheduled` + `betradar_id`
2. Coleta SuperBet `offerState=prematch`
3. **`tipster-prematch-bridge`**:
   - Pareia por **mesmo `betradar_id`**, ou esporte + horário (±15 min) + nomes normalizados
   - Ambíguo → não linka (log `ambiguous`)
   - Valida GISMO `match_info/{id}` (times compatíveis) → `sr_validated` / `sr_rejected`
   - Tudo registrado em `tipster_validation_logs`

```powershell
npx supabase db query --linked -f supabase/migrations/20260725120000_tipster_event_links.sql
npx supabase functions deploy tipster-prematch-collector --no-verify-jwt
npx supabase functions deploy tipster-prematch-bridge --no-verify-jwt
```

Invocar bridge (cron ou manual):

```http
POST /functions/v1/tipster-prematch-bridge
x-cron-secret: <CRON_SECRET>
```

Body opcional: `{ "betano_from": "both" }` para também puxar hot feed Betano se o DB estiver vazio.

Após o jogo começar: `tipster-link-sync` lê GISMO, atualiza placar nos links e marca
`live_events` como `finished` → `tipster-settle` liquida picks abertos.

### Crons (pg_cron)

| Job | Intervalo | Função |
|---|---|---|
| tipster-prematch-tick | */5 | prematch collector Betano |
| tipster-bridge-tick | */10 | match Betano↔SuperBet + GISMO validate |
| tipster-link-sync-tick | */2 | placar/status GISMO nos links |
| tipster-settle (existente) | ver setup | liquida picks |

```powershell
npx supabase db query --linked -f supabase/migrations/20260725130000_tipster_bridge_sync_cron.sql
npx supabase functions deploy tipster-prematch-bridge --no-verify-jwt
npx supabase functions deploy tipster-link-sync --no-verify-jwt
npx supabase functions deploy tipster-settle --no-verify-jwt
powershell -File scripts/setup-tipster-arena.ps1
```

## Regras Cursor

- `.cursor/rules/00-betano-monitor.mdc` — visão Arena Tipster
- `.cursor/rules/01-tipster-matching.mdc` — matching / GISMO / logs

## Fora de escopo

- **1xBet** (Cloudflare + odds ofuscadas)
- Matching ou settle por **IA**
- Expandir monitores HCTG / Favorito 1X2 salvo pedido explícito

## Outras Edges (legado Tipster)

| Função | Papel |
|---|---|
| `tipster-live-collector` | Live Betano → catálogo |
| `tipster-event-markets` | Mercados sob demanda (+) |
| `tipster-settle` | Liquida picks por placar (+ links finished) |
| `tipster-prematch-bridge` | Match pré + validação Sportradar |
| `tipster-link-sync` | Placar GISMO → live/finished |
| `tipster-superbet-live` | Tênis 2 (UI SuperBet) |
| `tipster-superbet-probe` | Compare SuperBet no + |

## Deploy base

```powershell
npx supabase db query --linked -f supabase/migrations/20260723120000_tipster_arena.sql
npx supabase db query --linked -f supabase/migrations/20260724120000_tipster_prematch.sql
npx supabase db query --linked -f supabase/migrations/20260725120000_tipster_event_links.sql
npx supabase db query --linked -f supabase/migrations/20260725130000_tipster_bridge_sync_cron.sql
npx supabase functions deploy tipster-live-collector --no-verify-jwt
npx supabase functions deploy tipster-prematch-collector --no-verify-jwt
npx supabase functions deploy tipster-prematch-bridge --no-verify-jwt
npx supabase functions deploy tipster-link-sync --no-verify-jwt
npx supabase functions deploy tipster-settle --no-verify-jwt
powershell -File scripts/setup-tipster-arena.ps1
```

Secrets: `LIVE_FEED_*`, `CRON_SECRET`, opcional `SUPERBET_OFFER_BASE`.

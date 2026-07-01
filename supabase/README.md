# Supabase — betano-monitor (web)

Projeto Supabase: **mddortcbebtkopeanrhu** (BetanoMonitor).

## Painel web (GitHub Pages)

**https://thiagomdr.github.io/betano-monitor/**

- Login: mesmo e-mail/senha do Supabase Auth
- Build local: `npm run build:historico-html` → `npx serve web/historico -p 5173`
- Deploy: `git push` em `main` (workflow GitHub Actions)

Config: `web/historico/supabase.config.json` ou secrets `EXPO_PUBLIC_SUPABASE_*` no GitHub.

### Migrations obrigatórias (SQL Editor ou `supabase db push`)

| Arquivo | O que faz |
|---------|-----------|
| `20260629120000_betano_coletas.sql` | Tabelas base + RLS |
| `20260629130000_coleta_scheduler.sql` | Scheduler + pg_cron |
| `20260629150000_jogos_coleta_odds_tempo.sql` | Odds e tempo |
| `20260629160000_realtime_historico.sql` | Realtime coletas/jogos |
| `20260629170000_delete_jogos.sql` | Excluir jogos no painel |
| `20260629180000_regras_alerta.sql` | Regras configuráveis |
| `20260629190000_realtime_alertas.sql` | Realtime alertas |
| `20260629191000_delete_alertas.sql` | Excluir alertas no painel |
| `20260629192000_jogos_url_partida.sql` | `event_id` e `url_partida` (link Betano) |

`20260629140000_storage_web.sql` — legado (Storage HTML); **não necessário** com GitHub Pages.

---

## Edge Function — `betano-coleta`

API Betano `danae-webapi/api/live/overview/latest`, filtro basquete (BASK).

### Deploy completo (migration + functions + validação)

```powershell
# Token: https://supabase.com/dashboard/account/tokens
$env:SUPABASE_ACCESS_TOKEN = "seu-token"
npm run deploy:supabase
```

Ou GitHub Actions → **Deploy Supabase** (secret `SUPABASE_ACCESS_TOKEN` no repositório).

### Deploy só functions

```powershell
npm run deploy:coleta
```

Teste:

```powershell
curl "https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-coleta" `
  -H "Authorization: Bearer SUA_ANON_KEY" -X POST
```

---

## Coleta automática — `betano-coleta-cron`

Intervalo **4–8 min** aleatório via `coleta_scheduler` + `pg_cron`.

```powershell
npx supabase functions deploy betano-coleta-cron --project-ref mddortcbebtkopeanrhu
```

Ativar no painel: **Iniciar** (grava `coleta_scheduler.ativo = true`).

Secret opcional: `CRON_SECRET` + `coleta_cron_config.cron_secret`.

---

## Alertas — `betano-alertas-avaliar`

```powershell
npx supabase functions deploy betano-alertas-avaliar --project-ref mddortcbebtkopeanrhu
```

Regras no painel: aba Alertas → ícone config.

---

## Probe — `betano-probe`

```powershell
npm run deploy:probe
```

---

## Variáveis

`.env` (build local) ou GitHub Secrets:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Consultas úteis

```sql
select c.coletado_em, c.qtd_jogos, c.fonte_parser
from coletas_betano c
order by c.coletado_em desc limit 20;
```

```sql
select a.time_casa, a.time_fora, a.periodo_atual, a.disparado_em
from alertas_betano a
order by a.disparado_em desc limit 20;
```

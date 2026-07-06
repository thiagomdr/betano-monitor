# Mercado de Gols +0,5 · Betano via Supabase

Monitoramento automatico da linha **Over +0,5** (placar + 0,5) em jogos ao vivo da Betano. Coleta na **nuvem Supabase** (Edge Function) — **nao usa o IP da sua casa**.

Sem cookie de conta: apenas endpoints publicos `danae-webapi`.

## Painel online

**https://thiagomdr.github.io/betano-monitor/**

(GitHub Pages publica a pasta `web/` a cada push em `main`.)

Localmente: `powershell -File scripts/serve-monitor.ps1` → http://localhost:8080

## O que o painel mostra

- Jogos monitorados no mercado **+0,5** (Super Estrategia e Imediato)
- Captura, GREEN/RED, lucro simulado 1u, placar e status ao vivo
- Popover **Super Estrategia** com historico de odds +0,5
- Exclusao por linha (soft-delete `excluido` — o cron nao recria)

## Setup

### 1. Migration + function

No projeto linkado (`mddortcbebtkopeanrhu`):

```powershell
npx supabase db query --linked -f supabase/migrations/<arquivo>.sql
npx supabase functions deploy betano-futebol-live --no-verify-jwt
```

### 2. Painel local

Edite `web/supabase.config.json` com a **anon key** do Dashboard (Settings → API):

```json
{
  "url": "https://mddortcbebtkopeanrhu.supabase.co",
  "anonKey": "eyJhbGciOi..."
}
```

```powershell
powershell -File scripts/serve-monitor.ps1
```

Abra **http://localhost:8080** (atualiza a cada 60s).

### 3. Disparo manual da coleta

```powershell
powershell -File scripts/invoke-cron.ps1
```

O **cron** no banco chama a function a cada **2 minutos** (`futebol-live-coleta-tick`).

### 4. (Opcional) Proteger o cron

Defina o secret `CRON_SECRET` na function e grave o mesmo valor em:

```sql
update public.futebol_live_coleta_config
set cron_secret = 'seu_segredo'
where id = 'default';
```

## Seguranca da conta Betano

- A function **nao** envia cookie/sessao de login.
- O trafego sai dos IPs da Supabase, nao do seu PC.
- A Betano pode limitar IP de datacenter (ToS / anti-bot).

## Estrutura

```
supabase/
  functions/betano-futebol-live/
  migrations/
web/
  index.html
  supabase.config.json
scripts/
  serve-monitor.ps1
  invoke-cron.ps1
```

## Tabelas (principais)

| Tabela | Uso |
|--------|-----|
| `futebol_mercado_gols_05` | Painel: capturas, resultados, snapshot ao vivo |
| `futebol_live_meta` | Ultima coleta / erros (header do painel) |
| `futebol_historico_jogos` | Placar persistente (FK do mercado) |
| `futebol_historico_gols` | Gols com minuto (liquidacao GREEN/RED) |
| `futebol_live_coleta_config` | URL da function + cron |

A tabela `futebol_live_rows` existe no schema legado mas **nao e mais gravada** pela coleta.

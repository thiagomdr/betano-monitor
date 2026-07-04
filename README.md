# Futebol Live · Manter Placar (Betano via Supabase)

Coleta jogos de **futebol ao vivo da Betano**, rodando na **nuvem Supabase** (Edge Function) — **não usa o IP da sua casa**.

Sem cookie de conta: só endpoints públicos `danae-webapi`.

## Painel online

**https://thiagomdr.github.io/betano-monitor/**

(GitHub Pages publica a pasta `web/` a cada push em `main`.)

Localmente: `powershell -File scripts/serve-monitor.ps1` → http://localhost:8080

## O que entra no painel

- **Todos** os jogos de futebol live da Betano (para estudar antes dos 85')
- Minuto / placar / liga
- Odds Betano do overview (1X2 e Under quando existirem)
- Chutes a gol, escanteios, tiros de meta via Sportradar (`betradarMatchId`)
- Link direto para o jogo na Betano
- Antes dos 85': sinal **em estudo** (azul)
- A partir dos 85': sinal **manter placar** (verde / amarelo / vermelho)

## Setup

### 1. Migration + function

No projeto linkado (`mddortcbebtkopeanrhu`):

```powershell
supabase db push
supabase functions deploy betano-futebol-live --no-verify-jwt
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

Abra **http://localhost:8080** (atualiza sozinho a cada 60s).

### 3. Disparo manual da coleta

```powershell
curl -X POST "https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-futebol-live"
```

O **cron** no banco chama a function a cada **2 minutos** (`futebol-live-coleta-tick`).

### 4. (Opcional) Proteger o cron

Defina o secret `CRON_SECRET` na function e grave o mesmo valor em:

```sql
update public.futebol_live_coleta_config
set cron_secret = 'seu_segredo'
where id = 'default';
```

## Segurança da conta Betano

- A function **não** envia cookie/sessão de login.
- O tráfego sai dos IPs da Supabase, não do seu PC.
- Ainda assim a Betano pode limitar IP de datacenter (ToS / anti-bot).

## Estrutura

```
supabase/
  functions/betano-futebol-live/
  migrations/20260717120000_futebol_live_betano.sql
web/
  index.html
  supabase.config.json
```

## Tabelas

- `futebol_live_rows` — jogos live atuais
- `futebol_live_meta` — totais / notas / último erro
- `futebol_live_coleta_config` — URL da function + cron
- `futebol_historico_jogos` — jogos monitorados (permanece após o live)
- `futebol_historico_gols` — gols com minuto (filtro “a partir de X'”)

## Histórico no painel

Aba **Histórico**: informe o minuto (ex. `85`) e clique **Buscar**.
Lista só jogos que tiveram **gol a partir desse minuto**, com a lista de gols destacada.

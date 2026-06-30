# Supabase — betano-monitor

## Edge Function — coleta JSON (`betano-coleta`)

Busca `danae-webapi/api/live/overview/latest` com headers Chrome Android (warm-up em `/live/` + cookie), filtra basquete (`BASK`) e exclui simulados/eSports.

### Deploy

```powershell
cd C:\Projetos\betano-monitor
npx supabase login   # se necessário
npm run deploy:coleta
```

Ou:

```powershell
npx supabase functions deploy betano-coleta --project-ref mddortcbebtkopeanrhu
```

### Testar pelo app

1. `.env` com `EXPO_PUBLIC_SUPABASE_*`
2. Menu ☰ → **Testar coleta JSON**
3. **Coletar agora** / **Iniciar** usam Supabase automaticamente (sem WebView) quando o `.env` está configurado

### Testar por curl

```powershell
curl "https://SEU_PROJETO.supabase.co/functions/v1/betano-coleta" `
  -H "Authorization: Bearer SUA_ANON_KEY" `
  -X POST
```

### Interpretar resposta

| Campo | Significado |
|-------|-------------|
| `ok: true`, `gameCount > 0` | Coleta funcionando com jogos reais |
| `ok: true`, `gameCount: 0` | API OK; só simulados ao vivo ou sem placar |
| `blocked: true` | Betano bloqueou (403, captcha, etc.) |

---

## Agendamento automático (`betano-coleta-cron`)

Coleta na nuvem a cada **4–8 minutos** com intervalo aleatório (inclui segundos e ms) sem repetir os últimos intervalos.

### 1. Aplicar migration

SQL Editor → `supabase/migrations/20260629130000_coleta_scheduler.sql`

Isso cria `coleta_scheduler`, `jogos_estado_monitor`, `pg_cron` (tick a cada minuto).

### 2. Deploy da function cron

```powershell
npx supabase functions deploy betano-coleta-cron --project-ref mddortcbebtkopeanrhu
```

### 3. Secret opcional (recomendado)

Dashboard → Edge Functions → Secrets → `CRON_SECRET`

SQL Editor:

```sql
update public.coleta_cron_config
set cron_secret = 'mesmo-valor-do-CRON_SECRET'
where id = 'default';
```

### 4. Usar no app

1. Login Supabase
2. Menu ☰ → **Iniciar** (ativa monitor na nuvem)
3. O `pg_cron` chama `betano-coleta-cron` quando `next_run_at` vence

### 5. Parar

Menu ☰ → **Parar** (`ativo = false` no scheduler)

---

## Painel web — Histórico (`betano-historico`)

Página igual à tela **Histórico por jogo** do app: login Supabase, cards expansíveis, linha do tempo.

> **Importante:** Edge Functions do Supabase **não renderizam HTML** (o gateway força `text/plain`). O painel fica no **Storage** com MIME `text/html`.

### Deploy (Storage + HTML)

1. Aplique a migration `supabase/migrations/20260629140000_storage_web.sql` no SQL Editor
2. Rode:

```powershell
npm run deploy:historico
```

### Abrir no Chrome (celular ou PC)

**URL recomendada** (apos deploy da function):

```
https://mddortcbebtkopeanrhu.supabase.co/functions/v1/betano-historico
```

A function redireciona para `data:text/html` (contorna limite do Supabase que forca `text/plain` em HTML).

> **Nao use** a URL do Storage (`/storage/.../index.html`) — o Supabase envia `Content-Type: text/plain` + CSP sandbox e o Chrome mostra codigo-fonte.

**Alternativa sem deploy:** copie `web/historico/abrir-no-celular.html` para o celular e abra com o Chrome (Arquivos → abrir com).

1. Login com o mesmo e-mail/senha do Supabase Auth
2. Toque no jogo para expandir a timeline
3. **Atualizar**, **Supabase Realtime** (instantâneo) ou fallback a cada 45s
4. Salve nos favoritos do Chrome

### Realtime (atualização instantânea)

Aplique no SQL Editor:

`supabase/migrations/20260629160000_realtime_historico.sql`

Isso publica `coletas_betano`, `jogos_coleta` e `coleta_scheduler` no Realtime (com `REPLICA IDENTITY FULL` para RLS).

### Regras de alerta configuráveis

Aplique no SQL Editor:

`supabase/migrations/20260629180000_regras_alerta.sql`

Deploy da function de avaliação (coleta manual no painel):

```powershell
npx supabase functions deploy betano-alertas-avaliar --project-ref mddortcbebtkopeanrhu
```

No painel: menu ⚙ → **Regras de Alerta** (Q1–Q4, +pts, odd líder). Próximo passo: Telegram (`telegram_config` + Edge Function).

---

Testa se a Betano aceita `fetch` da nuvem Supabase com headers de Chrome mobile.

### Deploy (uma vez)

**Opção rápida (script do projeto):**

```powershell
cd C:\Projetos\betano-monitor
npx supabase login
npm run deploy:probe
```

O script `deploy:probe` faz deploy e testa o endpoint com a anon key do `.env`.

**Ou manualmente:**

```powershell
npx supabase login
npx supabase functions deploy betano-probe --project-ref mddortcbebtkopeanrhu
```

> O login exige **terminal interativo** (abre o browser). O Agent do Cursor não consegue concluir sozinho.

**Sem login interativo:** crie um token em https://supabase.com/dashboard/account/tokens e rode:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "seu-token"
npm run deploy:probe
```

### Testar pelo app (Expo Go)

1. `.env` com `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Menu ☰ → **Testar probe Betano**
3. Leia o balão **Probe Betano (Supabase)**

### Testar por curl

```powershell
curl "https://SEU_PROJETO.supabase.co/functions/v1/betano-probe" `
  -H "Authorization: Bearer SUA_ANON_KEY"
```

### Interpretar `summary`

| Resultado | Significado |
|-----------|-------------|
| `Bloqueio provável` | 403 / Cloudflare — coleta na nuvem difícil |
| `HTTP OK, mas sem sinais... (SPA?)` | Não bloqueou, mas jogos vêm via JS/API |
| `HTML recebido com sinais de basquete` | `fetch` pode funcionar para o parser |

---

## Aplicar migration

1. Crie um projeto no [Supabase](https://supabase.com) (ou use um existente dedicado a este app).
2. Abra **SQL Editor** → cole o conteúdo de:
   `supabase/migrations/20260629120000_betano_coletas.sql`
3. Execute o script.

## Variáveis no app

Copie para `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Autenticação

As tabelas usam RLS com `auth.uid()`. Crie **uma conta** no Supabase Auth (e-mail/senha) e faça login no app antes de coletar — caso contrário, o histórico não é gravado (alertas locais continuam funcionando).

## Consultar histórico

```sql
select c.coletado_em, c.fonte_parser, c.qtd_jogos, c.texto_tamanho
from coletas_betano c
order by c.coletado_em desc
limit 50;
```

```sql
select j.*
from jogos_coleta j
join coletas_betano c on c.id = j.coleta_id
order by j.data_criacao desc
limit 100;
```

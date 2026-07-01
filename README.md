# Betano Monitor (Web)

Painel web para monitorar basquete ao vivo na Betano: histórico de coletas, alertas configuráveis e coleta automática na nuvem (Supabase).

**URL pública:** https://thiagomdr.github.io/betano-monitor/

## Stack

- **Frontend:** HTML/JS em `historicoWebPage.ts` → GitHub Pages
- **Backend:** Supabase (Postgres + Auth + Edge Functions + `pg_cron`)
- **Coleta:** API Betano `overview/latest` (Edge Function `betano-coleta`)

## Configuração local

1. Copie `.env.example` para `.env` (ou use `web/historico/supabase.config.json`).
2. Aplique migrations — ver `supabase/README.md`.
3. Instale dependências de build:

```powershell
cd C:\Projetos\betano-monitor
npm install
```

## Desenvolver o painel

```powershell
npm run build:historico-html
npx serve web/historico -p 5173
```

Abra http://localhost:5173 — login com usuário do Supabase Auth.

Edite a UI em `supabase/functions/_shared/historicoWebPage.ts`, depois:

```powershell
npm run build:historico-web
```

O template `web/historico/index.template.html` é versionado; o `index.html` é gerado localmente (gitignored).

## Deploy do painel

Push em `main` dispara `.github/workflows/deploy-historico-pages.yml`.

Secrets opcionais no GitHub: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (sobrescrevem `supabase.config.json`).

## Deploy Supabase

```powershell
npm run deploy:coleta
npm run deploy:probe
npx supabase functions deploy betano-coleta-cron --project-ref mddortcbebtkopeanrhu
npx supabase functions deploy betano-alertas-avaliar --project-ref mddortcbebtkopeanrhu
```

## Checklist

Progresso: **`docs/CHECKLIST.md`**

## Regras Cursor

`.cursor/rules/` — hierarquia, stack web, arquitetura, Supabase, checklist.

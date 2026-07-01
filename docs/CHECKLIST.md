# Checklist — betano-monitor (web)

Progresso do **painel web + Supabase**. O Agent deve marcar `[x]` ao concluir cada item e atualizar a data abaixo.

**Última atualização:** 2026-06-29 (futebol + coleta últimos 5 min + UI por esporte)

---

## 1. Fundação web e deploy

- [x] Repositório focado em web (app Expo removido)
- [x] Fonte única UI: `supabase/functions/_shared/historicoWebPage.ts`
- [x] Build: `scripts/build-historico-template.mjs` + `fill-historico-html.mjs`
- [x] GitHub Pages: `thiagomdr.github.io/betano-monitor`
- [x] Workflow deploy: `.github/workflows/deploy-historico-pages.yml`
- [x] Regras Cursor reescritas (`.cursor/rules/`)

---

## 2. Painel web (`historicoWebPage.ts`)

- [x] Login Supabase Auth
- [x] Abas **Coletas** | **Alertas**
- [x] Cards por jogo (`game_key`) + timeline ao expandir
- [x] Coletar Agora + Iniciar/Parar monitor (scheduler nuvem)
- [x] Regras de alerta — menu superior (listar, criar, editar, excluir)
- [x] Menu ⋮ excluir jogo (Coletas) e excluir alerta (Alertas)
- [x] Status alertas: finalizado para disparos antigos
- [x] Supabase Realtime + polling 45s
- [x] Título e barra de stats alinhados à margem esquerda dos cards (desktop)
- [x] Link Betano nos cards (Coletas e Alertas) — `url` da API overview
- [x] Seletor **Basquete** | **Futebol** — cards, alertas e regras separados por esporte
- [ ] Paginação completa `jogos_coleta` (limite 1000 por batch)

---

## 3. Supabase — banco e segurança

- [x] Migrations: `coletas_betano`, `jogos_coleta`, `alertas_betano`
- [x] `regras_alerta`, `coleta_scheduler`, `jogos_estado_monitor`
- [x] Coluna `esporte` (basquete/futebol) + períodos futebol `1T`/`2T` em regras
- [x] RLS por `auth.uid()`
- [x] Realtime: coletas, jogos, alertas, scheduler
- [x] Delete RLS: jogos e alertas (painel)
- [x] Projeto Supabase dedicado (`mddortcbebtkopeanrhu`)
- [ ] `CRON_SECRET` opcional configurado

---

## 4. Edge Functions e coleta automática

- [x] `betano-coleta` — API Betano overview/latest + BASK (todos ao vivo) + FOOT (últimos 5 min do 2º tempo)
- [x] `betano-coleta-cron` — scheduler 4–8 min + persistência
- [x] `betano-alertas-avaliar` — regras configuráveis
- [x] `betano-probe` — diagnóstico Betano na nuvem
- [x] Migration `pg_cron` aplicada
- [x] Cron só grava coleta se `games.length > 0`
- [ ] Deploy `betano-probe` validado em produção
- [x] Removido legado `betano-historico` / Storage HTML

---

## 5. Alertas

- [x] Motor `evaluateAlertRules` na nuvem (período ≥ regra, diff ≥ pontos/gols, odd líder ≥ mínimo; por esporte)
- [x] `alertas_betano` + join `regras_alerta` no painel
- [x] Excluir alerta não afeta coletas; excluir jogo não afeta alertas
- [ ] Telegram (`telegram_config` + Edge Function)
- [ ] Teste e2e: regra customizada dispara alerta visível no painel

---

## 6. Produção e próximos passos

- [x] README e `supabase/README.md` atualizados (web)
- [ ] Testes e2e painel: login → coletas → alertas → excluir
- [ ] Documentar ativação monitor nuvem só pelo painel (sem app)

---

## Legenda

| Marca | Significado |
|-------|-------------|
| `[x]` | Concluído |
| `[ ]` | Pendente |
| `[~]` | Em andamento (opcional) |

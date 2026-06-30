# Checklist — betano-monitor

Progresso do **projeto inteiro**. O Agent deve marcar `[x]` ao concluir cada item e atualizar a data abaixo.

**Última atualização:** 2026-06-29 (GitHub Pages painel historico)

---

## 1. Fundação e stack

- [x] Projeto Expo SDK 54 criado (`C:\Projetos\betano-monitor`)
- [x] Versões alinhadas ao app21 (RN 0.81.5, React 19.1.0)
- [x] `react-native-webview` instalado
- [x] Regras Cursor em `.cursor/rules/`
- [x] Checklist do projeto em `docs/CHECKLIST.md`
- [ ] `.env` com `EXPO_PUBLIC_OPENAI_API_KEY` (Supabase no `.env` **depois**)

---

## 2. WebView e coleta Betano

- [x] Teste WebView — site Betano carrega no celular
- [x] Aceitar cookies validado
- [x] Extração de `innerText` funcionando
- [x] UA **Mobile Chrome** fixo (sem toggle Desktop)
- [x] Componente `BetanoWebView`
- [x] `scrapeBridge` com timeout e inject JS
- [x] URL direta basquete ao vivo (`BETANO_BASKETBALL_LIVE_URL`)
- [x] Navegação automática + wait load + retry (`executarColetaWeb`)
- [x] Filtro Basquete automático com fallback (clique JS + URL direta)
- [x] Edge Function `betano-probe` (teste Betano com headers Chrome)
- [x] Edge Function `betano-coleta` (API JSON overview/latest + filtro BASK)
- [x] Coleta automática via Supabase quando `.env` configurado (`monitorLoop`)
- [x] Agendamento na nuvem `pg_cron` + `betano-coleta-cron` (4–8 min aleatório, ms)
- [x] Migration `coleta_scheduler` + `jogos_estado_monitor`
- [x] Aplicar migration `20260629130000_coleta_scheduler.sql` no Supabase
- [ ] Configurar `CRON_SECRET` (opcional) em `coleta_cron_config` + Edge Secrets
- [x] Deploy `betano-coleta` no Supabase + resultado validado no app
- [ ] Deploy `betano-probe` no Supabase + resultado do probe validado

---

## 3. Parser, regras e alertas

- [x] Parser local (`parseLocal.ts`)
- [x] Fallback GPT-4o-mini (`parseLlm.ts`)
- [x] Regra fim Q2 + diferença ≥ 10 (`rules.ts`)
- [x] SQLite local — estado por jogo (`store.ts`)
- [x] Notificações locais Notifee
- [x] `processGames` integrado ao ciclo de coleta
- [ ] Ajustar parser com amostras reais de texto da Betano
- [ ] Testar alerta real (Q2 → Intervalo/Q3, diff ≥ 10)
- [ ] Filtro eBasketball / simulados validado em produção

---

## 4. Monitor em background

- [x] `monitorLoop.ts` com intervalo 4–8 min
- [x] Foreground Service (`react-native-background-actions`)
- [x] Plugin Android `with-android-monitor.js`
- [x] Tela `MonitorScreen` (Iniciar / Parar / Coletar agora)
- [ ] Dev client gerado (`npx expo prebuild` + `expo run:android`)
- [ ] Monitor 24h estável (notificação persistente)
- [ ] Otimização de bateria desativada documentada/testada

---

## 5. Supabase — histórico de coletas

> **Nota:** O código no app já está pronto. Criar o **projeto no Supabase** (nuvem), aplicar migration e configurar `.env` ficam **para depois** — quando for testar o histórico na nuvem. Use um projeto **dedicado**, separado do app21.

### Código no app (feito)

- [x] Migration SQL no repositório: `coletas_betano`, `jogos_coleta`, `alertas_betano`
- [x] RLS e políticas na migration (`supabase/migrations/...`)
- [x] `src/services/supabase.ts`
- [x] `src/services/coletasSupabase.ts`
- [x] `src/services/autenticacaoSupabase.ts` + login na tela
- [x] Registro de cada coleta após `runCollectionCycle`
- [x] Registro de alertas em `alertas_betano`
- [x] Falha Supabase não bloqueia alerta local
- [x] Tela `HistoricoColetasScreen` agrupada por jogo (expansão + linha do tempo)
- [x] Serviço `historicoColetasSupabase.ts` (`listarHistoricoPorJogo`)
- [x] Painel web histórico — **GitHub Pages** (`thiagomdr.github.io/betano-monitor`)
- [~] Edge Function `betano-historico` (legado; Chrome bloqueia redirect — usar Pages)

### Nuvem — fazer depois

- [ ] Criar projeto Supabase dedicado (separado do app21)
- [ ] Aplicar migration no SQL Editor (`supabase/migrations/20260629120000_betano_coletas.sql`)
- [ ] Copiar URL e anon key para `.env` (`EXPO_PUBLIC_SUPABASE_*`)
- [ ] Criar usuário no Supabase Auth (e-mail/senha)
- [ ] Login no app + coleta de teste
- [x] Deploy `betano-historico` + validar no Chrome

---

## 6. Build APK e produção

- [ ] `expo prebuild --platform android` executado com sucesso
- [ ] APK debug instalado no celular
- [ ] APK release (`assembleRelease`) gerado
- [ ] App instalado via sideload (fora da Play Store)
- [x] README atualizado com Supabase e checklist

---

## 7. Testes end-to-end

- [ ] Fluxo: abrir app → cookies → basquete → coletar agora
- [ ] Fluxo: iniciar monitor → esperar ciclo → ver status na tela
- [ ] Fluxo: alerta recebido no celular
- [ ] Fluxo: coleta registrada no Supabase
- [ ] Fluxo: mesmo jogo não dispara alerta duplicado

---

## Legenda

| Marca | Significado |
|-------|-------------|
| `[x]` | Concluído |
| `[ ]` | Pendente |
| `[~]` | Em andamento (uso opcional) |

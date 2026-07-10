# Prompt — colar no novo chat (Agent mode)

Copie tudo abaixo para iniciar o projeto Monitor Betano + ScrapingBee:

---

## Contexto

Projeto **betano-monitor** (`C:\Projetos\betano-monitor`). Monitoro mercado **Over +0,5** (Total de Gols) da Betano ao vivo. Painel em `web/index.html` le so o Supabase.

**Arquitetura:**

```
Cron Supabase → Edge Function betano-futebol-live
  → ScrapingBee (IP Brasil) abre pagina do jogo /live/{slug}/{eventId}/
  → aba Gols → Total de Gols
  → parse DOM (ou screenshot + Gemini fallback)
  → grava hctg_lines + live_over_* em futebol_mercado_gols_05
  → Sportradar para gols/placar (liquidacao GREEN/RED)
```

Regras do projeto: `.cursor/rules/00-betano-monitor.mdc`

## O que ja existe no repo

- `supabase/functions/_shared/browser-proxy-fetch.ts` — fetch JSON via ScrapingBee (BR)
- `betano-futebol-live` — deep fetch HCTG via ScrapingBee quando overview global incompleto (parcial)
- `scripts/test-scrapingbee-hctg.mjs` — teste local
- `scripts/setup-scrapingbee.ps1` — grava secrets
- `scripts/screenshot-betano-odds.mjs` + `scripts/lib/betano-hctg-html.mjs` — Playwright + DOM (referencia para parser)
- Supabase: `mddortcbebtkopeanrhu`, cron `*/2 * * * *`
- Telegram captura +0,5 ja configurado

## O que falta fazer (prioridade)

1. **Configurar ScrapingBee:** tenho conta / vou criar — rodar `setup-scrapingbee.ps1` e deploy da function
2. **Completar coleta browser na Edge Function:** ScrapingBee com `render_js=true` + HTML da aba Gols → parser DOM (portar logica de `betano-hctg-html.mjs` para Deno ou extrair odds do HTML retornado)
3. **Testar** com um jogo ao vivo (`eventId` + `slug`) e validar `hctg_lines` no painel
4. **Limitar custo:** max N requests/rodada (`SCRAPINGBEE_MAX_PER_RUN`), so jogos `watching`/`sem_linha_05`
5. Opcional: gravar screenshot em `futebol_screenshot_debug` para auditoria

## Restricoes

- Nao usar IP da minha casa
- Nao reintroduzir abas Ao Vivo/Historico no painel
- BD-first: painel so le tabelas
- Manter regras mercado +0,5 (captura real placar+0,5, Estratégia +0,5, Telegram)
- Nao reintroduzir legado (CasinoScores, Sic Bo, Oracle VM)

## Primeira tarefa

Guie-me para criar conta ScrapingBee, configurar o secret no Supabase, rodar teste local (`test-scrapingbee-hctg.mjs`) e implementar/terminar a coleta HCTG por browser na Edge Function ate aparecer odds corretas no painel.

---

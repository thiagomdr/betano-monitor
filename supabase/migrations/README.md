# Migrations — Monitor Betano

Projeto vigente: **mercado Over +0,5** (Total de Gols Betano ao vivo).

## Eras

| Periodo | Arquivos | Status |
|---------|----------|--------|
| `20260710` – `20260716` | Sic Bo, CasinoScores, Lightning Storm | **Legado** — removido do banco por `20260718280000_betano_monitor_legacy_cleanup.sql` |
| `20260717` – `20260718` | `futebol_*` (live, historico, mercado +0,5, Telegram, HCTG, screenshot debug) | **Ativo** |

## Aplicar migration nova

```powershell
npx supabase db query --linked -f supabase/migrations/<arquivo>.sql
```

## Tabelas ativas (pos-cleanup)

- `futebol_mercado_gols_05` — painel
- `futebol_live_meta` — meta da ultima coleta
- `futebol_live_coleta_config` — cron
- `futebol_historico_jogos` / `futebol_historico_gols` — placar e gols
- `futebol_screenshot_debug` — auditoria opcional

**Nao** apague arquivos de migration ja aplicados no remoto — o Supabase usa o historico de nomes.

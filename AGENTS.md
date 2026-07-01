# Betano Monitor — Agent

Painel **web** (GitHub Pages) + **Supabase** na nuvem. Não há app mobile neste repositório.

## Projeto

Monitora basquete ao vivo na Betano, grava histórico de coletas e dispara alertas por regras configuráveis (Q1–Q4, pontos, odd).

## Stack

GitHub Pages (`historicoWebPage.ts`), Supabase Auth/DB/Realtime, Edge Functions (`betano-coleta`, `betano-coleta-cron`, `betano-alertas-avaliar`), `pg_cron`.

## Checklist

**`docs/CHECKLIST.md`** — ler antes de tarefas grandes; marcar `[x]` ao concluir.

## Regras

`.cursor/rules/` — hierarquia, stack web, arquitetura, Supabase, checklist.

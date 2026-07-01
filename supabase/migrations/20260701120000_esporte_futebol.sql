-- Esporte (basquete | futebol) e períodos de regra para futebol (1T, 2T)

alter table public.jogos_coleta
  add column if not exists esporte text not null default 'basquete'
    check (esporte in ('basquete', 'futebol'));

alter table public.alertas_betano
  add column if not exists esporte text not null default 'basquete'
    check (esporte in ('basquete', 'futebol'));

alter table public.regras_alerta
  add column if not exists esporte text not null default 'basquete'
    check (esporte in ('basquete', 'futebol'));

alter table public.regras_alerta
  drop constraint if exists regras_alerta_periodo_check;

alter table public.regras_alerta
  add constraint regras_alerta_periodo_check
  check (periodo in ('Q1', 'Q2', 'Q3', 'Q4', '1T', '2T'));

create index if not exists idx_jogos_coleta_esporte
  on public.jogos_coleta (esporte);

create index if not exists idx_alertas_betano_esporte
  on public.alertas_betano (esporte);

create index if not exists idx_regras_alerta_usuario_esporte
  on public.regras_alerta (usuario_id, esporte, ativo);

notify pgrst, 'reload schema';

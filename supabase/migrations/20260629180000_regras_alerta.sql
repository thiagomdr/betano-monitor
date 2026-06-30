-- Regras de alerta configuráveis + preparação Telegram

create table if not exists public.regras_alerta (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  periodo text not null check (periodo in ('Q1', 'Q2', 'Q3', 'Q4')),
  min_pontos integer not null check (min_pontos > 0),
  min_odd numeric(8, 2) not null check (min_odd >= 0),
  nome text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now()
);

create index if not exists idx_regras_alerta_usuario
  on public.regras_alerta (usuario_id, ativo);

create table if not exists public.alertas_regra_disparados (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  game_key text not null,
  regra_id uuid not null references public.regras_alerta (id) on delete cascade,
  disparado_em timestamptz not null default now(),
  primary key (usuario_id, game_key, regra_id)
);

create index if not exists idx_alertas_regra_disparados_usuario
  on public.alertas_regra_disparados (usuario_id);

alter table public.alertas_betano
  add column if not exists regra_id uuid references public.regras_alerta (id) on delete set null,
  add column if not exists odd_lider numeric(8, 2),
  add column if not exists time_lider text,
  add column if not exists telegram_enviado boolean not null default false,
  add column if not exists telegram_enviado_em timestamptz,
  add column if not exists telegram_erro text;

create table if not exists public.telegram_config (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  chat_id text not null,
  ativo boolean not null default true,
  data_atualizacao timestamptz not null default now()
);

alter table public.regras_alerta enable row level security;
alter table public.alertas_regra_disparados enable row level security;
alter table public.telegram_config enable row level security;

drop policy if exists regras_alerta_select_own on public.regras_alerta;
create policy regras_alerta_select_own
  on public.regras_alerta for select
  using (auth.uid() = usuario_id);

drop policy if exists regras_alerta_insert_own on public.regras_alerta;
create policy regras_alerta_insert_own
  on public.regras_alerta for insert
  with check (auth.uid() = usuario_id);

drop policy if exists regras_alerta_update_own on public.regras_alerta;
create policy regras_alerta_update_own
  on public.regras_alerta for update
  using (auth.uid() = usuario_id);

drop policy if exists regras_alerta_delete_own on public.regras_alerta;
create policy regras_alerta_delete_own
  on public.regras_alerta for delete
  using (auth.uid() = usuario_id);

drop policy if exists alertas_regra_disparados_select_own on public.alertas_regra_disparados;
create policy alertas_regra_disparados_select_own
  on public.alertas_regra_disparados for select
  using (auth.uid() = usuario_id);

drop policy if exists telegram_config_select_own on public.telegram_config;
create policy telegram_config_select_own
  on public.telegram_config for select
  using (auth.uid() = usuario_id);

drop policy if exists telegram_config_insert_own on public.telegram_config;
create policy telegram_config_insert_own
  on public.telegram_config for insert
  with check (auth.uid() = usuario_id);

drop policy if exists telegram_config_update_own on public.telegram_config;
create policy telegram_config_update_own
  on public.telegram_config for update
  using (auth.uid() = usuario_id);

notify pgrst, 'reload schema';

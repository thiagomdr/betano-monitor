-- betano-monitor: histórico de coletas da Betano
-- Aplicar no SQL Editor do Supabase ou via CLI: supabase db push

-- Coletas (1 linha por ciclo de leitura)
create table if not exists public.coletas_betano (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  coletado_em timestamptz not null default now(),
  fonte_parser text not null check (fonte_parser in ('local', 'llm', 'nenhum')),
  sucesso boolean not null default true,
  qtd_jogos integer not null default 0,
  erro_mensagem text,
  texto_tamanho integer,
  texto_preview text,
  dispositivo_id text,
  data_criacao timestamptz not null default now(),
  data_atualizacao timestamptz not null default now()
);

-- Jogos identificados em cada coleta
create table if not exists public.jogos_coleta (
  id uuid primary key default gen_random_uuid(),
  coleta_id uuid not null references public.coletas_betano (id) on delete cascade,
  game_key text not null,
  time_casa text not null,
  time_fora text not null,
  liga text,
  periodo text not null,
  placar_casa integer not null,
  placar_fora integer not null,
  data_criacao timestamptz not null default now()
);

-- Alertas disparados pelo app
create table if not exists public.alertas_betano (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  coleta_id uuid references public.coletas_betano (id) on delete set null,
  game_key text not null,
  time_casa text not null,
  time_fora text not null,
  liga text,
  placar_casa integer not null,
  placar_fora integer not null,
  diferenca_pontos integer not null,
  periodo_anterior text,
  periodo_atual text not null,
  disparado_em timestamptz not null default now(),
  data_criacao timestamptz not null default now()
);

create index if not exists idx_coletas_betano_coletado_em
  on public.coletas_betano (coletado_em desc);

create index if not exists idx_coletas_betano_usuario_id
  on public.coletas_betano (usuario_id);

create index if not exists idx_jogos_coleta_coleta_id
  on public.jogos_coleta (coleta_id);

create index if not exists idx_alertas_betano_disparado_em
  on public.alertas_betano (disparado_em desc);

-- RLS
alter table public.coletas_betano enable row level security;
alter table public.jogos_coleta enable row level security;
alter table public.alertas_betano enable row level security;

drop policy if exists coletas_betano_select_own on public.coletas_betano;
create policy coletas_betano_select_own
  on public.coletas_betano for select
  using (auth.uid() = usuario_id);

drop policy if exists coletas_betano_insert_own on public.coletas_betano;
create policy coletas_betano_insert_own
  on public.coletas_betano for insert
  with check (auth.uid() = usuario_id);

drop policy if exists coletas_betano_update_own on public.coletas_betano;
create policy coletas_betano_update_own
  on public.coletas_betano for update
  using (auth.uid() = usuario_id);

drop policy if exists jogos_coleta_select_own on public.jogos_coleta;
create policy jogos_coleta_select_own
  on public.jogos_coleta for select
  using (
    exists (
      select 1 from public.coletas_betano c
      where c.id = coleta_id and c.usuario_id = auth.uid()
    )
  );

drop policy if exists jogos_coleta_insert_own on public.jogos_coleta;
create policy jogos_coleta_insert_own
  on public.jogos_coleta for insert
  with check (
    exists (
      select 1 from public.coletas_betano c
      where c.id = coleta_id and c.usuario_id = auth.uid()
    )
  );

drop policy if exists alertas_betano_select_own on public.alertas_betano;
create policy alertas_betano_select_own
  on public.alertas_betano for select
  using (auth.uid() = usuario_id);

drop policy if exists alertas_betano_insert_own on public.alertas_betano;
create policy alertas_betano_insert_own
  on public.alertas_betano for insert
  with check (auth.uid() = usuario_id);

notify pgrst, 'reload schema';

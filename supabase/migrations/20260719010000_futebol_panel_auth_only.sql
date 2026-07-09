-- Painel: dados de futebol somente com login (authenticated). Anon nao le mercado/meta/debug.

-- futebol_mercado_gols_05
drop policy if exists "futebol_mercado_gols_05_select_anon" on public.futebol_mercado_gols_05;
drop policy if exists "futebol_mercado_gols_05_update_anon" on public.futebol_mercado_gols_05;
drop policy if exists "futebol_mercado_gols_05_delete_anon" on public.futebol_mercado_gols_05;

create policy "futebol_mercado_gols_05_select_auth"
  on public.futebol_mercado_gols_05 for select to authenticated
  using (true);

create policy "futebol_mercado_gols_05_update_auth"
  on public.futebol_mercado_gols_05 for update to authenticated
  using (true)
  with check (true);

create policy "futebol_mercado_gols_05_delete_auth"
  on public.futebol_mercado_gols_05 for delete to authenticated
  using (true);

-- futebol_live_meta
drop policy if exists "futebol_live_meta_select_anon" on public.futebol_live_meta;

create policy "futebol_live_meta_select_auth"
  on public.futebol_live_meta for select to authenticated
  using (true);

-- futebol_live_rows (se existir)
do $$ begin
  if to_regclass('public.futebol_live_rows') is not null then
    execute 'drop policy if exists "futebol_live_rows_select_anon" on public.futebol_live_rows';
    execute 'create policy "futebol_live_rows_select_auth" on public.futebol_live_rows for select to authenticated using (true)';
  end if;
end $$;

-- debug screenshot (modal do painel)
do $$ begin
  if to_regclass('public.futebol_screenshot_debug') is not null then
    execute 'drop policy if exists "futebol_screenshot_debug_select_anon" on public.futebol_screenshot_debug';
    execute 'create policy "futebol_screenshot_debug_select_auth" on public.futebol_screenshot_debug for select to authenticated using (true)';
  end if;
end $$;

-- historico (leitura futura / consistencia)
drop policy if exists "futebol_historico_jogos_select_anon" on public.futebol_historico_jogos;
drop policy if exists "futebol_historico_gols_select_anon" on public.futebol_historico_gols;

create policy "futebol_historico_jogos_select_auth"
  on public.futebol_historico_jogos for select to authenticated
  using (true);

create policy "futebol_historico_gols_select_auth"
  on public.futebol_historico_gols for select to authenticated
  using (true);

notify pgrst, 'reload schema';

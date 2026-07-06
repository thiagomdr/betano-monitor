-- Soft-delete (excluido) pelo painel sem permitir recriacao pelo cron

drop policy if exists "futebol_mercado_gols_05_update_anon" on public.futebol_mercado_gols_05;
create policy "futebol_mercado_gols_05_update_anon"
  on public.futebol_mercado_gols_05 for update to anon, authenticated
  using (true)
  with check (resultado = 'excluido');

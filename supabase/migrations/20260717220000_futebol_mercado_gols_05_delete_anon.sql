-- Permite excluir linhas do Mercado +0,5 pelo painel (anon key)

drop policy if exists "futebol_mercado_gols_05_delete_anon" on public.futebol_mercado_gols_05;
create policy "futebol_mercado_gols_05_delete_anon"
  on public.futebol_mercado_gols_05 for delete to anon, authenticated
  using (true);

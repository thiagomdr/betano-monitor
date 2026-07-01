-- Permite excluir partidas de futebol do histórico pelo painel web (RLS).
-- futebol_leituras são removidas em cascata (FK on delete cascade).

drop policy if exists futebol_partidas_delete_own on public.futebol_partidas;
create policy futebol_partidas_delete_own
  on public.futebol_partidas for delete
  using (auth.uid() = usuario_id);

notify pgrst, 'reload schema';

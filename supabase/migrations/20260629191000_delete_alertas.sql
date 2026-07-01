-- Permite excluir alertas do histórico pelo painel web (RLS)

drop policy if exists alertas_betano_delete_own on public.alertas_betano;
create policy alertas_betano_delete_own
  on public.alertas_betano for delete
  using (auth.uid() = usuario_id);

notify pgrst, 'reload schema';

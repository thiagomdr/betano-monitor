-- Permite excluir jogos do histórico pelo painel web (RLS)

drop policy if exists jogos_coleta_delete_own on public.jogos_coleta;
create policy jogos_coleta_delete_own
  on public.jogos_coleta for delete
  using (
    exists (
      select 1 from public.coletas_betano c
      where c.id = coleta_id and c.usuario_id = auth.uid()
    )
  );

drop policy if exists jogos_estado_monitor_delete_own on public.jogos_estado_monitor;
create policy jogos_estado_monitor_delete_own
  on public.jogos_estado_monitor for delete
  using (auth.uid() = usuario_id);

notify pgrst, 'reload schema';

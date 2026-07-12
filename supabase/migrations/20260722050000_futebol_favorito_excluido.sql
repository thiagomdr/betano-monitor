-- Soft-delete Favorito 1X2 pelo painel (status=excluido); Edge nao recria.

alter table public.futebol_favorito_drift
  drop constraint if exists futebol_favorito_drift_status_check;

alter table public.futebol_favorito_drift
  add constraint futebol_favorito_drift_status_check
  check (status in ('watching', 'settled', 'excluido'));

drop policy if exists "futebol_favorito_drift_update_excluido" on public.futebol_favorito_drift;
create policy "futebol_favorito_drift_update_excluido"
  on public.futebol_favorito_drift for update to authenticated
  using (true)
  with check (status = 'excluido');

comment on constraint futebol_favorito_drift_status_check on public.futebol_favorito_drift is
  'watching | settled | excluido (soft-delete pelo painel)';

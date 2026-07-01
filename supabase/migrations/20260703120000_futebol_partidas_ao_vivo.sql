-- Campos ao vivo no radar (antes e durante a janela dos 85 minutos)

alter table public.futebol_partidas
  add column if not exists placar_casa_atual integer,
  add column if not exists placar_fora_atual integer,
  add column if not exists minuto_relogio text,
  add column if not exists periodo_atual text;

notify pgrst, 'reload schema';

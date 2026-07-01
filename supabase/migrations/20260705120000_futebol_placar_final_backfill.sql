-- Preenche placar final em partidas já finalizadas sem placar, usando a última leitura intensiva.
UPDATE public.futebol_partidas p
SET
  placar_casa_final = l.placar_casa,
  placar_fora_final = l.placar_fora,
  gol_nos_ultimos_5_min = CASE
    WHEN p.placar_casa_inicio IS NOT NULL
      AND p.placar_fora_inicio IS NOT NULL
      AND (l.placar_casa IS DISTINCT FROM p.placar_casa_inicio
        OR l.placar_fora IS DISTINCT FROM p.placar_fora_inicio)
    THEN true
    WHEN p.placar_casa_inicio IS NOT NULL AND p.placar_fora_inicio IS NOT NULL
    THEN false
    ELSE p.gol_nos_ultimos_5_min
  END
FROM (
  SELECT DISTINCT ON (partida_id)
    partida_id,
    placar_casa,
    placar_fora
  FROM public.futebol_leituras
  ORDER BY partida_id, coletado_em DESC
) l
WHERE p.id = l.partida_id
  AND p.status = 'finalizado'
  AND p.placar_casa_final IS NULL
  AND p.placar_fora_final IS NULL;

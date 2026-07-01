import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import type { FootballScoutSnapshot } from './betanoFootballParse.ts';
import { getMatchMinute } from './betanoFootballParse.ts';
import type { FutebolPartidaRow } from './futebolEstatisticasService.ts';
import { getServiceClient } from './supabaseService.ts';

const JANELA_MINUTO_INICIO = 85;

export interface LeituraGolContext {
  id: string;
  gols_totais: number;
  minuto_jogo: number | null;
}

function db(): SupabaseClient {
  return getServiceClient();
}

export function minutoJogoDoSnapshot(snap: FootballScoutSnapshot): number | null {
  if (snap.matchMinute != null && snap.matchMinute >= 0) return snap.matchMinute;
  return getMatchMinute(
    snap.periodDescription ?? undefined,
    snap.period,
    null,
  );
}

export function totalGolsPlacar(casa: number, fora: number): number {
  return casa + fora;
}

export function calcularGolsNaJanela(
  placarCasaInicio: number | null,
  placarForaInicio: number | null,
  placarCasaFinal: number | null,
  placarForaFinal: number | null,
): number {
  if (placarCasaInicio == null || placarForaInicio == null) return 0;
  if (placarCasaFinal == null || placarForaFinal == null) return 0;
  return Math.max(
    0,
    totalGolsPlacar(placarCasaFinal, placarForaFinal)
      - totalGolsPlacar(placarCasaInicio, placarForaInicio),
  );
}

export async function loadUltimaLeituraGol(partidaId: string): Promise<LeituraGolContext | null> {
  const { data, error } = await db()
    .from('futebol_leituras')
    .select('id, gols_totais, minuto_jogo, placar_casa, placar_fora')
    .eq('partida_id', partidaId)
    .order('coletado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const golsTotais = data.gols_totais
    ?? totalGolsPlacar(data.placar_casa, data.placar_fora);
  return {
    id: data.id,
    gols_totais: golsTotais,
    minuto_jogo: data.minuto_jogo,
  };
}

async function inserirEventoGol(
  usuarioId: string,
  partidaId: string,
  leituraId: string | null,
  minutoJogo: number,
  quantidade: number,
  origem: 'leitura_delta' | 'fechamento_partida',
): Promise<void> {
  if (quantidade <= 0 || minutoJogo < JANELA_MINUTO_INICIO) return;

  const { error } = await db().from('futebol_eventos_gol').insert({
    usuario_id: usuarioId,
    partida_id: partidaId,
    leitura_id: leituraId,
    minuto_jogo: minutoJogo,
    quantidade,
    origem,
  });
  if (error) throw new Error(`futebol_eventos_gol: ${error.message}`);
}

export async function prepararMetadadosLeituraGol(
  partida: FutebolPartidaRow,
  snap: FootballScoutSnapshot,
  prev: LeituraGolContext | null,
): Promise<{ minutoJogo: number | null; deltaGols: number; golsTotais: number }> {
  const minutoJogo = minutoJogoDoSnapshot(snap);
  const golsTotais = totalGolsPlacar(snap.homeScore, snap.awayScore);

  const referencia = prev
    ? prev.gols_totais
    : (partida.placar_casa_inicio != null && partida.placar_fora_inicio != null
      ? totalGolsPlacar(partida.placar_casa_inicio, partida.placar_fora_inicio)
      : null);

  const deltaGols = referencia == null
    ? 0
    : Math.max(0, golsTotais - referencia);

  return { minutoJogo, deltaGols, golsTotais };
}

export async function registrarEventoGolLeitura(
  usuarioId: string,
  partidaId: string,
  leituraId: string,
  minutoJogo: number | null,
  deltaGols: number,
): Promise<void> {
  if (deltaGols <= 0 || minutoJogo == null) return;
  await inserirEventoGol(
    usuarioId,
    partidaId,
    leituraId,
    minutoJogo,
    deltaGols,
    'leitura_delta',
  );
}

export async function sincronizarGolsPartidaFinalizada(
  usuarioId: string,
  partida: FutebolPartidaRow,
  placarCasaFinal: number,
  placarForaFinal: number,
  minutoFechamento: number | null,
): Promise<void> {
  const golsNaJanela = calcularGolsNaJanela(
    partida.placar_casa_inicio,
    partida.placar_fora_inicio,
    placarCasaFinal,
    placarForaFinal,
  );

  await db()
    .from('futebol_partidas')
    .update({
      gols_na_janela: golsNaJanela,
      data_atualizacao: new Date().toISOString(),
    })
    .eq('id', partida.id);

  const ult = await loadUltimaLeituraGol(partida.id);
  const golsFinais = totalGolsPlacar(placarCasaFinal, placarForaFinal);
  const fechamento = ult
    ? Math.max(0, golsFinais - ult.gols_totais)
    : golsNaJanela;

  if (fechamento > 0) {
    const minuto = minutoFechamento ?? ult?.minuto_jogo ?? partida.minuto_inicio_janela ?? JANELA_MINUTO_INICIO;
    await inserirEventoGol(
      usuarioId,
      partida.id,
      ult?.id ?? null,
      minuto,
      fechamento,
      'fechamento_partida',
    );
  }
}

export async function atualizarGolsNaJanelaEmCurso(
  usuarioId: string,
  partida: FutebolPartidaRow,
  placarCasaAtual: number,
  placarForaAtual: number,
): Promise<void> {
  const golsNaJanela = calcularGolsNaJanela(
    partida.placar_casa_inicio,
    partida.placar_fora_inicio,
    placarCasaAtual,
    placarForaAtual,
  );

  await db()
    .from('futebol_partidas')
    .update({
      gols_na_janela: golsNaJanela,
      data_atualizacao: new Date().toISOString(),
    })
    .eq('id', partida.id);
}

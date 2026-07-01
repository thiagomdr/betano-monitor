import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import {
  addMs,
  FOOT_RADAR_MARGEM_MIN,
  pickFootballIntensiveDelayMs,
} from './betanoFootballDelay.ts';
import {
  type FootballScoutSnapshot,
  parseFootballScoutFromOverview,
  snapshotsEmJanelaFinal,
} from './betanoFootballParse.ts';
import type { BetanoOverviewPayload } from './betanoOverviewParse.ts';
import { getServiceClient } from './supabaseService.ts';

const JANELA_MINUTO_INICIO = 85;

export interface FutebolAgendaRow {
  usuario_id: string;
  modo: 'radar' | 'intenso';
  next_fetch_at: string | null;
  last_radar_at: string | null;
  last_intensive_at: string | null;
}

export interface FutebolPartidaRow {
  id: string;
  usuario_id: string;
  event_id: number;
  game_key: string;
  time_casa: string;
  time_fora: string;
  liga: string | null;
  url_partida: string | null;
  status: 'observado' | 'em_janela' | 'finalizado';
  minuto_inicio_janela: number | null;
  placar_casa_inicio: number | null;
  placar_fora_inicio: number | null;
  placar_casa_final: number | null;
  placar_fora_final: number | null;
  gol_nos_ultimos_5_min: boolean | null;
  eta_85: string | null;
  minutos_ate_85: number | null;
  finalizado_em: string | null;
}

export interface ProcessarFutebolResult {
  radarAtualizado: boolean;
  leiturasGravadas: number;
  partidasEmJanela: number;
  partidasFinalizadas: number;
  nextFetchAt: string | null;
  modo: 'radar' | 'intenso';
}

function db(): SupabaseClient {
  return getServiceClient();
}

export async function loadFutebolAgenda(usuarioId: string): Promise<FutebolAgendaRow | null> {
  const { data, error } = await db()
    .from('futebol_agenda')
    .select('*')
    .eq('usuario_id', usuarioId)
    .maybeSingle();

  if (error) throw new Error(`futebol_agenda: ${error.message}`);
  return data as FutebolAgendaRow | null;
}

export async function isFutebolFetchDue(usuarioId: string, now: Date): Promise<boolean> {
  const agenda = await loadFutebolAgenda(usuarioId);
  if (!agenda?.next_fetch_at) return false;
  return new Date(agenda.next_fetch_at).getTime() <= now.getTime();
}

async function upsertAgenda(
  usuarioId: string,
  patch: {
    modo: 'radar' | 'intenso';
    next_fetch_at: string | null;
    last_radar_at?: string | null;
    last_intensive_at?: string | null;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    usuario_id: usuarioId,
    modo: patch.modo,
    next_fetch_at: patch.next_fetch_at,
    data_atualizacao: new Date().toISOString(),
  };
  if (patch.last_radar_at !== undefined) row.last_radar_at = patch.last_radar_at;
  if (patch.last_intensive_at !== undefined) row.last_intensive_at = patch.last_intensive_at;

  const { error } = await db().from('futebol_agenda').upsert(row);
  if (error) throw new Error(`futebol_agenda upsert: ${error.message}`);
}

async function loadPartidasAtivas(usuarioId: string): Promise<FutebolPartidaRow[]> {
  const { data, error } = await db()
    .from('futebol_partidas')
    .select('*')
    .eq('usuario_id', usuarioId)
    .in('status', ['observado', 'em_janela']);

  if (error) throw new Error(`futebol_partidas: ${error.message}`);
  return (data ?? []) as FutebolPartidaRow[];
}

async function loadPartidaPorEventId(
  usuarioId: string,
  eventId: number,
): Promise<FutebolPartidaRow | null> {
  const { data, error } = await db()
    .from('futebol_partidas')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as FutebolPartidaRow | null;
}

function calcularGolUltimos5Min(
  placarCasaInicio: number | null,
  placarForaInicio: number | null,
  placarCasaFinal: number,
  placarForaFinal: number,
): boolean | null {
  if (placarCasaInicio == null || placarForaInicio == null) return null;
  return placarCasaFinal !== placarCasaInicio || placarForaFinal !== placarForaInicio;
}

function camposPartidaDoSnapshot(
  snap: FootballScoutSnapshot,
  now: Date,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    game_key: snap.gameKey,
    time_casa: snap.homeTeam,
    time_fora: snap.awayTeam,
    liga: snap.league,
    url_partida: snap.betanoUrl,
    eta_85: snap.eta85,
    minutos_ate_85: snap.minutesUntil85,
    placar_casa_atual: snap.homeScore,
    placar_fora_atual: snap.awayScore,
    minuto_relogio: snap.periodDescription ?? snap.tempoDecorrido ?? (snap.matchMinute != null ? `${snap.matchMinute}'` : null),
    periodo_atual: snap.period,
    data_atualizacao: now.toISOString(),
  };
  return base;
}

async function atualizarRadar(
  usuarioId: string,
  snapshots: FootballScoutSnapshot[],
  now: Date,
): Promise<{ nextFetchAt: string | null; emJanela: FootballScoutSnapshot[] }> {
  const emJanela = snapshotsEmJanelaFinal(snapshots);
  const ativos = await loadPartidasAtivas(usuarioId);
  const eventIdsVivos = new Set(snapshots.map((s) => s.eventId));

  for (const snap of snapshots) {
    if (snap.isFinished) continue;

    const existente = await loadPartidaPorEventId(usuarioId, snap.eventId);
    const campos = camposPartidaDoSnapshot(snap, now);

    if (!existente) {
      const status = snap.inFinalWindow ? 'em_janela' : 'observado';
      const insertRow: Record<string, unknown> = {
        usuario_id: usuarioId,
        event_id: snap.eventId,
        status,
        ...campos,
      };
      if (snap.inFinalWindow) {
        insertRow.minuto_inicio_janela = snap.matchMinute ?? JANELA_MINUTO_INICIO;
        insertRow.placar_casa_inicio = snap.homeScore;
        insertRow.placar_fora_inicio = snap.awayScore;
      }

      const { error } = await db().from('futebol_partidas').insert(insertRow);
      if (error) throw new Error(error.message);
      continue;
    }

    if (existente.status === 'finalizado') continue;

    if (existente.status === 'em_janela') {
      await db()
        .from('futebol_partidas')
        .update(campos)
        .eq('id', existente.id);
      continue;
    }

    if (existente.status === 'observado') {
      const patch: Record<string, unknown> = { ...campos };
      if (snap.inFinalWindow) {
        patch.status = 'em_janela';
        patch.minuto_inicio_janela = snap.matchMinute ?? JANELA_MINUTO_INICIO;
        patch.placar_casa_inicio = snap.homeScore;
        patch.placar_fora_inicio = snap.awayScore;
      }
      await db()
        .from('futebol_partidas')
        .update(patch)
        .eq('id', existente.id);
    }
  }

  for (const p of ativos) {
    if (!eventIdsVivos.has(Number(p.event_id)) && p.status === 'observado') {
      await db()
        .from('futebol_partidas')
        .update({
          status: 'finalizado',
          finalizado_em: now.toISOString(),
          data_atualizacao: now.toISOString(),
        })
        .eq('id', p.id);
    }
  }

  let nextFetchAt: string | null = null;
  if (emJanela.length === 0) {
    const candidatos = snapshots.filter(
      (s) => !s.isFinished && !s.inFinalWindow && s.eta85 != null,
    );
    for (const s of candidatos) {
      if (s.minutesUntil85 != null && s.minutesUntil85 <= FOOT_RADAR_MARGEM_MIN) {
        const iso = now.toISOString();
        if (!nextFetchAt || iso < nextFetchAt) nextFetchAt = iso;
        continue;
      }
      const margemMs = FOOT_RADAR_MARGEM_MIN * 60_000;
      const alvo = new Date(new Date(s.eta85!).getTime() - margemMs);
      const iso = alvo.getTime() <= now.getTime() ? now.toISOString() : alvo.toISOString();
      if (!nextFetchAt || iso < nextFetchAt) nextFetchAt = iso;
    }
  }

  return { nextFetchAt, emJanela };
}

async function processarLeiturasLote(
  usuarioId: string,
  snapshots: FootballScoutSnapshot[],
  now: Date,
): Promise<{ leituras: number; finalizadas: number; aindaEmJanela: number }> {
  const emJanela = snapshotsEmJanelaFinal(snapshots);
  const snapPorEvent = new Map(snapshots.map((s) => [s.eventId, s]));
  const loteId = crypto.randomUUID();
  let leituras = 0;
  let finalizadas = 0;

  const ativos = await loadPartidasAtivas(usuarioId);

  for (const snap of emJanela) {
    let partida = await loadPartidaPorEventId(usuarioId, snap.eventId);

    if (!partida) {
      const { error } = await db().from('futebol_partidas').insert({
        usuario_id: usuarioId,
        event_id: snap.eventId,
        game_key: snap.gameKey,
        time_casa: snap.homeTeam,
        time_fora: snap.awayTeam,
        liga: snap.league,
        url_partida: snap.betanoUrl,
        status: 'em_janela',
        minuto_inicio_janela: snap.matchMinute ?? JANELA_MINUTO_INICIO,
        placar_casa_inicio: snap.homeScore,
        placar_fora_inicio: snap.awayScore,
        eta_85: snap.eta85,
        minutos_ate_85: 0,
        data_atualizacao: now.toISOString(),
      });
      if (error) throw new Error(error.message);
      partida = await loadPartidaPorEventId(usuarioId, snap.eventId);
    } else if (partida.status === 'observado') {
      await db()
        .from('futebol_partidas')
        .update({
          status: 'em_janela',
          minuto_inicio_janela: snap.matchMinute ?? partida.minuto_inicio_janela ?? JANELA_MINUTO_INICIO,
          placar_casa_inicio: snap.homeScore,
          placar_fora_inicio: snap.awayScore,
          data_atualizacao: now.toISOString(),
        })
        .eq('id', partida.id);
    }

    if (!partida) continue;

    const { error: errLeitura } = await db().from('futebol_leituras').insert({
      usuario_id: usuarioId,
      partida_id: partida.id,
      lote_id: loteId,
      coletado_em: now.toISOString(),
      minuto_relogio: snap.periodDescription ?? snap.tempoDecorrido ?? (snap.matchMinute != null ? `${snap.matchMinute}'` : null),
      placar_casa: snap.homeScore,
      placar_fora: snap.awayScore,
      odd_manter_placar: snap.oddManterPlacar > 0 ? snap.oddManterPlacar : null,
      mercado_nome: snap.mercadoNome,
      linha_gols: snap.linhaGols,
    });
    if (errLeitura) throw new Error(errLeitura.message);
    leituras += 1;
  }

  for (const p of ativos.filter((x) => x.status === 'em_janela')) {
    const snap = snapPorEvent.get(Number(p.event_id));
    if (!snap) {
      await db()
        .from('futebol_partidas')
        .update({
          status: 'finalizado',
          finalizado_em: now.toISOString(),
          data_atualizacao: now.toISOString(),
        })
        .eq('id', p.id);
      finalizadas += 1;
      continue;
    }

    if (snap.isFinished) {
      const gol = calcularGolUltimos5Min(
        p.placar_casa_inicio,
        p.placar_fora_inicio,
        snap.homeScore,
        snap.awayScore,
      );
      await db()
        .from('futebol_partidas')
        .update({
          status: 'finalizado',
          placar_casa_final: snap.homeScore,
          placar_fora_final: snap.awayScore,
          gol_nos_ultimos_5_min: gol,
          finalizado_em: now.toISOString(),
          data_atualizacao: now.toISOString(),
        })
        .eq('id', p.id);
      finalizadas += 1;
    }
  }

  const restantes = (await loadPartidasAtivas(usuarioId)).filter((p) => p.status === 'em_janela');
  return { leituras, finalizadas, aindaEmJanela: restantes.length };
}

export async function processarFutebolEstatisticas(
  usuarioId: string,
  payload: BetanoOverviewPayload,
  opts: { footballFetchDue: boolean; ranRadar: boolean },
  now: Date = new Date(),
): Promise<ProcessarFutebolResult> {
  const snapshots = parseFootballScoutFromOverview(payload, now);
  const { nextFetchAt: radarNext, emJanela } = await atualizarRadar(usuarioId, snapshots, now);

  let leiturasGravadas = 0;
  let partidasFinalizadas = 0;
  let aindaEmJanela = emJanela.length;
  let modo: 'radar' | 'intenso' = 'radar';
  let nextFetchAt = radarNext;

  const deveIntensivo = opts.footballFetchDue || emJanela.length > 0;

  if (deveIntensivo) {
    const res = await processarLeiturasLote(usuarioId, snapshots, now);
    leiturasGravadas = res.leituras;
    partidasFinalizadas = res.finalizadas;
    aindaEmJanela = res.aindaEmJanela;

    if (aindaEmJanela > 0) {
      modo = 'intenso';
      nextFetchAt = addMs(now, pickFootballIntensiveDelayMs());
    } else {
      modo = 'radar';
      nextFetchAt = radarNext;
    }
  }

  const agendaPatch: {
    modo: 'radar' | 'intenso';
    next_fetch_at: string | null;
    last_radar_at?: string | null;
    last_intensive_at?: string | null;
  } = {
    modo,
    next_fetch_at: nextFetchAt,
  };
  if (opts.ranRadar) agendaPatch.last_radar_at = now.toISOString();
  if (leiturasGravadas > 0) agendaPatch.last_intensive_at = now.toISOString();

  await upsertAgenda(usuarioId, agendaPatch);

  return {
    radarAtualizado: opts.ranRadar,
    leiturasGravadas,
    partidasEmJanela: aindaEmJanela,
    partidasFinalizadas,
    nextFetchAt,
    modo,
  };
}

export interface SincronizarRadarResult {
  localizadosJson: number;
  sincronizados: number;
  processamento: ProcessarFutebolResult;
}

/** Coleta imediata: todos os jogos FOOT do JSON → futebol_partidas (radar + janela se aplicável). */
export async function sincronizarFutebolRadarImediato(
  usuarioId: string,
  payload: BetanoOverviewPayload,
  now: Date = new Date(),
): Promise<SincronizarRadarResult> {
  const snapshots = parseFootballScoutFromOverview(payload, now);
  const localizadosJson = snapshots.filter((s) => !s.isFinished).length;

  const processamento = await processarFutebolEstatisticas(usuarioId, payload, {
    footballFetchDue: true,
    ranRadar: true,
  }, now);

  const { count, error: countErr } = await db()
    .from('futebol_partidas')
    .select('*', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .in('status', ['observado', 'em_janela']);

  if (countErr) throw new Error(countErr.message);

  return {
    localizadosJson,
    sincronizados: count ?? localizadosJson,
    processamento,
  };
}

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import type { ParsedGame } from './betanoOverviewParse.ts';
import { buildGameKeyFromGame, detectQ2Alerts } from './betanoRules.ts';
import {
  formatDelayHuman,
  pickNextDelayMs,
  pushRecentInterval,
} from './humanRandomDelay.ts';

export interface SchedulerRow {
  id: string;
  usuario_id: string | null;
  ativo: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_interval_ms: number | null;
  recent_intervals_ms: number[];
}

export interface GameStateRow {
  game_key: string;
  periodo: string;
  alerta_enviado: boolean;
}

let adminClient: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes na Edge Function');
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

export async function loadScheduler(): Promise<SchedulerRow | null> {
  const { data, error } = await getServiceClient()
    .from('coleta_scheduler')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw new Error(`scheduler: ${error.message}`);
  return data as SchedulerRow | null;
}

export async function saveSchedulerPatch(
  patch: Partial<SchedulerRow> & { id: string },
): Promise<void> {
  const { error } = await getServiceClient()
    .from('coleta_scheduler')
    .update({
      ...patch,
      data_atualizacao: new Date().toISOString(),
    })
    .eq('id', patch.id);

  if (error) throw new Error(`scheduler update: ${error.message}`);
}

export async function scheduleNextRun(
  scheduler: SchedulerRow,
  ranAt: Date,
): Promise<{ nextRunAt: string; intervalMs: number }> {
  const intervalMs = pickNextDelayMs(
    scheduler.last_interval_ms,
    scheduler.recent_intervals_ms ?? [],
  );
  const nextRunAt = new Date(ranAt.getTime() + intervalMs).toISOString();
  const recent = pushRecentInterval(scheduler.recent_intervals_ms ?? [], intervalMs);

  await saveSchedulerPatch({
    id: scheduler.id,
    next_run_at: nextRunAt,
    last_interval_ms: intervalMs,
    recent_intervals_ms: recent,
  });

  return { nextRunAt, intervalMs };
}

export async function loadGameStates(usuarioId: string): Promise<Map<string, GameStateRow>> {
  const { data, error } = await getServiceClient()
    .from('jogos_estado_monitor')
    .select('game_key, periodo, alerta_enviado')
    .eq('usuario_id', usuarioId);

  if (error) throw new Error(`estado jogos: ${error.message}`);

  const map = new Map<string, GameStateRow>();
  for (const row of data ?? []) {
    map.set(row.game_key as string, row as GameStateRow);
  }
  return map;
}

export interface PersistResult {
  coletaId: string;
  alertas: number;
}

export async function persistColetaComJogos(
  usuarioId: string,
  coleta: {
    resumoJson: string;
    sucesso: boolean;
    erroMensagem?: string | null;
    games: ParsedGame[];
  },
): Promise<PersistResult> {
  const client = getServiceClient();
  const agora = new Date().toISOString();

  const { data: coletaRow, error: coletaError } = await client
    .from('coletas_betano')
    .insert({
      usuario_id: usuarioId,
      coletado_em: agora,
      fonte_parser: 'api',
      sucesso: coleta.sucesso,
      qtd_jogos: coleta.games.length,
      erro_mensagem: coleta.erroMensagem ?? null,
      texto_tamanho: coleta.resumoJson.length,
      texto_preview: coleta.resumoJson.slice(0, 2000),
      dispositivo_id: 'supabase-cron',
      data_atualizacao: agora,
    })
    .select('id')
    .single();

  if (coletaError || !coletaRow?.id) {
    throw new Error(coletaError?.message ?? 'Falha ao inserir coleta');
  }

  const coletaId = coletaRow.id as string;
  const estados = await loadGameStates(usuarioId);
  const alertasParaInserir: Record<string, unknown>[] = [];
  let alertasCount = 0;

  if (coleta.games.length > 0) {
    const linhasJogos = coleta.games.map((jogo) => ({
      coleta_id: coletaId,
      game_key: buildGameKeyFromGame(jogo),
      time_casa: jogo.homeTeam,
      time_fora: jogo.awayTeam,
      liga: jogo.league,
      periodo: jogo.period,
      placar_casa: jogo.homeScore,
      placar_fora: jogo.awayScore,
    }));

    const { error: jogosError } = await client.from('jogos_coleta').insert(linhasJogos);
    if (jogosError) throw new Error(jogosError.message);
  }

  for (const game of coleta.games) {
    const gameKey = buildGameKeyFromGame(game);
    const previous = estados.get(gameKey);
    const previousPeriod = (previous?.periodo as ParsedGame['period'] | undefined) ?? null;

    await client.from('jogos_estado_monitor').upsert({
      usuario_id: usuarioId,
      game_key: gameKey,
      time_casa: game.homeTeam,
      time_fora: game.awayTeam,
      liga: game.league,
      periodo: game.period,
      placar_casa: game.homeScore,
      placar_fora: game.awayScore,
      alerta_enviado: previous?.alerta_enviado ?? false,
      data_atualizacao: agora,
    });

    if (previous?.alerta_enviado) continue;

    const candidate = detectQ2Alerts(previousPeriod, game);
    if (!candidate) continue;

    alertasParaInserir.push({
      usuario_id: usuarioId,
      coleta_id: coletaId,
      game_key: candidate.gameKey,
      time_casa: candidate.game.homeTeam,
      time_fora: candidate.game.awayTeam,
      liga: candidate.game.league,
      placar_casa: candidate.game.homeScore,
      placar_fora: candidate.game.awayScore,
      diferenca_pontos: candidate.pointDiff,
      periodo_anterior: previousPeriod,
      periodo_atual: candidate.game.period,
      disparado_em: agora,
    });

    await client
      .from('jogos_estado_monitor')
      .update({ alerta_enviado: true, data_atualizacao: agora })
      .eq('usuario_id', usuarioId)
      .eq('game_key', gameKey);

    alertasCount += 1;
  }

  if (alertasParaInserir.length > 0) {
    const { error: alertasError } = await client
      .from('alertas_betano')
      .insert(alertasParaInserir);
    if (alertasError) throw new Error(alertasError.message);
  }

  return { coletaId, alertas: alertasCount };
}

export function isCronAuthorized(req: Request): boolean {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return true;
  return req.headers.get('x-cron-secret') === secret;
}

export { formatDelayHuman };

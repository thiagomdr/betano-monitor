import type { ParsedGame } from '../types/game';
import { debugLog } from './debugLog';
import { supabase, supabaseConfigurado } from './supabase';

export interface BetanoColetaFetchInfo {
  httpStatus: number;
  warmupStatus: number;
  durationMs: number;
  cookieUsed: boolean;
  totalEvents: number;
  sportsAvailable: string[];
  baskLeagueIds?: number[];
}

export interface BetanoColetaResponse {
  collectedAt: string;
  summary: string;
  ok: boolean;
  blocked?: boolean;
  fetch?: BetanoColetaFetchInfo;
  games: ParsedGame[];
  gameCount: number;
  preview?: string[];
  error?: string;
}

async function chamarColetaViaFetch(): Promise<{
  status: number;
  bodyText: string;
  bodyJson: BetanoColetaResponse | null;
}> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/functions/v1/betano-coleta`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  const bodyText = await response.text();
  let bodyJson: BetanoColetaResponse | null = null;
  try {
    bodyJson = JSON.parse(bodyText) as BetanoColetaResponse;
  } catch {
    bodyJson = null;
  }

  return { status: response.status, bodyText: bodyText.slice(0, 1200), bodyJson };
}

export async function executarBetanoColeta(): Promise<{
  resultado: BetanoColetaResponse | null;
  erro: string | null;
}> {
  if (!supabaseConfigurado || !supabase) {
    return { resultado: null, erro: 'Supabase não configurado no .env' };
  }

  debugLog('betanoColetaSupabase.ts:executarBetanoColeta', 'início coleta JSON', {
    functionName: 'betano-coleta',
  });

  const { data, error } = await supabase.functions.invoke<BetanoColetaResponse>('betano-coleta', {
    body: {},
  });

  if (!error && data) {
    debugLog('betanoColetaSupabase.ts:executarBetanoColeta', 'invoke ok', {
      summary: data.summary,
      gameCount: data.gameCount,
      ok: data.ok,
    });
    return { resultado: data, erro: null };
  }

  const invokeError = error as {
    message?: string;
    context?: Response;
  } | null;

  let invokeStatus: number | null = null;
  let invokeBody = '';
  if (invokeError?.context) {
    try {
      invokeStatus = invokeError.context.status;
      invokeBody = (await invokeError.context.text()).slice(0, 800);
    } catch {
      invokeBody = '';
    }
  }

  let fetchStatus: number | null = null;
  let fetchBody = '';
  let fetchJson: BetanoColetaResponse | null = null;
  try {
    const fetchResult = await chamarColetaViaFetch();
    fetchStatus = fetchResult.status;
    fetchBody = fetchResult.bodyText;
    fetchJson = fetchResult.bodyJson;
  } catch (fetchErr) {
    debugLog('betanoColetaSupabase.ts:executarBetanoColeta', 'fetch direto exceção', {
      message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
    });
  }

  if (fetchJson && fetchStatus && fetchStatus >= 200 && fetchStatus < 300) {
    return { resultado: fetchJson, erro: null };
  }

  const statusHint =
    fetchStatus === 404 || invokeStatus === 404
      ? 'Function betano-coleta não encontrada — rode: npm run deploy:coleta'
      : fetchStatus === 401 || invokeStatus === 401
        ? 'Não autorizado (401) — verifique anon key e verify_jwt'
        : fetchStatus === 500 || invokeStatus === 500
          ? `Erro interno na Edge Function: ${fetchBody || invokeBody || 'sem corpo'}`
          : null;

  const erro =
    statusHint ??
    invokeError?.message ??
    `Falha HTTP ${fetchStatus ?? invokeStatus ?? '?'}`;

  return { resultado: null, erro };
}

export function formatarColetaParaExibicao(coleta: BetanoColetaResponse): string {
  const linhas = [
    coleta.summary,
    `ok=${coleta.ok ? 'sim' : 'não'} · jogos=${coleta.gameCount}`,
  ];

  if (coleta.fetch) {
    linhas.push(
      `HTTP ${coleta.fetch.httpStatus} · warmup ${coleta.fetch.warmupStatus} · ${coleta.fetch.durationMs}ms · cookie=${coleta.fetch.cookieUsed ? 'sim' : 'não'}`,
      `eventos totais=${coleta.fetch.totalEvents} · esportes=${coleta.fetch.sportsAvailable.join(', ') || '—'}`,
    );
    if (coleta.fetch.baskLeagueIds?.length) {
      linhas.push(`ligas BASK=${coleta.fetch.baskLeagueIds.join(', ')}`);
    }
  }

  if (coleta.blocked) {
    linhas.push('bloqueio=sim');
  }

  if (coleta.preview?.length) {
    linhas.push('---');
    for (const line of coleta.preview) {
      linhas.push(line);
    }
  }

  return linhas.join('\n');
}

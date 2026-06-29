import { debugLog } from './debugLog';
import { supabase, supabaseConfigurado } from './supabase';

export interface BetanoProbeLive {
  url: string;
  httpStatus: number;
  ok: boolean;
  textLength: number;
  hasBasquete: boolean;
  hasPeriodQ: boolean;
  hasScoreLike: boolean;
  indicates404: boolean;
  indicatesBlock: boolean;
  blockReason: string | null;
  preview: string;
  durationMs: number;
}

export interface BetanoProbeResponse {
  testedAt: string;
  summary: string;
  viableForParser: boolean;
  live: BetanoProbeLive;
  note?: string;
  error?: string;
}

function supabaseHost(): string | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function chamarProbeViaFetch(): Promise<{
  status: number;
  bodyText: string;
  bodyJson: BetanoProbeResponse | null;
}> {
  const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/functions/v1/betano-probe`;

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
  let bodyJson: BetanoProbeResponse | null = null;
  try {
    bodyJson = JSON.parse(bodyText) as BetanoProbeResponse;
  } catch {
    bodyJson = null;
  }

  return { status: response.status, bodyText: bodyText.slice(0, 800), bodyJson };
}

export async function executarBetanoProbe(): Promise<{
  resultado: BetanoProbeResponse | null;
  erro: string | null;
}> {
  if (!supabaseConfigurado || !supabase) {
    return { resultado: null, erro: 'Supabase não configurado no .env' };
  }

  const host = supabaseHost();
  // #region agent log
  debugLog(
    'betanoProbeSupabase.ts:executarBetanoProbe',
    'início probe',
    { host, functionName: 'betano-probe' },
    'H2',
  );
  // #endregion

  const { data, error } = await supabase.functions.invoke<BetanoProbeResponse>('betano-probe', {
    body: {},
  });

  if (!error && data) {
    // #region agent log
    debugLog(
      'betanoProbeSupabase.ts:executarBetanoProbe',
      'invoke ok',
      { summary: data.summary, viableForParser: data.viableForParser },
      'H1',
      'post-fix',
    );
    // #endregion
    return { resultado: data, erro: null };
  }

  const invokeError = error as {
    name?: string;
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

  // #region agent log
  debugLog(
    'betanoProbeSupabase.ts:executarBetanoProbe',
    'invoke falhou',
    {
      name: invokeError?.name ?? null,
      message: invokeError?.message ?? null,
      invokeStatus,
      invokeBodyPreview: invokeBody,
    },
    'H1',
  );
  // #endregion

  let fetchStatus: number | null = null;
  let fetchBody = '';
  let fetchJson: BetanoProbeResponse | null = null;
  try {
    const fetchResult = await chamarProbeViaFetch();
    fetchStatus = fetchResult.status;
    fetchBody = fetchResult.bodyText;
    fetchJson = fetchResult.bodyJson;
    // #region agent log
    debugLog(
      'betanoProbeSupabase.ts:executarBetanoProbe',
      'fetch direto probe',
      { fetchStatus, fetchBodyPreview: fetchBody },
      'H3',
    );
    // #endregion
  } catch (fetchErr) {
    // #region agent log
    debugLog(
      'betanoProbeSupabase.ts:executarBetanoProbe',
      'fetch direto exceção',
      { message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) },
      'H4',
    );
    // #endregion
  }

  if (fetchJson && fetchStatus && fetchStatus >= 200 && fetchStatus < 300) {
    return { resultado: fetchJson, erro: null };
  }

  const statusHint =
    fetchStatus === 404 || invokeStatus === 404
      ? 'Function betano-probe não encontrada — rode: npx supabase functions deploy betano-probe'
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

export function formatarProbeParaExibicao(probe: BetanoProbeResponse): string {
  const linhas = [
    probe.summary,
    `HTTP Betano ${probe.live.httpStatus} · ${probe.live.textLength} chars · ${probe.live.durationMs}ms`,
    `basquete=${probe.live.hasBasquete} Q=${probe.live.hasPeriodQ} placar=${probe.live.hasScoreLike}`,
    `bloqueio=${probe.live.indicatesBlock} 404=${probe.live.indicates404}`,
    `viável=${probe.viableForParser ? 'sim' : 'não'}`,
  ];
  if (probe.note) linhas.push(probe.note);
  if (probe.live.preview) linhas.push(`preview: ${probe.live.preview.slice(0, 120)}...`);
  return linhas.join('\n');
}

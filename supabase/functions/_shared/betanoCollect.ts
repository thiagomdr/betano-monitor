import { fetchBetanoLiveOverviewAsChrome } from './betanoFetch.ts';
import {
  type BetanoOverviewPayload,
  type ParsedGame,
  parseBasketballFromOverview,
  parseFootballFromOverview,
} from './betanoOverviewParse.ts';

export interface BetanoCollectResult {
  ok: boolean;
  blocked: boolean;
  summary: string;
  games: ParsedGame[];
  gamesBasquete: ParsedGame[];
  futebolAoVivoTotal: number;
  gameCount: number;
  payload: BetanoOverviewPayload | null;
  resumoJson: string;
  fetch: {
    httpStatus: number;
    warmupStatus: number;
    durationMs: number;
    cookieUsed: boolean;
    totalEvents: number;
    sportsAvailable: string[];
    baskLeagueIds: number[];
    footLeagueIds: number[];
  } | null;
  blockReason: string | null;
}

function montarResumo(
  gamesBasquete: ParsedGame[],
  futebolAoVivoTotal: number,
  baskLeagueIds: number[],
  footLeagueIds: number[],
): string {
  const partes: string[] = [];
  if (gamesBasquete.length > 0) {
    partes.push(`${gamesBasquete.length} basquete`);
  }
  if (futebolAoVivoTotal > 0) {
    partes.push(`${futebolAoVivoTotal} futebol ao vivo (estatísticas)`);
  }

  if (partes.length > 0) return partes.join(' · ');

  if (baskLeagueIds.length === 0 && footLeagueIds.length === 0) {
    return 'JSON OK, mas sem ligas BASK/FOOT no momento';
  }
  return 'JSON OK, sem jogos de basquete ao vivo no momento';
}

export async function executarColetaBetanoJson(): Promise<BetanoCollectResult> {
  const fetchResult = await fetchBetanoLiveOverviewAsChrome();

  const footLeagueIds = fetchResult.footLeagueIds ?? [];

  const fetchMeta = {
    httpStatus: fetchResult.httpStatus,
    warmupStatus: fetchResult.warmupStatus,
    durationMs: fetchResult.durationMs,
    cookieUsed: fetchResult.cookieUsed,
    totalEvents: fetchResult.totalEvents,
    sportsAvailable: fetchResult.sportsAvailable,
    baskLeagueIds: fetchResult.baskLeagueIds,
    footLeagueIds,
  };

  if (fetchResult.indicatesBlock) {
    const summary = `Bloqueio provável (${fetchResult.blockReason})`;
    return {
      ok: false,
      blocked: true,
      summary,
      games: [],
      gamesBasquete: [],
      futebolAoVivoTotal: 0,
      gameCount: 0,
      payload: null,
      resumoJson: JSON.stringify({ summary, fetch: fetchMeta }),
      fetch: fetchMeta,
      blockReason: fetchResult.blockReason,
    };
  }

  if (!fetchResult.ok || !fetchResult.payload) {
    const reason = fetchResult.parseError ?? `HTTP ${fetchResult.httpStatus}`;
    const summary = `Falha ao obter JSON ao vivo: ${reason}`;
    return {
      ok: false,
      blocked: false,
      summary,
      games: [],
      gamesBasquete: [],
      futebolAoVivoTotal: 0,
      gameCount: 0,
      payload: null,
      resumoJson: JSON.stringify({ summary, fetch: fetchMeta }),
      fetch: fetchMeta,
      blockReason: null,
    };
  }

  const payload = fetchResult.payload as BetanoOverviewPayload;
  const gamesBasquete = parseBasketballFromOverview(payload);
  const futebolAoVivo = parseFootballFromOverview(payload);
  const summary = montarResumo(
    gamesBasquete,
    futebolAoVivo.length,
    fetchMeta.baskLeagueIds,
    footLeagueIds,
  );

  return {
    ok: true,
    blocked: false,
    summary,
    games: gamesBasquete,
    gamesBasquete,
    futebolAoVivoTotal: futebolAoVivo.length,
    gameCount: gamesBasquete.length,
    payload,
    resumoJson: JSON.stringify({
      summary,
      gameCount: gamesBasquete.length,
      gamesBasquete: gamesBasquete.length,
      futebolAoVivoTotal: futebolAoVivo.length,
      fetch: fetchMeta,
    }),
    fetch: fetchMeta,
    blockReason: null,
  };
}

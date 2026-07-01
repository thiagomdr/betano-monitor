import { fetchBetanoLiveOverviewAsChrome } from './betanoFetch.ts';
import {
  type BetanoOverviewPayload,
  combinarJogosColeta,
  filtrarFutebolElegivelColeta,
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
  gamesFutebol: ParsedGame[];
  futebolAoVivoTotal: number;
  gameCount: number;
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
  gamesFutebol: ParsedGame[],
  futebolAoVivoTotal: number,
  baskLeagueIds: number[],
  footLeagueIds: number[],
): string {
  const partes: string[] = [];
  if (gamesBasquete.length > 0) {
    partes.push(`${gamesBasquete.length} basquete`);
  }
  if (gamesFutebol.length > 0) {
    partes.push(`${gamesFutebol.length} futebol (últimos 5 min)`);
  } else if (futebolAoVivoTotal > 0) {
    partes.push(
      `${futebolAoVivoTotal} futebol ao vivo fora da janela de coleta (só 2º tempo, últimos 5 min)`,
    );
  }

  if (partes.length > 0) return partes.join(' · ');

  if (baskLeagueIds.length === 0 && footLeagueIds.length === 0) {
    return 'JSON OK, mas sem ligas BASK/FOOT no momento';
  }
  return 'JSON OK, sem jogos elegíveis para coleta (basquete ao vivo ou futebol nos últimos 5 min do 2º tempo)';
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
      gamesFutebol: [],
      futebolAoVivoTotal: 0,
      gameCount: 0,
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
      gamesFutebol: [],
      futebolAoVivoTotal: 0,
      gameCount: 0,
      resumoJson: JSON.stringify({ summary, fetch: fetchMeta }),
      fetch: fetchMeta,
      blockReason: null,
    };
  }

  const payload = fetchResult.payload as BetanoOverviewPayload;
  const gamesBasquete = parseBasketballFromOverview(payload);
  const futebolAoVivo = parseFootballFromOverview(payload);
  const gamesFutebol = filtrarFutebolElegivelColeta(payload);
  const games = combinarJogosColeta(gamesBasquete, gamesFutebol);
  const summary = montarResumo(
    gamesBasquete,
    gamesFutebol,
    futebolAoVivo.length,
    fetchMeta.baskLeagueIds,
    footLeagueIds,
  );

  return {
    ok: true,
    blocked: false,
    summary,
    games,
    gamesBasquete,
    gamesFutebol,
    futebolAoVivoTotal: futebolAoVivo.length,
    gameCount: games.length,
    resumoJson: JSON.stringify({
      summary,
      gameCount: games.length,
      gamesBasquete: gamesBasquete.length,
      gamesFutebol: gamesFutebol.length,
      futebolAoVivoTotal: futebolAoVivo.length,
      fetch: fetchMeta,
    }),
    fetch: fetchMeta,
    blockReason: null,
  };
}

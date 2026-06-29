import { fetchBetanoLiveOverviewAsChrome } from './betanoFetch.ts';
import {
  type BetanoOverviewPayload,
  type ParsedGame,
  parseBasketballFromOverview,
} from './betanoOverviewParse.ts';

export interface BetanoCollectResult {
  ok: boolean;
  blocked: boolean;
  summary: string;
  games: ParsedGame[];
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
  } | null;
  blockReason: string | null;
}

export async function executarColetaBetanoJson(): Promise<BetanoCollectResult> {
  const fetchResult = await fetchBetanoLiveOverviewAsChrome();

  const fetchMeta = {
    httpStatus: fetchResult.httpStatus,
    warmupStatus: fetchResult.warmupStatus,
    durationMs: fetchResult.durationMs,
    cookieUsed: fetchResult.cookieUsed,
    totalEvents: fetchResult.totalEvents,
    sportsAvailable: fetchResult.sportsAvailable,
    baskLeagueIds: fetchResult.baskLeagueIds,
  };

  if (fetchResult.indicatesBlock) {
    const summary = `Bloqueio provável (${fetchResult.blockReason})`;
    return {
      ok: false,
      blocked: true,
      summary,
      games: [],
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
      gameCount: 0,
      resumoJson: JSON.stringify({ summary, fetch: fetchMeta }),
      fetch: fetchMeta,
      blockReason: null,
    };
  }

  const games = parseBasketballFromOverview(fetchResult.payload as BetanoOverviewPayload);
  const summary =
    games.length > 0
      ? `${games.length} jogo(s) de basquete ao vivo`
      : fetchResult.baskLeagueIds.length === 0
        ? 'JSON OK, mas sem ligas BASK no momento'
        : 'JSON OK, sem jogos de basquete válidos (simulados filtrados ou sem placar)';

  return {
    ok: true,
    blocked: false,
    summary,
    games,
    gameCount: games.length,
    resumoJson: JSON.stringify({
      summary,
      gameCount: games.length,
      fetch: fetchMeta,
    }),
    fetch: fetchMeta,
    blockReason: null,
  };
}

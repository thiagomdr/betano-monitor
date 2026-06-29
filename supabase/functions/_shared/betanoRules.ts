import type { ParsedGame } from './betanoOverviewParse.ts';

export type GamePeriod = ParsedGame['period'];

export interface AlertCandidate {
  gameKey: string;
  game: ParsedGame;
  pointDiff: number;
}

const END_Q2_PERIODS: GamePeriod[] = ['Intervalo', 'Q3'];

export function buildGameKey(homeTeam: string, awayTeam: string): string {
  const teams = [homeTeam, awayTeam]
    .map((nome) => nome.trim().toLowerCase().replace(/\s+/g, ' '))
    .sort();
  return teams.join('|');
}

export function buildGameKeyFromGame(game: ParsedGame): string {
  return buildGameKey(game.homeTeam, game.awayTeam);
}

export function detectQ2Alerts(
  previousPeriod: GamePeriod | null,
  current: ParsedGame,
): AlertCandidate | null {
  if (previousPeriod !== 'Q2') return null;
  if (!END_Q2_PERIODS.includes(current.period)) return null;

  const pointDiff = Math.abs(current.homeScore - current.awayScore);
  if (pointDiff < 10) return null;

  return {
    gameKey: buildGameKeyFromGame(current),
    game: current,
    pointDiff,
  };
}

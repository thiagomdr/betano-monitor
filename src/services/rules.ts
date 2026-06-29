import type { GamePeriod, ParsedGame } from '../types/game';
import { buildGameKeyFromGame } from './parseLocal';

export interface AlertCandidate {
  gameKey: string;
  game: ParsedGame;
  pointDiff: number;
  leadingTeam: string;
}

const END_Q2_PERIODS: GamePeriod[] = ['Intervalo', 'Q3'];

export function detectQ2Alerts(
  previousPeriod: GamePeriod | null,
  current: ParsedGame,
): AlertCandidate | null {
  if (previousPeriod !== 'Q2') return null;
  if (!END_Q2_PERIODS.includes(current.period)) return null;

  const pointDiff = Math.abs(current.homeScore - current.awayScore);
  if (pointDiff < 10) return null;

  const leadingTeam =
    current.homeScore > current.awayScore
      ? current.homeTeam
      : current.awayTeam;

  return {
    gameKey: buildGameKeyFromGame(current),
    game: current,
    pointDiff,
    leadingTeam,
  };
}

export function formatAlertBody(candidate: AlertCandidate): string {
  const { game, pointDiff } = candidate;
  return [
    `${game.homeTeam} ${game.homeScore} x ${game.awayScore} ${game.awayTeam}`,
    `Diferença: ${pointDiff} | Período: ${game.period}`,
    game.league ? `Liga: ${game.league}` : '',
    'Aposte manualmente na Betano.',
  ]
    .filter(Boolean)
    .join('\n');
}

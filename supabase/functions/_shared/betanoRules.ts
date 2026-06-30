import type { ParsedGame } from './betanoOverviewParse.ts';

export type GamePeriod = ParsedGame['period'];
export type RegraPeriodo = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface RegraAlerta {
  id: string;
  periodo: RegraPeriodo;
  minPontos: number;
  minOdd: number;
  ativo: boolean;
}

export interface AlertCandidate {
  gameKey: string;
  game: ParsedGame;
  pointDiff: number;
  regraId: string;
  leadingTeam: string;
  leaderOdd: number;
}

const PERIODOS_REGRA = new Set<RegraPeriodo>(['Q1', 'Q2', 'Q3', 'Q4']);

export function buildGameKey(homeTeam: string, awayTeam: string): string {
  const teams = [homeTeam, awayTeam]
    .map((nome) => nome.trim().toLowerCase().replace(/\s+/g, ' '))
    .sort();
  return teams.join('|');
}

export function buildGameKeyFromGame(game: ParsedGame): string {
  return buildGameKey(game.homeTeam, game.awayTeam);
}

function liderDoJogo(game: ParsedGame): { team: string; odd: number; diff: number } | null {
  const diff = Math.abs(game.homeScore - game.awayScore);
  if (game.homeScore > game.awayScore) {
    return { team: game.homeTeam, odd: game.homeOdd, diff };
  }
  if (game.awayScore > game.homeScore) {
    return { team: game.awayTeam, odd: game.awayOdd, diff };
  }
  return null;
}

export function evaluateAlertRules(
  game: ParsedGame,
  rules: RegraAlerta[],
  firedRuleIds: Set<string>,
): AlertCandidate[] {
  const periodo = game.period;
  if (!PERIODOS_REGRA.has(periodo as RegraPeriodo)) return [];

  const lider = liderDoJogo(game);
  if (!lider) return [];

  const gameKey = buildGameKeyFromGame(game);
  const candidatos: AlertCandidate[] = [];

  for (const regra of rules) {
    if (!regra.ativo) continue;
    if (firedRuleIds.has(regra.id)) continue;
    if (periodo !== regra.periodo) continue;
    if (lider.diff < regra.minPontos) continue;
    if (lider.odd <= regra.minOdd) continue;

    candidatos.push({
      gameKey,
      game,
      pointDiff: lider.diff,
      regraId: regra.id,
      leadingTeam: lider.team,
      leaderOdd: lider.odd,
    });
  }

  return candidatos;
}

import type { Esporte, ParsedGame } from './betanoOverviewParse.ts';

export type GamePeriod = ParsedGame['period'];
export type RegraPeriodo = 'Q1' | 'Q2' | 'Q3' | 'Q4' | '1T' | '2T';

export interface RegraAlerta {
  id: string;
  esporte: Esporte;
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

const PERIODOS_BASQUETE = new Set<RegraPeriodo>(['Q1', 'Q2', 'Q3', 'Q4']);
const PERIODOS_FUTEBOL = new Set<RegraPeriodo>(['1T', '2T']);

const ORDEM_BASQUETE: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4,
};

const ORDEM_FUTEBOL: Record<'1T' | '2T', number> = {
  '1T': 1,
  '2T': 2,
};

export function buildGameKey(esporte: Esporte, homeTeam: string, awayTeam: string): string {
  const teams = [homeTeam, awayTeam]
    .map((nome) => nome.trim().toLowerCase().replace(/\s+/g, ' '))
    .sort();
  return `${esporte}|${teams.join('|')}`;
}

export function buildGameKeyFromGame(game: ParsedGame): string {
  return buildGameKey(game.esporte, game.homeTeam, game.awayTeam);
}

function periodoBasqueteAtingeRegra(periodoAtual: string, periodoRegra: 'Q1' | 'Q2' | 'Q3' | 'Q4'): boolean {
  const atual = ORDEM_BASQUETE[periodoAtual as keyof typeof ORDEM_BASQUETE];
  const minimo = ORDEM_BASQUETE[periodoRegra];
  if (atual == null || minimo == null) return false;
  return atual >= minimo;
}

function periodoFutebolAtingeRegra(periodoAtual: string, periodoRegra: '1T' | '2T'): boolean {
  const atual = ORDEM_FUTEBOL[periodoAtual as keyof typeof ORDEM_FUTEBOL];
  const minimo = ORDEM_FUTEBOL[periodoRegra];
  if (atual == null || minimo == null) return false;
  return atual >= minimo;
}

function periodoAtingeRegra(esporte: Esporte, periodoAtual: string, periodoRegra: RegraPeriodo): boolean {
  if (esporte === 'basquete') {
    if (!PERIODOS_BASQUETE.has(periodoRegra)) return false;
    return periodoBasqueteAtingeRegra(periodoAtual, periodoRegra);
  }
  if (!PERIODOS_FUTEBOL.has(periodoRegra)) return false;
  return periodoFutebolAtingeRegra(periodoAtual, periodoRegra);
}

function periodoValidoParaRegra(esporte: Esporte, periodo: string): boolean {
  if (esporte === 'basquete') return PERIODOS_BASQUETE.has(periodo as RegraPeriodo);
  return PERIODOS_FUTEBOL.has(periodo as RegraPeriodo);
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
): AlertCandidate[] {
  const periodo = game.period;
  if (!periodoValidoParaRegra(game.esporte, periodo)) return [];

  const lider = liderDoJogo(game);
  if (!lider) return [];

  const gameKey = buildGameKeyFromGame(game);
  const candidatos: AlertCandidate[] = [];

  for (const regra of rules) {
    if (!regra.ativo) continue;
    if (regra.esporte !== game.esporte) continue;
    if (!periodoAtingeRegra(game.esporte, periodo, regra.periodo)) continue;
    if (lider.diff < regra.minPontos) continue;
    if (lider.odd < regra.minOdd) continue;

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

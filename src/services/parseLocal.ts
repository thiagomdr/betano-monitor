import { LIGA_INVALIDA_PATTERN, SIMULATED_LEAGUE_PATTERN } from '../constants';
import type { GamePeriod, ParsedGame } from '../types/game';

const PERIOD_PATTERN = /\b(Q[1-4]|Intervalo|INT|HT|OT)\b/i;
const SCORE_PATTERN = /^(\d{1,3})$/;
const ESPORTS_TEAM_PATTERN = /\([^)]+\)/;

function normalizePeriod(raw: string): GamePeriod {
  const upper = raw.toUpperCase();
  if (upper === 'Q1') return 'Q1';
  if (upper === 'Q2') return 'Q2';
  if (upper === 'Q3') return 'Q3';
  if (upper === 'Q4') return 'Q4';
  if (upper === 'OT') return 'OT';
  if (upper === 'INTERVALO' || upper === 'INT' || upper === 'HT') return 'Intervalo';
  return 'unknown';
}

function normalizarNomeTime(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

function sanitizarLiga(league: string | null): string | null {
  if (!league) return null;
  const trimmed = league.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return null;
  if (LIGA_INVALIDA_PATTERN.test(trimmed)) return null;
  return trimmed;
}

function isSimulatedContext(
  league: string | null,
  homeTeam: string,
  awayTeam: string,
): boolean {
  const blob = `${league ?? ''} ${homeTeam} ${awayTeam}`;
  if (SIMULATED_LEAGUE_PATTERN.test(blob)) return true;
  if (ESPORTS_TEAM_PATTERN.test(homeTeam) && ESPORTS_TEAM_PATTERN.test(awayTeam)) {
    return true;
  }
  return false;
}

function buildGameKey(homeTeam: string, awayTeam: string): string {
  const teams = [normalizarNomeTime(homeTeam), normalizarNomeTime(awayTeam)].sort().join('|');
  return teams;
}

export function buildGameKeyFromGame(game: ParsedGame): string {
  return buildGameKey(game.homeTeam, game.awayTeam);
}

export function paginaBasqueteValida(text: string): boolean {
  return Boolean(text && text.length >= 300 && /basquete/i.test(text));
}

/**
 * Parser heurístico do innerText da Betano.
 * Retorna null se não houver confiança suficiente (aciona fallback LLM).
 */
export function parseLocal(text: string): ParsedGame[] | null {
  if (!paginaBasqueteValida(text)) {
    return null;
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const games: ParsedGame[] = [];
  let currentLeague: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (
      line.length > 3 &&
      line.length < 80 &&
      !PERIOD_PATTERN.test(line) &&
      !SCORE_PATTERN.test(line) &&
      !/vencedor|handicap|total|apostas/i.test(line)
    ) {
      const next = lines[i + 1];
      const nextNext = lines[i + 2];
      if (next && nextNext && !PERIOD_PATTERN.test(line)) {
        const couldBeLeague =
          !SCORE_PATTERN.test(line) &&
          !SCORE_PATTERN.test(next) &&
          (PERIOD_PATTERN.test(nextNext) || SCORE_PATTERN.test(nextNext));
        if (couldBeLeague && /[a-zA-Z]/.test(line)) {
          currentLeague = sanitizarLiga(line);
        }
      }
    }

    const periodMatch = line.match(PERIOD_PATTERN);
    if (!periodMatch) continue;

    const period = normalizePeriod(periodMatch[1]);
    if (period === 'unknown') continue;

    const homeTeam = lines[i + 1];
    const homeScoreLine = lines[i + 2];
    const awayTeam = lines[i + 3];
    const awayScoreLine = lines[i + 4];

    if (!homeTeam || !awayTeam) continue;
    if (!SCORE_PATTERN.test(homeScoreLine ?? '') || !SCORE_PATTERN.test(awayScoreLine ?? '')) {
      continue;
    }

    if (isSimulatedContext(currentLeague, homeTeam, awayTeam)) {
      continue;
    }

    games.push({
      homeTeam,
      awayTeam,
      homeScore: Number(homeScoreLine),
      awayScore: Number(awayScoreLine),
      period,
      league: currentLeague,
    });
  }

  const deduped = dedupeGames(games);
  return deduped.length > 0 ? deduped : null;
}

function dedupeGames(games: ParsedGame[]): ParsedGame[] {
  const map = new Map<string, ParsedGame>();
  for (const game of games) {
    map.set(buildGameKeyFromGame(game), game);
  }
  return Array.from(map.values());
}

export function validateParsedGames(games: ParsedGame[]): ParsedGame[] {
  return games.filter((game) => {
    if (game.period === 'unknown') return false;
    if (game.homeScore < 0 || game.awayScore < 0) return false;
    if (game.homeScore > 200 || game.awayScore > 200) return false;
    if (!game.homeTeam.trim() || !game.awayTeam.trim()) return false;
    if (isSimulatedContext(game.league, game.homeTeam, game.awayTeam)) return false;
    return true;
  });
}

/** Parser do JSON overview/latest da Betano (Deno Edge Function). */

export type GamePeriod =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'Intervalo'
  | 'OT'
  | 'unknown';

export interface ParsedGame {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: GamePeriod;
  league: string | null;
}

const SIMULATED_LEAGUE_PATTERN =
  /ebasketball|nba\s*2k|battle\s*\(|simulad|\(esports\)/i;
const ESPORTS_TEAM_PATTERN = /\([^)]+\)/;

interface OverviewParticipant {
  name?: string;
  isHome?: boolean;
}

interface OverviewEvent {
  id?: number;
  leagueId?: number;
  sportId?: string;
  participants?: OverviewParticipant[];
  isLive?: boolean;
  liveData?: {
    score?: { home?: string; away?: string };
    periodDescription?: string;
  };
}

interface OverviewLeague {
  id?: number;
  name?: string;
}

export interface BetanoOverviewPayload {
  sports?: {
    byIdLeagueIdList?: Record<string, number[]>;
  };
  leagues?: Record<string, OverviewLeague>;
  events?: Record<string, OverviewEvent>;
}

function normalizePeriod(raw: string | undefined): GamePeriod {
  if (!raw) return 'unknown';
  const upper = raw.trim().toUpperCase();
  if (upper === 'Q1') return 'Q1';
  if (upper === 'Q2') return 'Q2';
  if (upper === 'Q3') return 'Q3';
  if (upper === 'Q4') return 'Q4';
  if (upper === 'OT') return 'OT';
  if (upper === 'INTERVALO' || upper === 'INT' || upper === 'HT' || upper === 'HALFTIME') {
    return 'Intervalo';
  }
  if (/^Q[1-4]$/i.test(raw.trim())) {
    return raw.trim().toUpperCase() as GamePeriod;
  }
  return 'unknown';
}

function parseScore(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 && n <= 200 ? n : null;
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

function eventToGame(
  event: OverviewEvent,
  leagues: Record<string, OverviewLeague>,
): ParsedGame | null {
  if (event.sportId !== 'BASK') return null;
  if (event.isLive === false) return null;

  const participants = event.participants ?? [];
  const home = participants.find((p) => p.isHome);
  const away = participants.find((p) => !p.isHome);
  if (!home?.name || !away?.name) return null;

  const homeScore = parseScore(event.liveData?.score?.home);
  const awayScore = parseScore(event.liveData?.score?.away);
  if (homeScore == null || awayScore == null) return null;

  const leagueId = event.leagueId;
  const leagueName =
    leagueId != null ? leagues[String(leagueId)]?.name?.trim() ?? null : null;

  if (isSimulatedContext(leagueName, home.name, away.name)) return null;

  return {
    homeTeam: home.name.trim(),
    awayTeam: away.name.trim(),
    homeScore,
    awayScore,
    period: normalizePeriod(event.liveData?.periodDescription),
    league: leagueName,
  };
}

export function parseBasketballFromOverview(
  payload: BetanoOverviewPayload,
): ParsedGame[] {
  const leagueIds = payload.sports?.byIdLeagueIdList?.BASK ?? [];
  if (leagueIds.length === 0) return [];

  const leagueSet = new Set(leagueIds);
  const leagues = payload.leagues ?? {};
  const events = payload.events ?? {};
  const games: ParsedGame[] = [];
  const seen = new Set<string>();

  for (const event of Object.values(events)) {
    if (!event.leagueId || !leagueSet.has(event.leagueId)) continue;
    const game = eventToGame(event, leagues);
    if (!game) continue;
    const key = `${game.homeTeam}|${game.awayTeam}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(game);
  }

  return games;
}

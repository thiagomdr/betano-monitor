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
  homeOdd: number;
  awayOdd: number;
  tempoRestante: string | null;
}

const SIMULATED_LEAGUE_PATTERN =
  /ebasketball|nba\s*2k|battle\s*\(|simulad|\(esports\)/i;
const ESPORTS_TEAM_PATTERN = /\([^)]+\)/;
const VENCEDOR_MARKET_TYPES = new Set(['HTOH', 'H2HT', 'STWN', 'STWT']);
const VENCEDOR_MARKET_NAME = /vencedor|money\s*line|match\s*winner/i;
const NON_VENCEDOR_MARKET = /handicap|total|pontos|over|under|mais de|menos de/i;

interface OverviewParticipant {
  name?: string;
  isHome?: boolean;
}

interface OverviewSelection {
  id?: number;
  name?: string;
  fullName?: string;
  price?: number;
}

interface OverviewMarket {
  id?: number;
  type?: string;
  name?: string;
  selectionIdList?: number[];
}

interface OverviewEvent {
  id?: number;
  leagueId?: number;
  sportId?: string;
  marketIdList?: number[];
  participants?: OverviewParticipant[];
  isLive?: boolean;
  liveData?: {
    score?: { home?: string; away?: string };
    periodDescription?: string;
    clock?: {
      secondsSinceStart?: number;
      clockStopped?: boolean;
    };
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
  markets?: Record<string, OverviewMarket>;
  selections?: Record<string, OverviewSelection>;
}

export function formatTempoRestante(
  seconds: number | null | undefined,
  period: GamePeriod,
): string | null {
  if (seconds == null || seconds < 0) return null;
  if (period === 'Intervalo' || period === 'unknown') return null;
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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

function parseOdd(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
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

function selectionMatchesTeam(sel: OverviewSelection, teamName: string): boolean {
  const name = (sel.name ?? '').trim();
  const full = (sel.fullName ?? '').trim();
  return full === teamName || name === teamName || name.startsWith(`${teamName} `);
}

function isVencedorMarket(market: OverviewMarket): boolean {
  const type = market.type ?? '';
  const name = market.name ?? '';
  if (NON_VENCEDOR_MARKET.test(name)) return false;
  if (VENCEDOR_MARKET_TYPES.has(type)) return true;
  return VENCEDOR_MARKET_NAME.test(name);
}

function extractVencedorOdds(
  event: OverviewEvent,
  markets: Record<string, OverviewMarket>,
  selections: Record<string, OverviewSelection>,
): { homeOdd: number; awayOdd: number } {
  const home = event.participants?.find((p) => p.isHome)?.name?.trim();
  const away = event.participants?.find((p) => !p.isHome)?.name?.trim();
  if (!home || !away) return { homeOdd: 0, awayOdd: 0 };

  const tryMarket = (market: OverviewMarket | undefined): { homeOdd: number; awayOdd: number } | null => {
    if (!market || !isVencedorMarket(market)) return null;
    const sels = (market.selectionIdList ?? [])
      .map((id) => selections[String(id)])
      .filter((s): s is OverviewSelection => Boolean(s));
    if (sels.length !== 2) return null;
    const homeSel = sels.find((s) => selectionMatchesTeam(s, home));
    const awaySel = sels.find((s) => selectionMatchesTeam(s, away));
    if (!homeSel || !awaySel) return null;
    const homeOdd = parseOdd(homeSel.price);
    const awayOdd = parseOdd(awaySel.price);
    if (homeOdd <= 0 || awayOdd <= 0) return null;
    return { homeOdd, awayOdd };
  };

  const idsToTry = new Set<number>([
    ...(event.marketIdList ?? []),
    ...Object.values(markets)
      .map((m) => m.id)
      .filter((id): id is number => id != null),
  ]);

  for (const id of idsToTry) {
    const result = tryMarket(markets[String(id)]);
    if (result) return result;
  }

  return { homeOdd: 0, awayOdd: 0 };
}

function eventToGame(
  event: OverviewEvent,
  leagues: Record<string, OverviewLeague>,
  markets: Record<string, OverviewMarket>,
  selections: Record<string, OverviewSelection>,
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

  const period = normalizePeriod(event.liveData?.periodDescription);
  const { homeOdd, awayOdd } = extractVencedorOdds(event, markets, selections);
  const tempoRestante = formatTempoRestante(
    event.liveData?.clock?.secondsSinceStart,
    period,
  );

  return {
    homeTeam: home.name.trim(),
    awayTeam: away.name.trim(),
    homeScore,
    awayScore,
    period,
    league: leagueName,
    homeOdd,
    awayOdd,
    tempoRestante,
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
  const markets = payload.markets ?? {};
  const selections = payload.selections ?? {};
  const games: ParsedGame[] = [];
  const seen = new Set<string>();

  for (const event of Object.values(events)) {
    if (!event.leagueId || !leagueSet.has(event.leagueId)) continue;
    const game = eventToGame(event, leagues, markets, selections);
    if (!game) continue;
    const key = `${game.homeTeam}|${game.awayTeam}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(game);
  }

  return games;
}

/** Parser do JSON overview/latest da Betano (Deno Edge Function). */

export type Esporte = 'basquete' | 'futebol';

export type GamePeriod =
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'Intervalo'
  | 'OT'
  | '1T'
  | '2T'
  | 'INT'
  | 'FT'
  | 'unknown';

const BETANO_ORIGIN = 'https://www.betano.bet.br';
const FOOT_SPORT_IDS = new Set(['FOOT', 'SOCC', 'SOC']);
const ULTIMOS_MINUTOS_FUTEBOL = 5;

export interface ParsedGame {
  esporte: Esporte;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: GamePeriod;
  league: string | null;
  homeOdd: number;
  awayOdd: number;
  tempoRestante: string | null;
  eventId: number | null;
  betanoUrl: string | null;
}

/** Monta URL absoluta da partida a partir do campo `url` do JSON overview. */
export function buildBetanoEventUrl(
  path: string | undefined,
  eventId?: number | null,
): string | null {
  const trimmed = path?.trim();
  if (trimmed) {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('/')) return `${BETANO_ORIGIN}${trimmed}`;
  }
  if (eventId != null && Number.isFinite(eventId)) {
    return `${BETANO_ORIGIN}/live/${eventId}/`;
  }
  return null;
}

const SIMULATED_BASKETBALL_PATTERN =
  /ebasketball|nba\s*2k|battle\s*\(|simulad|\(esports\)/i;
const SIMULATED_FOOTBALL_PATTERN =
  /efootball|e-football|fifa\s*\d|battle\s*\(|simulad|virtual|esports/i;
const ESPORTS_TEAM_PATTERN = /\([^)]+\)/;
const VENCEDOR_MARKET_TYPES = new Set(['HTOH', 'H2HT', 'STWN', 'STWT']);
const VENCEDOR_MARKET_NAME = /vencedor|money\s*line|match\s*winner|resultado\s*final/i;
const NON_VENCEDOR_MARKET = /handicap|total|pontos|over|under|mais de|menos de|gols|escanteio/i;

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
  url?: string;
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
    allIds?: string[];
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
  if (period === 'Intervalo' || period === 'INT' || period === 'unknown') return null;
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function normalizeBasketballPeriod(raw: string | undefined): GamePeriod {
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

export function parseMinuteFromPeriodDescription(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const quoted = trimmed.match(/(\d{1,3})\s*['′+]/);
  if (quoted) return Number.parseInt(quoted[1], 10);
  const clock = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (clock) return Number.parseInt(clock[1], 10);
  return null;
}

export function normalizeFootballPeriod(raw: string | undefined): GamePeriod {
  if (!raw) return 'unknown';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (/intervalo|half\s*time|\bht\b|descanso/i.test(lower)) return 'INT';
  if (/2[º°]?\s*time|2nd|segundo\s*time|^2t$/i.test(trimmed)) return '2T';
  if (/1[º°]?\s*time|1st|primeiro\s*time|^1t$/i.test(trimmed)) return '1T';
  if (/final|fim|\bft\b|encerr/i.test(lower)) return 'FT';
  const minute = parseMinuteFromPeriodDescription(trimmed);
  if (minute != null) {
    if (minute > 45) return '2T';
    if (minute >= 1) return '1T';
  }
  return 'unknown';
}

function parseScore(value: string | undefined, max: number): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function parseOdd(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

function isSimulatedBasketballContext(
  league: string | null,
  homeTeam: string,
  awayTeam: string,
): boolean {
  const blob = `${league ?? ''} ${homeTeam} ${awayTeam}`;
  if (SIMULATED_BASKETBALL_PATTERN.test(blob)) return true;
  if (ESPORTS_TEAM_PATTERN.test(homeTeam) && ESPORTS_TEAM_PATTERN.test(awayTeam)) {
    return true;
  }
  return false;
}

function isSimulatedFootballContext(
  league: string | null,
  homeTeam: string,
  awayTeam: string,
): boolean {
  const blob = `${league ?? ''} ${homeTeam} ${awayTeam}`;
  if (SIMULATED_FOOTBALL_PATTERN.test(blob)) return true;
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

function formatFootballTempoRestante(
  periodDescription: string | undefined,
  period: GamePeriod,
  clockSeconds: number | null | undefined,
): string | null {
  const minute = parseMinuteFromPeriodDescription(periodDescription);
  if (minute != null && period === '2T') {
    const restMin = Math.max(0, 90 - minute);
    return `${restMin}:00`;
  }
  if (clockSeconds != null && period === '2T') {
    const restHalf = Math.max(0, 45 * 60 - Math.floor(clockSeconds));
    return formatTempoRestante(restHalf, period);
  }
  return formatTempoRestante(clockSeconds, period);
}

/** Futebol: coleta apenas nos últimos 5 minutos do 2º tempo. */
export function isFutebolElegivelColeta(event: OverviewEvent): boolean {
  const desc = event.liveData?.periodDescription;
  const period = normalizeFootballPeriod(desc);
  if (period !== '2T') return false;

  const minute = parseMinuteFromPeriodDescription(desc);
  if (minute != null) {
    if (minute >= 90 - ULTIMOS_MINUTOS_FUTEBOL) return true;
    if (minute >= 45 - ULTIMOS_MINUTOS_FUTEBOL && minute <= 45) return true;
  }

  const clockSeconds = event.liveData?.clock?.secondsSinceStart;
  if (clockSeconds != null && clockSeconds >= (45 - ULTIMOS_MINUTOS_FUTEBOL) * 60) {
    return true;
  }

  return false;
}

function eventToBasketballGame(
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

  const homeScore = parseScore(event.liveData?.score?.home, 200);
  const awayScore = parseScore(event.liveData?.score?.away, 200);
  if (homeScore == null || awayScore == null) return null;

  const leagueId = event.leagueId;
  const leagueName =
    leagueId != null ? leagues[String(leagueId)]?.name?.trim() ?? null : null;

  if (isSimulatedBasketballContext(leagueName, home.name, away.name)) return null;

  const period = normalizeBasketballPeriod(event.liveData?.periodDescription);
  const { homeOdd, awayOdd } = extractVencedorOdds(event, markets, selections);
  const tempoRestante = formatTempoRestante(
    event.liveData?.clock?.secondsSinceStart,
    period,
  );

  const eventId = event.id ?? null;

  return {
    esporte: 'basquete',
    homeTeam: home.name.trim(),
    awayTeam: away.name.trim(),
    homeScore,
    awayScore,
    period,
    league: leagueName,
    homeOdd,
    awayOdd,
    tempoRestante,
    eventId,
    betanoUrl: buildBetanoEventUrl(event.url, eventId),
  };
}

function eventToFootballGame(
  event: OverviewEvent,
  leagues: Record<string, OverviewLeague>,
  markets: Record<string, OverviewMarket>,
  selections: Record<string, OverviewSelection>,
): ParsedGame | null {
  const sportId = event.sportId ?? '';
  if (!FOOT_SPORT_IDS.has(sportId)) return null;
  if (event.isLive === false) return null;

  const participants = event.participants ?? [];
  const home = participants.find((p) => p.isHome);
  const away = participants.find((p) => !p.isHome);
  if (!home?.name || !away?.name) return null;

  const homeScore = parseScore(event.liveData?.score?.home, 30);
  const awayScore = parseScore(event.liveData?.score?.away, 30);
  if (homeScore == null || awayScore == null) return null;

  const leagueId = event.leagueId;
  const leagueName =
    leagueId != null ? leagues[String(leagueId)]?.name?.trim() ?? null : null;

  if (isSimulatedFootballContext(leagueName, home.name, away.name)) return null;

  const periodDesc = event.liveData?.periodDescription;
  const period = normalizeFootballPeriod(periodDesc);
  const { homeOdd, awayOdd } = extractVencedorOdds(event, markets, selections);
  const tempoRestante = formatFootballTempoRestante(
    periodDesc,
    period,
    event.liveData?.clock?.secondsSinceStart,
  );

  const eventId = event.id ?? null;

  return {
    esporte: 'futebol',
    homeTeam: home.name.trim(),
    awayTeam: away.name.trim(),
    homeScore,
    awayScore,
    period,
    league: leagueName,
    homeOdd,
    awayOdd,
    tempoRestante,
    eventId,
    betanoUrl: buildBetanoEventUrl(event.url, eventId),
  };
}

function parseGamesFromLeagues(
  payload: BetanoOverviewPayload,
  leagueIds: number[],
  toGame: (
    event: OverviewEvent,
    leagues: Record<string, OverviewLeague>,
    markets: Record<string, OverviewMarket>,
    selections: Record<string, OverviewSelection>,
  ) => ParsedGame | null,
  esporte: Esporte,
): ParsedGame[] {
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
    const game = toGame(event, leagues, markets, selections);
    if (!game) continue;
    const key = `${esporte}|${game.homeTeam}|${game.awayTeam}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(game);
  }

  return games;
}

export function parseBasketballFromOverview(
  payload: BetanoOverviewPayload,
): ParsedGame[] {
  const leagueIds = payload.sports?.byIdLeagueIdList?.BASK ?? [];
  return parseGamesFromLeagues(payload, leagueIds, eventToBasketballGame, 'basquete');
}

export function parseFootballFromOverview(
  payload: BetanoOverviewPayload,
): ParsedGame[] {
  const leagueIds = payload.sports?.byIdLeagueIdList?.FOOT ?? [];
  return parseGamesFromLeagues(payload, leagueIds, eventToFootballGame, 'futebol');
}

/** Todos os jogos de futebol ao vivo (sem filtro de janela de coleta). */
export function parseFootballAoVivoFromOverview(
  payload: BetanoOverviewPayload,
): ParsedGame[] {
  return parseFootballFromOverview(payload);
}

/** Apenas jogos elegíveis para persistência (últimos 5 min do 2º tempo). */
export function filtrarFutebolElegivelColeta(
  payload: BetanoOverviewPayload,
): ParsedGame[] {
  const leagueIds = payload.sports?.byIdLeagueIdList?.FOOT ?? [];
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
    if (!isFutebolElegivelColeta(event)) continue;
    const game = eventToFootballGame(event, leagues, markets, selections);
    if (!game) continue;
    const key = `${game.homeTeam}|${game.awayTeam}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(game);
  }

  return games;
}

export function combinarJogosColeta(
  basquete: ParsedGame[],
  futebol: ParsedGame[],
): ParsedGame[] {
  return [...basquete, ...futebol];
}

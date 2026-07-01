/**
 * Parser futebol para estatísticas: radar (ETA 85') e janela final (placar + odd manter).
 */

import {
  type BetanoOverviewPayload,
  buildBetanoEventUrl,
  formatTempoRestante,
  normalizeFootballPeriod,
  parseMinuteFromPeriodDescription,
  type GamePeriod,
} from './betanoOverviewParse.ts';
import { buildGameKey } from './betanoRules.ts';

const FOOT_SPORT_IDS = new Set(['FOOT', 'SOCC', 'SOC']);
const SIMULATED_FOOTBALL_PATTERN =
  /efootball|e-football|fifa\s*\d|battle\s*\(|simulad|virtual|esports/i;
const ESPORTS_TEAM_PATTERN = /\([^)]+\)/;
const JANELA_MINUTO_INICIO = 85;

const TOTAL_GOLS_MARKET = /total\s*(de\s*)?gols|goal\s*line|gols\s*mais|mais\/menos\s*de\s*gols/i;
const UNDER_SELECTION = /menos\s*de|under|abaixo/i;

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
  liveData?: Record<string, unknown> & {
    score?: { home?: string; away?: string };
    periodDescription?: string;
    period?: string;
    minute?: number;
    clock?: {
      secondsSinceStart?: number;
      elapsed?: number;
      elapsedSeconds?: number;
      clockStopped?: boolean;
    };
  };
}

export interface FootballScoutSnapshot {
  eventId: number;
  gameKey: string;
  homeTeam: string;
  awayTeam: string;
  league: string | null;
  betanoUrl: string | null;
  period: GamePeriod;
  periodDescription: string | null;
  matchMinute: number | null;
  tempoDecorrido: string | null;
  homeScore: number;
  awayScore: number;
  minutesUntil85: number | null;
  eta85: string | null;
  inFinalWindow: boolean;
  isFinished: boolean;
  oddManterPlacar: number;
  mercadoNome: string | null;
  linhaGols: number | null;
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

function extractClockSeconds(liveData: OverviewEvent['liveData']): number | null {
  if (!liveData) return null;
  const clock = liveData.clock;
  if (clock) {
    for (const key of ['secondsSinceStart', 'elapsed', 'elapsedSeconds', 'seconds'] as const) {
      const v = clock[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
    }
  }
  for (const key of ['secondsSinceStart', 'elapsedSeconds', 'elapsed', 'gameTime'] as const) {
    const v = liveData[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  }
  if (typeof liveData.minute === 'number' && liveData.minute >= 0) {
    return Math.floor(liveData.minute) * 60;
  }
  return null;
}

function inferPeriodFromMinute(minute: number | null, period: GamePeriod): GamePeriod {
  if (period !== 'unknown') return period;
  if (minute == null) return period;
  if (minute <= 45) return '1T';
  return '2T';
}

/** Amostra liveData bruto para diagnóstico (debug). */
export function probeFootballLiveDataFromPayload(
  payload: BetanoOverviewPayload,
  limit = 3,
): { rootTimeKeys: string[]; samples: Record<string, unknown>[] } {
  const leagueIds = payload.sports?.byIdLeagueIdList?.FOOT ?? [];
  const leagueSet = new Set(leagueIds);
  const rootTimeKeys = Object.keys(payload).filter((k) => /clock|time|timer|score|live/i.test(k));
  const samples: Record<string, unknown>[] = [];

  for (const event of Object.values(payload.events ?? {})) {
    if (!event.leagueId || !leagueSet.has(event.leagueId)) continue;
    const ev = event as Record<string, unknown>;
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ev)) {
      if (/live|time|clock|period|minute|score|elapsed/i.test(k)) extra[k] = v;
    }
    samples.push({
      eventId: ev.id,
      sportId: ev.sportId,
      liveData: ev.liveData ?? null,
      extra,
    });
    if (samples.length >= limit) break;
  }

  return { rootTimeKeys, samples };
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

/** Minuto de jogo (aprox.) a partir do relógio exibido ou do clock da API. */
export function getMatchMinute(
  periodDescription: string | undefined,
  period: GamePeriod = 'unknown',
  clockSeconds: number | null | undefined = null,
): number | null {
  const fromDesc = parseMinuteFromPeriodDescription(periodDescription);
  if (fromDesc != null) return fromDesc;
  if (clockSeconds == null || clockSeconds < 0) return null;
  if (period === 'INT') return 45;
  return Math.floor(clockSeconds / 60);
}

function formatarTempoDecorrido(
  periodDescription: string | null | undefined,
  period: GamePeriod,
  matchMinute: number | null,
  clockSeconds: number | null | undefined,
): string | null {
  const desc = periodDescription?.trim();
  if (desc) return desc;
  if (clockSeconds != null && clockSeconds >= 0 && period !== 'INT') {
    const periodoRelogio = period === 'unknown' ? '2T' : period;
    return formatTempoRestante(clockSeconds, periodoRelogio);
  }
  if (matchMinute != null) return `${matchMinute}'`;
  return null;
}

/** Minutos até o minuto 85 (entrada na janela dos 5 finais). */
export function estimarMinutosAte85(
  period: GamePeriod,
  matchMinute: number | null,
): number | null {
  if (period === 'FT') return null;
  if (period === 'INT') return 15 + (JANELA_MINUTO_INICIO - 45);
  if (matchMinute == null) return null;
  if (matchMinute >= JANELA_MINUTO_INICIO) return 0;
  if (matchMinute <= 45) {
    return (45 - matchMinute) + 15 + (JANELA_MINUTO_INICIO - 45);
  }
  return JANELA_MINUTO_INICIO - matchMinute;
}

export function isFutebolEmJanelaFinal(
  period: GamePeriod,
  matchMinute: number | null,
): boolean {
  if (period === 'FT') return false;
  if (period === 'INT' || period === '1T') return false;
  if (matchMinute != null && matchMinute >= JANELA_MINUTO_INICIO) return true;
  return false;
}

export function isFutebolPartidaEncerrada(
  period: GamePeriod,
  isLive: boolean | undefined,
): boolean {
  if (period === 'FT') return true;
  if (isLive === false) return true;
  return false;
}

function parseLineFromSelectionName(name: string): number | null {
  const m = name.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function extractOddManterPlacar(
  event: OverviewEvent,
  markets: Record<string, OverviewMarket>,
  selections: Record<string, OverviewSelection>,
  homeScore: number,
  awayScore: number,
): { odd: number; mercadoNome: string | null; linhaGols: number | null } {
  const linhaAlvo = homeScore + awayScore + 0.5;
  const idsToTry = new Set<number>([
    ...(event.marketIdList ?? []),
    ...Object.values(markets)
      .map((m) => m.id)
      .filter((id): id is number => id != null),
  ]);

  for (const id of idsToTry) {
    const market = markets[String(id)];
    if (!market?.name || !TOTAL_GOLS_MARKET.test(market.name)) continue;

    const sels = (market.selectionIdList ?? [])
      .map((sid) => selections[String(sid)])
      .filter((s): s is OverviewSelection => Boolean(s));

    for (const sel of sels) {
      const label = `${sel.name ?? ''} ${sel.fullName ?? ''}`.trim();
      if (!UNDER_SELECTION.test(label)) continue;
      const linha = parseLineFromSelectionName(label);
      if (linha == null) continue;
      if (Math.abs(linha - linhaAlvo) > 0.01 && Math.abs(linha - (homeScore + awayScore)) > 0.51) {
        continue;
      }
      const odd = parseOdd(sel.price);
      if (odd > 0) {
        return { odd, mercadoNome: market.name.trim(), linhaGols: linha };
      }
    }
  }

  return { odd: 0, mercadoNome: null, linhaGols: linhaAlvo };
}

function eventToFootballScout(
  event: OverviewEvent,
  leagues: Record<string, { name?: string }>,
  markets: Record<string, OverviewMarket>,
  selections: Record<string, OverviewSelection>,
  now: Date,
): FootballScoutSnapshot | null {
  const sportId = event.sportId ?? '';
  if (!FOOT_SPORT_IDS.has(sportId)) return null;
  if (event.isLive === false && normalizeFootballPeriod(event.liveData?.periodDescription) !== 'FT') {
    return null;
  }

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

  const periodDesc = event.liveData?.periodDescription
    ?? (typeof event.liveData?.period === 'string' ? event.liveData.period : null);
  let period = normalizeFootballPeriod(periodDesc ?? undefined);
  const clockSeconds = extractClockSeconds(event.liveData);
  let matchMinute = getMatchMinute(periodDesc ?? undefined, period, clockSeconds);
  period = inferPeriodFromMinute(matchMinute, period);
  matchMinute = getMatchMinute(periodDesc ?? undefined, period, clockSeconds);
  const tempoDecorrido = formatarTempoDecorrido(periodDesc, period, matchMinute, clockSeconds);
  const minutesUntil85 = estimarMinutosAte85(period, matchMinute);
  const eta85 = minutesUntil85 != null
    ? new Date(now.getTime() + minutesUntil85 * 60_000).toISOString()
    : null;

  const { odd, mercadoNome, linhaGols } = extractOddManterPlacar(
    event,
    markets,
    selections,
    homeScore,
    awayScore,
  );

  const eventId = event.id;
  if (eventId == null) return null;

  return {
    eventId,
    gameKey: buildGameKey('futebol', home.name.trim(), away.name.trim()),
    homeTeam: home.name.trim(),
    awayTeam: away.name.trim(),
    league: leagueName,
    betanoUrl: buildBetanoEventUrl(event.url, eventId),
    period,
    periodDescription: periodDesc,
    matchMinute,
    tempoDecorrido,
    homeScore,
    awayScore,
    minutesUntil85,
    eta85,
    inFinalWindow: isFutebolEmJanelaFinal(period, matchMinute),
    isFinished: isFutebolPartidaEncerrada(period, event.isLive),
    oddManterPlacar: odd,
    mercadoNome,
    linhaGols,
  };
}

export function parseFootballScoutFromOverview(
  payload: BetanoOverviewPayload,
  now: Date = new Date(),
): FootballScoutSnapshot[] {
  const leagueIds = payload.sports?.byIdLeagueIdList?.FOOT ?? [];
  if (leagueIds.length === 0) return [];

  const leagueSet = new Set(leagueIds);
  const leagues = payload.leagues ?? {};
  const events = payload.events ?? {};
  const markets = payload.markets ?? {};
  const selections = payload.selections ?? {};
  const out: FootballScoutSnapshot[] = [];
  const seen = new Set<number>();

  for (const event of Object.values(events)) {
    if (!event.leagueId || !leagueSet.has(event.leagueId)) continue;
    const snap = eventToFootballScout(event, leagues, markets, selections, now);
    if (!snap || seen.has(snap.eventId)) continue;
    seen.add(snap.eventId);
    out.push(snap);
  }

  return out;
}

export function snapshotsEmJanelaFinal(snapshots: FootballScoutSnapshot[]): FootballScoutSnapshot[] {
  return snapshots.filter((s) => s.inFinalWindow && !s.isFinished);
}

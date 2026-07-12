/**
 * Coleta futebol ao vivo da Betano (danae-webapi) a partir da nuvem Supabase.
 * Sem cookie de conta — apenas endpoints publicos.
 *
 * POST/GET /functions/v1/betano-futebol-live
 * Header opcional: x-cron-secret (se CRON_SECRET estiver definido)
 *
 * Telegram (captura +0,5): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_NOTIFY_CAPTURE=1
 * GREEN/RED: mesma flag; uma notificacao por liquidacao (sem lembrete).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  notifyTelegramCaptureOffer,
  notifyTelegramSettleOnce,
  processPendingTelegramReminders,
  processPendingTelegramSettlements,
} from "../_shared/telegram-capture-notify.ts";
import {
  canCaptureNeedLineFromHctg,
  minHctgOverLine,
  needLineOverFromHctg,
  trimHctgLinesForMatch,
  type HctgSnapshot,
} from "../_shared/hctg-match-totals.ts";
import {
  assertColetaAtiva,
  beginColetaEpoch,
  ColetaPausadaError,
  isColetaAtiva,
} from "../_shared/coleta-ativa.ts";
import { insertSistemaLog, matchLabel } from "../_shared/sistema-log.ts";

const BETANO_BASE = "https://www.betano.bet.br";
const OVERVIEW_URL =
  `${BETANO_BASE}/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8`;
const MIN_MINUTE_DEFAULT = 85;
const USER_AGENT =
  "Mozilla/5.0 (compatible; BetanoMonitor/1.0; +https://supabase.com)";

type Json = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function betanoGet(
  supabase: ReturnType<typeof createClient>,
  url: string,
  epoch: string,
  referer = `${BETANO_BASE}/live/`,
): Promise<unknown> {
  await assertColetaAtiva(supabase, "betano-json", epoch);
  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9",
      Referer: referer,
      Origin: BETANO_BASE,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Betano HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

/** Slots over/under a partir da linha principal do overview (aba Total de Gols). */
function buildTotalsFromHctgSnapshot(snap: HctgSnapshot, goalsTotal: number): TotalsOdds {
  const lines = trimHctgLinesForMatch(snap.lines, goalsTotal);
  if (!lines.length) {
    return { ...EMPTY_TOTALS_ODDS, elevated_over_lines: [] };
  }
  const loose = lines
    .filter((l) => l.over != null)
    .map((l) => ({
      line: l.line,
      overOdd: l.over as number,
      underOdd: l.under ?? undefined,
    }));
  let totals = totalsFromLooseGoals(loose, goalsTotal);
  const minLine = minHctgOverLine(lines);
  if (minLine != null) totals.min_over_absolute_line = minLine;
  const needLine = goalsTotal + 0.5;
  totals.elevated_over_lines = lines
    .filter((l) => l.over != null && l.line > needLine + 0.01)
    .map((l) => ({ line: l.line, odd: l.over as number }));
  totals.elevated_over_seen = totals.elevated_over_lines.length > 0;
  return canonicalizeTotalsOver05(totals, goalsTotal);
}

function mercadoHadElevatedFromHctg(snap: HctgSnapshot, goalsTotal: number): boolean {
  const lines = trimHctgLinesForMatch(snap.lines, goalsTotal);
  if (canCaptureNeedLineFromHctg(lines, goalsTotal)) return false;
  const minLine = minHctgOverLine(lines);
  return minLine != null && minLine > goalsTotal + 0.5 + 0.01;
}


/** HCTG vem do worker HTML local — Edge so le do BD. Nunca gera odds HCTG via JSON. */
const EMPTY_HCTG: HctgSnapshot = { lines: [], source: "pending", marketIds: [] };

function hctgSnapshotFromDbRow(row: Json | null | undefined): HctgSnapshot {
  if (!row) return { ...EMPTY_HCTG };
  const raw = row.hctg_lines;
  const lines = Array.isArray(raw) ? raw as HctgSnapshot["lines"] : [];
  const source = row.hctg_source != null ? String(row.hctg_source) : "pending";
  return { lines, source, marketIds: [] };
}

async function loadHctgSnapshotsByEvent(
  supabase: ReturnType<typeof createClient>,
  eventIds: string[],
): Promise<Map<string, HctgSnapshot>> {
  const map = new Map<string, HctgSnapshot>();
  if (!eventIds.length) return map;
  const { data } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id,hctg_lines,hctg_source")
    .in("event_id", eventIds);
  for (const row of data ?? []) {
    map.set(String(row.event_id), hctgSnapshotFromDbRow(row as Json));
  }
  return map;
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

function eventsMap(overview: Json): Json {
  const events = overview.events;
  if (Array.isArray(events)) {
    const map: Json = {};
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const id = rec.id ?? rec.eventId;
      if (id != null) map[String(id)] = rec;
    }
    return map;
  }
  return asRecord(events) ?? {};
}

function leaguesMap(overview: Json): Json {
  return asRecord(overview.leagues) ?? asRecord(overview.leaguesById) ?? {};
}

function isFootballEvent(event: Json, overview: Json): boolean {
  if (event.isOutrightEvent === true) return false;
  const participants = event.participants;
  if (!Array.isArray(participants) || participants.length < 2) return false;

  const names = participants
    .map((p) => String(asRecord(p)?.name ?? ""))
    .join(" ")
    .toLowerCase();
  if (names.includes("esports") || names.includes("e-sports")) return false;

  const sportId = event.sportId ?? event.sportTypeId;
  if (sportId === 1 || sportId === "1" || sportId === "FOOT") return true;

  const sportKey = String(event.sportKey ?? event.sport ?? "").toUpperCase();
  if (sportKey === "FOOT" || sportKey.includes("FOOTBALL") || sportKey.includes("SOCCER")) {
    return true;
  }

  const leagueId = event.leagueId ?? event.competitionId;
  const sports = asRecord(overview.sports);
  const byId = asRecord(sports?.byId);
  const foot = asRecord(byId?.FOOT);
  const leagueIds = foot?.leagueIdList;
  if (leagueId != null && Array.isArray(leagueIds)) {
    return leagueIds.map(String).includes(String(leagueId));
  }

  // fallback: se overview so lista futebol no FOOT zone lists
  const byIdLeague = asRecord(sports?.byIdLeagueIdList);
  const footLeagues = byIdLeague?.FOOT;
  if (leagueId != null && Array.isArray(footLeagues)) {
    return footLeagues.map(String).includes(String(leagueId));
  }

  return false;
}

function extractMinute(event: Json): number | null {
  const direct = toInt(
    event.minute ??
      event.matchMinute ??
      event.elapsed ??
      event.totalElapsedMinutes ??
      event.time ??
      event.gameTime,
  );
  if (direct != null) return direct;

  const seconds = toInt(
    event.totalElapsedSeconds ??
      event.elapsedSeconds ??
      event.matchTimeInSeconds ??
      event.seconds,
  );
  if (seconds != null) return Math.floor(seconds / 60);

  const liveData = asRecord(event.liveData) ?? asRecord(event.live) ??
    asRecord(event.match) ?? asRecord(event.game);
  if (liveData) {
    const m = toInt(
      liveData.minute ??
        liveData.elapsed ??
        liveData.matchMinute ??
        liveData.time ??
        liveData.gameMinute,
    );
    if (m != null) return m;
    const liveClock = asRecord(liveData.clock);
    const s = toInt(
      liveData.totalElapsedSeconds ??
        liveData.elapsedSeconds ??
        liveData.seconds ??
        liveClock?.secondsSinceStart ??
        liveClock?.seconds,
    );
    if (s != null) return Math.floor(s / 60);
  }

  const clock = asRecord(event.clock) ?? asRecord(event.matchClock) ??
    asRecord(liveData?.clock);
  if (clock) {
    const m = toInt(clock.minute ?? clock.elapsed ?? clock.minutes);
    if (m != null) return m;
    const s = toInt(
      clock.secondsSinceStart ??
        clock.seconds ??
        clock.playedSeconds ??
        clock.totalSeconds,
    );
    if (s != null) return Math.floor(s / 60);
  }

  const status = asRecord(event.matchStatus) ?? asRecord(event.status) ??
    asRecord(event.eventStatus);
  if (status) {
    const m = toInt(status.minute ?? status.elapsed ?? status.time);
    if (m != null) return m;
    // "87:12" / "87'"
    const desc = String(status.description ?? status.name ?? status.short ?? "");
    const mm = desc.match(/(\d{1,3})\s*[:'′]/);
    if (mm) return toInt(mm[1]);
  }

  // campos soltos tipo "87:00"
  for (const key of ["matchTime", "displayTime", "timeDescription", "periodDescription"]) {
    const text = event[key];
    if (typeof text === "string") {
      const mm = text.match(/(\d{1,3})\s*[:'′]/);
      if (mm) return toInt(mm[1]);
    }
  }

  return null;
}

function extractInjuryTime(event: Json): number | null {
  return toInt(
    event.injuryTime ??
      event.additionalTime ??
      event.extraTime ??
      asRecord(event.clock)?.injuryTime ??
      asRecord(event.liveData)?.injuryTime,
  );
}

function extractScore(event: Json): { home: number | null; away: number | null; text: string } {
  const scoreObj = asRecord(event.score) ?? asRecord(event.scores) ??
    asRecord(asRecord(event.liveData)?.score);
  let home = toInt(scoreObj?.home ?? scoreObj?.Home);
  let away = toInt(scoreObj?.away ?? scoreObj?.Away);

  if (home == null || away == null) {
    const results = event.results ?? event.result;
    if (Array.isArray(results) && results.length >= 2) {
      home = toInt(asRecord(results[0])?.value ?? results[0]);
      away = toInt(asRecord(results[1])?.value ?? results[1]);
    }
  }

  if ((home == null || away == null) && typeof event.score === "string") {
    const m = String(event.score).match(/(\d+)\s*[-:]\s*(\d+)/);
    if (m) {
      home = toInt(m[1]);
      away = toInt(m[2]);
    }
  }

  const text = home != null && away != null ? `${home}-${away}` : "—";
  return { home, away, text };
}

function extractTeams(event: Json): { home: string | null; away: string | null } {
  const participants = event.participants ?? event.teams;
  if (Array.isArray(participants) && participants.length >= 2) {
    let home: string | null = null;
    let away: string | null = null;
    for (const p of participants) {
      const rec = asRecord(p);
      if (!rec) continue;
      const name = String(rec.name ?? rec.participantName ?? rec.shortName ?? "");
      const isHome = rec.isHome === true || rec.side === "home" || rec.venueRole === "Home";
      const isAway = rec.isHome === false || rec.side === "away" || rec.venueRole === "Away";
      if (isHome) home = name || home;
      else if (isAway) away = name || away;
    }
    if (!home) home = String(asRecord(participants[0])?.name ?? "") || null;
    if (!away) away = String(asRecord(participants[1])?.name ?? "") || null;
    return { home, away };
  }

  return {
    home: event.home != null ? String(event.home) : (asRecord(event.homeTeam)?.name as string) ?? null,
    away: event.away != null ? String(event.away) : (asRecord(event.awayTeam)?.name as string) ?? null,
  };
}

function extractLeague(event: Json, leagues: Json): { league: string | null; country: string | null } {
  const leagueId = event.leagueId ?? event.competitionId;
  const leagueRec = leagueId != null ? asRecord(leagues[String(leagueId)]) : null;
  return {
    league: leagueRec?.name != null
      ? String(leagueRec.name)
      : event.leagueName != null
      ? String(event.leagueName)
      : null,
    country: leagueRec?.regionName != null
      ? String(leagueRec.regionName)
      : leagueRec?.country != null
      ? String(leagueRec.country)
      : null,
  };
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function betanoUrl(eventId: string, home: string | null, away: string | null): string {
  const slug = [home, away].filter(Boolean).map((s) => slugify(String(s))).join("-") || "evento";
  return `${BETANO_BASE}/live/${slug}/${eventId}/`;
}

function extractMlOdds(
  eventId: string,
  overview: Json,
): {
  home: number | null;
  draw: number | null;
  away: number | null;
  matchedMarket: string | null;
  matchedTypeId: string | null;
  marketCount: number;
} {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const event = asRecord(eventsMap(overview)[eventId]);
  const marketIds: string[] = [];

  if (Array.isArray(event?.marketIdList)) {
    marketIds.push(...event.marketIdList.map(String));
  }
  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec) continue;
    if (String(rec.eventId ?? rec.eventID ?? "") === eventId) marketIds.push(mid);
  }

  let marketCount = 0;
  for (const mid of marketIds) {
    const market = asRecord(markets[mid]);
    if (!market) continue;
    marketCount += 1;
    const name = String(market.name ?? market.typeName ?? market.marketType ?? "").toLowerCase();
    const typeId = String(market.typeId ?? market.marketTypeId ?? "");
    const is1x2 =
      name.includes("resultado") ||
      name.includes("1x2") ||
      name === "ml" ||
      typeId === "1" ||
      typeId === "100";
    if (!is1x2) continue;
    // Mercado suspenso/fechado no overview → tratar como ausente (nao reaproveitar preco fantasma).
    const mStatus = String(market.status ?? market.tradingStatus ?? market.marketStatus ?? "")
      .toLowerCase();
    if (
      market.suspended === true ||
      market.isSuspended === true ||
      mStatus.includes("suspend") ||
      mStatus === "closed" ||
      mStatus === "settled" ||
      mStatus === "deactivated"
    ) {
      continue;
    }

    const selIds = Array.isArray(market.selectionIdList)
      ? market.selectionIdList.map(String)
      : Object.keys(selections).filter((sid) => {
        const s = asRecord(selections[sid]);
        return s && String(s.marketId ?? "") === mid;
      });

    let home: number | null = null;
    let draw: number | null = null;
    let away: number | null = null;
    for (const sid of selIds) {
      const sel = asRecord(selections[sid]);
      if (!sel) continue;
      const sStatus = String(sel.status ?? sel.tradingStatus ?? "").toLowerCase();
      if (
        sel.suspended === true ||
        sel.isSuspended === true ||
        sStatus.includes("suspend") ||
        sStatus === "closed" ||
        sStatus === "settled"
      ) {
        continue;
      }
      const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
      if (price == null || !(price >= 1.001)) continue;
      const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
      const stype = String(sel.type ?? sel.outcomeType ?? "").toLowerCase();
      // Nao usar isHome===false: marca draw/outros e inverte casa/fora.
      if (sname === "x" || sname.includes("empate") || stype.includes("draw")) draw = price;
      else if (
        sname === "1" ||
        stype === "home" ||
        stype.includes("home") ||
        sel.isHome === true
      ) home = price;
      else if (
        sname === "2" ||
        stype === "away" ||
        stype.includes("away") ||
        sel.isAway === true
      ) away = price;
    }
    // Exige casa+fora: 1X2 incompleto = mercado inutilizavel.
    if (home != null && away != null) {
      return {
        home,
        draw,
        away,
        matchedMarket: String(market.name ?? market.typeName ?? mid),
        matchedTypeId: typeId || null,
        marketCount,
      };
    }
  }

  return {
    home: null,
    draw: null,
    away: null,
    matchedMarket: null,
    matchedTypeId: null,
    marketCount,
  };
}

/** Analise favorito 1X2: odd inicial → máximo → vitória? */
type FavoritoDriftRow = {
  event_id: string;
  favorito_lado: "home" | "away";
  odd_inicial: number;
  odd_max: number;
  status: string;
  ml_home_inicial?: number | null;
  ml_away_inicial?: number | null;
};

function pickFavoritoLado(
  mlHome: number,
  mlAway: number,
): { lado: "home" | "away"; odd: number } {
  // Empate de odd → home (lado fixo na abertura).
  if (mlAway < mlHome) return { lado: "away", odd: mlAway };
  return { lado: "home", odd: mlHome };
}

/** Se o favorito gravado nao e o menor odd do par inicial, corrige o lado. */
function repairFavoritoIfInverted(
  lado: "home" | "away",
  oddInicial: number,
  homeIni: number | null,
  awayIni: number | null,
): { lado: "home" | "away"; odd: number; repaired: boolean } {
  if (homeIni == null || awayIni == null) {
    return { lado, odd: oddInicial, repaired: false };
  }
  const correct = pickFavoritoLado(homeIni, awayIni);
  if (correct.lado === lado) {
    return { lado, odd: oddInicial, repaired: false };
  }
  return { lado: correct.lado, odd: correct.odd, repaired: true };
}

function favoritoVenceuFromScore(
  lado: "home" | "away",
  homeScore: number | null,
  awayScore: number | null,
): boolean | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore === awayScore) return null; // empate
  const homeWin = homeScore > awayScore;
  return lado === "home" ? homeWin : !homeWin;
}

async function processFavoritoDriftLive(
  supabase: ReturnType<typeof createClient>,
  input: {
    event_id: string;
    home: string | null;
    away: string | null;
    league: string | null;
    country: string | null;
    betano_url: string | null;
    minute: number | null;
    home_score: number | null;
    away_score: number | null;
    score_text: string | null;
    ml_home: number | null;
    ml_draw: number | null;
    ml_away: number | null;
  },
): Promise<"opened" | "updated" | "skipped"> {
  const { ml_home, ml_away } = input;
  const mlOk =
    ml_home != null &&
    ml_away != null &&
    ml_home >= 1.001 &&
    ml_away >= 1.001;

  const nowIso = new Date().toISOString();
  const { data: prev } = await supabase
    .from("futebol_favorito_drift")
    .select("event_id,favorito_lado,odd_inicial,odd_max,status,ml_home_inicial,ml_away_inicial")
    .eq("event_id", input.event_id)
    .maybeSingle();

  const row = prev as FavoritoDriftRow | null;
  if (row?.status === "settled") return "skipped";

  if (!row) {
    // Odd "inicial": so abre se o jogo ainda esta nos primeiros N minutos.
    // Sem minuto (kickoff / clock ausente) tambem aceita.
    // Teste: secret FAVORITO_OPEN_MAX_MINUTE=90 (depois voltar para 5).
    if (!mlOk) return "skipped";
    const openMaxMinute = Math.max(
      0,
      Number(Deno.env.get("FAVORITO_OPEN_MAX_MINUTE") || "5") || 5,
    );
    if (input.minute != null && input.minute > openMaxMinute) return "skipped";

    const pick = pickFavoritoLado(ml_home!, ml_away!);
    const nome = pick.lado === "home" ? input.home : input.away;
    await supabase.from("futebol_favorito_drift").insert({
      event_id: input.event_id,
      home: input.home,
      away: input.away,
      league: input.league,
      country: input.country,
      betano_url: input.betano_url,
      favorito_lado: pick.lado,
      favorito_nome: nome,
      odd_inicial: pick.odd,
      minuto_inicial: input.minute,
      minuto_atual: input.minute,
      odd_atual: pick.odd,
      odd_max: pick.odd,
      minuto_odd_max: input.minute,
      ml_home_inicial: ml_home,
      ml_away_inicial: ml_away,
      ml_home_atual: ml_home,
      ml_draw_atual: input.ml_draw,
      ml_away_atual: ml_away,
      placar_atual: input.score_text,
      home_score: input.home_score,
      away_score: input.away_score,
      status: "watching",
      first_seen_at: nowIso,
      updated_at: nowIso,
    });
    return "opened";
  }

  // Linha ja aberta: sempre atualiza relogio/placar (mesmo se 1X2 sumiu).
  const clockPatch: Record<string, unknown> = {
    home: input.home,
    away: input.away,
    league: input.league,
    country: input.country,
    betano_url: input.betano_url,
    minuto_atual: input.minute,
    placar_atual: input.score_text,
    home_score: input.home_score,
    away_score: input.away_score,
    updated_at: nowIso,
  };

  if (!mlOk) {
    // #region agent log
    await insertSistemaLog(supabase, {
      level: "info",
      source: "debug-230425",
      action: "favorito_ml_missing",
      message: "1X2 ausente — limpando odd_atual/ml_*_atual",
      event_id: input.event_id,
      match_label: matchLabel(input.home, input.away),
      payload: {
        hypothesisId: "H1",
        ml_home,
        ml_away,
        minuto: input.minute,
        score: input.score_text,
        clearedOdds: true,
      },
    });
    // #endregion
    // Mercado Vencedor fechado/suspenso: nao manter odd fantasma na tabela.
    await supabase
      .from("futebol_favorito_drift")
      .update({
        ...clockPatch,
        odd_atual: null,
        ml_home_atual: null,
        ml_draw_atual: null,
        ml_away_atual: null,
      })
      .eq("event_id", input.event_id);
    return "updated";
  }

  const homeIniPrev = Number(row.ml_home_inicial);
  const awayIniPrev = Number(row.ml_away_inicial);
  const homeIniOk = Number.isFinite(homeIniPrev) && homeIniPrev >= 1.01 ? homeIniPrev : null;
  const awayIniOk = Number.isFinite(awayIniPrev) && awayIniPrev >= 1.01 ? awayIniPrev : null;
  const oddIniPrev = Number(row.odd_inicial);
  const repaired = repairFavoritoIfInverted(
    row.favorito_lado === "away" ? "away" : "home",
    Number.isFinite(oddIniPrev) && oddIniPrev >= 1.01 ? oddIniPrev : ml_home!,
    homeIniOk,
    awayIniOk,
  );

  const lado = repaired.lado;
  const oddInicial = repaired.odd;
  const oddAtual = lado === "home" ? ml_home! : ml_away!;
  let oddMax = repaired.repaired ? oddAtual : Number(row.odd_max);
  if (!(Number.isFinite(oddMax) && oddMax >= 1.01)) oddMax = oddAtual;
  let minutoMax: number | null | undefined = repaired.repaired ? input.minute : undefined;
  if (oddAtual > oddMax + 0.001) {
    oddMax = oddAtual;
    minutoMax = input.minute;
  }
  if (repaired.repaired && oddInicial > oddMax) oddMax = oddInicial;

  const patch: Record<string, unknown> = {
    ...clockPatch,
    odd_atual: oddAtual,
    odd_max: oddMax,
    ml_home_atual: ml_home,
    ml_draw_atual: input.ml_draw,
    ml_away_atual: ml_away,
  };
  if (repaired.repaired) {
    patch.favorito_lado = lado;
    patch.favorito_nome = lado === "home" ? input.home : input.away;
    patch.odd_inicial = oddInicial;
    patch.minuto_odd_max = input.minute;
  }
  // Backfill seguro: nunca sobrescrever o par inicial com odds atuais (inverte o favorito na UI).
  // So completa o lado do favorito a partir de odd_inicial quando a coluna ainda e nula.
  if (homeIniOk == null && lado === "home") patch.ml_home_inicial = oddInicial;
  if (awayIniOk == null && lado === "away") patch.ml_away_inicial = oddInicial;
  if (homeIniOk == null && lado === "away" && ml_home != null) {
    // rival ausente: so preenche se for maior que o favorito (consistente)
    if (ml_home > oddInicial) patch.ml_home_inicial = ml_home;
  }
  if (awayIniOk == null && lado === "home" && ml_away != null) {
    if (ml_away > oddInicial) patch.ml_away_inicial = ml_away;
  }
  if (minutoMax !== undefined) patch.minuto_odd_max = minutoMax;

  await supabase.from("futebol_favorito_drift").update(patch).eq("event_id", input.event_id);
  return "updated";
}

async function finalizeFavoritoDriftOffLive(
  supabase: ReturnType<typeof createClient>,
  liveIds: string[],
): Promise<{ settled: number }> {
  const liveSet = new Set(liveIds.map(String));
  const { data: watching } = await supabase
    .from("futebol_favorito_drift")
    .select(
      "event_id,favorito_lado,home_score,away_score,placar_atual,screenshot_path",
    )
    .eq("status", "watching");

  let settled = 0;
  const nowIso = new Date().toISOString();
  const FAVORITO_SHOT_BUCKET = "betano-screenshot-debug";
  for (const row of watching ?? []) {
    const eventId = String(row.event_id);
    if (liveSet.has(eventId)) continue;

    // Placar final: historico se disponivel, senao ultimo placar visto
    const { data: hist } = await supabase
      .from("futebol_historico_jogos")
      .select("home_score,away_score,score,is_live,last_seen_at")
      .eq("event_id", eventId)
      .maybeSingle();

    // Grace: so settle se historico ja nao esta live (ou sumiu do overview ha tempo)
    if (hist?.is_live === true) continue;

    const homeScore = hist?.home_score ?? row.home_score ?? null;
    const awayScore = hist?.away_score ?? row.away_score ?? null;
    const placar =
      hist?.score ??
      row.placar_atual ??
      (homeScore != null && awayScore != null ? `${homeScore}-${awayScore}` : null);
    const lado = row.favorito_lado === "away" ? "away" : "home";
    const venceu = favoritoVenceuFromScore(lado, homeScore, awayScore);

    // Fase 2: apaga print do odd inicial apos o fim do jogo
    const shotPath = row.screenshot_path ? String(row.screenshot_path) : null;
    if (shotPath) {
      try {
        await supabase.storage.from(FAVORITO_SHOT_BUCKET).remove([shotPath]);
      } catch (err) {
        console.warn(
          `[favorito] falha ao apagar screenshot ${eventId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    await supabase.from("futebol_favorito_drift").update({
      status: "settled",
      placar_final: placar,
      home_score: homeScore,
      away_score: awayScore,
      favorito_venceu: venceu,
      settled_at: nowIso,
      updated_at: nowIso,
      screenshot_path: null,
      screenshot_url: null,
      screenshot_captured_at: null,
      screenshot_minuto: null,
    }).eq("event_id", eventId);
    settled += 1;
  }
  return { settled };
}

/** Totais Under/Over: slot 0/1/2 = +0.5 / +1.5 / +2.5 gols a partir do placar atual. */
type TotalsOdds = {
  under_0_line: number | null;
  under_0_odd: number | null;
  under_1_line: number | null;
  under_1_odd: number | null;
  under_2_line: number | null;
  under_2_odd: number | null;
  over_0_line: number | null;
  over_0_odd: number | null;
  over_1_line: number | null;
  over_1_odd: number | null;
  over_2_line: number | null;
  over_2_odd: number | null;
  /** Over acima do +0,5 (ex.: Mais de 5,5) sem slot 0/1/2 — fase elevada antes do +0,5. */
  elevated_over_seen: boolean;
  /** Menor linha Over absoluta vista (ex.: Mais de 4,5 no placar 1-0). */
  min_over_absolute_line: number | null;
  /** Linhas Over acima do +0,5 fora dos slots 0/1/2. */
  elevated_over_lines: Array<{ line: number; odd: number }>;
};

type OddSlot = { line: number | null; odd: number | null; kind: MarketLineMode | null };

const EMPTY_TOTALS_ODDS: TotalsOdds = {
  under_0_line: null,
  under_0_odd: null,
  under_1_line: null,
  under_1_odd: null,
  under_2_line: null,
  under_2_odd: null,
  over_0_line: null,
  over_0_odd: null,
  over_1_line: null,
  over_1_odd: null,
  over_2_line: null,
  over_2_odd: null,
  elevated_over_seen: false,
  min_over_absolute_line: null,
  elevated_over_lines: [],
};

const REMAINING_LINES = [0.5, 1.5, 2.5];

type MarketLineMode = "remaining" | "absolute";

function parseGoalLineFromSelectionName(text: string): number | null {
  const t = String(text).toLowerCase();
  if (
    !t.includes("menos") && !t.includes("mais") && !t.includes("under") &&
    !t.includes("over")
  ) {
    return null;
  }
  const m = t.match(/(\d+[.,]\d+|\d+)/);
  if (!m) return null;
  return toNum(m[1].replace(",", "."));
}

function marketLineMode(rec: Json): MarketLineMode | null {
  const name = String(rec.name ?? rec.typeName ?? rec.marketType ?? "").toLowerCase();
  const typeName = String(rec.typeName ?? "").toLowerCase();
  const combined = `${name} ${typeName}`;

  if (
    combined.includes("escanteio") || combined.includes("corner") ||
    combined.includes("cartão") || combined.includes("cartao") || combined.includes("card") ||
    combined.includes("chute") && !combined.includes("gol") ||
    combined.includes("shot") && !combined.includes("goal")
  ) {
    return null;
  }

  if (
    combined.includes("restante") || combined.includes("remaining") ||
    combined.includes("rest of") || combined.includes("restantes")
  ) {
    return "remaining";
  }

  if (
    (combined.includes("total") || combined.includes("gols") || combined.includes("goal")) &&
    (combined.includes("gol") || combined.includes("goal") || combined.includes("gols"))
  ) {
    return "absolute";
  }

  if (
    (combined.includes("mais") || combined.includes("menos") || combined.includes("over") ||
      combined.includes("under")) &&
    (combined.includes("gol") || combined.includes("goal"))
  ) {
    return "remaining";
  }

  return null;
}

/** Mapeia linha Betano para slot 0/1/2 conforme modo do mercado. */
function slotForLine(
  selLine: number,
  goalsTotal: number,
  mode: MarketLineMode,
): number | null {
  if (mode === "remaining") {
    for (let i = 0; i < 3; i++) {
      if (Math.abs(selLine - REMAINING_LINES[i]) < 0.01) return i;
    }
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (Math.abs(selLine - (goalsTotal + REMAINING_LINES[i])) < 0.01) return i;
  }
  return null;
}

/** Linha Over acima do minimo +0,5 (nao mapeada nos slots 0/1/2). */
function isElevatedOverLine(
  selLine: number,
  goalsTotal: number,
  mode: MarketLineMode,
): boolean {
  if (mode === "remaining") return selLine >= 1.5 - 0.01;
  return selLine > goalsTotal + 0.5 + 0.01;
}

/** Fase so com linhas Over elevadas (+1,5/+2,5), sem +0,5 real no mesmo snapshot. */
function mercadoHadElevatedOverPhase(totals: TotalsOdds, goalsTotal: number): boolean {
  if (canCaptureTrueOver05(totals, goalsTotal)) return false;
  return totals.over_1_odd != null || totals.over_2_odd != null ||
    totals.elevated_over_seen;
}

function goalsTotalFromScoreText(text: string): number {
  const m = String(text).match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return 0;
  return (toInt(m[1]) ?? 0) + (toInt(m[2]) ?? 0);
}

/**
 * Over +0,5 real disponivel: menor linha Over ofertada = placar+0,5.
 * "Menor odd" = menor LINHA (ex. 5,5 no 2-3), nao a cota decimal nem 6,5/7,5.
 * Linhas maiores podem coexistir na API; over_0 deve ser a linha minima.
 */
function canCaptureTrueOver05(totals: TotalsOdds, goalsTotal: number): boolean {
  if (totals.over_0_odd == null || totals.over_0_line == null) return false;
  const needLine = goalsTotal + 0.5;
  if (Math.abs(totals.over_0_line - needLine) > 0.01) return false;
  if (totals.min_over_absolute_line == null) return false;
  if (Math.abs(totals.min_over_absolute_line - needLine) > 0.01) return false;
  return true;
}

type ElevatedOddLogEntry = {
  at: string;
  minute: number | null;
  score: string;
  line: number;
  odd: number;
  remaining: number;
};

/** Snapshot da linha +0,5: menor linha Over = placar+0,5 e sua cota (nunca 6,5/7,5). */
function collectTrueOver05ForLog(
  totals: TotalsOdds,
  goalsTotal: number,
): { line: number; odd: number } | null {
  const needLine = goalsTotal + 0.5;
  if (totals.over_0_odd == null || totals.over_0_line == null) return null;
  if (Math.abs(totals.over_0_line - needLine) > 0.01) return null;
  return { line: totals.over_0_line, odd: totals.over_0_odd };
}

/** Menor linha Over HCTG apostavel: +0,5 real ou linha elevada (fase Estrategia +0,5). */
function collectHctgMinOverForLog(
  lines: HctgSnapshot["lines"],
  goalsTotal: number,
): { line: number; odd: number; remaining: number } | null {
  const trimmed = trimHctgLinesForMatch(lines, goalsTotal);
  const needHit = needLineOverFromHctg(trimmed, goalsTotal);
  if (needHit) {
    return { line: needHit.line, odd: needHit.odd, remaining: 0.5 };
  }
  const minLine = minHctgOverLine(trimmed);
  if (minLine == null) return null;
  const hit = trimmed.find((l) =>
    l.over != null && Math.abs(l.line - minLine) < 0.01
  );
  if (!hit?.over) return null;
  return {
    line: minLine,
    odd: hit.over,
    remaining: Math.round((minLine - goalsTotal) * 10) / 10,
  };
}

function parseElevatedOddsLog(raw: unknown): ElevatedOddLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) =>
    e && typeof e === "object" && typeof (e as ElevatedOddLogEntry).line === "number"
  ) as ElevatedOddLogEntry[];
}

async function appendMercadoElevatedOddsLog(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  ctx: MercadoGols05Context,
  hctgSnap: HctgSnapshot,
  existingLog: unknown,
): Promise<void> {
  const goalsTotal = goalsTotalFromScoreText(ctx.score_text);
  const snapshot = collectHctgMinOverForLog(hctgSnap.lines, goalsTotal);
  if (!snapshot) return;

  const log = parseElevatedOddsLog(existingLog);
  const lastEntry = log.length > 0 ? log[log.length - 1] : null;
  if (lastEntry && Math.abs(lastEntry.line - snapshot.line) < 0.01) {
    // Linha elevada: so registra troca de linha. +0,5: registra se a odd mudou.
    if (snapshot.remaining > 0.51) return;
    if (Math.abs(lastEntry.odd - snapshot.odd) < 0.01) return;
  }

  const nowIso = new Date().toISOString();
  log.push({
    at: nowIso,
    minute: ctx.minute,
    score: ctx.score_text,
    line: snapshot.line,
    odd: snapshot.odd,
    remaining: snapshot.remaining,
  });

  const trimmed = log.length > 300 ? log.slice(-300) : log;
  await supabase.from("futebol_mercado_gols_05").update({
    elevated_odds_log: trimmed,
    updated_at: nowIso,
  }).eq("event_id", eventId);
}

/** Apos captura: monitora a odd da linha +0,5 (over_05_line) ate o gol ou o fim. */
async function trackMercadoPendingOver05Odd(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  ctx: MercadoGols05Context,
  hctgSnap: HctgSnapshot,
  row: MercadoGols05Row,
): Promise<void> {
  if (row.resultado !== "pending" || row.over_05_line == null) return;
  const goalsNow = goalsTotalFromScoreText(ctx.score_text);
  const goalsAtCapture = row.placar_na_captura
    ? goalsTotalFromScoreText(row.placar_na_captura)
    : null;
  // Ja houve gol apos a abertura: nao atualiza odd (mantem ultima pre-gol).
  if (goalsAtCapture != null && goalsNow > goalsAtCapture) return;

  const hit = hctgSnap.lines.find((l) =>
    l.over != null && Math.abs(l.line - row.over_05_line!) < 0.01
  );
  const odd = hit?.over ?? null;
  if (odd == null || !Number.isFinite(odd) || odd < 1.01) return;

  const prevUltima = row.over_05_odd_ultima ?? row.over_05_odd;
  const log = parseElevatedOddsLog(row.elevated_odds_log);
  const lastEntry = log.length > 0 ? log[log.length - 1] : null;
  const sameTick = lastEntry &&
    Math.abs(lastEntry.line - row.over_05_line) < 0.01 &&
    Math.abs(lastEntry.odd - odd) < 0.01;
  const oddUnchanged = prevUltima != null && Math.abs(prevUltima - odd) < 0.01;
  if (sameTick && oddUnchanged) return;

  const nowIso = new Date().toISOString();
  if (!sameTick) {
    log.push({
      at: nowIso,
      minute: ctx.minute,
      score: ctx.score_text,
      line: row.over_05_line,
      odd,
      remaining: 0.5,
    });
  }
  const trimmed = log.length > 300 ? log.slice(-300) : log;
  await supabase.from("futebol_mercado_gols_05").update({
    over_05_odd_ultima: odd,
    elevated_odds_log: trimmed,
    last_minute: ctx.minute,
    updated_at: nowIso,
  }).eq("event_id", eventId).eq("resultado", "pending");
}

async function syncMercadoLiveSnapshot(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  minute: number | null,
  scoreText: string,
  totals: TotalsOdds,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await supabase.from("futebol_mercado_gols_05").update({
    last_minute: minute,
    live_score: scoreText,
    live_over_0_line: totals.over_0_line,
    live_over_0_odd: totals.over_0_odd,
    live_over_1_line: totals.over_1_line,
    live_over_1_odd: totals.over_1_odd,
    live_over_2_line: totals.over_2_line,
    live_over_2_odd: totals.over_2_odd,
    updated_at: nowIso,
  }).eq("event_id", eventId).eq("is_live", true).neq("resultado", "excluido");
}

function assignOddSlot(
  slots: OddSlot[],
  slot: number,
  line: number,
  odd: number,
  kind: MarketLineMode,
) {
  const cur = slots[slot];
  if (cur.odd == null) {
    slots[slot] = { line, odd, kind };
    return;
  }
  if (cur.kind === "remaining" && kind === "absolute") {
    slots[slot] = { line, odd, kind };
  }
}

function countFilledSlots(slots: OddSlot[]): number {
  return slots.filter((s) => s.odd != null).length;
}

function sideOddsMonotonic(odds: (number | null)[], side: "under" | "over"): boolean {
  let prev: number | null = null;
  for (const o of odds) {
    if (o == null) continue;
    if (prev != null) {
      if (side === "under" && o > prev) return false;
      if (side === "over" && o < prev) return false;
    }
    prev = o;
  }
  return true;
}

/** Reordena Over por linha absoluta asc; Under por odd desc. */
function reorderSideOdds(slots: OddSlot[], side: "under" | "over"): OddSlot[] {
  if (side === "over") {
    const empty: OddSlot = { line: null, odd: null, kind: null };
    const filled = slots
      .filter((s) => s.odd != null && s.line != null)
      .sort((a, b) => (a.line as number) - (b.line as number));
    return [filled[0] ?? empty, filled[1] ?? empty, filled[2] ?? empty];
  }

  const out = slots.map((s) => ({ ...s }));
  const filled = out
    .map((s, i) => ({ i, line: s.line, odd: s.odd }))
    .filter((x) => x.odd != null && x.line != null) as Array<
      { i: number; line: number; odd: number }
    >;
  if (filled.length <= 1) return out;

  const sorted = filled.slice().sort((a, b) =>
    side === "under" ? b.odd - a.odd : a.odd - b.odd
  );
  filled.sort((a, b) => a.i - b.i);
  for (let j = 0; j < filled.length; j++) {
    out[filled[j].i] = {
      ...out[filled[j].i],
      line: sorted[j].line,
      odd: sorted[j].odd,
    };
  }
  return out;
}

function slotsToTotalsOdds(
  underSlots: OddSlot[],
  overSlots: OddSlot[],
  goalsTotal: number,
): TotalsOdds {
  let u = reorderSideOdds(underSlots, "under");
  let o = reorderSideOdds(overSlots, "over");

  const pick = (slots: OddSlot[], i: number) => ({
    line: slots[i].odd != null ? slots[i].line : null,
    odd: slots[i].odd,
  });

  const build = (us: OddSlot[], os: OddSlot[]): TotalsOdds => ({
    under_0_line: pick(us, 0).line,
    under_0_odd: pick(us, 0).odd,
    under_1_line: pick(us, 1).line,
    under_1_odd: pick(us, 1).odd,
    under_2_line: pick(us, 2).line,
    under_2_odd: pick(us, 2).odd,
    over_0_line: pick(os, 0).line,
    over_0_odd: pick(os, 0).odd,
    over_1_line: pick(os, 1).line,
    over_1_odd: pick(os, 1).odd,
    over_2_line: pick(os, 2).line,
    over_2_odd: pick(os, 2).odd,
    elevated_over_seen: false,
    min_over_absolute_line: null,
    elevated_over_lines: [],
  });

  let t = build(u, o);

  const underOdds = [t.under_0_odd, t.under_1_odd, t.under_2_odd];
  const overOdds = [t.over_0_odd, t.over_1_odd, t.over_2_odd];
  if (!sideOddsMonotonic(underOdds, "under")) {
    for (const i of [0, 1, 2] as const) {
      (t as Record<string, number | null>)[`under_${i}_odd`] = null;
      (t as Record<string, number | null>)[`under_${i}_line`] = null;
    }
  }
  if (!sideOddsMonotonic(overOdds, "over")) {
    for (const i of [0, 1, 2] as const) {
      (t as Record<string, number | null>)[`over_${i}_odd`] = null;
      (t as Record<string, number | null>)[`over_${i}_line`] = null;
    }
  }

  return t;
}

/** Garante over_0 = placar+0,5 (menor linha Over ofertada), slots seguintes = linhas maiores. */
function canonicalizeTotalsOver05(t: TotalsOdds, goalsTotal: number): TotalsOdds {
  const needLine = goalsTotal + 0.5;
  const map = new Map<string, { line: number; odd: number }>();
  const add = (line: number | null, odd: number | null) => {
    if (line == null || odd == null) return;
    map.set(String(line), { line, odd });
  };
  add(t.over_0_line, t.over_0_odd);
  add(t.over_1_line, t.over_1_odd);
  add(t.over_2_line, t.over_2_odd);
  for (const e of t.elevated_over_lines ?? []) add(e.line, e.odd);

  const pairs = [...map.values()].sort((a, b) => a.line - b.line);
  const out: TotalsOdds = {
    ...t,
    over_0_line: null,
    over_0_odd: null,
    over_1_line: null,
    over_1_odd: null,
    over_2_line: null,
    over_2_odd: null,
    elevated_over_lines: [...(t.elevated_over_lines ?? [])],
  };

  const needIdx = pairs.findIndex((p) => Math.abs(p.line - needLine) < 0.01);
  if (needIdx >= 0) {
    out.over_0_line = pairs[needIdx].line;
    out.over_0_odd = pairs[needIdx].odd;
    let slot = 1;
    for (let i = needIdx + 1; i < pairs.length && slot < 3; i++, slot++) {
      if (slot === 1) {
        out.over_1_line = pairs[i].line;
        out.over_1_odd = pairs[i].odd;
      } else {
        out.over_2_line = pairs[i].line;
        out.over_2_odd = pairs[i].odd;
      }
    }
  }

  out.min_over_absolute_line = pairs.length
    ? pairs[0].line
    : t.min_over_absolute_line;
  out.elevated_over_seen = pairs.some((p) => p.line > needLine + 0.01) || t.elevated_over_seen;
  return out;
}

function scoreMarketOdds(underSlots: OddSlot[], overSlots: OddSlot[], goalsTotal: number): number {
  const t = slotsToTotalsOdds(underSlots, overSlots, goalsTotal);
  let score = 0;
  for (const o of [t.under_0_odd, t.under_1_odd, t.under_2_odd, t.over_0_odd, t.over_1_odd, t.over_2_odd]) {
    if (o != null) score += 1;
  }
  if (sideOddsMonotonic([t.under_0_odd, t.under_1_odd, t.under_2_odd], "under")) score += 3;
  if (sideOddsMonotonic([t.over_0_odd, t.over_1_odd, t.over_2_odd], "over")) score += 3;
  return score;
}

function extractOddsFromMarket(
  mid: string,
  rec: Json,
  selections: Record<string, Json>,
  goalsTotal: number,
): { under: OddSlot[]; over: OddSlot[]; elevatedOverSeen: boolean; minOverAbsLine: number | null; elevatedOverLines: Array<{ line: number; odd: number }> } | null {
  const mode = marketLineMode(rec);
  if (!mode) return null;

  const underSlots: OddSlot[] = [
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
  ];
  const overSlots: OddSlot[] = [
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
  ];
  let elevatedOverSeen = false;
  let minOverAbsLine: number | null = null;
  const elevatedOverLines: Array<{ line: number; odd: number }> = [];

  const marketLine = toNum(rec.handicap ?? rec.line ?? rec.points);
  const selIds = Array.isArray(rec.selectionIdList)
    ? rec.selectionIdList.map(String)
    : Object.keys(selections).filter((sid) =>
      String(asRecord(selections[sid])?.marketId ?? "") === mid
    );

  for (const sid of selIds) {
    const sel = asRecord(selections[sid]);
    if (!sel) continue;
    const sname = String(sel.name ?? sel.shortName ?? "").toLowerCase();
    const isUnder =
      sname.includes("under") || sname.includes("menos") || sname === "below" ||
      sname.startsWith("u ") || sname.startsWith("u(");
    const isOver =
      sname.includes("over") || sname.includes("mais") || sname === "above" ||
      sname.startsWith("o ") || sname.startsWith("o(");
    if (!isUnder && !isOver) continue;

    const price = toNum(sel.price ?? sel.odds ?? sel.decimalOdds);
    let selLine = toNum(sel.handicap ?? sel.line ?? sel.points) ?? marketLine;
    if (selLine == null) selLine = parseGoalLineFromSelectionName(sname);
    if (price == null || selLine == null || price < 1.01 || price > 100) continue;

    if (isOver && mode === "absolute") {
      minOverAbsLine = minOverAbsLine == null
        ? selLine
        : Math.min(minOverAbsLine, selLine);
    }
    if (isOver && mode === "remaining") {
      const absEquiv = goalsTotal + selLine;
      minOverAbsLine = minOverAbsLine == null
        ? absEquiv
        : Math.min(minOverAbsLine, absEquiv);
    }

    const slot = slotForLine(selLine, goalsTotal, mode);
    if (slot == null) {
      if (isOver && isElevatedOverLine(selLine, goalsTotal, mode)) {
        elevatedOverSeen = true;
        const absLine = mode === "absolute" ? selLine : goalsTotal + selLine;
        elevatedOverLines.push({ line: absLine, odd: price });
      }
      continue;
    }

    if (isUnder) assignOddSlot(underSlots, slot, selLine, price, mode);
    if (isOver) assignOddSlot(overSlots, slot, selLine, price, mode);
  }

  if (countFilledSlots(underSlots) === 0 && countFilledSlots(overSlots) === 0 &&
    !elevatedOverSeen) {
    return null;
  }
  return { under: underSlots, over: overSlots, elevatedOverSeen, minOverAbsLine, elevatedOverLines };
}

function extractTotalsOdds(
  eventId: string,
  event: Json,
  overview: Json,
  goalsTotal: number,
): TotalsOdds {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};

  const marketIds = new Set<string>();
  if (Array.isArray(event.marketIdList)) {
    for (const id of event.marketIdList) marketIds.add(String(id));
  }
  for (const [mid, market] of Object.entries(markets)) {
    const rec = asRecord(market);
    if (!rec) continue;
    if (String(rec.eventId ?? rec.eventID ?? "") === eventId) marketIds.add(mid);
  }

  const emptySlots = (): OddSlot[] => [
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
    { line: null, odd: null, kind: null },
  ];

  const byMode: Record<MarketLineMode, { under: OddSlot[]; over: OddSlot[] }> = {
    remaining: { under: emptySlots(), over: emptySlots() },
    absolute: { under: emptySlots(), over: emptySlots() },
  };
  let elevatedOverSeen = false;
  let minOverAbsoluteLine: number | null = null;
  const elevatedOverLinesAcc: Array<{ line: number; odd: number }> = [];

  const mergeElevatedLines = (lines: Array<{ line: number; odd: number }>) => {
    for (const e of lines) {
      const idx = elevatedOverLinesAcc.findIndex((x) =>
        Math.abs(x.line - e.line) < 0.01
      );
      if (idx < 0) elevatedOverLinesAcc.push(e);
      else if (e.odd != null) elevatedOverLinesAcc[idx] = e;
    }
  };

  const tryMarket = (mid: string, rec: Json) => {
    const mode = marketLineMode(rec);
    if (!mode) return;
    const extracted = extractOddsFromMarket(mid, rec, selections as Record<string, Json>, goalsTotal);
    if (!extracted) return;
    if (extracted.elevatedOverSeen) elevatedOverSeen = true;
    if (extracted.minOverAbsLine != null) {
      minOverAbsoluteLine = minOverAbsoluteLine == null
        ? extracted.minOverAbsLine
        : Math.min(minOverAbsoluteLine, extracted.minOverAbsLine);
    }
    mergeElevatedLines(extracted.elevatedOverLines);
    const bucket = byMode[mode];
    for (let i = 0; i < 3; i++) {
      const u = extracted.under[i];
      const o = extracted.over[i];
      if (u.odd != null && u.line != null) assignOddSlot(bucket.under, i, u.line, u.odd, mode);
      if (o.odd != null && o.line != null) assignOddSlot(bucket.over, i, o.line, o.odd, mode);
    }
  };

  for (const mid of marketIds) {
    const rec = asRecord(markets[mid]);
    if (rec) tryMarket(mid, rec);
  }

  let bestScore = -1;
  let bestMode: MarketLineMode | null = null;
  let bestUnder = emptySlots();
  let bestOver = emptySlots();

  for (const mode of ["remaining", "absolute"] as MarketLineMode[]) {
    const score = scoreMarketOdds(byMode[mode].under, byMode[mode].over, goalsTotal);
    const prefer = mode === "remaining" && score === bestScore;
    if (score > bestScore || prefer) {
      bestScore = score;
      bestMode = mode;
      bestUnder = byMode[mode].under.map((s) => ({ ...s }));
      bestOver = byMode[mode].over.map((s) => ({ ...s }));
    }
  }

  if (bestScore < 0) {
    for (const [mid, market] of Object.entries(markets)) {
      const rec = asRecord(market);
      if (!rec) continue;
      tryMarket(mid, rec);
    }
    for (const mode of ["remaining", "absolute"] as MarketLineMode[]) {
      const score = scoreMarketOdds(byMode[mode].under, byMode[mode].over, goalsTotal);
      const prefer = mode === "remaining" && score === bestScore;
      if (score > bestScore || prefer) {
        bestScore = score;
        bestMode = mode;
        bestUnder = byMode[mode].under.map((s) => ({ ...s }));
        bestOver = byMode[mode].over.map((s) => ({ ...s }));
      }
    }
  }

  if (bestScore < 0 || bestMode == null) {
    if (elevatedOverSeen || minOverAbsoluteLine != null) {
      return {
        ...EMPTY_TOTALS_ODDS,
        elevated_over_seen: elevatedOverSeen,
        min_over_absolute_line: minOverAbsoluteLine,
        elevated_over_lines: elevatedOverLinesAcc,
      };
    }
    return EMPTY_TOTALS_ODDS;
  }
  const totals = slotsToTotalsOdds(bestUnder, bestOver, goalsTotal);
  totals.elevated_over_seen = elevatedOverSeen;
  totals.min_over_absolute_line = minOverAbsoluteLine;
  totals.elevated_over_lines = elevatedOverLinesAcc;
  return canonicalizeTotalsOver05(totals, goalsTotal);
}

/** Under por gols restantes: linhas +0.5, +1.5, +2.5. */
function extractUnderGoalsRemaining(
  eventId: string,
  event: Json,
  overview: Json,
  goalsTotal: number,
): Pick<
  TotalsOdds,
  "under_0_line" | "under_0_odd" | "under_1_line" | "under_1_odd" | "under_2_line" | "under_2_odd"
> {
  const t = extractTotalsOdds(eventId, event, overview, goalsTotal);
  return {
    under_0_line: t.under_0_line,
    under_0_odd: t.under_0_odd,
    under_1_line: t.under_1_line,
    under_1_odd: t.under_1_odd,
    under_2_line: t.under_2_line,
    under_2_odd: t.under_2_odd,
  };
}

function hasAnyTotalsOdds(t: TotalsOdds): boolean {
  return [
    t.under_0_odd, t.under_1_odd, t.under_2_odd,
    t.over_0_odd, t.over_1_odd, t.over_2_odd,
  ].some((v) => v != null);
}

/** Overview so traz linha principal (ex. 4,5); faltam alternativas (+0,5/+2,5). */
function needsSupplementalTotalsFetch(totals: TotalsOdds, goalsTotal: number): boolean {
  if (!hasAnyTotalsOdds(totals)) return true;
  if (totals.over_0_odd != null) return false;
  const needLine = goalsTotal + 0.5;
  for (const line of [totals.over_1_line, totals.over_2_line, totals.min_over_absolute_line]) {
    if (line != null && line > needLine + 0.01) return true;
  }
  if (totals.elevated_over_seen) return true;
  if ((totals.elevated_over_lines?.length ?? 0) > 0) return true;
  return false;
}

function mergeTotalsOdds(primary: TotalsOdds, secondary: TotalsOdds): TotalsOdds {
  const out: TotalsOdds = {
    ...primary,
    elevated_over_lines: [...(primary.elevated_over_lines ?? [])],
  };
  for (const i of [0, 1, 2] as const) {
    const lineKey = `under_${i}_line` as keyof TotalsOdds;
    const oddKey = `under_${i}_odd` as keyof TotalsOdds;
    const oLineKey = `over_${i}_line` as keyof TotalsOdds;
    const oOddKey = `over_${i}_odd` as keyof TotalsOdds;
    if (out[oddKey] == null && secondary[oddKey] != null) {
      (out as Record<string, unknown>)[lineKey as string] = secondary[lineKey];
      (out as Record<string, unknown>)[oddKey as string] = secondary[oddKey];
    }
    if (out[oOddKey] == null && secondary[oOddKey] != null) {
      (out as Record<string, unknown>)[oLineKey as string] = secondary[oLineKey];
      (out as Record<string, unknown>)[oOddKey as string] = secondary[oOddKey];
    }
  }
  if (secondary.min_over_absolute_line != null) {
    out.min_over_absolute_line = out.min_over_absolute_line == null
      ? secondary.min_over_absolute_line
      : Math.min(out.min_over_absolute_line, secondary.min_over_absolute_line);
  }
  out.elevated_over_seen = primary.elevated_over_seen || secondary.elevated_over_seen;
  for (const e of secondary.elevated_over_lines ?? []) {
    const idx = out.elevated_over_lines!.findIndex((x) => Math.abs(x.line - e.line) < 0.01);
    if (idx < 0) out.elevated_over_lines!.push(e);
    else out.elevated_over_lines![idx] = e;
  }
  return out;
}

function mergeAndCanonicalizeTotals(
  primary: TotalsOdds,
  secondary: TotalsOdds,
  goalsTotal: number,
): TotalsOdds {
  return canonicalizeTotalsOver05(mergeTotalsOdds(primary, secondary), goalsTotal);
}

function eventZoneId(event: Json): string | null {
  const z = event.zoneId;
  return z != null && z !== "" ? String(z) : null;
}

/** Selecoes soltas (sem marketId) no overview do evento — ex. Mais de 0,5 alternativo. */
function harvestLooseGoalTotals(
  selections: Record<string, Json>,
  goalsTotal: number,
): Array<{ line: number; overOdd: number; underOdd?: number }> {
  const minLine = goalsTotal + 0.5;
  const maxLine = goalsTotal + 2.5;
  const byLine = new Map<number, { over?: number; under?: number }>();
  for (const sel of Object.values(selections)) {
    const rec = asRecord(sel);
    if (!rec) continue;
    const name = String(rec.name ?? "").toLowerCase();
    if (
      !name.includes("mais") && !name.includes("menos") &&
      !name.includes("over") && !name.includes("under")
    ) continue;
    const line = toNum(rec.handicap) ?? parseGoalLineFromSelectionName(name);
    if (line == null || line < minLine - 0.01 || line > maxLine + 0.01) continue;
    const price = toNum(rec.price ?? rec.odds);
    if (price == null || price < 1.01 || price > 100) continue;
    const bucket = byLine.get(line) ?? {};
    if (name.includes("mais") || name.includes("over")) bucket.over = price;
    if (name.includes("menos") || name.includes("under")) bucket.under = price;
    byLine.set(line, bucket);
  }
  const out: Array<{ line: number; overOdd: number; underOdd?: number }> = [];
  for (const [line, bucket] of byLine) {
    if (bucket.over != null) {
      out.push({ line, overOdd: bucket.over, underOdd: bucket.under });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

function mainHctgAnchorOver(
  event: Json,
  overview: Json,
): number | null {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const marketIdList = Array.isArray(event.marketIdList)
    ? event.marketIdList.map(String)
    : [];
  for (const mid of marketIdList) {
    const rec = asRecord(markets[mid]);
    if (rec?.type !== "HCTG" || !Array.isArray(rec.selectionIdList)) continue;
    for (const sid of rec.selectionIdList) {
      const sel = asRecord(selections[String(sid)]);
      if (!sel) continue;
      const name = String(sel.name ?? "").toLowerCase();
      if (name.includes("mais") || name.includes("over")) {
        const o = toNum(sel.price ?? sel.odds);
        if (o != null) return o;
      }
    }
  }
  return null;
}

/** Odd Over na linha exata (ex. 0,5 / 1,5) em selecoes soltas do overview do evento. */
function pickLooseOverOddForLine(
  selections: Record<string, Json>,
  line: number,
  anchorOver: number | null,
): number | null {
  const cands: number[] = [];
  for (const sel of Object.values(selections)) {
    const rec = asRecord(sel);
    if (!rec) continue;
    const name = String(rec.name ?? "").toLowerCase();
    if (!name.includes("mais") && !name.includes("over")) continue;
    const selLine = toNum(rec.handicap) ?? parseGoalLineFromSelectionName(name);
    if (selLine == null || Math.abs(selLine - line) > 0.01) continue;
    const price = toNum(rec.price ?? rec.odds);
    if (price == null || price < 1.01 || price > 100) continue;
    cands.push(price);
  }
  if (!cands.length) return null;
  if (anchorOver == null) return cands[0];
  return cands.slice().sort((a, b) =>
    Math.abs(a - anchorOver) - Math.abs(b - anchorOver),
  )[0];
}

function totalsFromDirectOverLine(
  line: number,
  overOdd: number,
  goalsTotal: number,
): TotalsOdds {
  const t: TotalsOdds = {
    ...EMPTY_TOTALS_ODDS,
    elevated_over_lines: [],
    over_0_line: line,
    over_0_odd: overOdd,
    min_over_absolute_line: line,
  };
  return canonicalizeTotalsOver05(t, goalsTotal);
}

function totalsFromLooseGoals(
  loose: Array<{ line: number; overOdd: number; underOdd?: number }>,
  goalsTotal: number,
): TotalsOdds {
  const empty: OddSlot = { line: null, odd: null, kind: null };
  const underSlots: OddSlot[] = [empty, empty, empty];
  const overSlots: OddSlot[] = [empty, empty, empty];
  for (const { line, overOdd, underOdd } of loose) {
    const slot = slotForLine(line, goalsTotal, "absolute");
    if (slot == null) continue;
    overSlots[slot] = { line, odd: overOdd, kind: "absolute" };
    if (underOdd != null) {
      underSlots[slot] = { line, odd: underOdd, kind: "absolute" };
    }
  }
  const totals = slotsToTotalsOdds(
    reorderSideOdds(underSlots, "under"),
    reorderSideOdds(overSlots, "over"),
    goalsTotal,
  );
  totals.min_over_absolute_line = loose.length ? loose[0].line : null;
  return canonicalizeTotalsOver05(totals, goalsTotal);
}

/** Mercados de gols do evento via JSON — desativado (fonte unica = Worker HCTG). */
async function fetchEventGoalMarkets(
  _supabase: ReturnType<typeof createClient>,
  _eventId: string,
  _event: Json,
  _goalsTotal: number,
  _globalOverview: Json,
  _epoch: string,
): Promise<TotalsOdds> {
  return { ...EMPTY_TOTALS_ODDS };
}

/** Extrai mercados/selecoes aninhados em marketOffers (inclui HCTG alternativos). */
function flattenOffersMarkets(data: unknown): { markets: Json; selections: Json } {
  const markets: Json = {};
  const selections: Json = {};

  const absorbSelection = (s: Json) => {
    const id = s.id ?? s.selectionId;
    if (id != null) selections[String(id)] = s;
  };

  const absorbMarket = (m: Json) => {
    const id = String(m.id ?? "");
    if (!id) return;
    markets[id] = m;
    const sels = m.selections;
    if (Array.isArray(sels)) {
      for (const item of sels) {
        const s = asRecord(item);
        if (s) absorbSelection(s);
      }
    }
  };

  const walk = (node: unknown, depth = 0) => {
    if (depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;

    const type = String(obj.type ?? "");
    const name = String(obj.name ?? "").toLowerCase();
    if (type === "HCTG" || name.includes("total de gols")) {
      absorbMarket(obj);
    }

    if (Array.isArray(obj.selections)) {
      for (const item of obj.selections) {
        const s = asRecord(item);
        if (s) absorbSelection(s);
      }
    }

    for (const v of Object.values(obj)) walk(v, depth + 1);
  };

  const root = asRecord(asRecord(data)?.data) ?? asRecord(data);
  walk(root?.marketOffers);
  walk(root?.markets);
  walk(root?.selections);

  return { markets, selections };
}

/** Mercados HCTG alternativos no overview (nao estao no marketIdList). */
function supplementOverviewHctgOrphans(
  event: Json,
  overview: Json,
  goalsTotal: number,
  totals: TotalsOdds,
): TotalsOdds {
  const markets = asRecord(overview.markets) ?? {};
  const selections = asRecord(overview.selections) ?? {};
  const marketIdList = Array.isArray(event.marketIdList)
    ? event.marketIdList.map(String)
    : [];

  const pickOverOdd = (mid: string): number | null => {
    const rec = asRecord(markets[mid]);
    if (!rec || !Array.isArray(rec.selectionIdList)) return null;
    for (const sid of rec.selectionIdList) {
      const sel = asRecord(selections[String(sid)]);
      if (!sel) continue;
      const name = String(sel.name ?? "").toLowerCase();
      if (name.includes("mais") || name.includes("over")) {
        return toNum(sel.price ?? sel.odds);
      }
    }
    return null;
  };

  let anchorOver: number | null = null;
  for (const mid of marketIdList) {
    const rec = asRecord(markets[mid]);
    if (rec?.type === "HCTG") {
      anchorOver = pickOverOdd(mid);
      if (anchorOver != null) break;
    }
  }
  const zoneId = eventZoneId(event);

  const pickOrphan = (targetHc: number): string | null => {
    const candidates: Array<{ mid: string; over: number }> = [];
    for (const [mid, market] of Object.entries(markets)) {
      if (marketIdList.includes(mid)) continue;
      const rec = asRecord(market);
      if (!rec || rec.type !== "HCTG") continue;
      const line = toNum(rec.handicap);
      if (line == null || Math.abs(line - targetHc) > 0.01) continue;
      const meid = String(rec.eventId ?? rec.eventID ?? "");
      const mz = String(rec.zoneId ?? "");
      if (zoneId && mz && mz !== zoneId && meid !== String(event.id ?? event.eventId ?? "")) {
        continue;
      }
      const over = pickOverOdd(mid);
      if (over == null) continue;
      candidates.push({ mid, over });
    }
    if (!candidates.length) return null;
    if (anchorOver != null && candidates.length > 1) {
      candidates.sort((a, b) =>
        Math.abs(a.over - anchorOver!) - Math.abs(b.over - anchorOver!),
      );
    } else {
      candidates.sort((a, b) => a.over - b.over);
    }
    return candidates[0].mid;
  };

  const targetHandicaps = [
    goalsTotal + 0.5,
    goalsTotal + 1.5,
    goalsTotal + 2.5,
  ];

  const extraIds: string[] = [];
  for (const targetHc of targetHandicaps) {
    if (marketIdList.some((mid) => {
      const hc = toNum(asRecord(markets[mid])?.handicap);
      return hc != null && Math.abs(hc - targetHc) < 0.01;
    })) continue;
    const chosen = pickOrphan(targetHc);
    if (chosen) extraIds.push(chosen);
  }

  if (!extraIds.length) return totals;

  const mergedIds = [...marketIdList, ...extraIds];
  const patched = extractTotalsOdds(
    String(event.id ?? event.eventId ?? ""),
    { ...event, marketIdList: mergedIds },
    overview,
    goalsTotal,
  );
  return mergeAndCanonicalizeTotals(totals, patched, goalsTotal);
}

/** Desativado: odds so via Worker HTML (hctg_lines). Nao busca markets-offers/JSON. */
async function fetchEventTotalsOdds(
  _supabase: ReturnType<typeof createClient>,
  _eventId: string,
  _goalsTotal: number,
  _epoch: string,
): Promise<TotalsOdds> {
  return { ...EMPTY_TOTALS_ODDS };
}

async function fetchEventUnderOdds(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  goalsTotal: number,
  epoch: string,
): Promise<Pick<
  TotalsOdds,
  "under_0_line" | "under_0_odd" | "under_1_line" | "under_1_odd" | "under_2_line" | "under_2_odd"
>> {
  const t = await fetchEventTotalsOdds(supabase, eventId, goalsTotal, epoch);
  return {
    under_0_line: t.under_0_line,
    under_0_odd: t.under_0_odd,
    under_1_line: t.under_1_line,
    under_1_odd: t.under_1_odd,
    under_2_line: t.under_2_line,
    under_2_odd: t.under_2_odd,
  };
}

const SPORTRADAR_STATS =
  "https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_details";

type TeamStats = {
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_shots_total: number | null;
  away_shots_total: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_goal_kicks: number | null;
  away_goal_kicks: number | null;
  available: boolean;
  raw: Json;
};

function emptyStats(): TeamStats {
  return {
    home_shots_on_target: null,
    away_shots_on_target: null,
    home_shots_total: null,
    away_shots_total: null,
    home_corners: null,
    away_corners: null,
    home_goal_kicks: null,
    away_goal_kicks: null,
    available: false,
    raw: {},
  };
}

function pairFromValues(
  values: Json,
  ...keys: string[]
): { home: number | null; away: number | null } {
  for (const key of keys) {
    const rec = asRecord(values[key]);
    if (!rec) continue;
    const value = asRecord(rec.value) ?? rec;
    const home = toInt(value.home ?? value.Home);
    const away = toInt(value.away ?? value.Away);
    if (home != null || away != null) return { home, away };
  }
  return { home: null, away: null };
}

/** Stats via Sportradar (betradarMatchId da Betano). */
async function tryFetchStats(
  supabase: ReturnType<typeof createClient>,
  betradarMatchId: string | number | null,
  epoch: string,
): Promise<TeamStats> {
  if (betradarMatchId == null || betradarMatchId === "") {
    return { ...emptyStats(), raw: { error: "sem betradarMatchId" } };
  }

  await assertColetaAtiva(supabase, "sportradar-stats", epoch);

  const urls = [
    `${SPORTRADAR_STATS}/${betradarMatchId}`,
    `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_detailsextended/${betradarMatchId}`,
  ];

  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.betano.bet.br/",
          Origin: "https://www.betano.bet.br",
        },
      });
      if (!res.ok) {
        errors.push(`${url} HTTP ${res.status}`);
        continue;
      }
      const data = asRecord(await res.json());
      const doc0 = Array.isArray(data?.doc) ? data.doc[0] : null;
      const doc = asRecord(doc0);
      // exception payload
      if (String(doc?.event ?? "") === "exception") {
        errors.push(`${url} exception`);
        continue;
      }
      const payload = asRecord(doc?.data) ?? {};
      const values = asRecord(payload.values) ?? {};
      if (Object.keys(values).length === 0) {
        errors.push(`${url} sem values`);
        continue;
      }

      // Codigos Sportradar: 125 shots on target, 124 corners, 121 goal kicks, goalattempts total
      const sot = pairFromValues(values, "125", "shotsonperiod");
      const total = pairFromValues(values, "goalattempts", "goalattemptsperiod");
      const corners = pairFromValues(values, "124", "1634");
      const gk = pairFromValues(values, "121", "goalkicksperiod");

      const available = [sot, total, corners, gk].some((p) => p.home != null || p.away != null);
      return {
        home_shots_on_target: sot.home,
        away_shots_on_target: sot.away,
        home_shots_total: total.home,
        away_shots_total: total.away,
        home_corners: corners.home,
        away_corners: corners.away,
        home_goal_kicks: gk.home,
        away_goal_kicks: gk.away,
        available,
        raw: { betradarMatchId, url, valuesKeys: Object.keys(values).slice(0, 30) },
      };
    } catch (err) {
      errors.push(`${url} ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { ...emptyStats(), raw: { betradarMatchId, errors } };
}

type GoalEvent = {
  event_id: string;
  sportradar_goal_id: string | null;
  minute: number;
  team: string | null;
  team_side: string | null;
  player: string | null;
  score_home: number | null;
  score_away: number | null;
};

function goalRowFromEvent(g: GoalEvent) {
  return {
    event_id: g.event_id,
    sportradar_goal_id: g.sportradar_goal_id,
    minute: g.minute,
    team: g.team,
    team_side: g.team_side ?? "unk",
    player: g.player,
    score_home: g.score_home,
    score_away: g.score_away,
  };
}

function dedupeGoals(goals: GoalEvent[]): GoalEvent[] {
  const seen = new Set<string>();
  return goals.filter((g) => {
    const key = g.sportradar_goal_id
      ? `sr:${g.sportradar_goal_id}`
      : `${g.minute}|${g.team_side ?? ""}|${g.score_home ?? ""}-${g.score_away ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function syncGoalsIntegrity(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  homeScore: number | null,
  awayScore: number | null,
): Promise<string> {
  const expected = (homeScore ?? 0) + (awayScore ?? 0);
  const { count } = await supabase
    .from("futebol_historico_gols")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  const recorded = count ?? 0;
  let status = "ok";
  if (expected === 0 && recorded === 0) status = "ok";
  else if (recorded === 0) status = "missing";
  else if (recorded < expected) status = "partial";
  else if (recorded > expected) status = "mismatch";
  else status = "ok";

  await supabase
    .from("futebol_historico_jogos")
    .update({
      goals_expected: expected,
      goals_recorded: recorded,
      goals_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);

  return status;
}

function extractBetradarMatchId(event: Json): string | null {
  const direct =
    event.betradarMatchId ??
      event.betradarId ??
      event.betRadarMatchId ??
      event.sportradarMatchId ??
      event.statsId;
  if (direct != null && direct !== "") return String(direct);

  const liveData = asRecord(event.liveData) ?? asRecord(event.live);
  const fromLive =
    liveData?.betradarMatchId ?? liveData?.betradarId ?? liveData?.sportradarMatchId;
  if (fromLive != null && fromLive !== "") return String(fromLive);

  const providers = asRecord(event.providerIds) ?? asRecord(event.externalIds);
  if (providers?.betradar != null && providers.betradar !== "") {
    return String(providers.betradar);
  }
  return null;
}

function inferGoalsFromScoreDelta(
  eventId: string,
  prevHome: number,
  prevAway: number,
  currHome: number,
  currAway: number,
  minute: number | null,
  homeName: string | null,
  awayName: string | null,
): GoalEvent[] {
  if (minute == null) return [];
  const goals: GoalEvent[] = [];
  const homeDelta = Math.max(0, currHome - prevHome);
  const awayDelta = Math.max(0, currAway - prevAway);

  for (let i = 0; i < homeDelta; i++) {
    goals.push({
      event_id: eventId,
      sportradar_goal_id: null,
      minute,
      team: homeName,
      team_side: "home",
      player: null,
      score_home: prevHome + i + 1,
      score_away: prevAway,
    });
  }
  for (let i = 0; i < awayDelta; i++) {
    goals.push({
      event_id: eventId,
      sportradar_goal_id: null,
      minute,
      team: awayName,
      team_side: "away",
      player: null,
      score_home: currHome,
      score_away: prevAway + i + 1,
    });
  }
  return goals;
}

async function persistEventGoals(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  timelineGoals: GoalEvent[],
  inferredGoals: GoalEvent[],
  homeScore: number | null,
  awayScore: number | null,
): Promise<{ saved: number; source: string; status: string }> {
  let merged: GoalEvent[];
  let source = "none";

  if (timelineGoals.length > 0) {
    merged = dedupeGoals(timelineGoals);
    source = "timeline";
  } else {
    const { data: existing } = await supabase
      .from("futebol_historico_gols")
      .select("event_id,sportradar_goal_id,minute,team,team_side,player,score_home,score_away")
      .eq("event_id", eventId);
    const existingGoals = (existing ?? []) as GoalEvent[];
    merged = dedupeGoals([...existingGoals, ...inferredGoals]);
    if (inferredGoals.length > 0) source = existingGoals.length > 0 ? "inferred+existing" : "inferred";
    else if (existingGoals.length > 0) source = "preserved";
  }

  let saved = 0;
  const upsertErrors: string[] = [];
  if (merged.length > 0) {
    for (const g of merged) {
      const row = goalRowFromEvent(g);
      if (g.sportradar_goal_id) {
        const { error } = await supabase
          .from("futebol_historico_gols")
          .upsert(row, { onConflict: "event_id,sportradar_goal_id" });
        if (!error) saved += 1;
        else {
          console.error("upsert sportradar goal", eventId, error.message);
          upsertErrors.push(error.message);
        }
      } else {
        const { error } = await supabase
          .from("futebol_historico_gols")
          .upsert(row, { onConflict: "event_id,minute,team_side,score_home,score_away" });
        if (!error) saved += 1;
        else {
          console.error("upsert placar goal", eventId, error.message);
          upsertErrors.push(error.message);
        }
      }
    }

    if (source === "timeline") {
      const srIds = merged.map((g) => g.sportradar_goal_id).filter(Boolean) as string[];
      if (srIds.length > 0) {
        const quoted = srIds.map((id) => `"${id}"`).join(",");
        await supabase
          .from("futebol_historico_gols")
          .delete()
          .eq("event_id", eventId)
          .not("sportradar_goal_id", "in", `(${quoted})`);
      }
    }
  }

  const status = await syncGoalsIntegrity(supabase, eventId, homeScore, awayScore);
  const goalsTotal = (homeScore ?? 0) + (awayScore ?? 0);
  if (merged.length === 0) {
    return { saved: 0, source: goalsTotal > 0 ? "missing" : "none", status };
  }
  return { saved, source, status };
}

function inferGoalsFromFinalScore(
  eventId: string,
  homeScore: number,
  awayScore: number,
  homeName: string | null,
  awayName: string | null,
  minute: number = 90,
): GoalEvent[] {
  return inferGoalsFromScoreDelta(eventId, 0, 0, homeScore, awayScore, minute, homeName, awayName);
}

async function reconcileHistoricGoals(
  supabase: ReturnType<typeof createClient>,
  limit = 120,
): Promise<{ backfilled: number; fixed: number; scanned: number }> {
  const { data: games } = await supabase
    .from("futebol_historico_jogos")
    .select("event_id,home,away,home_score,away_score,betradar_match_id,last_minute,goals_status,goals_recorded")
    .eq("is_live", false)
    .or("goals_status.neq.ok,goals_status.is.null,goals_status.eq.unknown")
    .order("finished_at", { ascending: false })
    .limit(limit);

  let backfilled = 0;
  let fixed = 0;
  let scanned = 0;

  for (const game of games ?? []) {
    scanned += 1;
    const home = game.home_score ?? 0;
    const away = game.away_score ?? 0;
    const expected = home + away;
    if (expected <= 0) {
      await syncGoalsIntegrity(supabase, game.event_id, home, away);
      continue;
    }

    const needsWork =
      game.goals_status === "missing" ||
      game.goals_status === "partial" ||
      game.goals_status === "mismatch" ||
      game.goals_status === "unknown" ||
      game.goals_status == null ||
      (game.goals_recorded ?? 0) < expected ||
      (game.goals_recorded ?? 0) > expected;

    if (!needsWork) continue;

    if (game.goals_status === "mismatch" || (game.goals_recorded ?? 0) > expected) {
      await supabase.from("futebol_historico_gols").delete().eq("event_id", game.event_id);
    }

    const timelineResult = await fetchGoalsTimeline(
      game.event_id,
      game.betradar_match_id,
      game.home,
      game.away,
    );
    let goals = timelineResult.goals;
    if (goals.length === 0) {
      goals = inferGoalsFromFinalScore(
        game.event_id,
        home,
        away,
        game.home,
        game.away,
        game.last_minute ?? 90,
      );
    }
    if (goals.length === 0) {
      await syncGoalsIntegrity(supabase, game.event_id, home, away);
      continue;
    }

    const persist = await persistEventGoals(
      supabase,
      game.event_id,
      goals,
      [],
      home,
      away,
    );
    if (persist.status === "ok") fixed += 1;
    else if (persist.saved > 0) backfilled += 1;
  }

  return { backfilled, fixed, scanned };
}

/** Gols com minuto via Sportradar match_timeline. */
async function fetchGoalsTimeline(
  eventId: string,
  betradarMatchId: string | number | null,
  homeName: string | null,
  awayName: string | null,
): Promise<{ goals: GoalEvent[]; eventsTotal: number }> {
  if (betradarMatchId == null || betradarMatchId === "") {
    return { goals: [], eventsTotal: 0 };
  }

  const url =
    `https://stats.fn.sportradar.com/common/en/Europe:Berlin/gismo/match_timeline/${betradarMatchId}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.betano.bet.br/",
      },
    });
    if (!res.ok) return { goals: [], eventsTotal: 0 };
    const data = asRecord(await res.json());
    const doc0 = Array.isArray(data?.doc) ? asRecord(data.doc[0]) : null;
    if (String(doc0?.event ?? "") === "exception") return { goals: [], eventsTotal: 0 };
    const payload = asRecord(doc0?.data) ?? {};
    const events = payload.events ?? payload.event ?? payload.timeline;
    if (!Array.isArray(events)) return { goals: [], eventsTotal: 0 };

    const goals: GoalEvent[] = [];
    for (const item of events) {
      const rec = asRecord(item);
      if (!rec) continue;
      const type = String(rec.type ?? "").toLowerCase();
      const typeId = toInt(rec.typeid ?? rec._typeid ?? rec.type_id);
      const docType = String(rec._doctype ?? "").toLowerCase();
      // BD-first: aceita apenas eventos Sportradar tipados como gol
      const isGoal =
        docType === "goal" ||
        type === "goal" ||
        typeId === 30 ||
        String(rec._typeid ?? "") === "30";
      if (!isGoal) continue;
      if (Number(rec.disabled ?? 0) !== 0) continue;

      let minute: number | null = null;
      const timeField = toInt(rec.time);
      const secondsField = toInt(rec.seconds);
      if (timeField != null && timeField >= 0) {
        minute = timeField;
      } else {
        minute = toInt(
          rec.minute ??
            rec.matchtime ??
            asRecord(rec.timeinfo)?.played ??
            rec.m,
        );
        if ((minute == null || minute < 0) && secondsField != null && secondsField >= 0) {
          minute = Math.floor(secondsField / 60);
        }
      }
      if (minute == null || minute < 0) continue;

      let teamSide: string | null = null;
      const teamField = rec.team ?? rec.side ?? rec.teams;
      if (typeof teamField === "string") {
        const t = teamField.toLowerCase();
        if (t === "home" || t === "1" || t.includes("home")) teamSide = "home";
        else if (t === "away" || t === "2" || t.includes("away")) teamSide = "away";
      } else if (asRecord(teamField)) {
        const tr = asRecord(teamField)!;
        const side = String(tr.side ?? tr.qualifier ?? tr.name ?? "").toLowerCase();
        if (side === "home" || side.includes("home")) teamSide = "home";
        else if (side === "away" || side.includes("away")) teamSide = "away";
      }

      const player = rec.player != null
        ? String(asRecord(rec.player)?.name ?? rec.player)
        : rec.scorer != null
        ? String(asRecord(rec.scorer)?.name ?? rec.scorer)
        : null;

      const teamName = teamSide === "home"
        ? homeName
        : teamSide === "away"
        ? awayName
        : player;

      const result = asRecord(rec.result) ?? asRecord(rec.score);
      const srId = rec._id != null ? String(rec._id) : null;
      goals.push({
        event_id: eventId,
        sportradar_goal_id: srId,
        minute,
        team: teamName,
        team_side: teamSide,
        player,
        score_home: toInt(result?.home),
        score_away: toInt(result?.away),
      });
    }

    return { goals: dedupeGoals(goals), eventsTotal: events.length };
  } catch {
    return { goals: [], eventsTotal: 0 };
  }
}

function pressureLabel(pressure: number, thresholds: [number, number]): string {
  const [low, mid] = thresholds;
  if (pressure <= low) return "pressao baixa";
  if (pressure <= mid) return "pressao media";
  return "pressao alta";
}

type MercadoGols05Row = {
  event_id: string;
  resultado: string;
  captured_at: string | null;
  disponivel_desde_minuto: number | null;
  indisponivel_ate_minuto: number | null;
  had_min_plus2_before: boolean;
  over_05_odd: number | null;
  over_05_odd_ultima?: number | null;
  over_05_line?: number | null;
  placar_na_captura?: string | null;
  elevated_odds_log?: unknown;
  estrategia?: string | null;
  telegram_capture_sent_at?: string | null;
  telegram_confirmacao?: string | null;
  hctg_fetched_at?: string | null;
};

type MercadoEstrategia = "estrategia_05";

type MercadoGols05Context = {
  home: string | null;
  away: string | null;
  league: string | null;
  country: string | null;
  betano_url: string;
  minute: number | null;
  score_text: string;
};

async function applyMercadoGols05Capture(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  ctx: MercadoGols05Context,
  totals: TotalsOdds,
  over0: number,
  estrategia: MercadoEstrategia,
  indisponivelAte: number | null,
  hadMinPlus2: boolean,
  onlyResultado: string | null,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const minute = ctx.minute;
  let q = supabase.from("futebol_mercado_gols_05").update({
    estrategia,
    indisponivel_ate_minuto: indisponivelAte,
    had_min_plus2_before: hadMinPlus2,
    disponivel_desde_minuto: minute,
    placar_na_captura: ctx.score_text,
    over_05_odd: over0,
    over_05_odd_ultima: over0,
    over_05_line: totals.over_0_line,
    captured_at: nowIso,
    resultado: "pending",
    last_minute: minute,
    is_live: true,
    placar_final: null,
    settled_at: null,
    updated_at: nowIso,
  }).eq("event_id", eventId);
  if (onlyResultado) q = q.eq("resultado", onlyResultado);
  await q;

  // Abertura +0,5 no historico do balao (primeira tick da serie monitorada).
  const { data: afterCap } = await supabase
    .from("futebol_mercado_gols_05")
    .select("elevated_odds_log")
    .eq("event_id", eventId)
    .maybeSingle();
  const log = parseElevatedOddsLog(afterCap?.elevated_odds_log);
  const last = log.length > 0 ? log[log.length - 1] : null;
  const line = totals.over_0_line;
  if (
    line != null &&
    !(last && Math.abs(last.line - line) < 0.01 && Math.abs(last.odd - over0) < 0.01)
  ) {
    log.push({
      at: nowIso,
      minute,
      score: ctx.score_text,
      line,
      odd: over0,
      remaining: 0.5,
    });
    const trimmed = log.length > 300 ? log.slice(-300) : log;
    await supabase.from("futebol_mercado_gols_05").update({
      elevated_odds_log: trimmed,
      updated_at: nowIso,
    }).eq("event_id", eventId);
  }
}

async function touchMercadoWatching(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  ctx: MercadoGols05Context,
  hctgSnap: HctgSnapshot,
  existing: MercadoGols05Row,
  hadMinPlus2: boolean,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const minute = ctx.minute;
  await supabase.from("futebol_mercado_gols_05").update({
    indisponivel_ate_minuto: minute,
    had_min_plus2_before: hadMinPlus2,
    last_minute: minute,
    updated_at: nowIso,
  }).eq("event_id", eventId).eq("resultado", "watching");
  await appendMercadoElevatedOddsLog(
    supabase,
    eventId,
    ctx,
    hctgSnap,
    existing.elevated_odds_log,
  );
}

async function countGoalsAfterMinute(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  afterMinute: number,
): Promise<{ count: number; firstMinute: number | null }> {
  const { data: goals } = await supabase
    .from("futebol_historico_gols")
    .select("minute")
    .eq("event_id", eventId)
    .gt("minute", afterMinute)
    .order("minute", { ascending: true });
  const list = goals ?? [];
  if (!list.length) return { count: 0, firstMinute: null };
  return { count: list.length, firstMinute: toInt(list[0].minute) };
}

async function settleMercadoGols05Pending(
  supabase: ReturnType<typeof createClient>,
  row: MercadoGols05Row,
  scoreText: string,
  forceFinal: boolean,
  epoch: string,
): Promise<"win" | "loss" | null> {
  if (row.resultado !== "pending" || row.disponivel_desde_minuto == null) return null;
  await assertColetaAtiva(supabase, `settle-${row.event_id}`, epoch);
  const { count, firstMinute } = await countGoalsAfterMinute(
    supabase,
    row.event_id,
    row.disponivel_desde_minuto,
  );
  const nowIso = new Date().toISOString();
  if (count >= 1) {
    await supabase.from("futebol_mercado_gols_05").update({
      resultado: "win",
      gols_apos_captura: count,
      gol_green_minute: firstMinute,
      settled_at: nowIso,
      placar_final: scoreText,
      updated_at: nowIso,
    }).eq("event_id", row.event_id).eq("resultado", "pending");
    // GREEN ja aparece em live_json_vs_sistema (secao GREEN Agora)
    await notifyTelegramSettleOnce(supabase, row.event_id);
    return "win";
  }
  if (forceFinal) {
    await supabase.from("futebol_mercado_gols_05").update({
      resultado: "loss",
      gols_apos_captura: 0,
      settled_at: nowIso,
      placar_final: scoreText,
      updated_at: nowIso,
    }).eq("event_id", row.event_id).eq("resultado", "pending");
    const { data: meta } = await supabase
      .from("futebol_mercado_gols_05")
      .select("home,away,over_05_odd")
      .eq("event_id", row.event_id)
      .maybeSingle();
    await insertSistemaLog(supabase, {
      source: "edge-live",
      action: "mercado_red",
      message: `RED — sem gol apos captura · placar final ${scoreText}`,
      event_id: row.event_id,
      match_label: matchLabel(meta?.home, meta?.away),
      payload: {
        placar_final: scoreText,
        over_05_odd: meta?.over_05_odd ?? null,
      },
    });
    await notifyTelegramSettleOnce(supabase, row.event_id);
    return "loss";
  }
  return null;
}

async function processMercadoGols05Live(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  totals: TotalsOdds,
  hctgSnap: HctgSnapshot,
  ctx: MercadoGols05Context,
  existing: MercadoGols05Row | null,
  epoch: string,
): Promise<"captured" | "win" | "loss" | null> {
  await assertColetaAtiva(supabase, `mercado-${eventId}`, epoch);
  const nowIso = new Date().toISOString();
  const minute = ctx.minute;
  const goalsTotal = goalsTotalFromScoreText(ctx.score_text);
  const needOver = needLineOverFromHctg(hctgSnap.lines, goalsTotal);
  const over0 = needOver?.odd ?? null;
  const over0Line = needOver?.line ?? null;
  const elevatedPhase = mercadoHadElevatedFromHctg(hctgSnap, goalsTotal);
  const trueOver05 = needOver != null && canCaptureNeedLineFromHctg(hctgSnap.lines, goalsTotal);

  if (existing?.resultado === "excluido") return null;

  if (!existing) {
    if (over0 != null && trueOver05) {
      await supabase.from("futebol_mercado_gols_05").insert({
        event_id: eventId,
        home: ctx.home,
        away: ctx.away,
        league: ctx.league,
        country: ctx.country,
        betano_url: ctx.betano_url,
        indisponivel_ate_minuto: null,
        had_min_plus2_before: elevatedPhase,
        estrategia: "estrategia_05",
        disponivel_desde_minuto: minute,
        placar_na_captura: ctx.score_text,
        over_05_odd: over0,
        over_05_odd_ultima: over0,
        over_05_line: over0Line,
        captured_at: nowIso,
        resultado: "pending",
        is_live: true,
        last_minute: minute,
        hctg_lines: hctgSnap.lines,
        hctg_source: hctgSnap.source,
        hctg_fetched_at: nowIso,
        elevated_odds_log: [{
          at: nowIso,
          minute,
          score: ctx.score_text,
          line: over0Line,
          odd: over0,
          remaining: 0.5,
        }],
        updated_at: nowIso,
      });
      return "captured";
    }

    await supabase.from("futebol_mercado_gols_05").insert({
      event_id: eventId,
      home: ctx.home,
      away: ctx.away,
      league: ctx.league,
      country: ctx.country,
      betano_url: ctx.betano_url,
      indisponivel_ate_minuto: minute,
      had_min_plus2_before: elevatedPhase,
      resultado: "watching",
      is_live: true,
      last_minute: minute,
      hctg_lines: hctgSnap.lines,
      hctg_source: hctgSnap.source,
      hctg_fetched_at: hctgSnap.lines.length > 0 ? nowIso : null,
      updated_at: nowIso,
    });
    if (hctgSnap.lines.length > 0) {
      await appendMercadoElevatedOddsLog(
        supabase,
        eventId,
        ctx,
        hctgSnap,
        [],
      );
    }
    return null;
  }

  if (existing.resultado === "watching") {
    if (existing.telegram_capture_sent_at) return null;
    if (existing.telegram_confirmacao === "recusada") return null;
    if (over0 == null) {
      const hadMinPlus2 = existing.had_min_plus2_before || elevatedPhase;
      await touchMercadoWatching(supabase, eventId, ctx, hctgSnap, existing, hadMinPlus2);
      return null;
    }
    if (!trueOver05) {
      const hadMinPlus2 = existing.had_min_plus2_before || elevatedPhase;
      await touchMercadoWatching(supabase, eventId, ctx, hctgSnap, existing, hadMinPlus2);
      return null;
    }
    const indisponivel = existing.indisponivel_ate_minuto ?? (minute != null ? minute - 1 : null);
    const hadMinPlus2 = existing.had_min_plus2_before || elevatedPhase;
    await applyMercadoGols05Capture(
      supabase,
      eventId,
      ctx,
      { ...totals, over_0_odd: over0, over_0_line: over0Line },
      over0,
      "estrategia_05",
      indisponivel,
      hadMinPlus2,
      "watching",
    );
    return "captured";
  }

  // Partida saiu do overview (ex. suspensa) e voltou: reabre monitoramento
  if (existing.resultado === "sem_linha_05" || existing.resultado === "skipped") {

    if (over0 != null && trueOver05) {
      await applyMercadoGols05Capture(
        supabase,
        eventId,
        ctx,
        { ...totals, over_0_odd: over0, over_0_line: over0Line },
        over0,
        "estrategia_05",
        existing.indisponivel_ate_minuto ?? (minute != null ? minute - 1 : null),
        existing.had_min_plus2_before || elevatedPhase,
        existing.resultado,
      );
      await insertSistemaLog(supabase, {
        source: "edge-live",
        action: "mercado_reaberto",
        message: `Jogo voltou ao vivo apos encerramento prematuro — captura +0,5`,
        event_id: eventId,
        match_label: matchLabel(ctx.home, ctx.away),
        payload: { from: existing.resultado, to: "pending", minute, score: ctx.score_text },
      });
      return "captured";
    }

    await supabase.from("futebol_mercado_gols_05").update({
      resultado: "watching",
      is_live: true,
      placar_final: null,
      settled_at: null,
      last_minute: minute,
      indisponivel_ate_minuto: minute,
      had_min_plus2_before: existing.had_min_plus2_before || elevatedPhase,
      hctg_lines: hctgSnap.lines,
      hctg_source: hctgSnap.source,
      hctg_fetched_at: hctgSnap.lines.length > 0 ? nowIso : existing.hctg_fetched_at,
      updated_at: nowIso,
    }).eq("event_id", eventId).in("resultado", ["sem_linha_05", "skipped"]);
    await insertSistemaLog(supabase, {
      source: "edge-live",
      action: "mercado_reaberto",
      message: `Jogo voltou ao vivo apos encerramento prematuro — monitorando`,
      event_id: eventId,
      match_label: matchLabel(ctx.home, ctx.away),
      payload: { from: existing.resultado, to: "watching", minute, score: ctx.score_text },
    });
    return null;
  }

  // Apos abertura +0,5: continua monitorando a odd ate GREEN/RED
  if (existing.resultado === "pending") {
    await trackMercadoPendingOver05Odd(supabase, eventId, ctx, hctgSnap, existing);
    return null;
  }

  return null;
}

async function revertMercadoInvalidPending(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  hctgSnap: HctgSnapshot,
  row: MercadoGols05Row | null,
): Promise<void> {
  if (!row || row.resultado !== "pending" || !row.placar_na_captura) return;
  if (row.telegram_confirmacao === "confirmada") return;
  const goalsAtCapture = goalsTotalFromScoreText(row.placar_na_captura);
  if (canCaptureNeedLineFromHctg(hctgSnap.lines, goalsAtCapture)) return;
  const nowIso = new Date().toISOString();
  await supabase.from("futebol_mercado_gols_05").update({
    resultado: "watching",
    estrategia: null,
    captured_at: null,
    over_05_odd: null,
    over_05_odd_ultima: null,
    over_05_line: null,
    disponivel_desde_minuto: null,
    placar_na_captura: null,
    updated_at: nowIso,
  }).eq("event_id", eventId).eq("resultado", "pending");
}

/** Minutos fora do overview antes de encerrar (suspensao/glitch). Default ~2 ciclos de 2 min. */
const OFF_LIVE_GRACE_MIN = Math.max(
  2,
  Number(Deno.env.get("OFF_LIVE_GRACE_MIN") || "5") || 5,
);

type LiveValidationLine = {
  event_id: string;
  label: string;
  home?: string | null;
  away?: string | null;
  status: "confere" | "erro" | "atencao";
  reason?: string;
};

type ConferenceMatchLine = {
  event_id: string;
  label: string;
  minute: number | null;
  score: string;
  statusLabel: "Monitorando" | "Aposta" | "GREEN" | "RED" | "Finalizado";
};

type LiveCountReconcile = {
  json_live: number;
  mercado_live_open: number;
  historico_live: number;
  missing_from_json: string[];
  held_by_grace: string[];
  finalized: string[];
  confere: number;
  erro: number;
  atencao: number;
  lines: LiveValidationLine[];
};

type LiveConferenceCycle = {
  reconcile: LiveCountReconcile;
  aoVivo: ConferenceMatchLine[];
  greensAgora: ConferenceMatchLine[];
  finalizadosAgora: ConferenceMatchLine[];
};

const CONFERENCE_SEP =
  "_______________________________________________________";

function formatScoreDisplay(score: string | null | undefined): string {
  const raw = String(score ?? "—").trim();
  if (!raw || raw === "—") return "—";
  const m = raw.match(/^(\d+)\s*[-:xX]\s*(\d+)$/);
  if (m) return `${m[1]} x ${m[2]}`;
  return raw.replace(/-/g, " x ");
}

function formatConferenceMatchLine(line: ConferenceMatchLine): string {
  const min = line.minute != null ? `${line.minute}'` : "—'";
  return `${line.label} - ${min} - ${formatScoreDisplay(line.score)} (${line.statusLabel})`;
}

function buildLiveConferenceMessage(cycle: LiveConferenceCycle): string {
  const parts = [
    "Conferência Jogos Ao Vivo",
    `JSON: ${cycle.reconcile.json_live}`,
    `Sistema: ${cycle.reconcile.mercado_live_open}`,
    CONFERENCE_SEP,
    "Jogos Ao Vivo:",
    ...(cycle.aoVivo.length
      ? cycle.aoVivo.map(formatConferenceMatchLine)
      : ["(nenhum)"]),
  ];
  if (cycle.greensAgora.length) {
    parts.push(
      CONFERENCE_SEP,
      "GREEN Agora:",
      ...cycle.greensAgora.map(formatConferenceMatchLine),
    );
  }
  if (cycle.finalizadosAgora.length) {
    parts.push(
      CONFERENCE_SEP,
      "Finalizados Agora:",
      ...cycle.finalizadosAgora.map(formatConferenceMatchLine),
    );
  }
  return parts.join("\n");
}

function minutesSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 60000;
}

/** Monta linhas Confere/Erro/Atenção: JSON overview vs mercado is_live. */
function buildLiveValidationLines(
  liveIds: string[],
  jsonById: Map<string, { home: string | null; away: string | null }>,
  sistemaRows: Array<{ event_id: string; home: unknown; away: unknown }>,
  heldByGrace: Set<string>,
): LiveValidationLine[] {
  const sistemaById = new Map<string, { home: string | null; away: string | null }>();
  for (const row of sistemaRows) {
    const id = String(row.event_id);
    sistemaById.set(id, {
      home: row.home != null ? String(row.home) : null,
      away: row.away != null ? String(row.away) : null,
    });
  }

  const liveSet = new Set(liveIds.map(String));
  const allIds = new Set<string>([...liveSet, ...sistemaById.keys()]);
  const lines: LiveValidationLine[] = [];

  for (const eventId of [...allIds].sort()) {
    const inJson = liveSet.has(eventId);
    const inSistema = sistemaById.has(eventId);
    const meta = jsonById.get(eventId) ?? sistemaById.get(eventId) ?? {
      home: null,
      away: null,
    };
    const label = matchLabel(meta.home, meta.away) ?? eventId;

    if (inJson && inSistema) {
      lines.push({
        event_id: eventId,
        label,
        home: meta.home,
        away: meta.away,
        status: "confere",
      });
      continue;
    }

    if (inSistema && !inJson) {
      if (heldByGrace.has(eventId)) {
        lines.push({
          event_id: eventId,
          label,
          home: meta.home,
          away: meta.away,
          status: "atencao",
          reason: "Fora do JSON — aguardando confirmação (possível suspensão)",
        });
      } else {
        lines.push({
          event_id: eventId,
          label,
          home: meta.home,
          away: meta.away,
          status: "erro",
          reason: "Jogo já foi encerrado na Betano",
        });
      }
      continue;
    }

    // Só no JSON
    lines.push({
      event_id: eventId,
      label,
      home: meta.home,
      away: meta.away,
      status: "erro",
      reason: "Jogo está encerrado no sistema e está ao vivo na Betano",
    });
  }

  return lines;
}

/**
 * Compara contagens JSON vs tabelas a cada cron e so encerra jogo ausente
 * do overview apos OFF_LIVE_GRACE_MIN (evita "finalizado" em partida suspensa).
 */
async function finalizeMercadoGols05OffLive(
  supabase: ReturnType<typeof createClient>,
  liveIds: string[],
  jsonById: Map<string, { home: string | null; away: string | null }>,
  epoch: string,
): Promise<{
  wins: number;
  losses: number;
  semLinha: number;
  reconcile: LiveCountReconcile;
  greensAgora: ConferenceMatchLine[];
  finalizadosAgora: ConferenceMatchLine[];
  aoVivo: ConferenceMatchLine[];
}> {
  let wins = 0;
  let losses = 0;
  let semLinha = 0;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const liveSet = new Set(liveIds.map(String));
  const greensAgora: ConferenceMatchLine[] = [];
  const finalizadosAgora: ConferenceMatchLine[] = [];

  const { data: openRows } = await supabase
    .from("futebol_mercado_gols_05")
    .select(
      "event_id,home,away,resultado,disponivel_desde_minuto,over_05_odd,captured_at,indisponivel_ate_minuto,had_min_plus2_before,last_minute",
    )
    .eq("is_live", true)
    .in("resultado", ["watching", "pending"]);

  const { count: historicoLiveCount } = await supabase
    .from("futebol_historico_jogos")
    .select("event_id", { count: "exact", head: true })
    .eq("is_live", true);

  const missingFromJson: string[] = [];
  const heldByGrace: string[] = [];
  const finalized: string[] = [];

  for (const row of openRows ?? []) {
    const eventId = String(row.event_id);
    if (liveSet.has(eventId)) continue;
    missingFromJson.push(eventId);

    const { data: game } = await supabase
      .from("futebol_historico_jogos")
      .select("score,home_score,away_score,last_seen_at,updated_at,last_minute")
      .eq("event_id", eventId)
      .maybeSingle();

    const lastSeenMin = minutesSinceIso(
      (game?.last_seen_at as string | null) ?? (game?.updated_at as string | null),
      nowMs,
    );
    // Ainda visto recentemente no historico / overview anterior → nao encerra
    if (lastSeenMin == null || lastSeenMin < OFF_LIVE_GRACE_MIN) {
      heldByGrace.push(eventId);
      continue;
    }

    const scoreText = game?.score ??
      (game?.home_score != null && game?.away_score != null
        ? `${game.home_score}-${game.away_score}`
        : "—");
    const minute = toInt(game?.last_minute) ?? toInt(row.last_minute);
    const label = matchLabel(row.home as string, row.away as string) ?? eventId;

    if (row.resultado === "watching") {
      await supabase.from("futebol_mercado_gols_05").update({
        resultado: "sem_linha_05",
        is_live: false,
        placar_final: scoreText,
        updated_at: nowIso,
      }).eq("event_id", eventId);
      // Finalizado sem linha ja aparece em live_json_vs_sistema (secao Finalizados Agora)
      semLinha += 1;
      finalized.push(eventId);
      finalizadosAgora.push({
        event_id: eventId,
        label,
        minute,
        score: scoreText,
        statusLabel: "Finalizado",
      });
      continue;
    }

    const outcome = await settleMercadoGols05Pending(
      supabase,
      row as MercadoGols05Row,
      scoreText,
      true,
      epoch,
    );
    await supabase.from("futebol_mercado_gols_05").update({
      is_live: false,
      updated_at: nowIso,
    }).eq("event_id", eventId);
    if (outcome === "win") {
      wins += 1;
      greensAgora.push({
        event_id: eventId,
        label,
        minute,
        score: scoreText,
        statusLabel: "GREEN",
      });
    } else if (outcome === "loss") {
      losses += 1;
    }
    finalized.push(eventId);
    finalizadosAgora.push({
      event_id: eventId,
      label,
      minute,
      score: scoreText,
      statusLabel: outcome === "loss" ? "RED" : "Finalizado",
    });
  }

  const { data: settledStillLive } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id")
    .eq("is_live", true)
    .in("resultado", ["win", "loss", "sem_linha_05", "skipped", "excluido"]);

  for (const row of settledStillLive ?? []) {
    const eventId = String(row.event_id);
    if (liveSet.has(eventId)) continue;
    await supabase.from("futebol_mercado_gols_05").update({
      is_live: false,
      updated_at: nowIso,
    }).eq("event_id", eventId);
  }

  // Ao vivo restantes (ainda watching/pending apos finalize)
  const { data: stillOpen } = await supabase
    .from("futebol_mercado_gols_05")
    .select("event_id,home,away,resultado,last_minute")
    .eq("is_live", true)
    .in("resultado", ["watching", "pending"]);

  const aoVivoIds = (stillOpen ?? []).map((r) => String(r.event_id));
  const histById = new Map<
    string,
    { score: string | null; last_minute: number | null }
  >();
  if (aoVivoIds.length) {
    const { data: histRows } = await supabase
      .from("futebol_historico_jogos")
      .select("event_id,score,home_score,away_score,last_minute")
      .in("event_id", aoVivoIds);
    for (const h of histRows ?? []) {
      const id = String(h.event_id);
      const score = (h.score as string | null) ??
        (h.home_score != null && h.away_score != null
          ? `${h.home_score}-${h.away_score}`
          : null);
      histById.set(id, {
        score,
        last_minute: toInt(h.last_minute),
      });
    }
  }

  const aoVivo: ConferenceMatchLine[] = (stillOpen ?? [])
    .map((r) => {
      const eventId = String(r.event_id);
      const jsonMeta = jsonById.get(eventId);
      const hist = histById.get(eventId);
      const label = matchLabel(
        (jsonMeta?.home ?? r.home) as string | null,
        (jsonMeta?.away ?? r.away) as string | null,
      ) ?? eventId;
      return {
        event_id: eventId,
        label,
        minute: hist?.last_minute ?? toInt(r.last_minute),
        score: hist?.score ?? "—",
        statusLabel: (r.resultado === "pending" ? "Aposta" : "Monitorando") as
          | "Aposta"
          | "Monitorando",
      };
    })
    .sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0));

  const graceSet = new Set(heldByGrace);
  const lines = buildLiveValidationLines(
    liveIds,
    jsonById,
    (openRows ?? []).map((r) => ({
      event_id: String(r.event_id),
      home: r.home,
      away: r.away,
    })),
    graceSet,
  );
  const confere = lines.filter((l) => l.status === "confere").length;
  const erro = lines.filter((l) => l.status === "erro").length;
  const atencao = lines.filter((l) => l.status === "atencao").length;

  const reconcile: LiveCountReconcile = {
    json_live: liveIds.length,
    mercado_live_open: (stillOpen ?? []).length,
    historico_live: historicoLiveCount ?? 0,
    missing_from_json: missingFromJson,
    held_by_grace: heldByGrace,
    finalized,
    confere,
    erro,
    atencao,
    lines,
  };

  return {
    wins,
    losses,
    semLinha,
    reconcile,
    greensAgora,
    finalizadosAgora,
    aoVivo,
  };
}

function buildSignal(row: {
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  home_shots_on_target: number | null;
  away_shots_on_target: number | null;
  home_corners: number | null;
  away_corners: number | null;
  home_goal_kicks: number | null;
  away_goal_kicks: number | null;
}): string {
  const { minute, home_score, away_score } = row;
  const hasStats = row.home_shots_on_target != null || row.away_shots_on_target != null ||
    row.home_corners != null || row.away_corners != null ||
    row.home_goal_kicks != null || row.away_goal_kicks != null;

  if (minute == null) return "sem minuto";

  // Antes dos 85': estudo (stats disponiveis para acompanhar)
  if (minute < MIN_MINUTE_DEFAULT) {
    const sotH = row.home_shots_on_target ?? "-";
    const sotA = row.away_shots_on_target ?? "-";
    const cH = row.home_corners ?? "-";
    const cA = row.away_corners ?? "-";
    const gkH = row.home_goal_kicks ?? "-";
    const gkA = row.away_goal_kicks ?? "-";
    if (!hasStats) return `em estudo (${minute}') · stats indisponiveis`;
    return `em estudo (${minute}') · SOT ${sotH}-${sotA} · esc ${cH}-${cA} · meta ${gkH}-${gkA}`;
  }

  if (home_score == null || away_score == null) return "sem placar";

  if (home_score > away_score) {
    const tSot = row.away_shots_on_target ?? 0;
    const tCorners = row.away_corners ?? 0;
    if (!hasStats) return "manter placar (casa) · stats indisponiveis — conferir Betano";
    const risk = pressureLabel(tSot * 2 + tCorners, [4, 10]);
    return `manter placar (casa) · ${risk} no lider (perdedor SOT ${tSot}/esc ${tCorners})`;
  }
  if (away_score > home_score) {
    const tSot = row.home_shots_on_target ?? 0;
    const tCorners = row.home_corners ?? 0;
    if (!hasStats) return "manter placar (fora) · stats indisponiveis — conferir Betano";
    const risk = pressureLabel(tSot * 2 + tCorners, [4, 10]);
    return `manter placar (fora) · ${risk} no lider (perdedor SOT ${tSot}/esc ${tCorners})`;
  }

  const shots = (row.home_shots_on_target ?? 0) + (row.away_shots_on_target ?? 0);
  const corners = (row.home_corners ?? 0) + (row.away_corners ?? 0);
  if (!hasStats) return "manter empate · stats indisponiveis — conferir Betano";
  const risk = pressureLabel(shots * 2 + corners, [8, 16]);
  return `manter empate · ${risk} (SOT ${shots}, esc ${corners})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const header = req.headers.get("x-cron-secret");
    if (header !== cronSecret) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "missing supabase env" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  if (!(await isColetaAtiva(supabase))) {
    return jsonResponse({
      ok: true,
      paused: true,
      message: "Sistema pausado (futebol_live_coleta_config.ativo=false)",
    });
  }

  const notes: string[] = [
    "Coleta via Edge Function (IP nuvem Supabase), sem cookie de conta.",
    "Lista todos os jogos live da Betano (futebol real).",
    "Stats: Sportradar match_details (chutes a gol, escanteios, tiros de meta).",
    "Sinal 'manter placar' so a partir dos 85'; antes disso: em estudo.",
    "Mercado +0,5: Estrategia +0,5 (1a oportunidade, monitora odd ate gol); GREEN ao gol apos captura.",
    "Analise favorito 1X2: odd inicial (JSON live) → odd máxima + minuto → se o favorito venceu.",
    "Odds HCTG (Total de Gols): worker OddsPapi/HTML (ou Kubmix); Edge so le do BD.",
    "Historico: jogos monitorados + gols com minuto (filtro por gol a partir de X').",
  ];

  try {
    const coletaEpoch = await beginColetaEpoch(supabase);
    const overview = asRecord(await betanoGet(supabase, OVERVIEW_URL, coletaEpoch));
    if (!overview) throw new Error("overview invalido");

    const events = eventsMap(overview);
    const leagues = leaguesMap(overview);
    const allEvents = Object.entries(events);
    const football = allEvents.filter(([, ev]) => isFootballEvent(asRecord(ev) ?? {}, overview));

    // Todos os jogos live (para estudar antes dos 85')
    const candidates: Array<Json & { event_id: string }> = [];
    for (const [id, raw] of football) {
      const event = asRecord(raw);
      if (!event) continue;
      candidates.push({ ...event, event_id: id });
    }

    const rows = [];
    let readyCount = 0;
    let statsOk = 0;
    let goalsSaved = 0;
    let goalsTimelineOk = 0;
    let goalsTimelineEmpty = 0;
    let goalsInferred = 0;
    let goalsMissing = 0;
    let mercadoCaptured = 0;
    let mercadoWins = 0;
    let hctgWithLines = 0;
    let hctgEmpty = 0;
    let favoritoOpened = 0;
    let favoritoUpdated = 0;
    const liveIds: string[] = [];
    const jsonById = new Map<string, { home: string | null; away: string | null }>();
    const greensAgora: ConferenceMatchLine[] = [];

    const anchorOverForSort = (ev: Json): number => {
      const markets = asRecord(overview.markets) ?? {};
      const selections = asRecord(overview.selections) ?? {};
      const ids = Array.isArray(ev.marketIdList) ? ev.marketIdList.map(String) : [];
      for (const mid of ids) {
        const rec = asRecord(markets[mid]);
        if (rec?.type !== "HCTG" || !Array.isArray(rec.selectionIdList)) continue;
        for (const sid of rec.selectionIdList) {
          const sel = asRecord(selections[String(sid)]);
          if (!sel) continue;
          const name = String(sel.name ?? "").toLowerCase();
          if (name.includes("mais") || name.includes("over")) {
            const o = toNum(sel.price ?? sel.odds);
            if (o != null) return o;
          }
        }
      }
      return 0;
    };
    candidates.sort((a, b) => anchorOverForSort(b) - anchorOverForSort(a));

    const { data: mercadoLiveRows } = await supabase
      .from("futebol_mercado_gols_05")
      .select("event_id,resultado")
      .eq("is_live", true)
      .in("resultado", ["watching", "pending"]);
    const mercadoResultadoByEvent = new Map<string, string>();
    for (const row of mercadoLiveRows ?? []) {
      mercadoResultadoByEvent.set(String(row.event_id), String(row.resultado));
    }

    const hctgByEvent = await loadHctgSnapshotsByEvent(
      supabase,
      candidates.map((c) => String(c.event_id)),
    );

    for (let eventIdx = 0; eventIdx < candidates.length; eventIdx++) {
      const event = candidates[eventIdx];
      const eventId = String(event.event_id);
      await assertColetaAtiva(supabase, `jogo-${eventId}`, coletaEpoch);
      const teams = extractTeams(event);
      const score = extractScore(event);
      const league = extractLeague(event, leagues);
      const minute = extractMinute(event);
      const injury = extractInjuryTime(event);
      // 1X2 do overview JSON — base da analise favorito (odd inicial → máximo).
      const ml = extractMlOdds(eventId, overview);
      // #region agent log
      if (
        eventId === "88720263" ||
        /bulls|illawarra/i.test(`${teams.home} ${teams.away}`) ||
        (ml.home != null && ml.home <= 1.02) ||
        (ml.away != null && ml.away <= 1.02)
      ) {
        await insertSistemaLog(supabase, {
          level: "info",
          source: "debug-230425",
          action: "favorito_ml_extract",
          message: "extractMlOdds debug",
          event_id: eventId,
          match_label: matchLabel(teams.home, teams.away),
          payload: {
            hypothesisId: "H2-H3",
            home: ml.home,
            draw: ml.draw,
            away: ml.away,
            matchedMarket: ml.matchedMarket,
            matchedTypeId: ml.matchedTypeId,
            marketCount: ml.marketCount,
            minute,
            score: score.text,
          },
        });
      }
      // #endregion
      const goalsTotal = (score.home ?? 0) + (score.away ?? 0);
      const mercadoResultado = mercadoResultadoByEvent.get(eventId) ?? null;
      const url = betanoUrl(eventId, teams.home, teams.away);
      const hctgSnap = hctgByEvent.get(eventId) ?? { ...EMPTY_HCTG };
      if (hctgSnap.lines.length > 0) hctgWithLines += 1;
      else hctgEmpty += 1;
      // Odds totais so a partir do Worker (hctg_lines no BD) — nunca do JSON Betano.
      const totals = buildTotalsFromHctgSnapshot(hctgSnap, goalsTotal);

      const under = totals;

      const betradarId = extractBetradarMatchId(event);
      const stats = await tryFetchStats(
        supabase,
        betradarId != null ? String(betradarId) : null,
        coletaEpoch,
      );
      if (stats.available) statsOk += 1;

      const rowBase = {
        minute,
        home_score: score.home,
        away_score: score.away,
        home_shots_on_target: stats.home_shots_on_target,
        away_shots_on_target: stats.away_shots_on_target,
        home_corners: stats.home_corners,
        away_corners: stats.away_corners,
        home_goal_kicks: stats.home_goal_kicks,
        away_goal_kicks: stats.away_goal_kicks,
      };

      const signal = buildSignal(rowBase);
      if (minute != null && minute >= MIN_MINUTE_DEFAULT) readyCount += 1;

      liveIds.push(eventId);
      jsonById.set(eventId, { home: teams.home, away: teams.away });

      rows.push({
        event_id: eventId,
        home: teams.home,
        away: teams.away,
        league: league.league,
        country: league.country,
        minute,
        injury_time: injury,
        home_score: score.home,
        away_score: score.away,
        score: score.text,
        home_shots_on_target: stats.home_shots_on_target,
        away_shots_on_target: stats.away_shots_on_target,
        home_shots_total: stats.home_shots_total,
        away_shots_total: stats.away_shots_total,
        home_corners: stats.home_corners,
        away_corners: stats.away_corners,
        home_goal_kicks: stats.home_goal_kicks,
        away_goal_kicks: stats.away_goal_kicks,
        ml_home: ml.home,
        ml_draw: ml.draw,
        ml_away: ml.away,
        under_line: under.under_0_line,
        under_odd: under.under_0_odd,
        under_0_line: under.under_0_line,
        under_0_odd: under.under_0_odd,
        under_1_line: under.under_1_line,
        under_1_odd: under.under_1_odd,
        under_2_line: under.under_2_line,
        under_2_odd: under.under_2_odd,
        over_0_line: totals.over_0_line,
        over_0_odd: totals.over_0_odd,
        over_1_line: totals.over_1_line,
        over_1_odd: totals.over_1_odd,
        over_2_line: totals.over_2_line,
        over_2_odd: totals.over_2_odd,
        signal,
        betano_url: url,
        stats_available: stats.available,
        raw: {
          event,
          betradarMatchId: betradarId,
          stats: stats.raw,
        },
        updated_at: new Date().toISOString(),
      });

      // Historico persistente (nao apaga quando o jogo sai do live)
      const nowIso = new Date().toISOString();

      const { data: prevGame } = await supabase
        .from("futebol_historico_jogos")
        .select("home_score,away_score")
        .eq("event_id", eventId)
        .maybeSingle();
      const prevHome = prevGame?.home_score ?? 0;
      const prevAway = prevGame?.away_score ?? 0;
      const currHome = score.home ?? 0;
      const currAway = score.away ?? 0;

      const shotsSum =
        stats.home_shots_on_target != null || stats.away_shots_on_target != null
          ? (stats.home_shots_on_target ?? 0) + (stats.away_shots_on_target ?? 0)
          : null;
      const cornersSum =
        stats.home_corners != null || stats.away_corners != null
          ? (stats.home_corners ?? 0) + (stats.away_corners ?? 0)
          : null;
      const kicksSum =
        stats.home_goal_kicks != null || stats.away_goal_kicks != null
          ? (stats.home_goal_kicks ?? 0) + (stats.away_goal_kicks ?? 0)
          : null;
      const cteSum =
        shotsSum != null || cornersSum != null || kicksSum != null
          ? (shotsSum ?? 0) + (cornersSum ?? 0) + (kicksSum ?? 0)
          : null;

      await supabase.from("futebol_historico_jogos").upsert({
        event_id: eventId,
        betradar_match_id: betradarId != null ? String(betradarId) : null,
        home: teams.home,
        away: teams.away,
        league: league.league,
        country: league.country,
        home_score: score.home,
        away_score: score.away,
        score: score.text,
        last_minute: minute,
        shots_on_target: shotsSum,
        corners: cornersSum,
        goal_kicks: kicksSum,
        cte: cteSum,
        is_live: true,
        betano_url: url,
        last_seen_at: nowIso,
        updated_at: nowIso,
      }, { onConflict: "event_id" });

      const favAction = await processFavoritoDriftLive(supabase, {
        event_id: eventId,
        home: teams.home,
        away: teams.away,
        league: league.league,
        country: league.country,
        betano_url: url,
        minute,
        home_score: score.home,
        away_score: score.away,
        score_text: score.text,
        ml_home: ml.home,
        ml_draw: ml.draw,
        ml_away: ml.away,
      });
      if (favAction === "opened") favoritoOpened += 1;
      if (favAction === "updated") favoritoUpdated += 1;

      const timelineResult = await fetchGoalsTimeline(
        eventId,
        betradarId != null ? String(betradarId) : null,
        teams.home,
        teams.away,
      );
      const timelineGoals = timelineResult.goals;
      if (timelineGoals.length > 0) goalsTimelineOk += 1;
      else if (betradarId != null && goalsTotal > 0) goalsTimelineEmpty += 1;

      const inferredGoals = inferGoalsFromScoreDelta(
        eventId,
        prevHome,
        prevAway,
        currHome,
        currAway,
        minute,
        teams.home,
        teams.away,
      );
      if (inferredGoals.length > 0) goalsInferred += inferredGoals.length;

      const persist = await persistEventGoals(
        supabase,
        eventId,
        timelineGoals,
        inferredGoals,
        score.home,
        score.away,
      );
      if (persist.saved > 0) goalsSaved += persist.saved;
      if (persist.source === "missing" || persist.status === "missing" || persist.status === "partial") {
        goalsMissing += 1;
      }

      const { data: mercadoRow } = await supabase
        .from("futebol_mercado_gols_05")
        .select(
          "event_id,resultado,captured_at,disponivel_desde_minuto,indisponivel_ate_minuto,had_min_plus2_before,over_05_odd,over_05_odd_ultima,over_05_line,placar_na_captura,elevated_odds_log,telegram_capture_sent_at,telegram_confirmacao,hctg_fetched_at",
        )
        .eq("event_id", eventId)
        .maybeSingle();

      const mercadoAction = await processMercadoGols05Live(
        supabase,
        eventId,
        totals,
        hctgSnap,
        {
          home: teams.home,
          away: teams.away,
          league: league.league,
          country: league.country,
          betano_url: url,
          minute,
          score_text: score.text,
        },
        mercadoRow as MercadoGols05Row | null,
        coletaEpoch,
      );
      if (mercadoRow?.resultado === "pending") {
        await revertMercadoInvalidPending(
          supabase,
          eventId,
          hctgSnap,
          mercadoRow as MercadoGols05Row | null,
        );
      }
      if (mercadoAction === "captured") {
        mercadoCaptured += 1;
        const { data: capRow } = await supabase
          .from("futebol_mercado_gols_05")
          .select("over_05_odd,over_05_line,estrategia,placar_na_captura")
          .eq("event_id", eventId)
          .maybeSingle();
        await insertSistemaLog(supabase, {
          source: "edge-live",
          action: "mercado_captura",
          message: `Capturou +0,5 @ ${capRow?.over_05_odd ?? "?"} (min ${minute ?? "?"})`,
          event_id: eventId,
          match_label: matchLabel(teams.home, teams.away),
          payload: {
            minute,
            estrategia: capRow?.estrategia ?? null,
            over_05_odd: capRow?.over_05_odd ?? null,
            over_05_line: capRow?.over_05_line ?? null,
            placar_na_captura: capRow?.placar_na_captura ?? score.text,
          },
        });
        await notifyTelegramCaptureOffer(supabase, eventId);
      }

      const needsSettle = mercadoRow?.resultado === "pending" || mercadoAction === "captured";
      if (needsSettle) {
        const { data: mercadoNow } = await supabase
          .from("futebol_mercado_gols_05")
          .select(
            "event_id,resultado,captured_at,disponivel_desde_minuto,indisponivel_ate_minuto,had_min_plus2_before,over_05_odd",
          )
          .eq("event_id", eventId)
          .maybeSingle();
        if (mercadoNow?.resultado === "pending") {
          const out = await settleMercadoGols05Pending(
            supabase,
            mercadoNow as MercadoGols05Row,
            score.text,
            false,
            coletaEpoch,
          );
          if (out === "win") {
            mercadoWins += 1;
            greensAgora.push({
              event_id: eventId,
              label: matchLabel(teams.home, teams.away) ?? eventId,
              minute,
              score: score.text,
              statusLabel: "GREEN",
            });
          }
        }
      }

      const { data: mercadoSnap } = await supabase
        .from("futebol_mercado_gols_05")
        .select("event_id,is_live,resultado")
        .eq("event_id", eventId)
        .maybeSingle();
      if (
        mercadoSnap?.is_live &&
        mercadoSnap.resultado !== "excluido"
      ) {
        await syncMercadoLiveSnapshot(
          supabase,
          eventId,
          minute,
          score.text,
          totals,
        );
        if (
          mercadoSnap.resultado === "win" ||
          mercadoSnap.resultado === "loss"
        ) {
          await supabase.from("futebol_mercado_gols_05").update({
            placar_final: score.text,
            updated_at: new Date().toISOString(),
          }).eq("event_id", eventId).in("resultado", ["win", "loss"]);
        }
      }
    }

    const reconcile = await reconcileHistoricGoals(supabase, 120);

    await assertColetaAtiva(supabase, "finalize", coletaEpoch);

    const mercadoFinalize = await finalizeMercadoGols05OffLive(
      supabase,
      liveIds,
      jsonById,
      coletaEpoch,
    );
    mercadoWins += mercadoFinalize.wins;

    const greenIds = new Set(greensAgora.map((g) => g.event_id));
    for (const g of mercadoFinalize.greensAgora) {
      if (!greenIds.has(g.event_id)) {
        greensAgora.push(g);
        greenIds.add(g.event_id);
      }
    }

    const reportLines = [
      `Jogos Ao Vivo no JSON: ${mercadoFinalize.reconcile.json_live}`,
      `Jogos Ao Vivo no Sistema: ${mercadoFinalize.reconcile.mercado_live_open}`,
      "",
      "Consulta de Jogos JSON x Sistema:",
      ...mercadoFinalize.reconcile.lines.map((l) => {
        if (l.status === "confere") return `${l.label} (Confere) ✓`;
        if (l.status === "atencao") {
          return `${l.label} (Atenção) ${l.reason ?? ""}`.trim();
        }
        return `${l.label} (Erro) ${l.reason ?? ""}`.trim();
      }),
    ];

    const conferenceCycle: LiveConferenceCycle = {
      reconcile: mercadoFinalize.reconcile,
      aoVivo: mercadoFinalize.aoVivo,
      greensAgora,
      finalizadosAgora: mercadoFinalize.finalizadosAgora,
    };

    await assertColetaAtiva(supabase, "log-conferencia", coletaEpoch);

    await insertSistemaLog(supabase, {
      // error = vermelho no painel; info = Sistema azul (ok)
      level: mercadoFinalize.reconcile.erro > 0 ? "error" : "info",
      source: "edge-live",
      action: "live_json_vs_sistema",
      message: buildLiveConferenceMessage(conferenceCycle),
      payload: {
        ...mercadoFinalize.reconcile,
        grace_min: OFF_LIVE_GRACE_MIN,
        report: reportLines.join("\n"),
        ao_vivo: mercadoFinalize.aoVivo,
        greens_agora: greensAgora,
        finalizados_agora: mercadoFinalize.finalizadosAgora,
      },
    });

    // Historico: so marca finished apos mesma gracia (partida suspensa nao some do live)
    if (liveIds.length > 0) {
      const graceCutoff = new Date(
        Date.now() - OFF_LIVE_GRACE_MIN * 60 * 1000,
      ).toISOString();
      await supabase
        .from("futebol_historico_jogos")
        .update({
          is_live: false,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("is_live", true)
        .not("event_id", "in", `(${liveIds.join(",")})`)
        .lt("last_seen_at", graceCutoff);
    }

    const favoritoFinalize = await finalizeFavoritoDriftOffLive(supabase, liveIds);

    rows.sort((a, b) => (b.minute ?? 0) - (a.minute ?? 0));

    await supabase.from("futebol_live_meta").upsert({
      id: 1,
      source: "betano-danae+sportradar",
      fetched_at: new Date().toISOString(),
      live_total: football.length,
      candidates: readyCount,
      total: rows.length,
      notes: [
        ...notes,
        `Stats ok em ${statsOk}/${rows.length} jogos.`,
        `Gols gravados nesta rodada: ${goalsSaved}.`,
        `Mercado +0,5: ${mercadoCaptured} captura(s), ${mercadoWins} green(s), ${mercadoFinalize.losses} red(s), ${mercadoFinalize.semLinha} sem linha +0,5 nesta rodada.`,
        `Live reconcile: JSON=${mercadoFinalize.reconcile.json_live} mercado=${mercadoFinalize.reconcile.mercado_live_open} historico=${mercadoFinalize.reconcile.historico_live}` +
          ` · confere=${mercadoFinalize.reconcile.confere}` +
          (mercadoFinalize.reconcile.atencao
            ? ` atenção=${mercadoFinalize.reconcile.atencao}`
            : "") +
          (mercadoFinalize.reconcile.erro
            ? ` erro=${mercadoFinalize.reconcile.erro}`
            : "") +
          (mercadoFinalize.reconcile.held_by_grace.length
            ? ` gracia=${mercadoFinalize.reconcile.held_by_grace.length}`
            : "") +
          (mercadoFinalize.reconcile.finalized.length
            ? ` encerrados=${mercadoFinalize.reconcile.finalized.length}`
            : "") +
          ".",
        `Favorito 1X2: ${favoritoOpened} abertura(s), ${favoritoUpdated} update(s), ${favoritoFinalize.settled} settle(s) nesta rodada.`,
        `HCTG odds: worker OddsPapi/HTML (${hctgWithLines} com linhas, ${hctgEmpty} sem linha no BD).`,
        `Gols timeline ok: ${goalsTimelineOk}, timeline vazia c/ placar: ${goalsTimelineEmpty}, inferidos: ${goalsInferred}, sem gols c/ placar: ${goalsMissing}.`,
        `Reconciliacao: ${reconcile.scanned} analisados, ${reconcile.fixed} ok, ${reconcile.backfilled} parcial/missing.`,
      ].filter(Boolean),
      last_error: null,
      updated_at: new Date().toISOString(),
    });

    await supabase.from("futebol_live_coleta_config").update({
      last_run_at: new Date().toISOString(),
      last_saved_count: rows.length,
      last_error: null,
    }).eq("id", "default");

    await processPendingTelegramReminders(supabase);
    await processPendingTelegramSettlements(supabase);

    return jsonResponse({
      ok: true,
      live_total: football.length,
      ready_85: readyCount,
      stats_ok: statsOk,
      total: rows.length,
      hctg_source: "oddspapi-or-db",
      hctg_with_lines: hctgWithLines,
      hctg_empty: hctgEmpty,
      favorito_opened: favoritoOpened,
      favorito_updated: favoritoUpdated,
      favorito_settled: favoritoFinalize.settled,
      sample: rows.slice(0, 5).map((r) => ({
        home: r.home,
        away: r.away,
        minute: r.minute,
        score: r.score,
        ml: `${r.ml_home ?? "-"} / ${r.ml_draw ?? "-"} / ${r.ml_away ?? "-"}`,
        sot: `${r.home_shots_on_target}-${r.away_shots_on_target}`,
        corners: `${r.home_corners}-${r.away_corners}`,
        goal_kicks: `${r.home_goal_kicks}-${r.away_goal_kicks}`,
        odd0: r.under_0_odd,
        odd1: r.under_1_odd,
        odd2: r.under_2_odd,
        signal: r.signal,
      })),
    });
  } catch (err) {
    if (err instanceof ColetaPausadaError) {
      return jsonResponse({
        ok: true,
        paused: true,
        message: err.message,
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    await insertSistemaLog(supabase, {
      level: "error",
      source: "edge-live",
      action: "erro",
      message: `Erro no cron live: ${message}`,
      payload: { error: message },
    });
    await supabase.from("futebol_live_meta").upsert({
      id: 1,
      source: "betano-danae",
      last_error: message,
      updated_at: new Date().toISOString(),
    });
    await supabase.from("futebol_live_coleta_config").update({
      last_error: message,
    }).eq("id", "default");
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

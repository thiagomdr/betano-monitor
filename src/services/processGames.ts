import type { ParsedGame } from '../types/game';
import type { AlertaRegistroInput } from '../types/coleta';
import type { FonteParser } from '../types/coleta';
import {
  criarAlertaRegistro,
  registrarColetaSilenciosa,
} from './coletasSupabase';
import { parseWithLlm } from './parseLlm';
import { buildGameKeyFromGame, parseLocal, validateParsedGames } from './parseLocal';
import { detectQ2Alerts, formatAlertBody } from './rules';
import { showGameAlert } from './notifications';
import { getGameState, markAlertSent, upsertGameState } from './store';

export interface ProcessResult {
  games: ParsedGame[];
  source: FonteParser;
  alerts: number;
  message: string;
  alertasRegistro: AlertaRegistroInput[];
}

export async function parseGamesFromText(text: string): Promise<{
  games: ParsedGame[];
  source: FonteParser;
}> {
  const local = parseLocal(text);
  if (local) {
    const valid = validateParsedGames(local);
    if (valid.length > 0) {
      return { games: valid, source: 'local' };
    }
  }

  const fromLlm = await parseWithLlm(text);
  if (fromLlm && fromLlm.length > 0) {
    return { games: fromLlm, source: 'llm' };
  }

  return { games: [], source: 'nenhum' };
}

export async function processGames(games: ParsedGame[]): Promise<ProcessResult> {
  let alerts = 0;
  const alertasRegistro: AlertaRegistroInput[] = [];

  for (const game of games) {
    const gameKey = buildGameKeyFromGame(game);
    const previous = await getGameState(gameKey);
    const previousPeriod = previous?.period ?? null;

    await upsertGameState(game);

    if (previous?.alertSent) continue;

    const candidate = detectQ2Alerts(previousPeriod, game);
    if (!candidate) continue;

    await showGameAlert(
      `🏀 Fim do 2º quarto — +${candidate.pointDiff} pts`,
      formatAlertBody(candidate),
    );
    await markAlertSent(gameKey);
    alerts += 1;
    alertasRegistro.push(
      criarAlertaRegistro(game, previousPeriod, candidate.pointDiff),
    );
  }

  return {
    games,
    source: 'nenhum',
    alerts,
    alertasRegistro,
    message:
      games.length === 0
        ? 'Nenhum jogo de basquete identificado'
        : `${games.length} jogo(s) processado(s), ${alerts} alerta(s)`,
  };
}

export async function runCollectionCycleFromApi(
  games: ParsedGame[],
  resumoJson: string,
): Promise<ProcessResult> {
  const result = await processGames(games);
  const finalResult: ProcessResult = { ...result, source: 'api' };
  const semJogos = games.length === 0;

  void registrarColetaSilenciosa({
    texto: resumoJson,
    fonteParser: 'api',
    jogos: games,
    sucesso: !semJogos,
    erroMensagem: semJogos ? 'Nenhum jogo de basquete na API ao vivo' : undefined,
    alertas: result.alertasRegistro,
  });

  return finalResult;
}

export async function runCollectionCycle(text: string): Promise<ProcessResult> {
  const { games, source } = await parseGamesFromText(text);
  const result = await processGames(games);
  const finalResult: ProcessResult = { ...result, source };

  const semJogos = games.length === 0;

  void registrarColetaSilenciosa({
    texto: text,
    fonteParser: source,
    jogos: games,
    sucesso: !semJogos,
    erroMensagem: semJogos
      ? 'Nenhum jogo de basquete identificado na página'
      : undefined,
    alertas: result.alertasRegistro,
  });

  return finalResult;
}

export async function runCollectionCycleComErro(
  text: string,
  erroMensagem: string,
): Promise<ProcessResult> {
  const { games, source } = await parseGamesFromText(text);
  const result = await processGames(games);

  void registrarColetaSilenciosa({
    texto: text,
    fonteParser: source,
    jogos: games,
    sucesso: false,
    erroMensagem,
    alertas: result.alertasRegistro,
  });

  return { ...result, source };
}

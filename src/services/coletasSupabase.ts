import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ParsedGame, GamePeriod } from '../types/game';
import type {
  AlertaRegistroInput,
  FonteParser,
  RegistrarColetaInput,
} from '../types/coleta';
import { buildGameKeyFromGame } from './parseLocal';
import { supabase, supabaseConfigurado } from './supabase';

const DISPOSITIVO_ID_KEY = 'betano_monitor_dispositivo_id';
const PREVIEW_MAX_CHARS = 2000;

async function obterDispositivoId(): Promise<string> {
  const existente = await AsyncStorage.getItem(DISPOSITIVO_ID_KEY);
  if (existente) return existente;

  const novo = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DISPOSITIVO_ID_KEY, novo);
  return novo;
}

async function obterUsuarioId(): Promise<string | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) return null;
  return data.session.user.id;
}

export function criarAlertaRegistro(
  game: ParsedGame,
  periodoAnterior: GamePeriod | null,
  pointDiff: number,
): AlertaRegistroInput {
  return {
    gameKey: buildGameKeyFromGame(game),
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    league: game.league,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    pointDiff,
    periodoAnterior,
    periodoAtual: game.period,
  };
}

/**
 * Registra coleta + jogos + alertas no Supabase.
 * Falhas são silenciosas para não bloquear alertas locais.
 */
export async function registrarColeta(
  input: RegistrarColetaInput,
): Promise<{ coletaId: string | null; erro: string | null }> {
  if (!supabaseConfigurado || !supabase) {
    return { coletaId: null, erro: 'Supabase não configurado no .env' };
  }

  const usuarioId = await obterUsuarioId();
  if (!usuarioId) {
    return { coletaId: null, erro: 'Usuário não autenticado no Supabase' };
  }

  try {
    const dispositivoId = await obterDispositivoId();
    const agora = new Date().toISOString();

    const { data: coleta, error: erroColeta } = await supabase
      .from('coletas_betano')
      .insert({
        usuario_id: usuarioId,
        coletado_em: agora,
        fonte_parser: input.fonteParser,
        sucesso: input.sucesso,
        qtd_jogos: input.jogos.length,
        erro_mensagem: input.erroMensagem ?? null,
        texto_tamanho: input.texto.length,
        texto_preview: input.texto.slice(0, PREVIEW_MAX_CHARS),
        dispositivo_id: dispositivoId,
        data_atualizacao: agora,
      })
      .select('id')
      .single();

    if (erroColeta || !coleta?.id) {
      return {
        coletaId: null,
        erro: erroColeta?.message ?? 'Falha ao inserir coletas_betano',
      };
    }

    const coletaId = coleta.id as string;

    if (input.jogos.length > 0) {
      const linhasJogos = input.jogos.map((jogo) => ({
        coleta_id: coletaId,
        game_key: buildGameKeyFromGame(jogo),
        time_casa: jogo.homeTeam,
        time_fora: jogo.awayTeam,
        liga: jogo.league,
        periodo: jogo.period,
        placar_casa: jogo.homeScore,
        placar_fora: jogo.awayScore,
        odd_casa: jogo.homeOdd ?? 0,
        odd_fora: jogo.awayOdd ?? 0,
        tempo_restante: jogo.tempoRestante ?? null,
      }));

      const { error: erroJogos } = await supabase
        .from('jogos_coleta')
        .insert(linhasJogos);

      if (erroJogos) {
        return { coletaId, erro: erroJogos.message };
      }
    }

    if (input.alertas.length > 0) {
      const linhasAlertas = input.alertas.map((alerta) => ({
        usuario_id: usuarioId,
        coleta_id: coletaId,
        game_key: alerta.gameKey,
        time_casa: alerta.homeTeam,
        time_fora: alerta.awayTeam,
        liga: alerta.league,
        placar_casa: alerta.homeScore,
        placar_fora: alerta.awayScore,
        diferenca_pontos: alerta.pointDiff,
        periodo_anterior: alerta.periodoAnterior,
        periodo_atual: alerta.periodoAtual,
        disparado_em: agora,
      }));

      const { error: erroAlertas } = await supabase
        .from('alertas_betano')
        .insert(linhasAlertas);

      if (erroAlertas) {
        return { coletaId, erro: erroAlertas.message };
      }
    }

    return { coletaId, erro: null };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Erro desconhecido no Supabase';
    return { coletaId: null, erro: mensagem };
  }
}

export async function registrarColetaSilenciosa(
  input: RegistrarColetaInput,
): Promise<void> {
  const { erro } = await registrarColeta(input);
  if (erro && __DEV__) {
    console.warn('[coletasSupabase]', erro);
  }
}

export async function testarConexaoSupabase(): Promise<{
  ok: boolean;
  mensagem: string;
}> {
  if (!supabaseConfigurado || !supabase) {
    return { ok: false, mensagem: 'Variáveis Supabase ausentes no .env' };
  }

  const { error } = await supabase.auth.getSession();
  if (error) {
    return { ok: false, mensagem: error.message };
  }

  return { ok: true, mensagem: 'Cliente Supabase inicializado' };
}

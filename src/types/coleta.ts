import type { ParsedGame } from './game';

export type FonteParser = 'local' | 'llm' | 'api' | 'nenhum';

export interface ColetaBetanoRow {
  id: string;
  usuario_id: string;
  coletado_em: string;
  fonte_parser: FonteParser;
  sucesso: boolean;
  qtd_jogos: number;
  erro_mensagem: string | null;
  texto_tamanho: number | null;
  texto_preview: string | null;
  dispositivo_id: string | null;
  data_criacao: string;
  data_atualizacao: string;
}

export interface JogoColetaRow {
  id: string;
  coleta_id: string;
  game_key: string;
  time_casa: string;
  time_fora: string;
  liga: string | null;
  periodo: string;
  placar_casa: number;
  placar_fora: number;
  odd_casa?: number;
  odd_fora?: number;
  tempo_restante?: string | null;
  data_criacao: string;
}

export interface AlertaBetanoRow {
  id: string;
  usuario_id: string;
  coleta_id: string | null;
  game_key: string;
  time_casa: string;
  time_fora: string;
  liga: string | null;
  placar_casa: number;
  placar_fora: number;
  diferenca_pontos: number;
  periodo_anterior: string | null;
  periodo_atual: string;
  disparado_em: string;
  data_criacao: string;
}

export interface RegistrarColetaInput {
  texto: string;
  fonteParser: FonteParser;
  jogos: ParsedGame[];
  sucesso: boolean;
  erroMensagem?: string | null;
  alertas: AlertaRegistroInput[];
}

export interface AlertaRegistroInput {
  gameKey: string;
  homeTeam: string;
  awayTeam: string;
  league: string | null;
  homeScore: number;
  awayScore: number;
  pointDiff: number;
  periodoAnterior: string | null;
  periodoAtual: string;
}

export type EstadoJogoHistorico = 'ao_vivo' | 'finalizado';

export interface EntradaHistoricoJogo {
  id: string;
  coletadoEm: string;
  placarCasa: number;
  placarFora: number;
  periodo: string;
  rotuloVantagem: string | null;
  oddCasa: number;
  oddFora: number;
  tempoRestante: string | null;
}

export interface JogoHistoricoGrupo {
  gameKey: string;
  timeCasa: string;
  timeFora: string;
  liga: string | null;
  estado: EstadoJogoHistorico;
  ultimaColetaEm: string;
  ultimoPlacarCasa: number;
  ultimoPlacarFora: number;
  ultimoPeriodo: string;
  ultimoOddCasa: number;
  ultimoOddFora: number;
  ultimoTempoRestante: string | null;
  entradas: EntradaHistoricoJogo[];
}

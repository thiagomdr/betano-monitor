import type {
  EntradaHistoricoJogo,
  EstadoJogoHistorico,
  JogoHistoricoGrupo,
} from '../types/coleta';

const PERIODOS_AO_VIVO = new Set([
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'Intervalo',
  'INT',
  'HT',
  'OT',
]);

export const TEXTO_INVALIDO_PATTERN =
  /não existem mercados|mercados disponíveis|de momento|^unknown$/i;

export function formatarOdd(valor: number | null | undefined): string {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '0.00';
  return n.toFixed(2);
}

export function periodoValidoParaExibicao(periodo: string): boolean {
  const p = periodo.trim();
  if (!p || TEXTO_INVALIDO_PATTERN.test(p)) return false;
  return true;
}

export function sanitizarLigaExibicao(liga: string | null | undefined): string | null {
  if (!liga) return null;
  const t = liga.trim();
  if (!t || TEXTO_INVALIDO_PATTERN.test(t)) return null;
  return t;
}

export function formatarPeriodoExibicao(
  periodo: string,
  estado: EstadoJogoHistorico,
): string {
  if (periodoValidoParaExibicao(periodo)) return periodo.trim();
  return estado === 'finalizado' ? 'Finalizado' : '—';
}

export function inferirEstadoEntrada(periodo: string): EstadoJogoHistorico {
  if (!periodoValidoParaExibicao(periodo)) return 'finalizado';
  return PERIODOS_AO_VIVO.has(periodo.trim()) ? 'ao_vivo' : 'finalizado';
}

export function blocoPeriodoComTempo(
  periodo: string,
  tempoRestante: string | null | undefined,
  estado: EstadoJogoHistorico,
): string {
  const periodoFmt = formatarPeriodoExibicao(periodo, estado);
  if (tempoRestante) {
    return `${periodoFmt} [ ${tempoRestante} ]`;
  }
  return periodoFmt;
}

function entradaMaisRecente(entradas: EntradaHistoricoJogo[]): EntradaHistoricoJogo {
  return entradas.reduce((a, b) =>
    new Date(a.coletadoEm).getTime() > new Date(b.coletadoEm).getTime() ? a : b,
  );
}

function ultimaEntradaComPeriodoValido(
  entradas: EntradaHistoricoJogo[],
): EntradaHistoricoJogo | null {
  const ordenadas = [...entradas].sort(
    (a, b) => new Date(b.coletadoEm).getTime() - new Date(a.coletadoEm).getTime(),
  );
  return ordenadas.find((e) => periodoValidoParaExibicao(e.periodo)) ?? null;
}

export function inferirEstadoJogoHistorico(
  entradas: EntradaHistoricoJogo[],
  ultimaColetaGlobalEm: string | null,
): EstadoJogoHistorico {
  if (ultimaColetaGlobalEm && entradas.length > 0) {
    const tsGlobal = new Date(ultimaColetaGlobalEm).getTime();
    const ultima = entradaMaisRecente(entradas);
    if (new Date(ultima.coletadoEm).getTime() < tsGlobal) {
      return 'finalizado';
    }
  }

  const ref = ultimaEntradaComPeriodoValido(entradas)?.periodo ?? entradaMaisRecente(entradas).periodo;
  if (!periodoValidoParaExibicao(ref)) return 'finalizado';
  return PERIODOS_AO_VIVO.has(ref.trim()) ? 'ao_vivo' : 'finalizado';
}

export function resolverExibicaoGrupo(
  entradas: EntradaHistoricoJogo[],
  ultimaColetaGlobalEm: string | null,
): {
  estado: EstadoJogoHistorico;
  ultimoPeriodo: string;
  ultimaColetaEm: string;
  ultimoPlacarCasa: number;
  ultimoPlacarFora: number;
  ultimoOddCasa: number;
  ultimoOddFora: number;
  ultimoTempoRestante: string | null;
} {
  const ultima = entradaMaisRecente(entradas);
  const estado = inferirEstadoJogoHistorico(entradas, ultimaColetaGlobalEm);
  const periodoRef =
    ultimaEntradaComPeriodoValido(entradas)?.periodo ?? ultima.periodo;

  return {
    estado,
    ultimoPeriodo: formatarPeriodoExibicao(periodoRef, estado),
    ultimaColetaEm: ultima.coletadoEm,
    ultimoPlacarCasa: ultima.placarCasa,
    ultimoPlacarFora: ultima.placarFora,
    ultimoOddCasa: ultima.oddCasa,
    ultimoOddFora: ultima.oddFora,
    ultimoTempoRestante: ultima.tempoRestante ?? null,
  };
}

export function formatarHoraHistorico(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function rotuloEstadoHistorico(estado: EstadoJogoHistorico): string {
  return estado === 'ao_vivo' ? 'Ao Vivo' : 'Finalizado';
}

export function formatarCabecalhoJogoHistorico(jogo: JogoHistoricoGrupo): string {
  const hora = formatarHoraHistorico(jogo.ultimaColetaEm);
  return (
    `${hora} - ${formatarOdd(jogo.ultimoOddCasa)} ${jogo.timeCasa} ` +
    `${jogo.ultimoPlacarCasa} x ${jogo.ultimoPlacarFora} ${jogo.timeFora} ` +
    `${formatarOdd(jogo.ultimoOddFora)} (${rotuloEstadoHistorico(jogo.estado)})`
  );
}

export function formatarMetaJogoHistorico(jogo: JogoHistoricoGrupo): string {
  const periodo = blocoPeriodoComTempo(
    jogo.ultimoPeriodo,
    jogo.ultimoTempoRestante,
    jogo.estado,
  );
  return `${jogo.entradas.length} coleta(s) - ${periodo}`;
}

export function formatarDetalhePeriodoHistorico(entrada: EntradaHistoricoJogo): string {
  const estadoEntrada = inferirEstadoEntrada(entrada.periodo);
  const bloco = blocoPeriodoComTempo(entrada.periodo, entrada.tempoRestante, estadoEntrada);
  const odds =
    `${formatarOdd(entrada.oddCasa)} ${formatarOdd(entrada.oddFora)}`;

  if (entrada.rotuloVantagem && entrada.rotuloVantagem !== 'empate') {
    return `${odds} ${bloco} ${entrada.rotuloVantagem}`;
  }
  if (entrada.rotuloVantagem === 'empate') {
    return `${odds} ${bloco} empate`;
  }
  return `${odds} ${bloco}`;
}

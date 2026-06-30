import type { ColetaBetanoRow, EntradaHistoricoJogo, EstadoJogoHistorico } from '../types/coleta';

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
  coletas: ColetaBetanoRow[],
): EstadoJogoHistorico {
  const coletaMaisRecente = coletas[0];
  if (coletaMaisRecente && entradas.length > 0) {
    const tsGlobal = new Date(coletaMaisRecente.coletado_em).getTime();
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
  coletas: ColetaBetanoRow[],
): {
  estado: EstadoJogoHistorico;
  ultimoPeriodo: string;
  ultimaColetaEm: string;
  ultimoPlacarCasa: number;
  ultimoPlacarFora: number;
} {
  const ultima = entradaMaisRecente(entradas);
  const estado = inferirEstadoJogoHistorico(entradas, coletas);
  const periodoRef =
    ultimaEntradaComPeriodoValido(entradas)?.periodo ?? ultima.periodo;

  return {
    estado,
    ultimoPeriodo: formatarPeriodoExibicao(periodoRef, estado),
    ultimaColetaEm: ultima.coletadoEm,
    ultimoPlacarCasa: ultima.placarCasa,
    ultimoPlacarFora: ultima.placarFora,
  };
}

export function formatarDetalhePeriodoHistorico(entrada: EntradaHistoricoJogo): string {
  const periodo = periodoValidoParaExibicao(entrada.periodo)
    ? entrada.periodo.trim()
    : 'Finalizado';

  if (entrada.rotuloVantagem && entrada.rotuloVantagem !== 'empate') {
    return `${periodo} » ${entrada.rotuloVantagem}`;
  }
  if (entrada.rotuloVantagem === 'empate') {
    return `${periodo} » empate`;
  }
  return periodo;
}

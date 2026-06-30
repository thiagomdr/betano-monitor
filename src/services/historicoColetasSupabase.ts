import type {
  AlertaBetanoRow,
  ColetaBetanoRow,
  EntradaHistoricoJogo,
  JogoColetaRow,
  JogoHistoricoGrupo,
} from '../types/coleta';
import { buildGameKeyFromGame } from './parseLocal';
import {
  formatarDetalhePeriodoHistorico,
  resolverExibicaoGrupo,
  sanitizarLigaExibicao,
} from './historicoDisplay';
import { supabase, supabaseConfigurado } from './supabase';

export interface ColetaHistoricoItem {
  coleta: ColetaBetanoRow;
  jogos: JogoColetaRow[];
  alertas: AlertaBetanoRow[];
}

export function formatarRotuloVantagem(
  placarCasa: number,
  placarFora: number,
  timeCasa: string,
  timeFora: string,
): string | null {
  const diff = Math.abs(placarCasa - placarFora);
  if (diff === 0) return 'empate';

  const timeLider =
    placarCasa > placarFora ? timeCasa : timeFora;

  return `+${diff} ${timeLider}`;
}

function montarGruposPorJogo(
  coletas: ColetaBetanoRow[],
  jogos: JogoColetaRow[],
): JogoHistoricoGrupo[] {
  const coletaPorId = new Map(coletas.map((c) => [c.id, c]));
  const gruposRaw = new Map<
    string,
    { meta: JogoColetaRow; entradas: EntradaHistoricoJogo[] }
  >();

  for (const jogo of jogos) {
    const coleta = coletaPorId.get(jogo.coleta_id);
    if (!coleta) continue;

    const entrada: EntradaHistoricoJogo = {
      id: jogo.id,
      coletadoEm: coleta.coletado_em,
      placarCasa: jogo.placar_casa,
      placarFora: jogo.placar_fora,
      periodo: jogo.periodo,
      rotuloVantagem: formatarRotuloVantagem(
        jogo.placar_casa,
        jogo.placar_fora,
        jogo.time_casa,
        jogo.time_fora,
      ),
      oddCasa: Number(jogo.odd_casa ?? 0),
      oddFora: Number(jogo.odd_fora ?? 0),
      tempoRestante: jogo.tempo_restante ?? null,
    };

    const grupoKey = buildGameKeyFromGame({
      homeTeam: jogo.time_casa,
      awayTeam: jogo.time_fora,
      homeScore: jogo.placar_casa,
      awayScore: jogo.placar_fora,
      period: 'unknown',
      league: jogo.liga,
    });

    const existente = gruposRaw.get(grupoKey);
    if (existente) {
      existente.entradas.push(entrada);
      existente.meta = jogo;
    } else {
      gruposRaw.set(grupoKey, { meta: jogo, entradas: [entrada] });
    }
  }

  const grupos: JogoHistoricoGrupo[] = [];

  for (const [gameKey, { meta, entradas }] of gruposRaw) {
    entradas.sort(
      (a, b) => new Date(b.coletadoEm).getTime() - new Date(a.coletadoEm).getTime(),
    );

    const exibicao = resolverExibicaoGrupo(entradas, coletas);

    grupos.push({
      gameKey,
      timeCasa: meta.time_casa,
      timeFora: meta.time_fora,
      liga: sanitizarLigaExibicao(meta.liga),
      estado: exibicao.estado,
      ultimaColetaEm: exibicao.ultimaColetaEm,
      ultimoPlacarCasa: exibicao.ultimoPlacarCasa,
      ultimoPlacarFora: exibicao.ultimoPlacarFora,
      ultimoPeriodo: exibicao.ultimoPeriodo,
      ultimoOddCasa: exibicao.ultimoOddCasa,
      ultimoOddFora: exibicao.ultimoOddFora,
      ultimoTempoRestante: exibicao.ultimoTempoRestante,
      entradas,
    });
  }

  grupos.sort(
    (a, b) =>
      new Date(b.ultimaColetaEm).getTime() - new Date(a.ultimaColetaEm).getTime(),
  );

  return grupos;
}

async function buscarColetasEJogos(limiteColetas: number): Promise<{
  coletas: ColetaBetanoRow[];
  jogos: JogoColetaRow[];
  erro: string | null;
}> {
  if (!supabaseConfigurado || !supabase) {
    return { coletas: [], jogos: [], erro: 'Supabase não configurado no .env' };
  }

  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao) {
    return { coletas: [], jogos: [], erro: erroSessao.message };
  }
  if (!sessao.session?.user?.id) {
    return { coletas: [], jogos: [], erro: 'Faça login no Supabase para ver o histórico' };
  }

  const { data: coletas, error: erroColetas } = await supabase
    .from('coletas_betano')
    .select('*')
    .order('coletado_em', { ascending: false })
    .limit(limiteColetas);

  if (erroColetas) {
    return { coletas: [], jogos: [], erro: erroColetas.message };
  }

  const linhas = (coletas ?? []) as ColetaBetanoRow[];
  if (linhas.length === 0) {
    return { coletas: [], jogos: [], erro: null };
  }

  const coletaIds = linhas.map((c) => c.id);

  const { data: jogos, error: erroJogos } = await supabase
    .from('jogos_coleta')
    .select('*')
    .in('coleta_id', coletaIds);

  if (erroJogos) {
    return { coletas: [], jogos: [], erro: erroJogos.message };
  }

  return { coletas: linhas, jogos: (jogos ?? []) as JogoColetaRow[], erro: null };
}

export async function listarHistoricoPorJogo(
  limiteColetas = 80,
): Promise<{ jogos: JogoHistoricoGrupo[]; erro: string | null }> {
  const { coletas, jogos, erro } = await buscarColetasEJogos(limiteColetas);
  if (erro) return { jogos: [], erro };

  return {
    jogos: montarGruposPorJogo(coletas, jogos),
    erro: null,
  };
}

export async function listarHistoricoColetas(
  limite = 40,
): Promise<{ itens: ColetaHistoricoItem[]; erro: string | null }> {
  if (!supabaseConfigurado || !supabase) {
    return { itens: [], erro: 'Supabase não configurado no .env' };
  }

  const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
  if (erroSessao) {
    return { itens: [], erro: erroSessao.message };
  }
  if (!sessao.session?.user?.id) {
    return { itens: [], erro: 'Faça login no Supabase para ver o histórico' };
  }

  const { coletas, jogos, erro } = await buscarColetasEJogos(limite);
  if (erro) return { itens: [], erro };

  const { data: alertas, error: erroAlertas } = await supabase
    .from('alertas_betano')
    .select('*')
    .in('coleta_id', coletas.map((c) => c.id));

  if (erroAlertas) {
    return { itens: [], erro: erroAlertas.message };
  }

  const jogosPorColeta = new Map<string, JogoColetaRow[]>();
  for (const jogo of jogos) {
    const lista = jogosPorColeta.get(jogo.coleta_id) ?? [];
    lista.push(jogo);
    jogosPorColeta.set(jogo.coleta_id, lista);
  }

  const alertasPorColeta = new Map<string, AlertaBetanoRow[]>();
  for (const alerta of (alertas ?? []) as AlertaBetanoRow[]) {
    if (!alerta.coleta_id) continue;
    const lista = alertasPorColeta.get(alerta.coleta_id) ?? [];
    lista.push(alerta);
    alertasPorColeta.set(alerta.coleta_id, lista);
  }

  const itens: ColetaHistoricoItem[] = coletas.map((coleta) => ({
    coleta,
    jogos: jogosPorColeta.get(coleta.id) ?? [],
    alertas: alertasPorColeta.get(coleta.id) ?? [],
  }));

  return { itens, erro: null };
}

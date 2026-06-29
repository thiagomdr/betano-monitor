import { showGameAlert } from './notifications';
import { supabase, supabaseConfigurado } from './supabase';

const POLL_MS = 25_000;
let timer: ReturnType<typeof setInterval> | null = null;
let ultimoAlertaVisto: string | null = null;

function formatarCorpoAlerta(row: {
  time_casa: string;
  time_fora: string;
  placar_casa: number;
  placar_fora: number;
  diferenca_pontos: number;
  periodo_atual: string;
  liga: string | null;
}): string {
  return [
    `${row.time_casa} ${row.placar_casa} x ${row.placar_fora} ${row.time_fora}`,
    `Diferença: ${row.diferenca_pontos} | Período: ${row.periodo_atual}`,
    row.liga ? `Liga: ${row.liga}` : '',
    'Aposte manualmente na Betano.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function verificarNovosAlertas(): Promise<void> {
  if (!supabaseConfigurado || !supabase) return;

  const { data: session } = await supabase.auth.getSession();
  const usuarioId = session.session?.user?.id;
  if (!usuarioId) return;

  let query = supabase
    .from('alertas_betano')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('disparado_em', { ascending: false })
    .limit(5);

  if (ultimoAlertaVisto) {
    query = query.gt('disparado_em', ultimoAlertaVisto);
  }

  const { data, error } = await query;
  if (error || !data?.length) return;

  const ordenados = [...data].sort(
    (a, b) =>
      new Date(a.disparado_em as string).getTime() -
      new Date(b.disparado_em as string).getTime(),
  );

  for (const row of ordenados) {
    await showGameAlert(
      `🏀 Fim do 2º quarto — +${row.diferenca_pontos} pts`,
      formatarCorpoAlerta({
        time_casa: row.time_casa as string,
        time_fora: row.time_fora as string,
        placar_casa: row.placar_casa as number,
        placar_fora: row.placar_fora as number,
        diferenca_pontos: row.diferenca_pontos as number,
        periodo_atual: row.periodo_atual as string,
        liga: (row.liga as string | null) ?? null,
      }),
    );
  }

  const maisRecente = ordenados[ordenados.length - 1];
  ultimoAlertaVisto = maisRecente.disparado_em as string;
}

export function startAlertasPoller(): void {
  if (timer) return;
  void verificarNovosAlertas();
  timer = setInterval(() => {
    void verificarNovosAlertas();
  }, POLL_MS);
}

export function stopAlertasPoller(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

export async function sincronizarUltimoAlertaVisto(): Promise<void> {
  if (!supabaseConfigurado || !supabase) return;

  const { data: session } = await supabase.auth.getSession();
  const usuarioId = session.session?.user?.id;
  if (!usuarioId) return;

  const { data } = await supabase
    .from('alertas_betano')
    .select('disparado_em')
    .eq('usuario_id', usuarioId)
    .order('disparado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  ultimoAlertaVisto = (data?.disparado_em as string | undefined) ?? null;
}

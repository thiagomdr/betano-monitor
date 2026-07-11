/**
 * Sistema Ligado — futebol_live_coleta_config.ativo + data_atualizacao (epoch).
 * Cada Iniciar/Pausar atualiza data_atualizacao; coleta em andamento invalida ao pausar.
 */

export class ColetaPausadaError extends Error {
  constructor(where) {
    super(`Sistema pausado — coleta bloqueada (${where})`);
    this.name = "ColetaPausadaError";
  }
}

export async function readColetaState(supabase) {
  const { data, error } = await supabase
    .from("futebol_live_coleta_config")
    .select("ativo,data_atualizacao")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.warn("[coleta-ativa] leitura falhou:", error.message);
    return null;
  }
  return data;
}

/** Valido somente se ativo=true e epoch bate com o Iniciar atual (se informado). */
export async function isColetaAtiva(supabase, epoch = null) {
  const st = await readColetaState(supabase);
  if (!st || st.ativo !== true) return false;
  if (epoch != null && String(st.data_atualizacao) !== String(epoch)) return false;
  return true;
}

/** Inicio de ciclo — retorna epoch (data_atualizacao) ou lança se pausado. */
export async function beginColetaEpoch(supabase) {
  const st = await readColetaState(supabase);
  if (!st?.ativo) throw new ColetaPausadaError("inicio");
  return st.data_atualizacao;
}

export async function assertColetaAtiva(
  supabase,
  where,
  epoch = null,
) {
  const st = await readColetaState(supabase);
  const ativo = st?.ativo === true;
  const epochOk = epoch == null || String(st?.data_atualizacao) === String(epoch);
  if (!ativo || !epochOk) {
    throw new ColetaPausadaError(where);
  }
}

/** Durante ciclo em andamento: so Pausar (ativo=false) bloqueia persist/log/scrape. */
export async function assertNaoPausado(supabase, where) {
  const st = await readColetaState(supabase);
  if (st?.ativo !== true) {
    throw new ColetaPausadaError(where);
  }
}

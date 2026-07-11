import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type ColetaState = {
  ativo: boolean;
  data_atualizacao: string;
};

/** Lancada quando ativo=false ou epoch de sessao mudou (Pausar invalida coleta em andamento). */
export class ColetaPausadaError extends Error {
  constructor(public readonly where: string) {
    super(`Sistema pausado — coleta bloqueada (${where})`);
    this.name = "ColetaPausadaError";
  }
}

export async function readColetaState(
  supabase: SupabaseClient,
): Promise<ColetaState | null> {
  const { data, error } = await supabase
    .from("futebol_live_coleta_config")
    .select("ativo,data_atualizacao")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    console.warn("[coleta-ativa] leitura falhou:", error.message);
    return null;
  }
  return data as ColetaState | null;
}

export async function isColetaAtiva(
  supabase: SupabaseClient,
  epoch: string | null = null,
): Promise<boolean> {
  const st = await readColetaState(supabase);
  if (!st || st.ativo !== true) return false;
  if (epoch != null && String(st.data_atualizacao) !== String(epoch)) return false;
  return true;
}

export async function beginColetaEpoch(
  supabase: SupabaseClient,
): Promise<string> {
  const st = await readColetaState(supabase);
  if (!st?.ativo) throw new ColetaPausadaError("inicio");
  return st.data_atualizacao;
}

export async function assertColetaAtiva(
  supabase: SupabaseClient,
  where: string,
  epoch: string | null = null,
): Promise<void> {
  if (!(await isColetaAtiva(supabase, epoch))) {
    throw new ColetaPausadaError(where);
  }
}

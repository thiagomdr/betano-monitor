import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type SistemaLogLevel = "info" | "warn" | "error";

export type SistemaLogInput = {
  level?: SistemaLogLevel;
  source: string;
  action: string;
  message: string;
  event_id?: string | null;
  match_label?: string | null;
  payload?: Record<string, unknown> | null;
  duration_ms?: number | null;
};

export function matchLabel(
  home?: string | null,
  away?: string | null,
): string | null {
  if (!home && !away) return null;
  return `${home ?? "—"} x ${away ?? "—"}`;
}

/** Grava evento no log do sistema (falha silenciosa — nao quebra o fluxo principal). */
export async function insertSistemaLog(
  supabase: SupabaseClient,
  input: SistemaLogInput,
): Promise<void> {
  try {
    const { error } = await supabase.from("futebol_sistema_log").insert({
      level: input.level ?? "info",
      source: input.source,
      action: input.action,
      message: input.message,
      event_id: input.event_id ?? null,
      match_label: input.match_label ?? null,
      payload: input.payload ?? null,
      duration_ms: input.duration_ms ?? null,
    });
    if (error) console.error("sistema_log insert failed", error.message);
  } catch (err) {
    console.error("sistema_log insert error", err);
  }
}

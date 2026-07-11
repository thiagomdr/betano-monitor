/**
 * Log do sistema — worker local grava no Supabase (service_role).
 */
export function matchLabel(home, away) {
  if (!home && !away) return null;
  return `${home ?? "—"} x ${away ?? "—"}`;
}

export async function insertSistemaLog(supabase, input) {
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
    if (error) console.error("[sistema_log]", error.message);
  } catch (err) {
    console.error("[sistema_log]", err?.message ?? err);
  }
}

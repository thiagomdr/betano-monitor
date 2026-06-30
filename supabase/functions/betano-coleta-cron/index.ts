import { executarColetaBetanoJson } from '../_shared/betanoCollect.ts';
import {
  formatDelayHuman,
  isCronAuthorized,
  loadScheduler,
  persistColetaComJogos,
  saveSchedulerPatch,
  scheduleNextRun,
} from '../_shared/supabaseService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isCronAuthorized(req)) {
    return jsonResponse({ ok: false, summary: 'Não autorizado (cron secret)' }, 401);
  }

  try {
    const scheduler = await loadScheduler();
    if (!scheduler) {
      return jsonResponse({
        ok: false,
        summary: 'Scheduler não configurado — aplique a migration coleta_scheduler',
        skipped: true,
      });
    }

    if (!scheduler.ativo) {
      return jsonResponse({
        ok: true,
        skipped: true,
        summary: 'Monitor na nuvem parado',
        ativo: false,
        debug: { hypothesisId: 'H3', ativo: false, usuarioId: scheduler.usuario_id ?? null },
      });
    }

    if (!scheduler.usuario_id) {
      return jsonResponse({
        ok: false,
        skipped: true,
        summary: 'Sem usuário vinculado — faça login no app e toque Iniciar',
        debug: { hypothesisId: 'H4', ativo: scheduler.ativo, usuarioId: null },
      });
    }

    const now = new Date();
    const nextRunAt = scheduler.next_run_at ? new Date(scheduler.next_run_at) : null;
    if (nextRunAt && nextRunAt.getTime() > now.getTime()) {
      return jsonResponse({
        ok: true,
        skipped: true,
        summary: 'Aguardando próximo horário',
        nextRunAt: scheduler.next_run_at,
        secondsUntil: Math.ceil((nextRunAt.getTime() - now.getTime()) / 1000),
      });
    }

    const coleta = await executarColetaBetanoJson();
    const ranAt = new Date();

    let persist: { coletaId: string; alertas: number } | null = null;
    if (coleta.blocked) {
      await persistColetaComJogos(scheduler.usuario_id, {
        resumoJson: coleta.resumoJson,
        sucesso: false,
        erroMensagem: coleta.summary,
        games: [],
      });
    } else {
      persist = await persistColetaComJogos(scheduler.usuario_id, {
        resumoJson: coleta.resumoJson,
        sucesso: coleta.ok,
        erroMensagem: coleta.gameCount === 0 ? coleta.summary : null,
        games: coleta.games,
      });
    }

    await saveSchedulerPatch({
      id: scheduler.id,
      last_run_at: ranAt.toISOString(),
    });

    const { nextRunAt: proximo, intervalMs } = await scheduleNextRun(scheduler, ranAt);

    return jsonResponse({
      collectedAt: ranAt.toISOString(),
      ok: coleta.ok,
      blocked: coleta.blocked,
      summary: coleta.summary,
      gameCount: coleta.gameCount,
      alertas: persist?.alertas ?? 0,
      coletaId: persist?.coletaId ?? null,
      fetch: coleta.fetch,
      nextRunAt: proximo,
      nextDelayMs: intervalMs,
      nextDelayHuman: formatDelayHuman(intervalMs),
      preview: coleta.games.slice(0, 5).map(
        (g) => `${g.homeTeam} ${g.homeScore}–${g.awayScore} ${g.awayTeam} · ${g.period}`,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({
      ok: false,
      summary: `Erro no cron: ${message}`,
      error: message,
    }, 500);
  }
});

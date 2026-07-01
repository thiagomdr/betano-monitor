import { executarColetaBetanoJson } from '../_shared/betanoCollect.ts';
import {
  isFutebolFetchDue,
  processarFutebolEstatisticas,
} from '../_shared/futebolEstatisticasService.ts';
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
      });
    }

    if (!scheduler.usuario_id) {
      return jsonResponse({
        ok: false,
        skipped: true,
        summary: 'Sem usuário vinculado — faça login no app e toque Iniciar',
      });
    }

    const now = new Date();
    const usuarioId = scheduler.usuario_id;
    const nextRunAt = scheduler.next_run_at ? new Date(scheduler.next_run_at) : null;
    const basketballDue = !nextRunAt || nextRunAt.getTime() <= now.getTime();
    const footballDue = await isFutebolFetchDue(usuarioId, now);

    if (!basketballDue && !footballDue) {
      return jsonResponse({
        ok: true,
        skipped: true,
        summary: 'Aguardando próximo horário (basquete ou futebol)',
        nextRunAt: scheduler.next_run_at,
        basketballDue: false,
        footballDue: false,
      });
    }

    const cronTickAt = new Date();
    const coleta = await executarColetaBetanoJson();
    const ranAt = new Date();

    let persist: { coletaId: string; alertas: number } | null = null;
    let futebolStats = null;

    if (coleta.ok && coleta.payload) {
      const ranRadar = basketballDue;
      futebolStats = await processarFutebolEstatisticas(usuarioId, coleta.payload, {
        footballFetchDue: footballDue,
        ranRadar,
        cronTickAt,
      }, ranAt);
    }

    if (basketballDue && coleta.games.length > 0) {
      persist = await persistColetaComJogos(usuarioId, {
        resumoJson: coleta.resumoJson,
        sucesso: coleta.ok,
        erroMensagem: null,
        games: coleta.games,
      });
    }

    let proximo: string | null = scheduler.next_run_at;
    let intervalMs: number | null = null;

    if (basketballDue) {
      await saveSchedulerPatch({
        id: scheduler.id,
        last_run_at: ranAt.toISOString(),
      });
      const next = await scheduleNextRun(scheduler, ranAt);
      proximo = next.nextRunAt;
      intervalMs = next.intervalMs;
    }

    return jsonResponse({
      collectedAt: ranAt.toISOString(),
      ok: coleta.ok,
      blocked: coleta.blocked,
      summary: coleta.summary,
      gameCount: coleta.gameCount,
      alertas: persist?.alertas ?? 0,
      coletaId: persist?.coletaId ?? null,
      fetch: coleta.fetch,
      basketballDue,
      footballDue,
      futebol: futebolStats,
      nextRunAt: proximo,
      nextDelayMs: intervalMs,
      nextDelayHuman: intervalMs != null ? formatDelayHuman(intervalMs) : null,
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

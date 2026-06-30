import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { avaliarEGravarAlertas } from '../_shared/supabaseService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ ok: false, error: 'Não autenticado' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    const usuarioId = userData.user?.id;
    if (userError || !usuarioId) {
      return jsonResponse({ ok: false, error: 'Sessão inválida' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const coletaId = body.coletaId as string | undefined;
    if (!coletaId) {
      return jsonResponse({ ok: false, error: 'coletaId obrigatório' }, 400);
    }

    const { data: coleta, error: errColeta } = await userClient
      .from('coletas_betano')
      .select('id')
      .eq('id', coletaId)
      .eq('usuario_id', usuarioId)
      .maybeSingle();

    if (errColeta || !coleta) {
      return jsonResponse({ ok: false, error: 'Coleta não encontrada' }, 404);
    }

    const { data: jogos, error: errJogos } = await userClient
      .from('jogos_coleta')
      .select('*')
      .eq('coleta_id', coletaId);

    if (errJogos) {
      return jsonResponse({ ok: false, error: errJogos.message }, 500);
    }

    const games = (jogos ?? []).map((j) => ({
      homeTeam: j.time_casa as string,
      awayTeam: j.time_fora as string,
      homeScore: Number(j.placar_casa),
      awayScore: Number(j.placar_fora),
      period: j.periodo as 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Intervalo' | 'OT' | 'unknown',
      league: (j.liga as string | null) ?? null,
      homeOdd: Number(j.odd_casa ?? 0),
      awayOdd: Number(j.odd_fora ?? 0),
      tempoRestante: (j.tempo_restante as string | null) ?? null,
    }));

    const alertas = await avaliarEGravarAlertas(usuarioId, coletaId, games);

    return jsonResponse({ ok: true, alertas, coletaId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ ok: false, error: message }, 500);
  }
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

import { executarColetaBetanoJson } from '../_shared/betanoCollect.ts';
import { parseFootballScoutFromOverview, probeFootballLiveDataFromPayload } from '../_shared/betanoFootballParse.ts';
import { sincronizarFutebolRadarImediato } from '../_shared/futebolEstatisticasService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatGameLine(game: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  period: string;
  league: string | null;
}): string {
  const liga = game.league ? ` (${game.league})` : '';
  return `${game.homeTeam} ${game.homeScore}–${game.awayScore} ${game.awayTeam} · ${game.period}${liga}`;
}

function scoutToJson(snap: ReturnType<typeof parseFootballScoutFromOverview>[number]) {
  return {
    eventId: snap.eventId,
    homeTeam: snap.homeTeam,
    awayTeam: snap.awayTeam,
    league: snap.league,
    homeScore: snap.homeScore,
    awayScore: snap.awayScore,
    period: snap.period,
    periodDescription: snap.periodDescription,
    matchMinute: snap.matchMinute,
    tempoDecorrido: snap.tempoDecorrido,
    minutesUntil85: snap.minutesUntil85,
    eta85: snap.eta85,
    inFinalWindow: snap.inFinalWindow,
    isFinished: snap.isFinished,
    betanoUrl: snap.betanoUrl,
    oddManterPlacar: snap.oddManterPlacar,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let debugFootball = false;
    try {
      const body = await req.json();
      debugFootball = body?.debugFootball === true;
    } catch {
      // body vazio
    }

    const coleta = await executarColetaBetanoJson();
    const now = new Date();

    let futebolSync = null;
    let footballRadar: ReturnType<typeof scoutToJson>[] = [];

    if (coleta.payload) {
      const scouts = parseFootballScoutFromOverview(coleta.payload, now);
      footballRadar = scouts
        .filter((s) => !s.isFinished)
        .map(scoutToJson);

      const authHeader = req.headers.get('Authorization');
      if (authHeader && coleta.ok) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;
        const userClient = createClient(supabaseUrl, supabaseAnon, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await userClient.auth.getUser();
        const usuarioId = userData.user?.id;
        if (usuarioId) {
          futebolSync = await sincronizarFutebolRadarImediato(usuarioId, coleta.payload, now);
        }
      }
    }

    let footballLiveProbe = null;
    if (coleta.payload && debugFootball) {
      footballLiveProbe = probeFootballLiveDataFromPayload(coleta.payload, 3);
    }

    const footballTimeStats = {
      total: footballRadar.length,
      withTempo: footballRadar.filter((g) => Boolean(g.tempoDecorrido)).length,
      withUntil85: footballRadar.filter((g) => g.minutesUntil85 != null).length,
    };

    return new Response(
      JSON.stringify({
        collectedAt: now.toISOString(),
        summary: coleta.summary,
        ok: coleta.ok,
        blocked: coleta.blocked,
        fetch: coleta.fetch,
        games: coleta.games,
        gamesBasquete: coleta.gamesBasquete,
        futebolAoVivoTotal: coleta.futebolAoVivoTotal,
        gameCount: coleta.gameCount,
        footballRadar,
        footballTimeStats,
        footballLiveProbe,
        futebolSync,
        preview: coleta.games.slice(0, 5).map(formatGameLine),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({
        collectedAt: new Date().toISOString(),
        summary: `Erro na coleta: ${message}`,
        ok: false,
        blocked: false,
        games: [],
        gameCount: 0,
        footballRadar: [],
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

import { executarColetaBetanoJson } from '../_shared/betanoCollect.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const coleta = await executarColetaBetanoJson();

    return new Response(
      JSON.stringify({
        collectedAt: new Date().toISOString(),
        summary: coleta.summary,
        ok: coleta.ok,
        blocked: coleta.blocked,
        fetch: coleta.fetch,
        games: coleta.games,
        gamesBasquete: coleta.gamesBasquete,
        futebolAoVivoTotal: coleta.futebolAoVivoTotal,
        gameCount: coleta.gameCount,
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
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

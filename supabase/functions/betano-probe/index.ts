import { BETANO_LIVE_URL, fetchBetanoAsChrome } from '../_shared/betanoFetch.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const live = await fetchBetanoAsChrome(BETANO_LIVE_URL);

    const viableForParser =
      live.ok &&
      !live.indicatesBlock &&
      !live.indicates404 &&
      live.textLength >= 300 &&
      live.hasBasquete;

    const summary =
      live.indicatesBlock
        ? `Bloqueio provável (${live.blockReason})`
        : live.indicates404
          ? 'Página 404 ou erro'
          : viableForParser
            ? 'HTML recebido com sinais de basquete — teste promissor'
            : live.ok
              ? 'HTTP OK, mas sem sinais claros de jogos ao vivo (SPA?)'
              : `HTTP ${live.httpStatus} — falha`;

    return new Response(
      JSON.stringify({
        testedAt: new Date().toISOString(),
        summary,
        viableForParser,
        live,
        note:
          'Edge Function não executa JavaScript. Se viableForParser=false com HTTP 200, inspecione APIs no Network do Chrome mobile.',
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
        testedAt: new Date().toISOString(),
        summary: `Falha na requisição: ${message}`,
        viableForParser: false,
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

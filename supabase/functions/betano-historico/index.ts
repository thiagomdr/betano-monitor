const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Supabase forca text/plain em HTML nas Edge Functions.
 * Redireciona para data:text/html curto que busca o HTML via betano-historico-data (JSON).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  if (!supabaseUrl || !anonKey) {
    return new Response('Supabase nao configurado', { status: 500 });
  }

  const dataApi = `${supabaseUrl}/functions/v1/betano-historico-data`;
  const loader =
    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Betano Monitor</title></head><body style="margin:0;background:#111;color:#eee;font-family:sans-serif">' +
    '<p style="padding:16px">Carregando historico...</p><script>' +
    `(async function(){try{var U=${JSON.stringify(dataApi)};var K=${JSON.stringify(anonKey)};` +
    'var r=await fetch(U,{headers:{apikey:K,Authorization:"Bearer "+K}});' +
    'var d=await r.json();if(!d.html)throw new Error(d.error||"sem html");' +
    'document.open();document.write(d.html);document.close();' +
    '}catch(e){document.body.innerHTML="<p style=\\"padding:16px;color:#f66\\">"+e+"</p>";}})();' +
    '</script></body></html>';

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(loader)}`;

  return new Response(null, {
    status: 302,
    headers: {
      location: dataUrl,
      'cache-control': 'no-store',
    },
  });
});

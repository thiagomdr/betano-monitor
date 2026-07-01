/**
 * Valida migration url_partida + parser betanoUrl na coleta remota.
 * Grava NDJSON em debug-94b3c3.log
 */
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(root, 'debug-94b3c3.log');

function loadConfig() {
  let url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  let key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) {
    const envPath = join(root, '.env');
    if (existsSync(envPath)) {
      for (const line of readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^(EXPO_PUBLIC_SUPABASE_URL|EXPO_PUBLIC_SUPABASE_ANON_KEY)=(.*)$/);
        if (!m) continue;
        const v = m[2].trim();
        if (m[1] === 'EXPO_PUBLIC_SUPABASE_URL') url = v;
        else key = v;
      }
    }
  }
  if (!url || !key) {
    const file = JSON.parse(
      readFileSync(join(root, 'web/historico/supabase.config.json'), 'utf8'),
    );
    url = (file.url ?? '').trim();
    key = (file.anonKey ?? '').trim();
  }
  return { url: url.replace(/\/$/, ''), key };
}

function log(hypothesisId, location, message, data, runId = 'validate') {
  const line = JSON.stringify({
    sessionId: '94b3c3',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId,
  });
  appendFileSync(logPath, line + '\n', 'utf8');
  console.log(`[${hypothesisId}] ${message}`, JSON.stringify(data));
}

const { url, key } = loadConfig();
if (!url || !key) {
  console.error('Sem credenciais Supabase');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

// H1: colunas event_id / url_partida existem no banco
try {
  const res = await fetch(
    `${url}/rest/v1/jogos_coleta?select=event_id,url_partida&limit=1`,
    { headers },
  );
  const body = await res.json().catch(() => null);
  const migrationApplied =
    res.ok && !(body && typeof body === 'object' && body.code === '42703');
  log('H1', 'validate:schema', 'jogos_coleta columns', {
    status: res.status,
    migrationApplied,
    sample: Array.isArray(body) ? body[0] ?? null : body,
  });
} catch (e) {
  log('H1', 'validate:schema', 'schema query failed', { error: String(e) });
}

// H2/H3: coleta remota retorna betanoUrl (edge function atualizada)
try {
  const res = await fetch(`${url}/functions/v1/betano-coleta`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const body = await res.json().catch(() => ({}));
  const games = Array.isArray(body.games) ? body.games : [];
  const withUrl = games.filter((g) => g?.betanoUrl);
  log('H2-H3', 'validate:coleta', 'betano-coleta response', {
    status: res.status,
    ok: body.ok,
    gameCount: body.gameCount ?? games.length,
    hasBetanoUrlField: games.some((g) => 'betanoUrl' in (g ?? {})),
    withBetanoUrlCount: withUrl.length,
    sampleBetanoUrl: withUrl[0]?.betanoUrl ?? games[0]?.betanoUrl ?? null,
    persistError: body.persistError ?? body.error ?? null,
  });
} catch (e) {
  log('H2', 'validate:coleta', 'coleta fetch failed', { error: String(e) });
}

// H5: ultimo jogo gravado tem url_partida
try {
  const res = await fetch(
    `${url}/rest/v1/jogos_coleta?select=game_key,url_partida,event_id&url_partida=not.is.null&order=data_criacao.desc&limit=3`,
    { headers },
  );
  const body = await res.json().catch(() => null);
  log('H5', 'validate:db', 'jogos com url_partida', {
    status: res.status,
    count: Array.isArray(body) ? body.length : 0,
    rows: body,
  });
} catch (e) {
  log('H5', 'validate:db', 'url_partida query failed', { error: String(e) });
}

console.log('Log:', logPath);

let ok = true;
const logText = readFileSync(logPath, 'utf8');
const lines = logText.trim().split('\n').filter(Boolean);
for (const line of lines) {
  const entry = JSON.parse(line);
  if (entry.hypothesisId === 'H1' && !entry.data?.migrationApplied) ok = false;
  if (entry.hypothesisId === 'H2-H3' && !entry.data?.hasBetanoUrlField) ok = false;
}
if (!ok) process.exit(1);

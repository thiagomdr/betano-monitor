/**
 * Diagnóstico coleta automática — grava em debug-94b3c3.log (NDJSON)
 */
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(root, 'debug-94b3c3.log');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function log(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: '94b3c3',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: 'diagnose',
  });
  appendFileSync(logPath, line + '\n', 'utf8');
  console.log(`[${hypothesisId}] ${message}`, data);
}

if (!url || !key) {
  console.error('Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

// H1/H2: cron endpoint responde e estado do scheduler
try {
  const cronRes = await fetch(`${url}/functions/v1/betano-coleta-cron`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ tick: true }),
  });
  const cronBody = await cronRes.json().catch(() => ({}));
  log('H1-H4', 'diagnose:cron', 'betano-coleta-cron response', {
    status: cronRes.status,
    body: cronBody,
  });
} catch (e) {
  log('H2', 'diagnose:cron', 'cron fetch failed', { error: String(e) });
}

// H1: tabela coleta_scheduler existe?
try {
  const schedRes = await fetch(
    `${url}/rest/v1/coleta_scheduler?id=eq.default&select=ativo,usuario_id,last_run_at,next_run_at`,
    { headers: { ...headers, Accept: 'application/json' } },
  );
  const schedBody = await schedRes.json().catch(() => null);
  log('H1-H4', 'diagnose:scheduler', 'coleta_scheduler REST', {
    status: schedRes.status,
    rows: schedBody,
  });
} catch (e) {
  log('H1', 'diagnose:scheduler', 'scheduler query failed', { error: String(e) });
}

// últimas coletas
try {
  const coletasRes = await fetch(
    `${url}/rest/v1/coletas_betano?select=coletado_em,sucesso,qtd_jogos,fonte_parser&order=coletado_em.desc&limit=5`,
    { headers: { ...headers, Accept: 'application/json' } },
  );
  const coletasBody = await coletasRes.json().catch(() => null);
  log('H6', 'diagnose:coletas', 'ultimas coletas', {
    status: coletasRes.status,
    rows: coletasBody,
  });
} catch (e) {
  log('H6', 'diagnose:coletas', 'coletas query failed', { error: String(e) });
}

// H5: coleta manual API
try {
  const coletaRes = await fetch(`${url}/functions/v1/betano-coleta`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const coletaBody = await coletaRes.json().catch(() => ({}));
  log('H5', 'diagnose:coleta', 'betano-coleta response', {
    status: coletaRes.status,
    ok: coletaBody.ok,
    gameCount: coletaBody.gameCount,
    summary: coletaBody.summary,
  });
} catch (e) {
  log('H5', 'diagnose:coleta', 'coleta fetch failed', { error: String(e) });
}

console.log('Log:', logPath);

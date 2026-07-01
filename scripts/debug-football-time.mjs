/**
 * Diagnóstico tempo futebol — grava em debug-94b3c3.log (NDJSON)
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(root, 'debug-94b3c3.log');
const cfg = JSON.parse(readFileSync(join(root, 'web/historico/supabase.config.json'), 'utf8'));
const url = cfg.url.replace(/\/$/, '');
const key = cfg.anonKey;

function log(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: '94b3c3',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: 'football-time-probe',
  });
  appendFileSync(logPath, line + '\n', 'utf8');
  console.log(`[${hypothesisId}] ${message}`, JSON.stringify(data, null, 2));
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

const res = await fetch(`${url}/functions/v1/betano-coleta`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ debugFootball: true }),
});
const body = await res.json();

const sample = body.footballRadar?.[0] ?? null;
log('H1', 'probe:coleta', 'footballRadar sample', {
  status: res.status,
  hasTempoDecorrido: sample?.tempoDecorrido != null,
  sample,
});

log('H2', 'probe:liveData', 'raw liveData from Betano JSON', {
  footballLiveProbe: body.footballLiveProbe ?? null,
});

log('H3', 'probe:stats', 'football radar stats', {
  count: body.footballRadar?.length ?? 0,
  withMinute: (body.footballRadar ?? []).filter((g) => g.matchMinute != null).length,
  withTempo: (body.footballRadar ?? []).filter((g) => g.tempoDecorrido).length,
  withUntil85: (body.footballRadar ?? []).filter((g) => g.minutesUntil85 != null).length,
});

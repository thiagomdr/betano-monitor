/**
 * Mede intervalos entre futebol_leituras e estado da agenda — NDJSON em debug-94b3c3.log
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(root, 'debug-94b3c3.log');
const cfg = JSON.parse(readFileSync(join(root, 'web/historico/supabase.config.json'), 'utf8'));
const url = cfg.url.replace(/\/$/, '');
const key = cfg.anonKey;

function log(hypothesisId, location, message, data, runId = 'interval-probe') {
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
  console.log(`[${hypothesisId}] ${message}`, JSON.stringify(data, null, 2));
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
};

async function rest(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

const agenda = await rest('futebol_agenda?select=*&limit=1');
log('H1', 'probe:agenda', 'futebol_agenda', agenda[0] ?? null);

const partidas = await rest(
  'futebol_partidas?select=id,time_casa,time_fora,status&status=eq.em_janela&order=data_atualizacao.desc&limit=3',
);

for (const p of partidas) {
  const leituras = await rest(
    `futebol_leituras?select=coletado_em,lote_id&partida_id=eq.${p.id}&order=coletado_em.desc&limit=20`,
  );
  const sorted = [...leituras].reverse();
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].coletado_em).getTime();
    const cur = new Date(sorted[i].coletado_em).getTime();
    intervals.push({
      from: sorted[i - 1].coletado_em,
      to: sorted[i].coletado_em,
      deltaSec: Math.round((cur - prev) / 1000),
    });
  }
  const secs = intervals.map((x) => x.deltaSec);
  const at60 = secs.filter((s) => s >= 58 && s <= 62).length;
  const at4050 = secs.filter((s) => s >= 38 && s <= 52).length;
  log('H1-H5', 'probe:leituras', `${p.time_casa} x ${p.time_fora}`, {
    partidaId: p.id,
    count: sorted.length,
    intervals,
    stats: {
      minSec: secs.length ? Math.min(...secs) : null,
      maxSec: secs.length ? Math.max(...secs) : null,
      avgSec: secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null,
      at60,
      at4050,
      secondSuffixes: sorted.map((l) => l.coletado_em.slice(17, 19)),
    },
  });
}

if (partidas.length === 0) {
  log('H0', 'probe:leituras', 'nenhuma partida em_janela', { hint: 'aguarde jogo na janela 85+' });
}

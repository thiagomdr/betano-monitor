/**
 * Diagnóstico gols por minuto — NDJSON em debug-94b3c3.log
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
    runId: 'gols-minuto-probe',
  });
  appendFileSync(logPath, line + '\n', 'utf8');
  console.log(`[${hypothesisId}] ${message}`, JSON.stringify(data));
}

function extrairMinutoJogo(texto) {
  if (!texto) return null;
  const trimmed = String(texto).trim();
  const acrescimo = trimmed.match(/(\d{1,3})\s*['′]\s*\+\s*(\d{1,2})/);
  if (acrescimo) return Number.parseInt(acrescimo[1], 10) + Number.parseInt(acrescimo[2], 10);
  const aposto = trimmed.match(/(\d{1,3})\s*['′]/);
  if (aposto) return Number.parseInt(aposto[1], 10);
  const clock = trimmed.match(/(\d{1,3}):(\d{2})/);
  if (clock) {
    const m = Number.parseInt(clock[1], 10);
    const s = Number.parseInt(clock[2], 10);
    if (m >= 46) return m;
    if (m <= 20) return 90 - m - (s >= 45 ? 1 : 0);
    return m;
  }
  const solto = trimmed.match(/\b(\d{1,3})\s*\+/);
  if (solto) return Number.parseInt(solto[1], 10);
  return null;
}

function totalGols(casa, fora) {
  return Number(casa ?? 0) + Number(fora ?? 0);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const partidas = await fetch(
  `${url}/rest/v1/futebol_partidas?select=*&status=in.(em_janela,finalizado)&order=data_atualizacao.desc&limit=300`,
  { headers },
).then((r) => r.json());

const ids = partidas.map((p) => p.id);
let leituras = [];
if (ids.length) {
  leituras = await fetch(
    `${url}/rest/v1/futebol_leituras?select=*&partida_id=in.(${ids.join(',')})&order=coletado_em.asc`,
    { headers },
  ).then((r) => r.json());
}

const porPartida = {};
for (const l of leituras) {
  (porPartida[l.partida_id] ??= []).push(l);
}

const golsPorMinuto = {};
let fallback85 = 0;
let fallbackOutro = 0;
let delta85 = 0;
let deltaOutro = 0;
let parseNull = 0;
let parseLow = 0;
const amostrasMinuto = {};

for (const p of partidas) {
  const ls = porPartida[p.id] ?? [];
  const golsInicio = totalGols(p.placar_casa_inicio, p.placar_fora_inicio);
  let casaF = p.placar_casa_final;
  let foraF = p.placar_fora_final;
  if (casaF == null || foraF == null) {
    const ult = ls[ls.length - 1];
    if (ult) { casaF = ult.placar_casa; foraF = ult.placar_fora; }
  }
  const golsPartida = Math.max(0, totalGols(casaF, foraF) - golsInicio);
  if (golsPartida <= 0) continue;

  let golsAtribuidos = 0;
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i];
    const raw = l.minuto_relogio;
    const min = extrairMinutoJogo(raw);
    if (min == null) parseNull++;
    else if (min < 85) parseLow++;
    const amostraKey = raw?.trim()?.slice(0, 40) ?? '(vazio)';
    amostrasMinuto[amostraKey] = (amostrasMinuto[amostraKey] ?? 0) + 1;

    if (min == null || min < 85) continue;
    const atual = totalGols(l.placar_casa, l.placar_fora);
    const ref = i > 0
      ? totalGols(ls[i - 1].placar_casa, ls[i - 1].placar_fora)
      : golsInicio;
    const delta = atual - ref;
    if (delta > 0) {
      golsPorMinuto[min] = (golsPorMinuto[min] ?? 0) + delta;
      golsAtribuidos += delta;
      if (min === 85) delta85 += delta;
      else deltaOutro += delta;
    }
  }

  const restante = golsPartida - golsAtribuidos;
  if (restante > 0) {
    let ultimo = null;
    for (const l of ls) {
      const m = extrairMinutoJogo(l.minuto_relogio);
      if (m != null && m >= 85) ultimo = m;
    }
    const minFb = ultimo ?? p.minuto_inicio_janela ?? 85;
    golsPorMinuto[minFb] = (golsPorMinuto[minFb] ?? 0) + restante;
    if (minFb === 85) fallback85 += restante;
    else fallbackOutro += restante;
    log('H1', 'probe:fallback', 'gols fallback partida', {
      partida: `${p.time_casa} x ${p.time_fora}`,
      golsPartida,
      golsAtribuidos,
      restante,
      minFb,
      ultimoMinLeitura: ultimo,
      minutoInicioJanela: p.minuto_inicio_janela,
      leituras: ls.length,
      amostraTempos: ls.slice(0, 3).map((x) => x.minuto_relogio),
    });
  }
}

const topMinutos = Object.entries(golsPorMinuto)
  .map(([m, n]) => ({ min: Number(m), n }))
  .sort((a, b) => a.min - b.min);

log('H1-H5', 'probe:resumo', 'agregado gols por minuto', {
  totalMinutos: topMinutos,
  delta85,
  deltaOutro,
  fallback85,
  fallbackOutro,
  parseNull,
  parseLow,
  partidasComGol: partidas.filter((p) => {
    const ls = porPartida[p.id] ?? [];
    const gi = totalGols(p.placar_casa_inicio, p.placar_fora_inicio);
    let cf = p.placar_casa_final ?? ls.at(-1)?.placar_casa;
    let ff = p.placar_fora_final ?? ls.at(-1)?.placar_fora;
    return totalGols(cf, ff) > gi;
  }).length,
});

const topFormatos = Object.entries(amostrasMinuto)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([k, v]) => ({ formato: k, count: v }));

log('H2', 'probe:parser', 'extrairMinutoJogo samples', {
  '88:32': extrairMinutoJogo('88:32'),
  '4:30': extrairMinutoJogo('4:30'),
  '0:45': extrairMinutoJogo('0:45'),
  "90'+2": extrairMinutoJogo("90'+2"),
  "87'": extrairMinutoJogo("87'"),
});

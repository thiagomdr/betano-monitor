/**
 * Teste local ScrapingBee: JSON overview + HTML aba Gols (render_js).
 *
 *   cd scripts
 *   $env:SCRAPINGBEE_API_KEY="..." ; node test-scrapingbee-hctg.mjs 88494497 suica-colombia
 *   $env:SCRAPINGBEE_API_KEY="..." ; node test-scrapingbee-hctg.mjs 88494497 suica-colombia --html-only
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMatchTotalGoalsLines } from "./lib/betano-hctg-json.mjs";
import {
  extractMatchTotalGoalsFromHtmlString,
  formatLinesTable,
} from "./lib/betano-hctg-html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const apiKey = process.env.SCRAPINGBEE_API_KEY?.trim();
if (!apiKey) {
  console.error("Defina SCRAPINGBEE_API_KEY no .env ou no ambiente.");
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const htmlOnly = process.argv.includes("--html-only");
const jsonOnly = process.argv.includes("--json-only");
const eventId = args[0] || "88494497";
const slug = args[1] || "evento";
const country = process.env.SCRAPINGBEE_COUNTRY || "br";
const premium = process.env.SCRAPINGBEE_PREMIUM === "1";
const pageUrl = `https://www.betano.bet.br/live/${slug}/${eventId}/`;

const GOLS_SCENARIO = JSON.stringify({
  instructions: [
    { wait: 4000 },
    {
      evaluate:
        "(() => { const t = ['Aceitar','Aceitar todos','Sim','Não']; for (const b of document.querySelectorAll('button')) { const x = (b.textContent||'').trim(); if (t.some((w) => x.includes(w))) { b.click(); return true; } } return false; })()",
    },
    { wait: 800 },
    {
      evaluate:
        "(() => { const tab = [...document.querySelectorAll('.GTM-Gols-container,.events-tabs-container__tab__item')].find((el) => (el.textContent||'').trim() === 'Gols'); if (tab) (tab.querySelector('div,span,button') || tab).click(); return !!tab; })()",
    },
    { wait: 2500 },
    { wait_for: "[data-selnid]" },
  ],
});

async function scrapingBeeFetch(targetUrl, opts = {}) {
  const params = new URLSearchParams({
    api_key: apiKey,
    url: targetUrl,
    country_code: country,
    forward_headers: "true",
  });
  if (premium) params.set("premium_proxy", "true");
  if (opts.renderJs) {
    params.set("render_js", "true");
    params.set("block_resources", "false");
  }
  if (opts.jsScenario) params.set("js_scenario", opts.jsScenario);

  const forwardHeaders = {
    "Spb-Accept-Language": "pt-BR,pt;q=0.9",
    "Spb-User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Spb-Referer": pageUrl,
    "Spb-Origin": "https://www.betano.bet.br",
  };
  if (opts.accept) forwardHeaders["Spb-Accept"] = opts.accept;

  const res = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
    headers: forwardHeaders,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ScrapingBee HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  return text;
}

async function testJson() {
  const base =
    "https://www.betano.bet.br/danae-webapi/api/live/overview/latest" +
    "?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8";
  const targetUrl = `${base}&eventId=${encodeURIComponent(eventId)}`;

  console.log("\n=== JSON overview?eventId= (ScrapingBee) ===");
  const text = await scrapingBeeFetch(targetUrl, {
    accept: "application/json, text/plain, */*",
  });
  const data = JSON.parse(text);
  const events = data.events;
  let event = null;
  if (Array.isArray(events)) {
    event = events.find((e) => String(e?.id ?? e?.eventId) === eventId) ?? events[0];
  } else if (events && typeof events === "object") {
    event = events[eventId] ?? Object.values(events)[0];
  }
  if (!event) throw new Error("Evento nao encontrado no overview");

  const score = event.liveData?.score ?? {};
  const goalsTotal = Number(score.home ?? 0) + Number(score.away ?? 0);
  const snap = extractMatchTotalGoalsLines(eventId, event, data, goalsTotal);
  console.log(`placar: ${goalsTotal} gol(s)`);
  console.log(`linhas: ${snap.lines.length}`);
  console.log(formatLinesTable(snap.lines));
  return { snap, goalsTotal };
}

async function testHtml() {
  console.log("\n=== HTML pagina + aba Gols (ScrapingBee render_js) ===");
  console.log(`URL: ${pageUrl}`);
  const html = await scrapingBeeFetch(pageUrl, {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    renderJs: true,
    jsScenario: GOLS_SCENARIO,
  });
  console.log(`HTML: ${html.length} bytes`);
  const snap = extractMatchTotalGoalsFromHtmlString(html);
  console.log(`blocos Total de Gols: ${snap.blockCount ?? "?"}`);
  console.log(`linhas: ${snap.lines.length}`);
  console.log(formatLinesTable(snap.lines));
  return snap;
}

console.log("ScrapingBee HCTG test", { eventId, slug, country, premium });

try {
  if (!htmlOnly) await testJson();
  if (!jsonOnly) await testHtml();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

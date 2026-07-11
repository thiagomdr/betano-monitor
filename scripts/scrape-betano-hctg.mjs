#!/usr/bin/env node
/**
 * HCTG via HTML (Playwright) — fonte oficial. JSON desabilitado.
 *
 * Uso (VPS Linux):
 *   xvfb-run -a node scrape-betano-hctg.mjs EVENT_ID slug --headed
 *
 * Flags:
 *   --headed       browser visivel (obrigatorio na VPS Linux)
 *   --headless     forca headless (debug)
 *   --timing       imprime breakdown de tempo por etapa
 *   --compare-json debug JSON (nao usar em producao)
 */

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  extractMatchTotalsFromDom,
  formatLinesTable,
} from "./lib/betano-hctg-html.mjs";
import { gotoBetanoEvent, setupPageRoutes, setRouteEventId } from "./lib/betano-hctg-playwright.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BETANO_BASE = "https://www.betano.bet.br";

const eventId = process.argv[2] || "87690049";
const slug = process.argv[3] || "stars-fc-fc-tucson";
const headedFlag = process.argv.includes("--headed");
const headlessFlag = process.argv.includes("--headless");
const showTiming = process.argv.includes("--timing");
const compareJson = process.argv.includes("--compare-json");
/** VPS Linux: headed via xvfb; headless fica no splash Cloudflare. */
const headless = headlessFlag || (!headedFlag && process.platform !== "linux");

function msSince(t0) {
  return Math.round(performance.now() - t0);
}

async function blockHeavyAssets(page) {
  await setupPageRoutes(page);
}

async function dismissOverlays(page) {
  await page.evaluate(() => {
    const labels = ["Aceitar", "Aceitar todos", "Accept", "Accept all"];
    for (const btn of document.querySelectorAll("button")) {
      const t = (btn.textContent || "").trim();
      if (labels.some((l) => t === l)) {
        btn.click();
        return;
      }
    }
  }).catch(() => {});
}

async function clickGolsTab(page) {
  const tab = page
    .locator(".events-tabs-container__tab__item, [role='tab']")
    .filter({ hasText: /^Gols$/ })
    .first();
  try {
    await tab.click({ timeout: 4000 });
    return true;
  } catch {
    try {
      await page.getByRole("tab", { name: /^Gols$/i }).first().click({ timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

async function waitForHctgBlock(page, timeoutMs = 5000) {
  const sel = page.locator("[data-selnid]").first();
  try {
    await sel.waitFor({ state: "attached", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function waitForRealBetanoPage(page, maxWaitMs = 15000) {
  const t0 = performance.now();
  while (msSince(t0) < maxWaitMs) {
    const state = await page.evaluate(() => ({
      splash: /splash screen/i.test(document.title),
      len: (document.body?.innerText || "").length,
    }));
    if (!state.splash && state.len > 300) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function scrapeHtml(eventId, slug) {
  const url = `${BETANO_BASE}/live/${slug}/${eventId}/`;
  const timings = {};
  const tTotal = performance.now();

  let t0 = performance.now();
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });
  timings.launchMs = msSince(t0);

  const context = await browser.newContext({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  await blockHeavyAssets(page);
  setRouteEventId(eventId);

  try {
    t0 = performance.now();
    const waitUntil = await gotoBetanoEvent(page, url);
    timings.gotoMs = msSince(t0);
    timings.gotoWaitUntil = waitUntil;

    t0 = performance.now();
    const ready = headless
      ? await waitForRealBetanoPage(page, 60000)
      : await waitForRealBetanoPage(page, 12000);
    timings.splashWaitMs = msSince(t0);

    t0 = performance.now();
    await dismissOverlays(page);
    timings.overlaysMs = msSince(t0);

    t0 = performance.now();
    const golsClicked = await clickGolsTab(page);
    timings.golsTabMs = msSince(t0);

    t0 = performance.now();
    const marketsReady = await waitForHctgBlock(page);
    timings.marketsWaitMs = msSince(t0);

    t0 = performance.now();
    const htmlSnap = await page.evaluate(extractMatchTotalsFromDom);
    const pageTitle = await page.title();
    timings.parseMs = msSince(t0);

    htmlSnap.tab = golsClicked ? "gols" : "gols-failed";
    htmlSnap.marketsReady = marketsReady;
    htmlSnap.pageTitle = pageTitle;

    if (!htmlSnap.lines?.length) {
      await page.screenshot({
        path: join(__dirname, "..", ".cursor", `hctg-debug-${eventId}.png`),
        fullPage: false,
      }).catch(() => {});
    }

    timings.totalMs = msSince(tTotal);

    return {
      url,
      golsTab: golsClicked,
      activeTab: htmlSnap.tab,
      marketsReady,
      timings,
      ...htmlSnap,
    };
  } finally {
    t0 = performance.now();
    await browser.close();
    timings.closeMs = msSince(t0);
  }
}

function printTimings(timings) {
  if (!timings) return;
  console.log("\n--- Tempo por etapa ---");
  const rows = [
    ["launch (abrir Chrome)", timings.launchMs],
    ["goto (carregar pagina)", timings.gotoMs],
    ["splash (sair da verificacao)", timings.splashWaitMs],
    ["overlays (cookies)", timings.overlaysMs],
    ["aba Gols", timings.golsTabMs],
    ["espera mercado HCTG", timings.marketsWaitMs],
    ["parse DOM", timings.parseMs],
    ["fechar browser", timings.closeMs],
    ["TOTAL", timings.totalMs],
  ];
  for (const [label, ms] of rows) {
    if (ms == null) continue;
    console.log(`  ${label}: ${(ms / 1000).toFixed(2)}s`);
  }
}

async function main() {
  const tRun = performance.now();
  console.log(`Evento ${eventId} (${slug})`);
  console.log(`Modo: ${headless ? "headless" : "headed"}`);
  console.log("Coletando HTML via Playwright...");

  const html = await scrapeHtml(eventId, slug);

  console.log(`URL: ${html.url}`);
  console.log(`Titulo: ${html.pageTitle ?? "?"}`);
  console.log(`Aba Gols: ${html.golsTab ? "sim" : "nao"}`);
  console.log(`Mercado HCTG visivel: ${html.marketsReady ? "sim" : "nao"}`);
  console.log(`Selecoes: ${html.selections?.length ?? 0}`);
  console.log("\nTotal de Gols (HTML):");
  console.log(formatLinesTable(html.lines));

  if (showTiming || html.timings) printTimings(html.timings);
  console.log(`\nTempo wall-clock: ${((performance.now() - tRun) / 1000).toFixed(2)}s`);

  const outDir = join(__dirname, "..", ".cursor");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `hctg-test-${eventId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        eventId,
        slug,
        scrapedAt: new Date().toISOString(),
        source: "html-dom-playwright",
        html,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`Salvo: ${outPath}`);

  if (!html.lines?.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Playwright HCTG (HTML) — nucleo compartilhado: scrape manual + worker VPS.
 */
import { chromium } from "playwright";
import {
  extractMatchTotalsFromDom,
  extractLiveScoreFromDom,
  goalsTotalFromScoreText,
  trimHctgLinesForMatch,
} from "./betano-hctg-html.mjs";

export const BETANO_BASE = "https://www.betano.bet.br";
const GOTO_TIMEOUT_MS = Number(process.env.HCTG_GOTO_TIMEOUT_MS || "90000");

export async function gotoBetanoEvent(page, url) {
  const waitModes = ["commit", "domcontentloaded"];
  let lastErr;
  for (const waitUntil of waitModes) {
    try {
      await page.goto(url, { waitUntil, timeout: GOTO_TIMEOUT_MS });
      return waitUntil;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export function slugFromBetanoUrl(url) {
  const m = String(url ?? "").match(/\/live\/([^/]+)\/\d+\/?/i);
  return m?.[1] ?? null;
}

export async function blockHeavyAssets(page) {
  void page;
}

/** eventId do jogo atual — mantido para compatibilidade com scripts de debug. */
let routeEventId = null;

export function setRouteEventId(eventId) {
  routeEventId = eventId != null ? String(eventId) : null;
}

/** Sem interceptacao de rede — pagina Betano carrega normal. */
export async function setupPageRoutes(page) {
  void page;
}

/** Sem CSS injetado — nada escondido na pagina. */
export async function injectLightDomCss(page) {
  void page;
}

/** Limpa cache de rede do Chrome (nao remove cookies de sessao). */
export async function clearBrowserCache(page, context) {
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.clearBrowserCache");
    await cdp.detach();
  } catch {
    /* ignore */
  }
}

/** Cookie + gate de idade ("VOCÊ TEM MAIS DE 18 ANOS?" → SIM). */
export async function dismissOverlays(page) {
  const probeAgeGate = async () => {
    try {
      return await page.evaluate(() => {
        const body = (document.body?.innerText || "").slice(0, 1200);
        const hasAge = /MAIS DE 18 ANOS/i.test(body) || /TEM MAIS DE 18/i.test(body);
        const nodes = Array.from(
          document.querySelectorAll("button, [role='button'], a, div, span"),
        );
        const buttons = nodes
          .map((el) => ({
            tag: el.tagName,
            text: (el.textContent || "").trim().slice(0, 40),
            visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
          }))
          .filter((b) => b.visible && /^(SIM|NÃO|NAO)$/i.test(b.text))
          .slice(0, 12);
        return {
          hasAge,
          bodyLen: (document.body?.innerText || "").length,
          title: document.title,
          iframeCount: document.querySelectorAll("iframe").length,
          buttons,
        };
      });
    } catch (e) {
      return { probeError: String(e?.message || e) };
    }
  };

  const clickSimStrategies = async () => {
    const strategies = [
      ["role=SIM", () => page.getByRole("button", { name: /^SIM$/i })],
      ["button=SIM", () => page.locator("button").filter({ hasText: /^SIM$/i })],
      ["text=SIM", () => page.getByText(/^SIM$/i)],
      ["css-sim", () => page.locator("button, [role='button'], div, span").filter({ hasText: /^SIM$/i })],
    ];
    for (const [, getLoc] of strategies) {
      try {
        const el = getLoc().first();
        if (!(await el.isVisible({ timeout: 800 }))) continue;
        await el.click({ timeout: 3000, force: true });
        return true;
      } catch {
        /* try next */
      }
    }

    try {
      return await page.evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll("button, [role='button'], a, div, span"),
        );
        const sim = nodes.find((el) => /^(SIM)$/i.test((el.textContent || "").trim()));
        if (!sim) return false;
        sim.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        if (typeof sim.click === "function") sim.click();
        return true;
      });
    } catch {
      return false;
    }
  };

  const waitMs = Number(process.env.HCTG_AGE_GATE_WAIT_MS || "20000");
  const t0 = Date.now();
  let ageClicked = false;
  let clickLabel = null;
  let before = await probeAgeGate();

  while (Date.now() - t0 < waitMs) {
    before = await probeAgeGate();
    if (before.hasAge || (before.buttons || []).some((b) => /^SIM$/i.test(b.text))) {
      clickLabel = (await clickSimStrategies()) ? "SIM" : null;
      ageClicked = !!clickLabel;
      if (ageClicked) {
        await page.waitForTimeout(700);
        const mid = await probeAgeGate();
        if (!mid.hasAge) break;
      }
    } else if ((before.bodyLen || 0) > 300 && !before.hasAge) {
      break;
    }
    await page.waitForTimeout(400);
  }

  const clickIfVisible = async (locator, timeout = 800) => {
    try {
      const el = locator.first();
      if (!(await el.isVisible({ timeout }))) return false;
      await el.click({ timeout: 3000, force: true });
      return true;
    } catch {
      return false;
    }
  };

  for (const sel of [
    'button:has-text("Aceitar todos")',
    'button:has-text("Aceitar")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
  ]) {
    await clickIfVisible(page.locator(sel));
  }

  const after = await probeAgeGate();
  return { ageClicked, clickLabel, before, after };
}

export async function clickGolsTab(page) {
  const strategies = [
    () => page.getByRole("tab", { name: /^Gols$/i }),
    () => page.locator(".events-tabs-container__tab__item").filter({ hasText: /^Gols$/ }),
    () => page.getByText("Gols", { exact: true }),
  ];
  for (const getLoc of strategies) {
    try {
      await getLoc().first().click({ timeout: 8000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export async function waitForHctgBlock(page, timeoutMs = 12000) {
  try {
    await page.locator("[data-selnid]").first().waitFor({ state: "attached", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function waitForRealBetanoPage(page, maxWaitMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    const state = await page.evaluate(() => ({
      splash: /splash screen/i.test(document.title),
      len: (document.body?.innerText || "").length,
      title: document.title,
    }));
    if (!state.splash && state.len > 300) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

export async function isBetanoSplashScreen(page) {
  return page.evaluate(() => /splash screen/i.test(document.title));
}

/** Scrape HCTG numa aba ja aberta (worker persistente). */
function hctgHtmlSourceTag() {
  return (process.env.HCTG_HTML_SOURCE || "html-dom-local").trim() || "html-dom-local";
}

export async function scrapeHctgOnPage(page, eventId, slug) {
  const url = `${BETANO_BASE}/live/${slug}/${eventId}/`;
  const timings = {};
  const t0all = Date.now();
  const source = hctgHtmlSourceTag();

  setRouteEventId(eventId);

  let t0 = Date.now();
  const waitUntil = await gotoBetanoEvent(page, url);
  timings.gotoMs = Date.now() - t0;
  timings.gotoWaitUntil = waitUntil;

  // Clica SIM (+18) cedo — senao o scrape espera 90s ou le DOM atras do modal
  t0 = Date.now();
  const dismiss1 = await dismissOverlays(page);
  timings.overlaysMs = Date.now() - t0;

  t0 = Date.now();
  const pageReady = await waitForRealBetanoPage(page, 90000);
  timings.splashWaitMs = Date.now() - t0;

  if (!pageReady || await isBetanoSplashScreen(page)) {
    return {
      url,
      eventId,
      slug,
      golsTab: false,
      marketsReady: false,
      betanoBlocked: true,
      lines: [],
      selections: [],
      source,
      timings,
    };
  }

  // Cookies / age gate podem reaparecer apos o shell carregar
  const dismiss2 = await dismissOverlays(page);
  timings.overlaysMs = (timings.overlaysMs || 0) + 200;

  if (dismiss1?.after?.hasAge || dismiss2?.after?.hasAge) {
    return {
      url,
      eventId,
      slug,
      golsTab: false,
      marketsReady: false,
      betanoBlocked: false,
      ageGated: true,
      lines: [],
      selections: [],
      source,
      timings,
    };
  }

  t0 = Date.now();
  const golsTab = await clickGolsTab(page);
  timings.golsTabMs = Date.now() - t0;

  if (golsTab) await page.waitForTimeout(2000);

  t0 = Date.now();
  const marketsReady = await waitForHctgBlock(page);
  timings.marketsWaitMs = Date.now() - t0;

  // CSS leve so apos mercados — nao interfere splash, +18 nem aba Gols
  await injectLightDomCss(page);

  t0 = Date.now();
  const dom = await page.evaluate(extractMatchTotalsFromDom);
  const scoreText = await page.evaluate(extractLiveScoreFromDom);
  const goalsTotal = goalsTotalFromScoreText(scoreText);
  const rawLines = dom.lines ?? [];
  const lines =
    goalsTotal != null
      ? trimHctgLinesForMatch(rawLines, goalsTotal)
      : rawLines;
  timings.parseMs = Date.now() - t0;

  timings.totalMs = Date.now() - t0all;

  return {
    url,
    eventId,
    slug,
    golsTab,
    marketsReady,
    scoreText,
    goalsTotal,
    lines,
    selections: dom.selections ?? [],
    source,
    timings,
    trimmedFrom: rawLines.length,
  };
}

export async function createBetanoBrowser({ headless } = {}) {
  const resolvedHeadless =
    headless ??
    ((process.env.HCTG_HEADLESS || "0").trim() === "1");
  const profileDir = (process.env.HCTG_CHROME_PROFILE || "").trim();
  const commonArgs = ["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"];
  const viewportHeight = Number(process.env.HCTG_VIEWPORT_HEIGHT || "900");
  const contextOptions = {
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: {
      width: Number(process.env.HCTG_VIEWPORT_WIDTH || "1400"),
      height: Number.isFinite(viewportHeight) ? viewportHeight : 900,
    },
  };

  // Perfil persistente = cookie +18 / consentimento entre jogos (PC local)
  if (profileDir) {
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: resolvedHeadless,
      args: commonArgs,
      ...contextOptions,
    });
    return { browser: context, context, persistent: true };
  }

  const browser = await chromium.launch({
    headless: resolvedHeadless,
    args: commonArgs,
  });
  const context = await browser.newContext(contextOptions);
  return { browser, context, persistent: false };
}

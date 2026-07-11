#!/usr/bin/env node
/**
 * Smoke-test: IP da casa passa do splash Betano BR?
 * Exit 0 = OK, 1 = bloqueado, 2 = erro.
 *
 * Uso: node scripts/test-local-betano-ip.mjs
 */
import { chromium } from "playwright";

const headless = (process.env.HCTG_HEADLESS || "0").trim() === "1";

const browser = await chromium.launch({
  headless,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-blink-features=AutomationControlled"],
});
const page = await browser.newPage({
  locale: "pt-BR",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});

try {
  console.log("Abrindo https://www.betano.bet.br/live/ ...");
  await page.goto("https://www.betano.bet.br/live/", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });

  let ok = false;
  let last = {};
  for (let i = 0; i < 60; i++) {
    last = await page.evaluate(() => ({
      title: document.title,
      len: (document.body?.innerText || "").length,
      href: location.href,
    }));
    if (!/splash screen/i.test(last.title) && last.len > 300) {
      ok = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  console.log(ok ? "BETANO_OK — IP da casa passou do splash" : "BETANO_BLOQUEADO_SPLASH");
  console.log(last);
  await browser.close();
  process.exit(ok ? 0 : 1);
} catch (err) {
  console.error("ERRO:", err?.message ?? err);
  await browser.close();
  process.exit(2);
}

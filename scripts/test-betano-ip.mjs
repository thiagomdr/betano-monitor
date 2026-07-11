#!/usr/bin/env node
/** Testa se o IP da VPS passa do splash da Betano. Exit 0 = OK, 1 = bloqueado. */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: false,
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage({
  locale: "pt-BR",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
});
await page.goto("https://www.betano.bet.br/live/", { waitUntil: "domcontentloaded", timeout: 90000 });

let ok = false;
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(() => ({
    title: document.title,
    len: (document.body?.innerText || "").length,
  }));
  if (!/splash screen/i.test(st.title) && st.len > 300) {
    ok = true;
    break;
  }
  await page.waitForTimeout(1000);
}

console.log(ok ? "BETANO_OK" : "BETANO_BLOQUEADO_SPLASH");
await browser.close();
process.exit(ok ? 0 : 1);

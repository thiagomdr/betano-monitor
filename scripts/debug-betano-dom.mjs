#!/usr/bin/env node
import { chromium } from "playwright";

const eventId = process.argv[2] || "88616717";
const slug = process.argv[3] || "vancouver-fc-cf-montreal";
const url = `https://www.betano.bet.br/live/${slug}/${eventId}/`;

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});
const page = await browser.newPage({
  viewport: { width: 1400, height: 900 },
  locale: "pt-BR",
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
for (let i = 0; i < 18; i++) {
  const state = await page.evaluate(() => ({
    title: document.title,
    len: (document.body?.innerText || "").length,
  }));
  if (!/splash/i.test(state.title) && state.len > 300) break;
  await page.waitForTimeout(5000);
}
for (const sel of ['button:has-text("Aceitar")', 'button:has-text("Aceitar todos")']) {
  try {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1500 })) await el.click();
  } catch {}
}

let golsOk = false;
for (const getLoc of [
  () => page.getByRole("tab", { name: /^Gols$/i }),
  () => page.locator(".events-tabs-container__tab__item").filter({ hasText: /^Gols$/ }),
  () => page.getByText("Gols", { exact: true }),
]) {
  try {
    await getLoc().first().click({ timeout: 8000 });
    golsOk = true;
    break;
  } catch {}
}
await page.waitForTimeout(4000);

const info = await page.evaluate(() => {
  const aria = [...document.querySelectorAll("[aria-label]")]
    .filter((e) => /Mais de|Menos de/i.test(e.getAttribute("aria-label") || ""))
    .slice(0, 12)
    .map((e) => ({
      aria: e.getAttribute("aria-label"),
      selnid: e.getAttribute("data-selnid"),
      tag: e.tagName,
      cls: (e.className || "").toString().slice(0, 60),
    }));
  return {
    title: document.title,
    selnidCount: document.querySelectorAll("[data-selnid]").length,
    marketsCount: document.querySelectorAll(".markets__market").length,
    totalGolsHeadings: [...document.querySelectorAll("*")].filter(
      (e) => (e.textContent || "").trim() === "Total de Gols",
    ).length,
    ariaSamples: aria,
    textSnippet: document.body.innerText.replace(/\s+/g, " ").slice(0, 1500),
  };
});

console.log(JSON.stringify({ golsOk, ...info }, null, 2));
await browser.close();

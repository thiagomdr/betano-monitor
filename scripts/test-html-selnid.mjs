import { chromium } from "playwright";

const url = process.argv[2] || "https://www.betano.bet.br/live/druk-united-thimphu-fc/88331427/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
const html = await page.content();
const re = /data-selnid="(\d+)"/g;
const ids = [];
let m;
while ((m = re.exec(html)) !== null) ids.push(m[1]);
console.log("selnid count in page HTML:", ids.length);
console.log(ids.slice(0, 12).join(", "));
await browser.close();

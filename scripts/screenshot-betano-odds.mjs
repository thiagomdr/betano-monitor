/**
 * Betano Total de Gols: screenshot na nuvem + leitura via Gemini Vision.
 *
 * Local:
 *   cd scripts && npm ci
 *   node screenshot-betano-odds.mjs 88494497 suica-colombia
 *   (GEMINI_API_KEY em ../.env ou variavel de ambiente)
 *
 * GitHub Actions: .github/workflows/betano-screenshot-odds.yml
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractMatchTotalsFromDom } from "./lib/betano-hctg-html.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv(join(__dirname, "..", ".env"));
const BETANO_BASE = "https://www.betano.bet.br";

const eventId = process.argv[2] ?? process.env.EVENT_ID ?? "88494497";
const slug = process.argv[3] ?? process.env.SLUG ?? "suica-colombia";
const geminiKey = process.env.GEMINI_API_KEY ?? "";
const geminiModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const headless = process.env.HEADLESS !== "0";
const outDir =
  process.env.OUTPUT_DIR ?? join(__dirname, "..", "out", "betano-screenshot");

async function dismissOverlays(page) {
  const selectors = [
    'button:has-text("Aceitar")',
    'button:has-text("Aceitar todos")',
    'button:has-text("Continuar")',
    '[data-testid="cookie-accept"]',
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 800 })) await btn.click({ timeout: 2000 });
    } catch {
      /* ignore */
    }
  }
}

async function clickGolsTab(page) {
  const tabs = [
    page.getByRole("tab", { name: /gols/i }),
    page.locator('[role="tab"]').filter({ hasText: /^Gols$/i }),
    page.locator("button, a, [role=tab]").filter({ hasText: /^Gols$/i }),
  ];
  for (const tab of tabs) {
    try {
      const el = tab.first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

async function waitForGoalMarkets(page) {
  const selectors = [
    'h2:has-text("Total de Gols")',
    'text=/Mais de \\d/',
    '[data-selnid]',
  ];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 20000 });
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

async function screenshotTotalGolsBlock(page) {
  const heading = page.locator("h2").filter({ hasText: /Total de Gols/i }).first();
  await heading.waitFor({ state: "visible", timeout: 25000 });

  const block = heading.locator(
    'xpath=ancestor::*[self::section or self::div][.//button[contains(., "Mais de") or contains(., "Menos de")]][1]',
  );

  if ((await block.count()) > 0) {
    return block.first().screenshot({ type: "png" });
  }

  const fallback = heading.locator("xpath=ancestor::section[1] | ancestor::div[3]");
  if ((await fallback.count()) > 0) {
    return fallback.first().screenshot({ type: "png" });
  }

  return page.screenshot({ type: "png", fullPage: false });
}

async function analyzeWithGemini(pngBuffer, meta) {
  if (!geminiKey) {
    return { skipped: true, reason: "GEMINI_API_KEY ausente" };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;

  const prompt = `Voce analisa um recorte da pagina ao vivo da Betano (mercado "Total de Gols" / handicap de gols).

Extraia TODAS as linhas visiveis com odds decimal (formato brasileiro ou internacional).
Cada linha tem "Mais de X" (over) e "Menos de X" (under).

Retorne SOMENTE JSON valido, sem markdown:
{
  "eventId": "${meta.eventId}",
  "teams": "time casa x time visitante ou null",
  "score": "0-0 ou null",
  "lines": [
    { "line": 0.5, "over": 1.62, "under": 2.20 }
  ],
  "confidence": "high|medium|low",
  "notes": "observacoes curtas ou null"
}

Regras:
- "line" e o numero do handicap (0.5, 1.5, 2.5, etc.)
- odds sao numeros decimais (ex: 1.62), nunca fracao
- se nao conseguir ler, lines: [] e confidence: "low"`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/png",
                data: pngBuffer.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

  if (!text.trim()) {
    throw new Error("Gemini retornou resposta vazia");
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Gemini JSON invalido: ${text.slice(0, 300)}`);
  }
}

async function scrapeAndAnalyze() {
  const pageUrl = `${BETANO_BASE}/live/${slug}/${eventId}/`;
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  let domSnap = null;
  let blockPng = null;
  let fullPng = null;
  let pageError = null;

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);
    await dismissOverlays(page);
    await clickGolsTab(page);
    await waitForGoalMarkets(page);

    domSnap = await page.evaluate(extractMatchTotalsFromDom);
    blockPng = await screenshotTotalGolsBlock(page);
    fullPng = await page.screenshot({ type: "png", fullPage: true });
  } catch (err) {
    pageError = String(err?.message ?? err);
    if (!fullPng) {
      try {
        fullPng = await page.screenshot({ type: "png", fullPage: true });
      } catch {
        /* ignore */
      }
    }
  } finally {
    await browser.close();
  }

  const blockPath = join(outDir, "screenshot-total-gols.png");
  const fullPath = join(outDir, "screenshot-full.png");
  if (blockPng) writeFileSync(blockPath, blockPng);
  if (fullPng) writeFileSync(fullPath, fullPng);

  let geminiOdds = null;
  let geminiError = null;
  const visionInput = blockPng ?? fullPng;

  if (visionInput) {
    try {
      geminiOdds = await analyzeWithGemini(visionInput, { eventId, slug, url: pageUrl });
    } catch (err) {
      geminiError = String(err?.message ?? err);
    }
  }

  const result = {
    eventId,
    slug,
    url: pageUrl,
    scrapedAt: new Date().toISOString(),
    runner: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
    pageError,
    dom: domSnap,
    gemini: geminiOdds,
    geminiError,
    artifacts: {
      blockScreenshot: blockPng ? blockPath : null,
      fullScreenshot: fullPng ? fullPath : null,
    },
  };

  writeFileSync(join(outDir, "odds-dom.json"), JSON.stringify(domSnap, null, 2), "utf8");
  writeFileSync(
    join(outDir, "odds-gemini.json"),
    JSON.stringify(geminiOdds ?? { error: geminiError }, null, 2),
    "utf8",
  );
  writeFileSync(join(outDir, "result.json"), JSON.stringify(result, null, 2), "utf8");

  console.log(JSON.stringify(result, null, 2));

  if (pageError && !visionInput) {
    throw new Error(pageError);
  }
  if (geminiError && !domSnap?.lines?.length) {
    throw new Error(geminiError ?? pageError ?? "Falha na coleta");
  }

  return result;
}

scrapeAndAnalyze().catch((err) => {
  console.error(err);
  process.exit(1);
});

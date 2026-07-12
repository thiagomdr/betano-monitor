/**
 * Print do odd inicial 1X2 (prova) para futebol_favorito_drift.
 * Usado pelo worker HCTG/Kubmix; arquivo apagado no settle pela Edge.
 */
import { createClient } from "@supabase/supabase-js";
import {
  BETANO_BASE,
  clearBrowserCache,
  createBetanoBrowser,
  dismissOverlays,
  gotoBetanoEvent,
  isBetanoSplashScreen,
  setupPageRoutes,
  slugFromBetanoUrl,
  waitForRealBetanoPage,
} from "./betano-hctg-playwright.mjs";

const BUCKET = "betano-screenshot-debug";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes");
  return createClient(url, key);
}

/** Nome de arquivo seguro: Time A x Time B → time-a_x_time-b_odds-iniciais.png */
export function favoritoShotFileName(home, away) {
  const slug = (name, fallback) => {
    const s = String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return s || fallback;
  };
  return `${slug(home, "time-1")}_x_${slug(away, "time-2")}_odds-iniciais.png`;
}

export function favoritoShotObjectPath(home, away) {
  return `favorito/${favoritoShotFileName(home, away)}`;
}

/** Linhas watching sem print, ou com print antigo a recapturar (FAVORITO_RECAPTURE=1). */
export async function fetchFavoritoScreenshotPending(limit = 1) {
  const supabase = supabaseAdmin();
  const recapture = (process.env.FAVORITO_RECAPTURE || "0").trim() === "1";
  let q = supabase
    .from("futebol_favorito_drift")
    .select(
      "event_id,home,away,betano_url,favorito_lado,favorito_nome,odd_inicial,minuto_inicial,minuto_atual,screenshot_url,screenshot_path",
    )
    .eq("status", "watching")
    .order("first_seen_at", { ascending: true })
    .limit(limit);
  if (!recapture) q = q.is("screenshot_url", null);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function clickResultadoTab(page) {
  const strategies = [
    () => page.getByRole("tab", { name: /resultado|1x2|match result/i }),
    () => page.locator(".events-tabs-container__tab__item").filter({ hasText: /Resultado|1X2/i }),
    () => page.getByText(/^Resultado$/i),
    () => page.getByText(/^1X2$/i),
  ];
  for (const getLoc of strategies) {
    try {
      await getLoc().first().click({ timeout: 5000 });
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

/**
 * Fecha / limpa / esconde o cupom de apostas (widget flutuante "Cupom de Apostas")
 * e o banner de cookies, para nao cobrir o odd 1X2 no print.
 */
export async function dismissBetslip(page) {
  const clickIfVisible = async (locator, timeout = 700) => {
    try {
      const el = locator.first();
      if (!(await el.isVisible({ timeout }))) return false;
      await el.click({ timeout: 2500, force: true });
      return true;
    } catch {
      return false;
    }
  };

  // Cookies (banner branco embaixo)
  for (const sel of [
    'button:has-text("SIM, EU ACEITO")',
    'button:has-text("Sim, eu aceito")',
    'button:has-text("NÃO, OBRIGADO")',
    'button:has-text("Não, obrigado")',
    'button:has-text("Aceitar todos")',
    'button:has-text("Aceitar")',
  ]) {
    await clickIfVisible(page.locator(sel));
  }

  // Limpar / minimizar por botoes
  const textClicks = [
    () => page.getByRole("button", { name: /remover todas|limpar cupom|^limpar$|clear all|remove all/i }),
    () => page.getByRole("button", { name: /fechar cupom|minimizar|recolher|close betslip/i }),
    () => page.locator("button, [role='button']").filter({ hasText: /remover todas|limpar cupom|^limpar$/i }),
    () => page.locator("[aria-label*='Fechar' i], [aria-label*='Close' i], [aria-label*='Limpar' i], [aria-label*='Minimizar' i]"),
  ];
  for (const getLoc of textClicks) {
    try {
      if (await clickIfVisible(getLoc())) await page.waitForTimeout(200);
    } catch {
      /* next */
    }
  }

  // Esconde o widget flutuante pelo conteudo visual (Cupom de Apostas / APOSTE JÁ)
  try {
    await page.evaluate(() => {
      const hide = (el) => {
        if (!el || el === document.body || el === document.documentElement) return;
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
      };

      const looksLikeCupom = (text) =>
        /cupom de apostas/i.test(text) ||
        (/aposte j[aá]/i.test(text) && /cupom|seleç|selec|odd/i.test(text));

      const all = Array.from(document.querySelectorAll("div, section, aside, article, form"));
      for (const el of all) {
        const text = (el.innerText || "").trim();
        if (!text || text.length > 2500) continue;
        if (!looksLikeCupom(text.slice(0, 200))) continue;

        const style = window.getComputedStyle(el);
        const pos = style.position;
        const rect = el.getBoundingClientRect();
        const floating =
          pos === "fixed" ||
          pos === "absolute" ||
          pos === "sticky" ||
          (rect.bottom > window.innerHeight * 0.45 && rect.right > window.innerWidth * 0.45);

        if (!floating && !/cupom de apostas/i.test(text.slice(0, 40))) continue;

        // Sobe ate o container do painel (largura tipica do cupom)
        let target = el;
        for (let i = 0; i < 6 && target.parentElement; i++) {
          const p = target.parentElement;
          const r = p.getBoundingClientRect();
          const ps = window.getComputedStyle(p).position;
          if (
            (ps === "fixed" || ps === "absolute" || ps === "sticky") &&
            r.width > 160 &&
            r.width < 560 &&
            r.height > 60
          ) {
            target = p;
            break;
          }
          if (r.width > 160 && r.width < 560 && r.height > 100 && r.height < window.innerHeight * 0.95) {
            target = p;
          }
        }
        hide(target);
      }

      // Lixeira / X dentro de qualquer resto visivel com "Cupom"
      for (const b of document.querySelectorAll("button, [role='button'], a, span")) {
        const t = (b.getAttribute("aria-label") || b.textContent || "").trim();
        if (/^(×|✕|x)$/i.test(t) || /fechar|limpar|clear|remover|minimizar|recolher/i.test(t)) {
          const root = b.closest("div, aside, section");
          if (root && /cupom/i.test(root.innerText || "")) {
            try {
              b.click();
            } catch {
              /* ignore */
            }
          }
        }
      }
    });
  } catch {
    /* ignore */
  }

  // CSS amplo (classes + cookies banner)
  try {
    await page.addStyleTag({
      content: `
        [data-qa*="betslip" i],
        [data-testid*="betslip" i],
        [id*="betslip" i],
        [class*="betslip" i],
        [class*="bet-slip" i],
        [class*="Betslip" i],
        [class*="coupon" i],
        [class*="Coupon" i],
        [class*="bet-slip-container" i],
        [class*="selections-wrapper" i],
        [class*="BetSlip" i],
        [class*="betSlip" i],
        aside[class*="slip" i],
        [aria-label*="Cupom" i],
        [aria-label*="Betslip" i],
        [class*="cookie" i],
        [id*="cookie" i],
        [class*="consent" i] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `,
    });
  } catch {
    /* ignore */
  }

  await page.waitForTimeout(400);
}

/**
 * Print da viewport inteira (sem clip/recorte).
 */
async function screenshot1x2Block(page) {
  try {
    await page.evaluate(() => {
      const markers = Array.from(document.querySelectorAll("h1, h2, h3, div, span")).filter((el) => {
        const t = (el.textContent || "").trim();
        return /resultado|1\s*[xX]\s*2|casa|empate|fora/i.test(t) && t.length < 40;
      });
      const el = markers[0];
      if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
    });
  } catch {
    /* ignore */
  }
  await page.waitForTimeout(400);

  return page.screenshot({
    type: "png",
    fullPage: false,
  });
}

/**
 * Tira print da pagina do jogo (prova do odd inicial).
 * @returns {{ path: string, url: string } | null}
 */
export async function captureFavoritoOddScreenshot(page, row) {
  const eventId = String(row.event_id);
  const slug =
    slugFromBetanoUrl(row.betano_url) ||
    String(row.betano_url || "").match(/\/live\/([^/]+)\//)?.[1] ||
    null;
  if (!slug) {
    console.warn(`[favorito-shot] ${eventId} sem slug`);
    return null;
  }

  const url = `${BETANO_BASE}/live/${slug}/${eventId}/`;
  await gotoBetanoEvent(page, url);
  await dismissOverlays(page);
  const ready = await waitForRealBetanoPage(page, 45000);
  if (!ready || (await isBetanoSplashScreen(page))) {
    console.warn(`[favorito-shot] ${eventId} splash/pagina nao pronta`);
    return null;
  }
  await dismissOverlays(page);

  const finalUrl = page.url();
  if (!finalUrl.includes(eventId)) {
    console.warn(`[favorito-shot] ${eventId} redirecionou para ${finalUrl}`);
    return null;
  }

  await clickResultadoTab(page);
  await page.waitForTimeout(1200);
  await dismissBetslip(page);

  const png = await screenshot1x2Block(page);
  const objectPath = favoritoShotObjectPath(row.home, row.away);
  const supabase = supabaseAdmin();
  const oldPath = row.screenshot_path ? String(row.screenshot_path) : null;
  if (oldPath && oldPath !== objectPath) {
    try {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    } catch {
      /* ignore */
    }
  }
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, png, { contentType: "image/png", upsert: true });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl ?? null;
  if (!publicUrl) throw new Error("getPublicUrl vazio");

  const nowIso = new Date().toISOString();
  const publicUrlFresh = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const shotMinuteRaw = row.minuto_atual ?? row.minuto_inicial;
  const shotMinute =
    shotMinuteRaw != null && Number.isFinite(Number(shotMinuteRaw))
      ? Number(shotMinuteRaw)
      : null;
  const { error: dbErr } = await supabase
    .from("futebol_favorito_drift")
    .update({
      screenshot_path: objectPath,
      screenshot_url: publicUrlFresh,
      screenshot_captured_at: nowIso,
      screenshot_minuto: shotMinute,
      updated_at: nowIso,
    })
    .eq("event_id", eventId)
    .eq("status", "watching");
  if (dbErr) throw dbErr;

  console.log(
    `[favorito-shot] OK ${eventId} ${row.home} x ${row.away} odd_ini=${row.odd_inicial} → ${objectPath}`,
  );
  return { path: objectPath, url: publicUrlFresh };
}

/**
 * Processa ate `limit` prints pendentes numa aba Playwright ja aberta.
 */
export async function processPendingFavoritoScreenshots(page, { limit = 1 } = {}) {
  const pending = await fetchFavoritoScreenshotPending(limit);
  if (!pending.length) return { done: 0, failed: 0 };

  await setupPageRoutes(page);
  let done = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      const ok = await captureFavoritoOddScreenshot(page, row);
      if (ok) done += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[favorito-shot] ERRO ${row.event_id}:`, err?.message ?? err);
    }
  }
  return { done, failed };
}

/** Helper standalone (teste manual): node ... com browser proprio. */
export async function runFavoritoScreenshotOnce(eventId) {
  const supabase = supabaseAdmin();
  const { data: row, error } = await supabase
    .from("futebol_favorito_drift")
    .select("*")
    .eq("event_id", String(eventId))
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error(`event ${eventId} nao encontrado`);

  const headless = (process.env.HCTG_HEADLESS || "0").trim() === "1";
  const { browser, context } = await createBetanoBrowser({ headless });
  try {
    const page = await context.newPage();
    await setupPageRoutes(page);
    return await captureFavoritoOddScreenshot(page, row);
  } finally {
    try {
      const pages = context.pages();
      if (pages[0]) await clearBrowserCache(pages[0], context);
    } catch {
      /* ignore */
    }
    await browser.close();
  }
}

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

/** Linhas watching sem print ainda (prioridade: abertos ha pouco). */
export async function fetchFavoritoScreenshotPending(limit = 1) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("futebol_favorito_drift")
    .select(
      "event_id,home,away,betano_url,favorito_lado,favorito_nome,odd_inicial,minuto_inicial,screenshot_url",
    )
    .eq("status", "watching")
    .is("screenshot_url", null)
    .order("first_seen_at", { ascending: true })
    .limit(limit);
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

  // Confirma que nao redirecionou para o lobby
  const finalUrl = page.url();
  if (!finalUrl.includes(eventId)) {
    console.warn(`[favorito-shot] ${eventId} redirecionou para ${finalUrl}`);
    return null;
  }

  await clickResultadoTab(page);
  await page.waitForTimeout(1200);

  const png = await page.screenshot({ type: "png", fullPage: false });
  const objectPath = `favorito/${eventId}/odd-inicial.png`;
  const supabase = supabaseAdmin();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, png, { contentType: "image/png", upsert: true });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl ?? null;
  if (!publicUrl) throw new Error("getPublicUrl vazio");

  const nowIso = new Date().toISOString();
  const { error: dbErr } = await supabase
    .from("futebol_favorito_drift")
    .update({
      screenshot_path: objectPath,
      screenshot_url: publicUrl,
      screenshot_captured_at: nowIso,
      updated_at: nowIso,
    })
    .eq("event_id", eventId)
    .eq("status", "watching");
  if (dbErr) throw dbErr;

  console.log(
    `[favorito-shot] OK ${eventId} ${row.home} x ${row.away} odd_ini=${row.odd_inicial} → ${objectPath}`,
  );
  return { path: objectPath, url: publicUrl };
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

  const { browser, context } = await createBetanoBrowser({ headless: false });
  try {
    const page = await context.newPage();
    await setupPageRoutes(page);
    return await captureFavoritoOddScreenshot(page, row);
  } finally {
    try {
      await clearBrowserCache(await context.pages().then((p) => p[0]), context);
    } catch {
      /* ignore */
    }
    await browser.close();
  }
}

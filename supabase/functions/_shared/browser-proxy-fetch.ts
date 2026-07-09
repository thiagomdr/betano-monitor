/**
 * HTTP fetch via ScrapingBee (IP Brasil) para endpoints Betano bloqueados no IP Supabase.
 *
 * Secrets (Supabase Edge Function):
 *   SCRAPINGBEE_API_KEY — obrigatorio para ativar
 *   SCRAPINGBEE_COUNTRY — default br
 *   SCRAPINGBEE_PREMIUM — "1" para premium_proxy (mais creditos, geo melhor)
 *   SCRAPINGBEE_RENDER_JS — "1" forca render_js tambem em fetch JSON (default: so HTML)
 *   SCRAPINGBEE_MAX_PER_RUN — limite por cron (default 6)
 */

const SCRAPINGBEE_API = "https://app.scrapingbee.com/api/v1/";
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BETANO_GOLS_PAGE_SCENARIO = JSON.stringify({
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

export type BrowserProxyConfig = {
  apiKey: string;
  countryCode: string;
  premiumProxy: boolean;
  renderJs: boolean;
  maxPerRun: number;
};

export function getBrowserProxyConfig(): BrowserProxyConfig | null {
  const apiKey = Deno.env.get("SCRAPINGBEE_API_KEY")?.trim();
  if (!apiKey) return null;
  const maxRaw = Deno.env.get("SCRAPINGBEE_MAX_PER_RUN")?.trim();
  const maxPerRun = maxRaw ? Math.max(1, parseInt(maxRaw, 10) || 6) : 6;
  return {
    apiKey,
    countryCode: Deno.env.get("SCRAPINGBEE_COUNTRY")?.trim() || "br",
    premiumProxy: Deno.env.get("SCRAPINGBEE_PREMIUM") === "1",
    renderJs: Deno.env.get("SCRAPINGBEE_RENDER_JS") === "1",
    maxPerRun,
  };
}

export async function fetchViaBrowserProxy(
  targetUrl: string,
  opts: {
    referer?: string;
    accept?: string;
    forceRenderJs?: boolean;
    jsScenario?: string;
    waitFor?: string;
  },
  cfg: BrowserProxyConfig,
): Promise<Response> {
  const params = new URLSearchParams({
    api_key: cfg.apiKey,
    url: targetUrl,
    country_code: cfg.countryCode,
    forward_headers: "true",
  });
  if (cfg.premiumProxy) params.set("premium_proxy", "true");
  if (cfg.renderJs || opts.forceRenderJs) params.set("render_js", "true");
  if (opts.forceRenderJs) params.set("block_resources", "false");
  if (opts.jsScenario) params.set("js_scenario", opts.jsScenario);
  if (opts.waitFor) params.set("wait_for", opts.waitFor);

  const forwardHeaders: Record<string, string> = {
    "Spb-Accept-Language": "pt-BR,pt;q=0.9",
    "Spb-User-Agent": DEFAULT_UA,
  };
  if (opts.accept) forwardHeaders["Spb-Accept"] = opts.accept;
  if (opts.referer) {
    forwardHeaders["Spb-Referer"] = opts.referer;
    forwardHeaders["Spb-Origin"] = "https://www.betano.bet.br";
  }

  return await fetch(`${SCRAPINGBEE_API}?${params.toString()}`, {
    headers: forwardHeaders,
    signal: AbortSignal.timeout(opts.forceRenderJs ? 120_000 : 45_000),
  });
}

export async function fetchJsonViaBrowserProxy(
  url: string,
  referer: string,
  cfg: BrowserProxyConfig,
): Promise<unknown> {
  const res = await fetchViaBrowserProxy(url, {
    referer,
    accept: "application/json, text/plain, */*",
    forceRenderJs: cfg.renderJs,
  }, cfg);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ScrapingBee HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`ScrapingBee resposta nao-JSON: ${text.slice(0, 120)}`);
  }
}

/** Pagina /live/{slug}/{eventId}/ com render_js + clique aba Gols. */
export async function fetchHtmlViaBrowserProxy(
  pageUrl: string,
  referer: string,
  cfg: BrowserProxyConfig,
): Promise<string> {
  const res = await fetchViaBrowserProxy(pageUrl, {
    referer,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    forceRenderJs: true,
    jsScenario: BETANO_GOLS_PAGE_SCENARIO,
  }, cfg);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ScrapingBee HTML HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  if (text.length < 500) {
    throw new Error(`ScrapingBee HTML curto (${text.length} bytes)`);
  }
  return text;
}

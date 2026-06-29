import {
  BASKETBALL_CLICK_TIMEOUT_MS,
  BETANO_LIVE_URL,
  PAGE_LOAD_TIMEOUT_MS,
  SCRAPE_TIMEOUT_MS,
} from '../constants';
import type { ScrapeResult } from '../types/game';
import { debugLog, textoIndica404 } from './debugLog';
import { paginaBasqueteValida } from './parseLocal';

type PendingResolver<T> = {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

let pendingScrape: PendingResolver<ScrapeResult> | null = null;
let pendingBasketball: PendingResolver<boolean> | null = null;
let pendingLoad: PendingResolver<void> | null = null;

let injectScrape: (() => void) | null = null;
let injectBasketball: (() => void) | null = null;
let injectNavigate: ((url: string) => void) | null = null;

function rejectPending<T>(
  pending: PendingResolver<T> | null,
  message: string,
): PendingResolver<T> | null {
  if (pending) {
    pending.reject(new Error(message));
  }
  return null;
}

export function registerWebViewActions(actions: {
  scrape: () => void;
  clickBasketball: () => void;
  navigate: (url: string) => void;
}): void {
  injectScrape = actions.scrape;
  injectBasketball = actions.clickBasketball;
  injectNavigate = actions.navigate;
}

export function unregisterWebViewActions(): void {
  injectScrape = null;
  injectBasketball = null;
  injectNavigate = null;
  pendingScrape = rejectPending(pendingScrape, 'WebView desmontada');
  pendingBasketball = rejectPending(pendingBasketball, 'WebView desmontada');
  pendingLoad = rejectPending(pendingLoad, 'WebView desmontada');
}

export function notifyPageLoadComplete(): void {
  if (!pendingLoad) return;
  const resolver = pendingLoad;
  pendingLoad = null;
  resolver.resolve();
}

export function handleWebViewMessage(raw: string): void {
  let data: { type?: string; ok?: boolean; text?: string; error?: string };
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  if (data.type === 'scrape' && pendingScrape) {
    if (!data.ok) {
      pendingScrape.reject(new Error(data.error ?? 'Falha na extração'));
      pendingScrape = null;
      return;
    }

    pendingScrape.resolve({
      text: data.text ?? '',
      scrapedAt: new Date().toISOString(),
    });
    pendingScrape = null;
    return;
  }

  if (data.type === 'basketball' && pendingBasketball) {
    pendingBasketball.resolve(Boolean(data.ok));
    pendingBasketball = null;
  }
}

export function requestScrape(): Promise<ScrapeResult> {
  if (!injectScrape) {
    return Promise.reject(new Error('WebView não registrada'));
  }

  if (pendingScrape) {
    return Promise.reject(new Error('Coleta já em andamento'));
  }

  return new Promise<ScrapeResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingScrape) {
        pendingScrape.reject(new Error('Timeout na extração da página'));
        pendingScrape = null;
      }
    }, SCRAPE_TIMEOUT_MS);

    pendingScrape = {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    };

    injectScrape?.();
  });
}

export function navigateToUrl(url: string): Promise<void> {
  if (!injectNavigate) {
    return Promise.reject(new Error('WebView não registrada'));
  }

  if (pendingLoad) {
    return Promise.reject(new Error('Navegação já em andamento'));
  }

  const destino = url.includes('?') ? `${url}&_bm=${Date.now()}` : `${url}?_bm=${Date.now()}`;

  // #region agent log
  debugLog('scrapeBridge.ts:navigateToUrl', 'navegando', { url, destino }, 'H1');
  // #endregion

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingLoad) {
        pendingLoad.reject(new Error('Timeout ao carregar a página'));
        pendingLoad = null;
      }
    }, PAGE_LOAD_TIMEOUT_MS);

    pendingLoad = {
      resolve: () => {
        clearTimeout(timeout);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    };

    injectNavigate!(destino);
  });
}

export function clickBasketballFilter(): Promise<boolean> {
  if (!injectBasketball) {
    return Promise.reject(new Error('WebView não registrada'));
  }

  if (pendingBasketball) {
    return Promise.reject(new Error('Filtro basquete já em andamento'));
  }

  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (pendingBasketball) {
        pendingBasketball.reject(new Error('Timeout ao aplicar filtro basquete'));
        pendingBasketball = null;
      }
    }, BASKETBALL_CLICK_TIMEOUT_MS);

    pendingBasketball = {
      resolve: (ok) => {
        clearTimeout(timeout);
        resolve(ok);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    };

    injectBasketball!();
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomPollDelay(minMs: number, maxMs: number): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return sleep(randomPollDelay(minMs, maxMs));
}

async function tentarExtrairBasquete(): Promise<ScrapeResult> {
  const scrape = await requestScrape();
  // #region agent log
  debugLog(
    'scrapeBridge.ts:tentarExtrairBasquete',
    'scrape inicial',
    {
      textLen: scrape.text.length,
      is404: textoIndica404(scrape.text),
      paginaValida: paginaBasqueteValida(scrape.text),
      preview: scrape.text.slice(0, 120),
    },
    'H3',
  );
  // #endregion
  if (paginaBasqueteValida(scrape.text)) {
    return scrape;
  }

  const clicou = await clickBasketballFilter();
  // #region agent log
  debugLog(
    'scrapeBridge.ts:tentarExtrairBasquete',
    'clique filtro basquete',
    { clicou },
    'H4',
  );
  // #endregion
  if (clicou) {
    await humanDelay(2000, 4500);
    const retry = await requestScrape();
    // #region agent log
    debugLog(
      'scrapeBridge.ts:tentarExtrairBasquete',
      'scrape após filtro',
      {
        textLen: retry.text.length,
        is404: textoIndica404(retry.text),
        paginaValida: paginaBasqueteValida(retry.text),
        preview: retry.text.slice(0, 120),
      },
      'H3',
    );
    // #endregion
    if (paginaBasqueteValida(retry.text)) {
      return retry;
    }
  }

  return scrape;
}

/**
 * Navega até basquete ao vivo, espera carregar e extrai o texto da página.
 */
export async function executarColetaWeb(): Promise<ScrapeResult> {
  if (!injectNavigate) {
    return Promise.reject(new Error('WebView não registrada'));
  }

  // #region agent log
  debugLog(
    'scrapeBridge.ts:executarColetaWeb',
    'início coleta',
    { targetUrl: BETANO_LIVE_URL },
    'H1',
    'post-fix',
  );
  // #endregion

  await navigateToUrl(BETANO_LIVE_URL);
  await humanDelay(2500, 5000);

  let scrape = await tentarExtrairBasquete();
  if (paginaBasqueteValida(scrape.text) && !textoIndica404(scrape.text)) {
    return scrape;
  }

  await navigateToUrl(BETANO_LIVE_URL);
  await humanDelay(2000, 4000);
  scrape = await tentarExtrairBasquete();

  if (!paginaBasqueteValida(scrape.text) || textoIndica404(scrape.text)) {
    // #region agent log
    debugLog(
      'scrapeBridge.ts:executarColetaWeb',
      'coleta falhou',
      {
        is404: textoIndica404(scrape.text),
        textLen: scrape.text.length,
        paginaValida: false,
      },
      'H5',
    );
    // #endregion
    throw new Error(
      'Não foi possível carregar a listagem de basquete ao vivo. Verifique cookies/login na Betano.',
    );
  }

  return scrape;
}

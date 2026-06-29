/** Headers para imitar Chrome Android mobile (alinhado ao app). */
export const CHROME_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export const BETANO_LIVE_URL = 'https://www.betano.bet.br/live/';

export const BETANO_LIVE_OVERVIEW_URL =
  'https://www.betano.bet.br/danae-webapi/api/live/overview/latest?includeVirtuals=true&queryLanguageId=5&queryOperatorId=8';

const CHROME_SEC_HEADERS = {
  'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-CH-UA-Mobile': '?1',
  'Sec-CH-UA-Platform': '"Android"',
} as const;

export function chromeMobileHeaders(referer = 'https://www.betano.bet.br/'): Record<string, string> {
  return {
    'User-Agent': CHROME_MOBILE_UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    ...CHROME_SEC_HEADERS,
    Referer: referer,
    Origin: 'https://www.betano.bet.br',
    Connection: 'keep-alive',
  };
}

export interface BetanoFetchAnalysis {
  url: string;
  httpStatus: number;
  ok: boolean;
  textLength: number;
  hasBasquete: boolean;
  hasPeriodQ: boolean;
  hasScoreLike: boolean;
  indicates404: boolean;
  indicatesBlock: boolean;
  blockReason: string | null;
  preview: string;
  durationMs: number;
}

function detectBlock(text: string, status: number): { blocked: boolean; reason: string | null } {
  const lower = text.toLowerCase();
  if (status === 403) return { blocked: true, reason: 'HTTP 403' };
  if (status === 503) return { blocked: true, reason: 'HTTP 503' };
  if (lower.includes('cloudflare') && lower.includes('ray id')) {
    return { blocked: true, reason: 'cloudflare_challenge' };
  }
  if (lower.includes('captcha') || lower.includes('cf-challenge')) {
    return { blocked: true, reason: 'captcha' };
  }
  if (lower.includes('access denied') || lower.includes('acesso negado')) {
    return { blocked: true, reason: 'access_denied' };
  }
  return { blocked: false, reason: null };
}

function detect404(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("doesn't exist") ||
    lower.includes('não existe') ||
    lower.includes('page not found') ||
    lower.includes('página não encontrada')
  );
}

/** Headers de XHR/fetch feito pela página /live/ no Chrome Android. */
export function chromeMobileApiHeaders(
  referer = BETANO_LIVE_URL,
  cookie?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': CHROME_MOBILE_UA,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    ...CHROME_SEC_HEADERS,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Referer: referer,
    Origin: 'https://www.betano.bet.br',
    Connection: 'keep-alive',
  };
  if (cookie) {
    headers.Cookie = cookie;
  }
  return headers;
}

function extractSetCookieHeader(response: Response): string {
  const getSetCookie = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getSetCookie === 'function') {
    return getSetCookie
      .call(response.headers)
      .map((entry) => entry.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
  }
  const single = response.headers.get('set-cookie');
  if (!single) return '';
  return single
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

export interface BetanoOverviewFetchResult {
  url: string;
  httpStatus: number;
  ok: boolean;
  durationMs: number;
  warmupStatus: number;
  warmupDurationMs: number;
  cookieUsed: boolean;
  indicatesBlock: boolean;
  blockReason: string | null;
  payload: Record<string, unknown> | null;
  parseError: string | null;
  totalEvents: number;
  baskLeagueIds: number[];
  sportsAvailable: string[];
}

export async function fetchBetanoLiveOverviewAsChrome(): Promise<BetanoOverviewFetchResult> {
  const started = Date.now();
  let warmupStatus = 0;
  let warmupDurationMs = 0;
  let cookie = '';

  try {
    const warmupStarted = Date.now();
    const warmup = await fetch(BETANO_LIVE_URL, {
      method: 'GET',
      headers: chromeMobileHeaders(BETANO_LIVE_URL),
      redirect: 'follow',
    });
    warmupStatus = warmup.status;
    warmupDurationMs = Date.now() - warmupStarted;
    cookie = extractSetCookieHeader(warmup);
    await warmup.text();
  } catch {
    // warm-up opcional — segue sem cookie
  }

  const response = await fetch(BETANO_LIVE_OVERVIEW_URL, {
    method: 'GET',
    headers: chromeMobileApiHeaders(BETANO_LIVE_URL, cookie || undefined),
    redirect: 'follow',
  });

  const text = await response.text();
  const block = detectBlock(text, response.status);
  let payload: Record<string, unknown> | null = null;
  let parseError: string | null = null;

  if (response.ok) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch (error) {
      parseError = error instanceof Error ? error.message : 'JSON inválido';
    }
  }

  const sports = payload?.sports as
    | { allIds?: string[]; byIdLeagueIdList?: { BASK?: number[] } }
    | undefined;

  const events = payload?.events as Record<string, unknown> | undefined;

  return {
    url: BETANO_LIVE_OVERVIEW_URL,
    httpStatus: response.status,
    ok: response.ok && payload != null,
    durationMs: Date.now() - started,
    warmupStatus,
    warmupDurationMs,
    cookieUsed: Boolean(cookie),
    indicatesBlock: block.blocked,
    blockReason: block.reason,
    payload,
    parseError,
    totalEvents: events ? Object.keys(events).length : 0,
    baskLeagueIds: sports?.byIdLeagueIdList?.BASK ?? [],
    sportsAvailable: sports?.allIds ?? [],
  };
}

export async function fetchBetanoAsChrome(url: string): Promise<BetanoFetchAnalysis> {
  const started = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: chromeMobileHeaders(),
    redirect: 'follow',
  });

  const text = await response.text();
  const block = detectBlock(text, response.status);

  return {
    url,
    httpStatus: response.status,
    ok: response.ok,
    textLength: text.length,
    hasBasquete: /basquete/i.test(text),
    hasPeriodQ: /\bQ[1-4]\b/i.test(text),
    hasScoreLike: /\b\d{1,3}\s*[xX×]\s*\d{1,3}\b/.test(text),
    indicates404: detect404(text),
    indicatesBlock: block.blocked,
    blockReason: block.reason,
    preview: text.replace(/\s+/g, ' ').trim().slice(0, 400),
    durationMs: Date.now() - started,
  };
}

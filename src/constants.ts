export const BETANO_LIVE_URL = 'https://www.betano.bet.br/live/';
/** @deprecated Não usar — retorna 404 na Betano BR. Usar BETANO_LIVE_URL + filtro basquete. */
export const BETANO_BASKETBALL_LIVE_URL = BETANO_LIVE_URL;

/** Chrome Android — sem marcador WebView (; wv)) */
export const USER_AGENT_MOBILE_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

export const POLL_MIN_MS = Number(process.env.EXPO_PUBLIC_POLL_MIN_MS) || 240_000;
export const POLL_MAX_MS = Number(process.env.EXPO_PUBLIC_POLL_MAX_MS) || 480_000;

export const SCRAPE_TIMEOUT_MS = 45_000;
export const PAGE_LOAD_TIMEOUT_MS = 30_000;
export const BASKETBALL_CLICK_TIMEOUT_MS = 8_000;

export const SIMULATED_LEAGUE_PATTERN =
  /ebasketball|nba\s*2k|battle\s*\(|simulad|\(esports\)/i;

export const LIGA_INVALIDA_PATTERN =
  /não existem mercados|mercados disponíveis|de momento/i;

export const OPENAI_MODEL = 'gpt-4o-mini';

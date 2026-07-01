/** Intervalo único da coleta intensiva de futebol (lote): 40–50 s. */

export const FOOT_INTENSIVE_MIN_MS = 40_000;
export const FOOT_INTENSIVE_MAX_MS = 50_000;

/** Margem antes do minuto 85 para disparar o primeiro fetch intensivo (radar). */
export const FOOT_RADAR_MARGEM_MIN = 5;

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

export function pickFootballIntensiveDelayMs(): number {
  return randomIntInclusive(FOOT_INTENSIVE_MIN_MS, FOOT_INTENSIVE_MAX_MS);
}

export function addMs(isoOrDate: Date, ms: number): string {
  return new Date(isoOrDate.getTime() + ms).toISOString();
}

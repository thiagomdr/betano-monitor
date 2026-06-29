/** Intervalo humano 4–8 min com precisão de ms e sem repetir intervalos recentes. */

export const POLL_MIN_MS = 4 * 60 * 1000;
export const POLL_MAX_MS = 8 * 60 * 1000;
export const RECENT_INTERVALS_MAX = 8;

function randomIntInclusive(min: number, max: number): number {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

export function pickNextDelayMs(
  lastIntervalMs: number | null,
  recentIntervals: number[],
): number {
  const recent = new Set(recentIntervals.filter((n) => n > 0));
  let candidate = randomIntInclusive(POLL_MIN_MS, POLL_MAX_MS);
  let tries = 0;

  while (tries < 40) {
    const duplicateLast = lastIntervalMs != null && candidate === lastIntervalMs;
    const duplicateRecent = recent.has(candidate);
    if (!duplicateLast && !duplicateRecent) {
      return candidate;
    }
    candidate = randomIntInclusive(POLL_MIN_MS, POLL_MAX_MS);
    tries += 1;
  }

  return candidate;
}

export function pushRecentInterval(
  recent: number[],
  intervalMs: number,
): number[] {
  const next = [intervalMs, ...recent.filter((n) => n !== intervalMs)];
  return next.slice(0, RECENT_INTERVALS_MAX);
}

export function formatDelayHuman(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}m ${sec}s`;
}

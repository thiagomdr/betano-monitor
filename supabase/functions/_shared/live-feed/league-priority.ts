/**
 * Arena Tips — drop low-interest competitions (Class C / youth / friendlies / amateur).
 * Shared by live (and later prematch) collectors.
 */

function norm(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Explicit low-tier / niche patterns (PT + EN). */
const EXCLUDE_PATTERNS: RegExp[] = [
  // Brazil / LatAm lower divisions
  /\bserie\s*c\b/,
  /\bseries?\s*c\b/,
  /\bserie\s*d\b/,
  /\b3a\s*divis/,
  /\b3\s*a\s*divis/,
  /\bterceira\s*divis/,
  /\b4a\s*divis/,
  /\bquarta\s*divis/,
  /\bsegunda\s*b\b/,
  /\b2a\s*b\b/,
  /\bdivision\s*(3|4|c|d)\b/,
  /\bthird\s*division\b/,
  /\bfourth\s*division\b/,
  /\bnational\s*league\s*[cds]\b/,
  // State / regional lower
  /\bsegunda\s*divisao\s*(estadual|regional)?\b/,
  /\bcopa\s*estadual\s*(2|ii|b)\b/,
  /\bliga\s*regional\b/,
  /\bcampeonato\s*regional\b/,
  /\bregional\s*(league|liga)\b/,
  // Youth / academy
  /\bu-?\s*1[5-9]\b/,
  /\bu-?\s*2[01]\b/,
  /\bsub-?\s*1[5-9]\b/,
  /\bsub-?\s*2[01]\b/,
  /\bjuvenil\b/,
  /\bjuniors?\b/,
  /\byouth\b/,
  /\bacadem/,
  /\bbase\b/,
  /\breservas?\b/,
  /\breserves?\b/,
  // Friendlies / amateur
  /\bamistoso/,
  /\bfriendly\b/,
  /\bclub\s*friendly\b/,
  /\bamador\b/,
  /\bamateur\b/,
  // Obscure cups often noise on BR books
  /\bcopa\s*verde\s*sub\b/,
  /\btorneio\s*inic/,
];

/** Keep even if another weak signal appears (avoid killing top comps). */
const KEEP_OVERRIDE: RegExp[] = [
  /\bserie\s*a\b/,
  /\bserie\s*b\b/,
  /\bbrasileirao\b/,
  /\bpremier\s*league\b/,
  /\bla\s*liga\b/,
  /\bserie\s*a\s*tim\b/,
  /\bbundesliga\b/,
  /\bligue\s*1\b/,
  /\bchampions\s*league\b/,
  /\beuropa\s*league\b/,
  /\bconference\s*league\b/,
  /\bcopa\s*libertadores\b/,
  /\bcopa\s*sudamericana\b/,
  /\bnba\b/,
  /\beuroliga\b/,
  /\beurolague\b/,
  /\batp\b/,
  /\bwta\b/,
  /\bgrand\s*slam\b/,
  /\bnfl\b/,
  /\bnhl\b/,
  /\bmlb\b/,
];

export function isLowPriorityCompetition(input: {
  league?: string | null;
  country?: string | null;
  sport?: string | null;
}): boolean {
  const league = norm(input.league || "");
  const country = norm(input.country || "");
  const sport = norm(input.sport || "");
  const blob = `${league} ${country} ${sport}`.trim();
  if (!blob) return false;

  if (KEEP_OVERRIDE.some((re) => re.test(blob))) return false;
  if (EXCLUDE_PATTERNS.some((re) => re.test(blob))) return true;

  // Football-only: bare "Masculino/Feminino" with no country/league depth is usually junk filler.
  if (
    (sport === "football" || sport === "soccer" || !sport) &&
    /^(masculino|feminino|women|men)$/.test(league)
  ) {
    return true;
  }

  return false;
}

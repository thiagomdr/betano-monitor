/**
 * Deterministic Betano ↔ SuperBet event matching (no AI).
 */
export type MatchSide = {
  provider: "betano" | "superbet";
  provider_event_id: string;
  sport: string;
  home: string;
  away: string;
  starts_at: string | null;
  betradar_id: string | null;
  league?: string | null;
};

export type MatchPair = {
  betano: MatchSide;
  superbet: MatchSide;
  betradar_id: string;
  method: "betradar_id" | "name_time";
  score: number;
};

const TIME_WINDOW_MS = 15 * 60_000;
const MIN_SCORE = 0.72;
const MIN_GAP = 0.12;

const STOP = new Set(["jr", "jnr", "sr", "de", "da", "do", "dos", "das", "van", "von", "the"]);

export function normalizeNameKey(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(s: string): Set<string> {
  const key = normalizeNameKey(s).replace(/\//g, " ");
  const out = new Set<string>();
  for (const t of key.split(" ")) {
    if (!t || t.length < 2 || STOP.has(t)) continue;
    out.add(t);
  }
  return out;
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  return hit / Math.max(a.size, b.size);
}

function sideTeamScore(homeA: string, awayA: string, homeB: string, awayB: string): number {
  const ah = nameTokens(homeA);
  const aa = nameTokens(awayA);
  const bh = nameTokens(homeB);
  const ba = nameTokens(awayB);
  const direct = (tokenOverlap(ah, bh) + tokenOverlap(aa, ba)) / 2;
  const swapped = (tokenOverlap(ah, ba) + tokenOverlap(aa, bh)) / 2;
  return Math.max(direct, swapped);
}

export function normalizeSportKey(sport: string): string {
  const s = String(sport || "").toLowerCase().trim();
  if (s === "1" || s === "football" || s === "soccer" || s === "futebol") return "football";
  if (s === "2" || s === "tennis" || s === "tenis" || s === "tênis") return "tennis";
  if (s === "5" || s === "basketball" || s === "basquete") return "basketball";
  return s || "other";
}

/** SuperBet numeric sportId → arena key */
export function sportFromSuperbetId(sportId: unknown): string {
  const n = Number(sportId);
  if (n === 1) return "football";
  if (n === 2) return "tennis";
  if (n === 5) return "football"; // often football cups in BR feed
  if (n === 3) return "basketball";
  if (n === 6) return "table_tennis";
  return "other";
}

function startsClose(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= TIME_WINDOW_MS;
}

export function scoreNameTimePair(a: MatchSide, b: MatchSide): number {
  if (normalizeSportKey(a.sport) !== normalizeSportKey(b.sport)) return 0;
  if (!startsClose(a.starts_at, b.starts_at)) return 0;
  const team = sideTeamScore(a.home, a.away, b.home, b.away);
  if (team < 0.35) return 0;
  let score = 0.55 * team + 0.35; // time already gated
  if (a.league && b.league) {
    const la = normalizeNameKey(a.league);
    const lb = normalizeNameKey(b.league);
    if (la && lb && (la.includes(lb) || lb.includes(la))) score += 0.05;
  }
  return Math.min(1, score);
}

/**
 * Pair Betano ↔ SuperBet sides.
 * Prefers identical betradar_id; else unique name+time winner.
 */
export function matchBetanoSuperbet(
  betano: MatchSide[],
  superbet: MatchSide[],
): { pairs: MatchPair[]; ambiguous: { betano_id: string; candidates: number }[] } {
  const pairs: MatchPair[] = [];
  const ambiguous: { betano_id: string; candidates: number }[] = [];
  const usedSb = new Set<string>();
  const usedBn = new Set<string>();

  // Pass 1: identical betradar_id
  const sbByBr = new Map<string, MatchSide[]>();
  for (const s of superbet) {
    if (!s.betradar_id) continue;
    if (!sbByBr.has(s.betradar_id)) sbByBr.set(s.betradar_id, []);
    sbByBr.get(s.betradar_id)!.push(s);
  }
  for (const b of betano) {
    if (!b.betradar_id) continue;
    const cands = (sbByBr.get(b.betradar_id) || []).filter((s) => !usedSb.has(s.provider_event_id));
    if (cands.length === 1) {
      const s = cands[0];
      pairs.push({
        betano: b,
        superbet: s,
        betradar_id: b.betradar_id,
        method: "betradar_id",
        score: 1,
      });
      usedSb.add(s.provider_event_id);
      usedBn.add(b.provider_event_id);
    } else if (cands.length > 1) {
      ambiguous.push({ betano_id: b.provider_event_id, candidates: cands.length });
    }
  }

  // Pass 2: name + time (need betradar on at least one side — prefer Betano)
  for (const b of betano) {
    if (usedBn.has(b.provider_event_id)) continue;
    const ranked: { s: MatchSide; score: number; br: string }[] = [];
    for (const s of superbet) {
      if (usedSb.has(s.provider_event_id)) continue;
      const br = b.betradar_id || s.betradar_id;
      if (!br) continue;
      const score = scoreNameTimePair(b, s);
      if (score >= MIN_SCORE) ranked.push({ s, score, br });
    }
    ranked.sort((x, y) => y.score - x.score);
    if (!ranked.length) continue;
    if (ranked.length > 1 && ranked[0].score - ranked[1].score < MIN_GAP) {
      ambiguous.push({ betano_id: b.provider_event_id, candidates: ranked.length });
      continue;
    }
    const best = ranked[0];
    pairs.push({
      betano: b,
      superbet: best.s,
      betradar_id: best.br,
      method: "name_time",
      score: best.score,
    });
    usedSb.add(best.s.provider_event_id);
    usedBn.add(b.provider_event_id);
  }

  return { pairs, ambiguous };
}

/**
 * Deno self-check for match-events.
 * Run: deno run supabase/functions/_shared/live-feed/match-events.test.ts
 */
import { matchBetanoSuperbet, scoreNameTimePair } from "./match-events.ts";

const bn = {
  provider: "betano" as const,
  provider_event_id: "b1",
  sport: "tennis",
  home: "Jonathan Irwanto",
  away: "Shion Itsusaki",
  starts_at: "2026-07-14T16:00:00.000Z",
  betradar_id: "72724886",
  league: "UTR",
};
const sb = {
  provider: "superbet" as const,
  provider_event_id: "14001",
  sport: "tennis",
  home: "Irwanto, Jonathan",
  away: "Itsusaki, Shion",
  starts_at: "2026-07-14T16:05:00.000Z",
  betradar_id: "72724886",
  league: "Torneio 1",
};

const s = scoreNameTimePair(bn, { ...sb, betradar_id: null });
if (!(s >= 0.72)) throw new Error(`expected high name score, got ${s}`);

const { pairs } = matchBetanoSuperbet([bn], [sb]);
if (pairs.length !== 1 || pairs[0].method !== "betradar_id") {
  throw new Error(`expected betradar_id pair, got ${JSON.stringify(pairs)}`);
}

console.log("match-events.test.ts OK", { nameScore: s, method: pairs[0].method });

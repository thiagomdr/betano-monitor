/**
 * Tiny settle-rules self-check (Deno).
 * Run: deno run supabase/functions/_shared/live-feed/settle-rules.test.ts
 */
import { settlePick } from "./settle-rules.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const w = settlePick({
  market_key: "1x2",
  selection_key: "home",
  line: null,
  odd_snapshot: 1.1,
  home_score: 2,
  away_score: 1,
});
assert(w.status === "won" && Math.abs(w.pnl_u - 0.1) < 1e-9, "1x2 home win");

const l = settlePick({
  market_key: "1x2",
  selection_key: "away",
  line: null,
  odd_snapshot: 2.5,
  home_score: 2,
  away_score: 1,
});
assert(l.status === "lost" && l.pnl_u === -1, "1x2 away loss");

const btts = settlePick({
  market_key: "btts",
  selection_key: "yes",
  line: null,
  odd_snapshot: 1.8,
  home_score: 1,
  away_score: 1,
});
assert(btts.status === "won" && Math.abs(btts.pnl_u - 0.8) < 1e-9, "btts yes");

const tot = settlePick({
  market_key: "total",
  selection_key: "over",
  line: 2.5,
  odd_snapshot: 1.9,
  home_score: 2,
  away_score: 1,
});
assert(tot.status === "won", "total over 2.5 with 3 goals");

const push = settlePick({
  market_key: "total",
  selection_key: "over",
  line: 2,
  odd_snapshot: 1.9,
  home_score: 1,
  away_score: 1,
});
assert(push.status === "void" && push.pnl_u === 0, "total push");

console.log("settle-rules.test.ts OK");

/** Settle rules for Tipster Arena MVP markets. Always use pick.odd_snapshot for PnL. */

import type { MarketKey, PickOutcome, SelectionKey } from "./types.ts";

export type SettleInput = {
  market_key: MarketKey | string;
  selection_key: SelectionKey | string;
  line: number | null;
  odd_snapshot: number;
  home_score: number;
  away_score: number;
  market_status?: string | null;
};

export type SettleResult = {
  status: PickOutcome;
  pnl_u: number;
  reason: string;
};

function won(odd: number, reason: string): SettleResult {
  return { status: "won", pnl_u: Number((odd - 1).toFixed(4)), reason };
}

function lost(reason: string): SettleResult {
  return { status: "lost", pnl_u: -1, reason };
}

function voided(reason: string): SettleResult {
  return { status: "void", pnl_u: 0, reason };
}

export function settlePick(input: SettleInput): SettleResult {
  const mStatus = String(input.market_status ?? "").toLowerCase();
  if (mStatus === "void" || mStatus.includes("void") || mStatus.includes("anul")) {
    return voided("market_void");
  }

  const hs = input.home_score;
  const as_ = input.away_score;
  if (!Number.isFinite(hs) || !Number.isFinite(as_) || hs < 0 || as_ < 0) {
    return voided("invalid_score");
  }

  const goals = hs + as_;
  const key = input.market_key;
  const sel = input.selection_key;
  const odd = input.odd_snapshot;

  if (key === "1x2") {
    const result = hs > as_ ? "home" : hs < as_ ? "away" : "draw";
    if (sel === result) return won(odd, `1x2_${result}`);
    return lost(`1x2_${result}`);
  }

  if (key === "btts") {
    const both = hs > 0 && as_ > 0;
    if (sel === "yes") return both ? won(odd, "btts_yes") : lost("btts_no");
    if (sel === "no") return both ? lost("btts_yes") : won(odd, "btts_no");
    return voided("btts_bad_selection");
  }

  if (key === "total") {
    const line = input.line;
    if (line == null || !Number.isFinite(line)) return voided("total_no_line");
    if (Math.abs(goals - line) < 1e-9) return voided("total_push");
    const isOver = goals > line;
    if (sel === "over") return isOver ? won(odd, "total_over") : lost("total_under");
    if (sel === "under") return isOver ? lost("total_over") : won(odd, "total_under");
    return voided("total_bad_selection");
  }

  if (key === "double_chance") {
    const homeWin = hs > as_;
    const awayWin = hs < as_;
    const draw = hs === as_;
    if (sel === "1x") {
      return homeWin || draw ? won(odd, "dc_1x") : lost("dc_away");
    }
    if (sel === "x2") {
      return awayWin || draw ? won(odd, "dc_x2") : lost("dc_home");
    }
    if (sel === "12") {
      return homeWin || awayWin ? won(odd, "dc_12") : lost("dc_draw");
    }
    return voided("dc_bad_selection");
  }

  return voided("unknown_market");
}

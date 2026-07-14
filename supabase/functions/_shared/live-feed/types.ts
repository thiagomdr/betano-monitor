/** Provider-agnostic live feed types for Tipster Arena. */

export type Json = Record<string, unknown>;

export type MarketKey = "1x2" | "total" | "btts" | "double_chance";
export type SelectionKey =
  | "home"
  | "draw"
  | "away"
  | "over"
  | "under"
  | "yes"
  | "no"
  | "1x"
  | "x2"
  | "12";

export type EventStatus = "live" | "suspended" | "finished" | "cancelled";
export type MarketStatus = "open" | "suspended" | "settled" | "void";

export type SelectionDraft = {
  selection_key: SelectionKey;
  odd: number;
  status: MarketStatus;
  provider_selection_id?: string | null;
};

export type MarketDraft = {
  market_key: MarketKey;
  line: number | null;
  status: MarketStatus;
  provider_market_id?: string | null;
  selections: SelectionDraft[];
};

export type EventDraft = {
  provider_event_id: string;
  sport: string;
  league: string | null;
  home: string;
  away: string;
  minute: number | null;
  home_score: number | null;
  away_score: number | null;
  status: EventStatus;
  betradar_id: string | null;
  markets: MarketDraft[];
  raw?: Json;
};

export type PickOutcome = "won" | "lost" | "void";

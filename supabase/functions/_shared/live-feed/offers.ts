/**
 * Flatten nested markets-offers JSON into Danae-style markets + selections maps.
 */
import type { Json } from "./types.ts";

function asRecord(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : null;
}

export function absorbOffersTree(data: unknown): { markets: Json; selections: Json } {
  const markets: Json = {};
  const selections: Json = {};

  const absorbSelection = (s: Json, marketId?: string) => {
    const id = s.id ?? s.selectionId;
    if (id == null) return;
    const sid = String(id);
    selections[sid] = marketId && !s.marketId ? { ...s, marketId } : s;
  };

  const absorbMarket = (m: Json) => {
    const rawId = m.id ?? m.marketId;
    if (rawId == null) return;
    const id = String(rawId);
    const sels = m.selections;
    const selectionIdList = Array.isArray(m.selectionIdList)
      ? m.selectionIdList.map(String)
      : [];
    if (Array.isArray(sels)) {
      for (const item of sels) {
        const s = asRecord(item);
        if (!s) continue;
        absorbSelection(s, id);
        const sid = String(s.id ?? s.selectionId ?? "");
        if (sid && !selectionIdList.includes(sid)) selectionIdList.push(sid);
      }
    }
    markets[id] = {
      ...m,
      id,
      eventId: m.eventId ?? m.eventID,
      selectionIdList: selectionIdList.length ? selectionIdList : m.selectionIdList,
    };
  };

  const walk = (node: unknown, depth = 0) => {
    if (depth > 14 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;

    if (Array.isArray(obj.selections) && obj.selections.length >= 1) {
      const hasId = obj.id != null || obj.marketId != null;
      const looksMarket =
        hasId &&
        (obj.type != null || obj.typeName != null || obj.name != null || obj.handicap != null);
      if (looksMarket) absorbMarket(obj);
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };

  walk(data);
  return { markets, selections };
}

export function mergeOffersIntoOverview(overview: Json, offersData: unknown): Json {
  const extra = absorbOffersTree(offersData);
  const gMarkets = asRecord(overview.markets) ?? {};
  const gSelections = asRecord(overview.selections) ?? {};
  return {
    ...overview,
    markets: { ...gMarkets, ...extra.markets },
    selections: { ...gSelections, ...extra.selections },
  };
}

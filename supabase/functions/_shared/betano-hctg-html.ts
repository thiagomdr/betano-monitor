/**
 * Extrai Total de Gols (jogo inteiro) do HTML da pagina Betano.
 * Port de scripts/lib/betano-hctg-html.mjs — regex, sem DOM (Deno Edge).
 */

export type HtmlHctgLine = {
  line: number;
  over: number | null;
  under: number | null;
  selectionIds?: { over?: string; under?: string };
};

export type HtmlHctgSnapshot = {
  lines: HtmlHctgLine[];
  source: string;
  marketIds: string[];
  selectionIds?: string[];
};

const EXCLUDE_TITLE_RE =
  /tempo|half|1°|1º|1o\s|2°|2º|2o\s|pr[oó]ximo|next goal|equipe|which team/i;

type ParsedBet = {
  side: "over" | "under";
  line: number;
  odd: number;
  selectionId: string | null;
};

function parseBetFromTag(openTag: string): ParsedBet | null {
  const aria = openTag.match(/aria-label="([^"]*)"/i)?.[1] ?? "";
  const selnid = openTag.match(/data-selnid="(\d+)"/i)?.[1] ?? null;
  const lm = aria.match(/(Mais de|Menos de|Over|Under)\s*(\d+[.,]\d+|\d+)/i);
  if (!lm) return null;
  const side = /menos|under/i.test(lm[1]) ? "under" : "over";
  const line = parseFloat(lm[2].replace(",", "."));
  const om = aria.match(/odds\s+([\d.]+)/i);
  const odd = om ? parseFloat(om[1].replace(",", ".")) : null;
  if (!Number.isFinite(line) || odd == null || odd < 1.01) return null;
  if (!/mais de|menos de/i.test(aria)) return null;
  return { side, line, odd, selectionId: selnid };
}

function regionAroundMatchTotalGoals(html: string): string {
  const lower = html.toLowerCase();
  let pos = 0;
  while (pos < lower.length) {
    const i = lower.indexOf("total de gols", pos);
    if (i < 0) break;
    const head = lower.slice(i, i + 120);
    if (!EXCLUDE_TITLE_RE.test(head)) {
      return html.slice(i, i + 100_000);
    }
    pos = i + 12;
  }
  return html;
}

function parseBetsFromHtmlRegion(region: string): ParsedBet[] {
  const bets: ParsedBet[] = [];
  const tagRe = /<[a-z][^>]*\bdata-selnid="[^"]+"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(region)) !== null) {
    const bet = parseBetFromTag(m[0]);
    if (bet) bets.push(bet);
  }
  return bets;
}

function betsToLines(bets: ParsedBet[]): HtmlHctgLine[] {
  const byLine = new Map<number, HtmlHctgLine>();
  for (const bet of bets) {
    const bucket = byLine.get(bet.line) ?? {
      line: bet.line,
      over: null,
      under: null,
      selectionIds: {},
    };
    if (bet.side === "over") {
      bucket.over = bet.odd;
      if (bet.selectionId) bucket.selectionIds!.over = bet.selectionId;
    } else {
      bucket.under = bet.odd;
      if (bet.selectionId) bucket.selectionIds!.under = bet.selectionId;
    }
    byLine.set(bet.line, bucket);
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

/** Extrai linhas HCTG do HTML renderizado (regiao Total de Gols + data-selnid). */
export function extractMatchTotalGoalsFromHtml(html: string): HtmlHctgSnapshot {
  const region = regionAroundMatchTotalGoals(html);
  const bets = parseBetsFromHtmlRegion(region);

  if (!bets.length) {
    return { lines: [], source: "html-dom", marketIds: [] };
  }

  const lines = betsToLines(bets);
  const selectionIds = bets
    .map((b) => b.selectionId)
    .filter((id): id is string => !!id);

  return {
    lines,
    source: "html-dom",
    marketIds: [],
    selectionIds: selectionIds.length ? selectionIds : undefined,
  };
}

/** IDs data-selnid do bloco Total de Gols (para hibrido com JSON overview). */
export function extractTotalGoalsSelectionIdsFromHtml(html: string): string[] {
  const snap = extractMatchTotalGoalsFromHtml(html);
  return snap.selectionIds ?? [];
}

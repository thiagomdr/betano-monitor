/**
 * Extrai Total de Gols (jogo inteiro) do DOM da pagina do evento Betano.
 * Usa .markets__market + titulo "Total de Gols" + data-selnid.
 */

/** Funcao serializavel para page.evaluate() no Playwright. */
export function extractMatchTotalsFromDom() {
  const excludeTitleRe =
    /tempo|half|1°|1º|1o\s|2°|2º|2o\s|pr[oó]ximo|next goal|equipe|which team/i;

  function parseBet(el) {
    const aria = el.getAttribute("aria-label") || "";
    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    const src = aria || text;
    const lm = src.match(/(Mais de|Menos de|Over|Under)\s*(\d+[.,]\d+|\d+)/i);
    if (!lm) return null;
    const side = /menos|under/i.test(lm[1]) ? "under" : "over";
    const line = parseFloat(lm[2].replace(",", "."));
    const om = src.match(/odds\s+([\d.]+)/i) || text.match(/(\d+[.,]\d+)\s*$/);
    const odd = om ? parseFloat(String(om[1]).replace(",", ".")) : null;
    if (!Number.isFinite(line) || odd == null || odd < 1.01) return null;
    const selectionId = el.getAttribute("data-selnid") || null;
    return { side, line, odd, selectionId, aria, text };
  }

  function marketTitle(block) {
    for (const el of block.querySelectorAll("div, span, h2, h3, h4")) {
      const t = (el.textContent || "").trim();
      if (t === "Total de Gols" || t === "Total goals") return t;
      if (/^total de gols\b/i.test(t) && t.length < 40) return t;
    }
    return null;
  }

  function isMatchTotalBlock(block) {
    const title = marketTitle(block);
    if (!title) return false;
    if (excludeTitleRe.test(title)) return false;
    const raw = block.textContent.replace(/\s+/g, " ");
    if (excludeTitleRe.test(raw.slice(0, 80))) return false;
    return true;
  }

  function scoreBlock(block) {
    const bets = [...block.querySelectorAll("[data-selnid], [role='button']")]
      .map(parseBet)
      .filter((b) => b && /mais de|menos de/i.test(b.aria + b.text));
    const lines = new Set(bets.map((b) => b.line.toFixed(1)));
    const hasAlt = /opções alternativas|opcoes alternativas/i.test(block.textContent);
    return { bets, lines: lines.size, hasAlt, score: lines.size * 10 + (hasAlt ? 5 : 0) + bets.length };
  }

  const root = document.body;

  let candidates = [...root.querySelectorAll(".markets__market")]
    .filter(isMatchTotalBlock)
    .map((block) => ({ block, ...scoreBlock(block) }))
    .sort((a, b) => b.score - a.score);

  const picked = candidates[0];
  if (!picked) {
    return { lines: [], selections: [], source: "html-dom", blockCount: 0 };
  }

  const selections = [];
  const byLine = new Map();

  for (const bet of picked.bets) {
    selections.push({
      selectionId: bet.selectionId,
      side: bet.side,
      line: bet.line,
      odd: bet.odd,
    });
    const key = bet.line.toFixed(1);
    const bucket = byLine.get(key) || {
      line: bet.line,
      over: null,
      under: null,
      selectionIds: {},
    };
    if (bet.side === "over") {
      bucket.over = bet.odd;
      if (bet.selectionId) bucket.selectionIds.over = bet.selectionId;
    } else {
      bucket.under = bet.odd;
      if (bet.selectionId) bucket.selectionIds.under = bet.selectionId;
    }
    byLine.set(key, bucket);
  }

  const lines = [...byLine.values()].sort((a, b) => a.line - b.line);
  return {
    lines,
    selections,
    source: "html-dom",
    blockCount: candidates.length,
    pickedHasAlternativas: picked.hasAlt,
  };
}

export function formatLinesTable(lines) {
  if (!lines.length) return "(nenhuma linha)";
  const rows = lines.map((l) => {
    const o = l.over != null ? l.over.toFixed(2) : "—";
    const u = l.under != null ? l.under.toFixed(2) : "—";
    const ids = l.selectionIds
      ? ` [${l.selectionIds.over || "?"}/${l.selectionIds.under || "?"}]`
      : "";
    return `  ${l.line.toFixed(1)}: over ${o} / under ${u}${ids}`;
  });
  return rows.join("\n");
}

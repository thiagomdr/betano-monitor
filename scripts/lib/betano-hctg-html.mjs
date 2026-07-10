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

  function extractFromHeading() {
    const headings = [...root.querySelectorAll("h2, h3, h4")].filter((el) => {
      const t = (el.textContent || "").trim();
      return t === "Total de Gols" || t === "Total goals";
    });
    let best = null;
    for (const heading of headings) {
      let container = heading;
      for (let depth = 0; depth < 12; depth++) {
        container = container.parentElement;
        if (!container) break;
        const raw = container.textContent.replace(/\s+/g, " ");
        if (excludeTitleRe.test(raw.slice(0, 100))) continue;
        const bets = [...container.querySelectorAll("[data-selnid]")]
          .map(parseBet)
          .filter((b) => b && /mais de|menos de/i.test(b.aria + b.text));
        if (bets.length < 2) continue;
        const lineSet = new Set(bets.map((b) => b.line.toFixed(1)));
        const hasAlt = /opções alternativas|opcoes alternativas/i.test(raw);
        const score = lineSet.size * 20 + (hasAlt ? 10 : 0) + bets.length;
        if (!best || score > best.score) {
          best = { bets, hasAlt, score };
        }
      }
    }
    return best;
  }

  const headingPick = extractFromHeading();
  if (headingPick) {
    const selections = [];
    const byLine = new Map();
    for (const bet of headingPick.bets) {
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
      source: "html-dom-h2",
      blockCount: 1,
      pickedHasAlternativas: headingPick.hasAlt,
    };
  }

  let candidates = [...root.querySelectorAll(".markets__market")]
    .filter(isMatchTotalBlock)
    .map((block) => ({ block, ...scoreBlock(block) }))
    .sort((a, b) => b.score - a.score);

  // Fallback: so .markets__market (evita varrer todos os divs da pagina)
  if (!candidates.length) {
    return { lines: [], selections: [], source: "html-dom", blockCount: 0 };
  }

  // Mescla todos os blocos HCTG (Total de Gols + Opções Alternativas)
  const mergedBets = [];
  const seen = new Set();
  for (const { bets } of candidates) {
    for (const bet of bets) {
      const key = `${bet.side}:${bet.line.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mergedBets.push(bet);
    }
  }

  const picked = candidates[0];
  const selections = [];
  const byLine = new Map();

  for (const bet of mergedBets) {
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
    pickedHasAlternativas: candidates.some((c) => c.hasAlt),
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

/** Placar agregado "1 - 0" → total de gols. */
export function goalsTotalFromScoreText(scoreText) {
  const m = String(scoreText || "").match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]);
}

/**
 * Linhas HCTG plausiveis para o placar atual.
 * - So linhas >= placar+0,5 (apostaveis)
 * - Remove linha baixa fantasma quando a proxima tem odd Over quase igual
 */
export function trimHctgLinesForMatch(lines, goalsTotal, maxLines = 6) {
  if (!Array.isArray(lines) || goalsTotal == null || !Number.isFinite(goalsTotal)) {
    return Array.isArray(lines) ? lines : [];
  }
  const need = goalsTotal + 0.5;
  let cleaned = lines
    .filter((l) =>
      l &&
      Number.isFinite(l.line) &&
      l.line >= 0.5 &&
      l.line <= 12.5 &&
      Math.abs((l.line % 1) - 0.5) < 0.01 &&
      l.over != null &&
      l.over >= 1.01,
    )
    .filter((l) => l.line + 0.01 >= need)
    .sort((a, b) => a.line - b.line);

  // Linha inferior com odd quase igual a uma mais alta = DOM fantasma (ex. 2.5@1.45 vs 3.5@1.47)
  const filtered = [];
  for (let i = 0; i < cleaned.length; i++) {
    const cur = cleaned[i];
    const next = cleaned[i + 1];
    if (
      next &&
      next.over != null &&
      cur.over != null &&
      next.line - cur.line >= 0.99 &&
      next.over <= cur.over + 0.06
    ) {
      continue;
    }
    filtered.push(cur);
  }
  cleaned = filtered;

  return cleaned.slice(0, maxLines);
}

/** Le placar ao vivo do cabecalho do evento (best-effort). */
export function extractLiveScoreFromDom() {
  const scoreRe = /(\d+)\s*[-–]\s*(\d+)/;
  const selectors = [
    "[data-testid*='score']",
    "[class*='score']",
    "[class*='Score']",
    "header",
  ];
  for (const sel of selectors) {
    for (const el of document.querySelectorAll(sel)) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      const m = t.match(scoreRe);
      if (m && t.length < 40) {
        return `${m[1]} - ${m[2]}`;
      }
    }
  }
  const body = (document.body?.innerText || "").slice(0, 4000);
  const m = body.match(scoreRe);
  return m ? `${m[1]} - ${m[2]}` : null;
}

const EXCLUDE_TITLE_RE =
  /tempo|half|1°|1º|1o\s|2°|2º|2o\s|pr[oó]ximo|next goal|equipe|which team/i;

function parseBetFromTag(openTag) {
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

function marketTitleInBlock(block) {
  if (/>\s*Total de Gols\s*</i.test(block)) return "Total de Gols";
  if (/>\s*Total goals\s*</i.test(block)) return "Total goals";
  const m = block.match(/>([^<]{4,38})</);
  if (m && /^total de gols\b/i.test(m[1].trim()) && m[1].length < 40) {
    return m[1].trim();
  }
  return null;
}

function isMatchTotalBlock(block) {
  const title = marketTitleInBlock(block);
  if (!title) return false;
  if (EXCLUDE_TITLE_RE.test(title)) return false;
  const raw = block.replace(/\s+/g, " ").slice(0, 200);
  if (EXCLUDE_TITLE_RE.test(raw)) return false;
  return true;
}

function scoreBlockHtml(block) {
  const bets = [];
  const tagRe = /<[a-z][^>]*\bdata-selnid="[^"]+"[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(block)) !== null) {
    const bet = parseBetFromTag(m[0]);
    if (bet) bets.push(bet);
  }
  const lines = new Set(bets.map((b) => b.line.toFixed(1)));
  const hasAlt = /opções alternativas|opcoes alternativas/i.test(block);
  return { bets, score: lines.size * 10 + (hasAlt ? 5 : 0) + bets.length };
}

/** Parser HTML string (mesma logica da Edge Function / ScrapingBee). */
export function extractMatchTotalGoalsFromHtmlString(html) {
  const EXCLUDE = EXCLUDE_TITLE_RE;
  const lower = html.toLowerCase();
  let region = html;
  let pos = 0;
  while (pos < lower.length) {
    const i = lower.indexOf("total de gols", pos);
    if (i < 0) break;
    if (!EXCLUDE.test(lower.slice(i, i + 120))) {
      region = html.slice(i, i + 100_000);
      break;
    }
    pos = i + 12;
  }

  const bets = [];
  const tagRe = /<[a-z][^>]*\bdata-selnid="[^"]+"[^>]*>/gi;
  let m;
  while ((m = tagRe.exec(region)) !== null) {
    const openTag = m[0];
    const aria = openTag.match(/aria-label="([^"]*)"/i)?.[1] ?? "";
    const selnid = openTag.match(/data-selnid="(\d+)"/i)?.[1] ?? null;
    const lm = aria.match(/(Mais de|Menos de|Over|Under)\s*(\d+[.,]\d+|\d+)/i);
    if (!lm) continue;
    const side = /menos|under/i.test(lm[1]) ? "under" : "over";
    const line = parseFloat(lm[2].replace(",", "."));
    const om = aria.match(/odds\s+([\d.]+)/i);
    const odd = om ? parseFloat(om[1].replace(",", ".")) : null;
    if (!Number.isFinite(line) || odd == null || odd < 1.01) continue;
    if (!/mais de|menos de/i.test(aria)) continue;
    bets.push({ side, line, odd, selectionId: selnid });
  }

  if (!bets.length) {
    return { lines: [], selections: [], source: "html-dom", blockCount: 0 };
  }

  const byLine = new Map();
  const selections = [];
  for (const bet of bets) {
    selections.push({
      selectionId: bet.selectionId,
      side: bet.side,
      line: bet.line,
      odd: bet.odd,
    });
    const bucket = byLine.get(bet.line) || {
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
    byLine.set(bet.line, bucket);
  }

  return {
    lines: [...byLine.values()].sort((a, b) => a.line - b.line),
    selections,
    source: "html-dom",
    blockCount: 1,
  };
}

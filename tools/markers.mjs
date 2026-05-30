// Beacon Phase A · marker mini-grammar for core/content/*.md.
// Tokens are matched as EXACT trimmed lines, interpreted EVERYWHERE in the file
// (including inside fenced code blocks — verified: 10 of inspect's 30 markers land
// inside its ```bash block, so fence-aware pass-through would break byte-identity).
// CAUTION: a BALANCED real <!--@cc-->...<!--/@cc--> pair in genuine content would
// be silently consumed as a marker block. These tokens must never appear as
// literal content. The round-trip test (byte-compare vs committed files) is the
// guard that catches any such collision.

export const MARKER_RE = /^<!--\/?@(cc|codex)-->$/;

const lines = (s) => s.split('\n');

// Validate marker grammar; throw with a 1-based line number on any error.
export function validateMarkers(core) {
  let open = null;     // null | 'cc' | 'codex'
  let openLine = 0;
  const ls = lines(core);
  for (let i = 0; i < ls.length; i++) {
    const t = ls[i].trim();
    const m = t.match(MARKER_RE);
    if (!m) continue;
    const isClose = t.startsWith('<!--/@');
    const tag = m[1];
    if (!isClose) {
      if (open) throw new Error(`markers: '@${tag}' opened at line ${i + 1} while '@${open}' (line ${openLine}) still open`);
      open = tag; openLine = i + 1;
    } else {
      if (open !== tag) throw new Error(`markers: '/@${tag}' close at line ${i + 1} without matching open`);
      open = null;
    }
  }
  if (open) throw new Error(`markers: '@${open}' opened at line ${openLine} never closed`);
}

// Strip a marked core into one surface variant. keep = 'cc' | 'codex'.
export function buildVariant(core, keep) {
  validateMarkers(core);
  const drop = keep === 'cc' ? 'codex' : 'cc';
  const out = [];
  let skipping = false;
  for (const line of lines(core)) {
    const t = line.trim();
    if (t === `<!--@${drop}-->`) { skipping = true; continue; }
    if (t === `<!--/@${drop}-->`) { skipping = false; continue; }
    if (t === `<!--@${keep}-->` || t === `<!--/@${keep}-->`) continue;
    if (skipping) continue;
    out.push(line);
  }
  return out.join('\n');
}

// A built OUTPUT must contain no marker tokens (all should be consumed).
export function assertNoStrayTokens(text, label) {
  const ls = lines(text);
  for (let i = 0; i < ls.length; i++) {
    if (MARKER_RE.test(ls[i].trim())) {
      throw new Error(`${label}: stray marker token at line ${i + 1}: ${ls[i].trim()}`);
    }
  }
}

// Advisory: content lines that appear in BOTH a @cc and a @codex block
// (the duplicated lines a future edit must change in both places).
export function findDuplicatedLines(core) {
  const cc = new Set(), codex = new Set();
  let mode = null;
  for (const line of lines(core)) {
    const t = line.trim();
    if (t === '<!--@cc-->') { mode = 'cc'; continue; }
    if (t === '<!--@codex-->') { mode = 'codex'; continue; }
    if (t === '<!--/@cc-->' || t === '<!--/@codex-->') { mode = null; continue; }
    if (mode === 'cc' && line.trim()) cc.add(line);
    else if (mode === 'codex' && line.trim()) codex.add(line);
  }
  return [...cc].filter((l) => codex.has(l));
}

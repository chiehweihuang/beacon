// Shared start-tag attribute lookup for Beacon's regex-based Tier-1 detectors.
//
// Fourth appearance of the same bug class (2026-08): a detector checks for an
// attribute by testing whether a NAME SUBSTRING appears anywhere in the tag,
// so it false-matches a DIFFERENT attribute that merely contains the target
// name (data-reactid contains "id=", an attribute containing "onclick",
// data-title matching /title=/, and — the instance that forced this file —
// jsonld-missing assuming type="application/ld+json" is the LAST attribute on
// the tag, so a trailing data-gatsby-head="true" hid it). One tokenizer,
// exact attribute-name lookup, order irrelevant, quoting agnostic.

const ATTR_RE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`/]*)))?/g;

// Parses a start tag (e.g. `<script type="application/ld+json" data-x="y">`)
// into a Map<lowercase attribute name, string value>. Boolean attributes
// (present, no `=`) and explicitly empty values (`title=""`, `title=''`) both
// map to '' — callers distinguish "absent" from "present-empty" via has().
// The tag name itself (first token) is dropped.
export function parseStartTag(startTag) {
  const body = String(startTag)
    .replace(/^<\s*[^\s"'>/=]+/, '')   // strip "<tagname"
    .replace(/\/?>\s*$/, '');          // strip trailing "/>" or ">"
  const attrs = new Map();
  for (const m of body.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (!name) continue;
    attrs.set(name, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

// Reports whether `name` is absent, present with an empty value (boolean
// attribute or explicit ""/''), or present with a real value — an EXACT
// tokenized attribute-name match, never a substring match.
export function attrState(startTag, name) {
  const attrs = parseStartTag(startTag);
  const lc = String(name).toLowerCase();
  if (!attrs.has(lc)) return { state: 'absent' };
  const value = attrs.get(lc);
  return value === '' ? { state: 'present-empty', value: '' } : { state: 'present-value', value };
}

// ---------------------------------------------------------------------------------------
// Linear-time stand-ins for two regex shapes the Tier-1 detectors scan whole pages with
// (perf audit 2026-10-04, P5 and P8). Both return exactly what the regex would; they only
// stop the engine from rescanning the same tail of the document once per candidate.

// Blocks shaped OPEN([\s\S]*?)CLOSE, in the order and extent of text.matchAll(/OPEN…CLOSE/gi).
// `openRe` (global) matches the start of OPEN; with `untilGt` the open tag runs on to the
// first `>` (the `<tag\b[^>]*>` shape). The regex retried every later OPEN to EOF once no
// CLOSE was left (quadratic on a truncated page); an OPEN with no CLOSE after it can end the
// scan instead, because every later OPEN ends no earlier and so has no CLOSE either.
// Requires OPEN's end to never move backwards as its start moves forwards (true for a fixed
// literal and for `untilGt`). Returns { index, bodyStart, bodyEnd, end } per block.
export function lazyBlocks(text, openRe, closeRe, { untilGt = false } = {}) {
  const blocks = [];
  for (let cursor = 0; ;) {
    openRe.lastIndex = cursor;
    const open = openRe.exec(text);
    if (!open) break;
    let bodyStart = open.index + open[0].length;
    if (untilGt) {
      const gt = text.indexOf('>', bodyStart);
      if (gt === -1) break;
      bodyStart = gt + 1;
    }
    closeRe.lastIndex = bodyStart;
    const close = closeRe.exec(text);
    if (!close) break;
    const end = close.index + close[0].length;
    blocks.push({ index: open.index, bodyStart, bodyEnd: close.index, end });
    cursor = end;
  }
  return blocks;
}

// text.replace(/OPEN[\s\S]*?CLOSE/gi, …) over blocks from lazyBlocks; `replace` maps the
// whole block text to its replacement.
export function replaceBlocks(text, blocks, replace) {
  let out = '', last = 0;
  for (const b of blocks) {
    out += text.slice(last, b.index) + replace(text.slice(b.index, b.end));
    last = b.end;
  }
  return last === 0 ? text : out + text.slice(last);
}

// text.matchAll(re) for a start-tag pattern `<tag\b[^>]*X…` whose success at a start depends
// only on WHAT FOLLOWS that start (no negative lookahead into the tag): `startRe` (global)
// finds the `<tag\b` candidates and `re` (sticky, same flags otherwise) is the full pattern.
// When a candidate fails, every later candidate before the same `>` sees a suffix of that
// candidate's tag text and fails too, so the scan jumps to that `>` (or stops when none is
// left) instead of rescanning one long run once per `<tag` inside it. `limit` stops early
// for a leftmost-match test.
export function tagMatchAll(text, startRe, re, limit = Infinity) {
  const matches = [];
  for (let cursor = 0; matches.length < limit;) {
    startRe.lastIndex = cursor;
    const start = startRe.exec(text);
    if (!start) break;
    re.lastIndex = start.index;
    const m = re.exec(text);
    if (m) {
      matches.push(m);
      cursor = m.index + Math.max(m[0].length, 1);
      continue;
    }
    const gt = text.indexOf('>', start.index);
    if (gt === -1) break;
    cursor = gt;
  }
  return matches;
}

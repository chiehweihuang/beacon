#!/usr/bin/env node
// Beacon static baseline audit for Codex.
// Produces JSON compatible with Beacon's generate-report.mjs.
//
// Usage:
//   node static-audit.mjs --scope "My page" --output audit-results.json <file-or-dir>...

import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { createHash } from 'crypto';
import { extractText, assessLang, isWellFormedLangTag } from './lang-detect.mjs';
import { detectAuthBarriers, detectAuthBarriersInSource } from './auth-detect.mjs';
import { assessPdf } from './pdf-detect.mjs';
import { detectQualityFlags } from './quality-detect.mjs';
import { parseColor, relLuminance, contrastRatio } from './tier2-audit.mjs';
import { attrState, parseStartTag } from './attr-scan.mjs';
import { normalizeReaderEvidence } from './reader-task-audit.mjs';
import { legalExposureFor } from './jurisdictions.mjs';


const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage']);
const FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|js|cjs|mjs|ts|pdf)$/i;
const PDF_PATTERN = /\.pdf$/i;
const AGENT_FILE_NAMES = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'openapi.json', 'openapi.yaml', 'openapi.yml', 'mcp.json', 'server-card.json']);

const CATEGORY_NAMES = {
  contrast: 'Color & Contrast',
  keyboard: 'Keyboard Navigation',
  screenreader: 'Screen Reader',
  forms: 'Forms',
  responsive: 'Responsive & Reflow',
  touch: 'Touch & Targets',
  cognitive: 'Cognitive',
  motion: 'Motion & Animation',
  media: 'Media',
  agent: 'Agent Operability & AEO',
};

const CATEGORY_ORDER = ['contrast', 'keyboard', 'screenreader', 'forms', 'responsive', 'touch', 'cognitive', 'motion', 'media', 'agent'];

// P1: the verdict path is owned by this script, not the agent. The weighted-average
// table and the severity matrix below are the SINGLE SOURCE for scoring — inspect.md
// Step 4 documents them but forbids the agent from hand-applying them. Weights sum to 100.
const CATEGORY_WEIGHTS = {
  screenreader: 18, keyboard: 13, contrast: 13, forms: 13,
  responsive: 12, touch: 8, cognitive: 8, motion: 5, media: 5, agent: 5,
};
const WEIGHT_SUM = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);

// SEVERITY MATRIX — WCAG criterion -> mandated severity. Overrides a finding's own
// severity when the criterion appears here (mirrors inspect.md Step 4). Applied at the
// single funnel addFinding(), so native and merged findings are normalised identically.
const SEVERITY_MATRIX = {
  '1.1.1': 'critical', '1.2.2': 'critical', '1.3.1': 'critical', '1.3.6': 'tip',
  '1.4.1': 'critical', '1.4.2': 'critical', '1.4.3': 'warning', '1.4.4': 'warning',
  '1.4.10': 'warning', '1.4.11': 'warning', '1.4.12': 'warning', '2.1.1': 'critical',
  '2.2.2': 'critical', '2.3.1': 'critical', '2.4.1': 'warning', '2.4.2': 'critical',
  '2.4.7': 'warning', '2.4.11': 'warning', '3.1.1': 'critical', '3.3.2': 'critical',
  '4.1.2': 'critical',
};

// Score bands — the SINGLE source for report colouring and doc tables. Emitted with the
// artifact (summary.score_bands) so generate-report.mjs and inspect.md cannot drift.
const SCORE_BANDS = [
  { min: 90, id: 'pass' },
  { min: 50, id: 'needs-work' },
  { min: 0, id: 'fail' },
];

// Life-safety criteria gate the OVERALL score: a weighted average must never dilute a
// confirmed seizure risk (2.3.1) into an amber verdict. A confirmed critical on any of
// these criteria caps the overall inside the fail band.
const LIFE_SAFETY_CRITERIA = new Set(['2.3.1']);
const LIFE_SAFETY_CAP = 49;

// Repeated instances of ONE finding key are usually one root cause stamped out by a
// template (benchmark 2026-07-05: 9x list-non-li-child from a single reused Vue nav
// component floored a 96%-passing category to 0). The pass/fail base ratio already
// reflects the repetition, so the severity penalty counts at most this many instances
// per key per category.
const SEV_REPEAT_CAP = 3;

// P3: engine fingerprint. The reproducibility contract is "same page + same fingerprint
// => identical machine layer". Bump DETECTOR_VERSION when detection/scoring LOGIC changes;
// the ruleset hash auto-changes when the scoring CONTRACT (weights/matrix/formula) changes.
// External engine provenance is carried separately in audit.axe / audit.tier2.
const DETECTOR_VERSION = 'beacon-static-audit@19';

// A category with 1-2 total machine checks is a coin-flip denominator (a single fail
// reads identically to a six-check 100) — too thin to trust alone, but no longer a reason
// to hide the number (user ruling 2026-08-08, VALIDATION.md L2). N=3 is a CALIBRATION
// DECISION, not a physical constant — revisit with data.
const THIN_EVIDENCE_MIN = 3;

function rulesetHash() {
  const payload = JSON.stringify({
    weights: CATEGORY_WEIGHTS,
    matrix: SEVERITY_MATRIX,
    bands: SCORE_BANDS,
    thinEvidenceMin: THIN_EVIDENCE_MIN,
    formula: 'category=base-12crit-5warn-1tip(cap3/key); states=scored|not-machine-checkable|not-applicable; thin=auditable<3; overall=weighted-over-scored; gate=life-safety-cap-49',
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 12);
}

function engineFingerprint() {
  return `${DETECTOR_VERSION}+ruleset.${rulesetHash()}`;
}

// A composed wcag string (axe rules tagged with several criteria, e.g. "2.4.1 Bypass
// Blocks; 2.3.1") can carry more than one criterion — ALL of them, not just the first.
function allCriteriaOf(wcag) {
  return [...String(wcag || '').matchAll(/\b([1-4]\.\d\.\d{1,2})\b/g)].map(m => m[1]);
}

const SEVERITY_RANK = { critical: 3, warning: 2, tip: 1 };

// Matrix wins when ANY of the finding's WCAG criteria is listed — the strictest mandated
// severity across all of them applies, so a life-safety criterion (e.g. 2.3.1) can't hide
// behind a milder one listed first in a composed string. Otherwise the finding keeps its
// own severity (or 'warning' as a last resort for merged findings with none).
function mandatedSeverity(wcag, fallback) {
  let best = null;
  for (const c of allCriteriaOf(wcag)) {
    const sev = SEVERITY_MATRIX[c];
    if (sev && (!best || SEVERITY_RANK[sev] > SEVERITY_RANK[best])) best = sev;
  }
  return best || fallback || 'warning';
}

// Reproducibility (P3 precursor): the stamped date must be injectable so two runs of the
// same page can be byte-identical. --date wins; else SOURCE_DATE_EPOCH (reproducible-builds
// convention); else today. Live runs that pass neither keep the old today's-date behaviour.
function resolveDate(optDate) {
  if (optDate) return optDate;
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function usage() {
  console.error('Usage: node static-audit.mjs [--scope name] [--url url] [--output audit-results.json] [--merge-findings findings.json] [--llm-judgment judgment.json] [--reader-evidence reader-results.json] <file-or-dir>...');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { scope: 'Static UI audit', url: null, output: 'audit-results.json', date: null, mergeFindings: null, llmJudgment: null, readerEvidence: null, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scope') opts.scope = argv[++i] || usage();
    else if (arg === '--url') opts.url = argv[++i] || usage();
    else if (arg === '--output') opts.output = argv[++i] || usage();
    else if (arg === '--date') opts.date = argv[++i] || usage();
    else if (arg === '--merge-findings') opts.mergeFindings = argv[++i] || usage();
    else if (arg === '--llm-judgment') opts.llmJudgment = argv[++i] || usage();
    else if (arg === '--reader-evidence') opts.readerEvidence = argv[++i] || usage();
    else opts.paths.push(arg);
  }
  if (opts.paths.length === 0) usage();
  return opts;
}

function collect(inputPath, out = []) {
  const stat = statSync(inputPath);
  if (stat.isDirectory()) {
    for (const name of readdirSync(inputPath)) {
      if (SKIP_DIRS.has(name)) continue;
      collect(join(inputPath, name), out);
    }
    return out;
  }
  if (FILE_PATTERN.test(inputPath) || AGENT_FILE_NAMES.has(basename(inputPath).toLowerCase())) out.push(inputPath);
  return out;
}

// Offsets where each line starts, computed once per text. lineOf and snippetAt run per
// finding, and re-splitting the whole file each time cost findings x lines (snapshot
// 102618: 2,845 findings x 63,247 lines took 112 s, near the 120 s audit timeout, 2026-10-04).
let lineStartsCache = { text: null, starts: null };
function lineStarts(text) {
  if (lineStartsCache.text === text) return lineStartsCache.starts;
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  lineStartsCache = { text, starts };
  return starts;
}

// 1-based line of `index`: one more than the number of newlines strictly before it.
function lineOf(text, index) {
  const starts = lineStarts(text);
  const limit = Math.max(index, 0);
  let lo = 0, hi = starts.length - 1; // count starts[k] (k >= 1) with starts[k] - 1 < limit
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] - 1 < limit) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

// Decodes character references to their real characters instead of blanking them —
// an anchor whose entire text is entity-only (pagination/close controls: "&gt;&gt;",
// "&raquo;", "&hellip;" ...) has real content and must not read as nameless (2026-08
// hunt round 2, id 104362). Whitespace entities (&nbsp; and friends) still map to a
// plain space in the table below, so "A&nbsp;B" keeps its word separator and an
// entity-only label of just "&nbsp;" still trims to ''. Common table, not the full
// WHATWG set — an unrecognised named entity falls through unchanged, which is still
// non-empty text, not a false "nameless" reading.
const NAMED_ENTITY_CHARS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", raquo: '»', laquo: '«',
  times: '×', hellip: '…', rarr: '→', larr: '←', mdash: '—',
  ndash: '–', nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
};
function safeFromCodePoint(n) {
  try { return Number.isFinite(n) && n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ''; }
  catch { return ''; }
}
function decodeCommonEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITY_CHARS[name.toLowerCase()] ?? m);
}

// Evidence excerpts are for human/report display only (never scoring), but an
// unbounded one still breaks reports: a single-line minified <style> block turns
// the normal 3-line context into the whole stylesheet. matchLen (when the caller
// has it) keeps the actual match intact while clamping the surrounding context.
const SNIPPET_MAX_CHARS = 300;

function snippetAt(text, index, matchLen = 0) {
  // Lines line-1 .. line+1 (1-based), joined as split('\n').slice(...).join('\n') would.
  const starts = lineStarts(text);
  const line = lineOf(text, index);
  const first = Math.max(0, line - 2);
  const last = Math.min(starts.length, line + 1) - 1;
  const raw = text.slice(starts[first], last + 1 < starts.length ? starts[last + 1] - 1 : text.length).trim();
  if (raw.length <= SNIPPET_MAX_CHARS) return raw;
  // Oversized (typically one giant minified line): fall back to a character
  // window centered on the matched text itself instead of the whole line.
  const start = Math.max(0, index);
  const end = Math.min(text.length, start + Math.max(matchLen, 1));
  // The match itself can exceed the budget too (e.g. a long <a>...</a> body) —
  // clamp it from its own start rather than let an oversized match through whole.
  if (end - start >= SNIPPET_MAX_CHARS) {
    const winEnd = Math.min(text.length, start + SNIPPET_MAX_CHARS);
    const suffix = winEnd < text.length ? '…' : '';
    return `${text.slice(start, winEnd).trim()}${suffix}`;
  }
  const pad = Math.max(0, Math.floor((SNIPPET_MAX_CHARS - (end - start)) / 2));
  const winStart = Math.max(0, start - pad);
  const winEnd = Math.min(text.length, end + pad);
  const prefix = winStart > 0 ? '…' : '';
  const suffix = winEnd < text.length ? '…' : '';
  return `${prefix}${text.slice(winStart, winEnd).trim()}${suffix}`;
}

// Remove @media block bodies so a width scoped to a breakpoint (e.g. inside
// @media (max-width:767px)) is not treated as an always-on fixed width. Regex
// cannot balance braces, so scan them.
function stripAtMedia(css) {
  let out = '', i = 0;
  for (;;) {
    const at = css.indexOf('@media', i);
    if (at === -1) return out + css.slice(i);
    out += css.slice(i, at);
    const open = css.indexOf('{', at);
    if (open === -1) return out + css.slice(at);
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) {
      const c = css[j++];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    i = j; // drop the whole @media ... { ... }
  }
}

// Elements hidden from the accessibility tree (inline display:none / visibility:hidden,
// aria-hidden="true", or the hidden attribute) take their whole subtree with them:
// nothing inside is a violation OR pass evidence. 2026-07-06 ground-truth study: hidden
// tracking iframes, preload images, and collapsed carousels were the dominant FP class.
// Linear tag walk with an open-element stack; forgiving about malformed nesting.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// Quote-aware: a bare regex over the raw attrs blob reads "hidden" inside a quoted
// VALUE (style="overflow: hidden overlay;", class="btn hidden md:block") as the boolean
// hidden ATTRIBUTE, opening a phantom hidden range to EOF that blacks out whole documents
// (2026-08 hunt round 2, id 100594 / youku). parseStartTag tokenizes by attribute NAME.
function isHiddenAttrs(attrs) {
  const parsed = parseStartTag(`<x ${attrs}>`);
  if (parsed.has('hidden')) return true;
  if ((parsed.get('aria-hidden') || '').toLowerCase() === 'true') return true;
  return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(parsed.get('style') || '');
}

// `maskedRanges` (script/style bodies + HTML comments; see scanFile) hides tag tokens
// that are not real elements — a JS string or a comment containing tag-shaped text must
// not open/close a range. Defaults to none so other callers/tests are unaffected.
function computeHiddenRanges(text, maskedRanges = []) {
  const inMasked = (i) => maskedRanges.some(([s, e]) => i >= s && i < e);
  const ranges = [];
  const stack = []; // open non-void elements: { tag, hidden }
  let hiddenDepth = 0;
  let hiddenStart = -1;
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = re.exec(text))) {
    if (inMasked(m.index)) continue;
    const [full, close, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === 'script' || tag === 'style') continue; // masked separately (inMasked)
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag !== tag) continue;
        for (const popped of stack.splice(i)) {
          if (!popped.hidden) continue;
          hiddenDepth -= 1;
          if (hiddenDepth === 0) { ranges.push([hiddenStart, m.index + full.length]); hiddenStart = -1; }
        }
        break;
      }
      continue;
    }
    const hidden = isHiddenAttrs(attrs);
    if (VOID_TAGS.has(tag) || attrs.endsWith('/')) {
      // a hidden void/self-closing element hides only itself
      if (hidden && hiddenDepth === 0) ranges.push([m.index, m.index + full.length]);
      continue;
    }
    if (hidden) { hiddenDepth += 1; if (hiddenDepth === 1) hiddenStart = m.index; }
    stack.push({ tag, hidden });
  }
  // KEEP: an unclosed inline-hidden element hides the rest of the document to EOF. This is
  // not a bug — a real unclosed hidden element does swallow subsequent content in browsers
  // too, and this tail rule shipped in @5/@6 and is ground-truth-validated (2026-07-06
  // study). Do not "fix" this the way computeLabelRanges below was fixed: hidden-range
  // credit (suppressing findings) staying conservative-to-EOF is the safe direction; label
  // credit (suppressing findings AND adding passes) is not, so it stays bounded instead.
  if (hiddenDepth > 0 && hiddenStart >= 0) ranges.push([hiddenStart, text.length]);
  return ranges;
}

// Character ranges of <label>...</label>. A wrapping label already gives its control an
// accessible name (WCAG 1.3.1/4.1.2; VALIDATION.md L3), independent of a matching `for`.
// 2026-07-07 88-site benchmark: 46/57 input-label-missing findings were wrapped inputs
// (benchmark/2026-07-07-cjk-fp/README.md). Depth counter only (labels rarely nest) —
// same linear-scan style + quote-aware attrs + maskedRanges as computeHiddenRanges (see
// its comment above for why masking matters: a stray tag token in a script string or
// comment must not open a phantom range).
// ponytail: approximation — a wrapping label whose `for` targets a DIFFERENT control's id
// still counts as labelling here; we don't cross-check `for` against the wrapped input's
// id. Tier-1 ceiling, not worth a full DOM parse.
// Positive credit must stay conservative (unlike the hidden-range tail rule above): a
// self-closing <label/> wraps nothing, and an unclosed <label> does NOT credit the rest of
// the page — a maybe-open label must never manufacture a pass or suppress a real fail.
function computeLabelRanges(text, maskedRanges = []) {
  const inMasked = (i) => maskedRanges.some(([s, e]) => i >= s && i < e);
  const ranges = [];
  let depth = 0;
  let start = -1;
  const re = /<(\/?)label\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi;
  let m;
  while ((m = re.exec(text))) {
    if (inMasked(m.index)) continue;
    const [, close, attrs] = m;
    if (close) {
      if (depth > 0 && --depth === 0) { ranges.push([start, m.index + m[0].length]); start = -1; }
      continue;
    }
    if (attrs.endsWith('/')) continue; // self-closing <label/> wraps nothing
    if (depth === 0) start = m.index;
    depth += 1;
  }
  return ranges;
}

// ---------------------------------------------------------------------------------------
// Workstream B (engine @10): static contrast reference value. EVIDENCE ONLY, never a score
// (contrast stays 'not-machine-checkable' — every finding below uses check:'review', which
// addFinding never routes into the fail/severity accounting). Reuses the color/ratio math
// from tier2-audit.mjs (parseColor/relLuminance/contrastRatio) rather than duplicating it;
// only hex-color parsing is new here (getComputedStyle, tier2's source, never returns hex).
//
// Resolvability is deliberately narrow — "any doubt -> not resolvable" (v3.2's lesson: static
// CSS resolution that guesses is a lie). A pair only counts if:
//   - the foreground is a literal, opaque (alpha=1) color on the text-bearing element itself
//     (inline `style`, or exactly one same-FILE `<style>` rule matching its id/class with no
//     conflicting redeclaration — id beats class per fixed CSS specificity; ties across
//     multiple classes are NOT resolved, since which wins depends on stylesheet source order);
//   - the background is the same kind of certain, opaque literal color, found on that same
//     element or by walking DIRECT ancestors outward, stopping (unresolved) at the first
//     ancestor whose own background is declared but uncertain (gradient/url/var/alpha<1/tie);
//   - reaching the document root with NO background declared anywhere is UNRESOLVED, never a
//     default-to-white guess (external stylesheets commonly set body background; static
//     analysis of one file cannot know that).
//   - No external CSS (`<link>`) is ever consulted. No alpha compositing across layers.
// ponytail: uniform 4.5:1 threshold only (matches the plan's own evidence-line wording) — no
// static large-text (18pt/14pt-bold) carve-out; that needs the same certain-literal treatment
// for font-size/weight and isn't asked for here.
const STATIC_CONTRAST_MIN = 4.5;
// WCAG 1.4.11 Non-text Contrast — applies to a PUA-glyph icon node instead of 1.4.3's
// 4.5:1 (see the PUA-detection branch below).
const NON_TEXT_CONTRAST_MIN = 3;
const TAG_ATTRS_RE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

function attrValue(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3];
}

// Extends tier2-audit.mjs's parseColor (rgb()/rgba() only, its source is getComputedStyle
// output) with hex, since authored CSS commonly uses hex. Named colors / var() / currentColor
// are NOT accepted — not certain enough to resolve without a real cascade.
function parseStaticColor(value) {
  const v = String(value || '').trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  return parseColor(v);
}

// One inline `style="..."` string -> a resolved color per logical property, or null if the
// value can't be trusted (unparseable, or BOTH `background` and `background-color` present —
// ponytail: not modelling shorthand-vs-longhand precedence inside one block, rare enough that
// declining to resolve costs nothing real). `undefined` = the property was never declared.
function resolveInlineColor(style, prop) {
  if (!style) return undefined;
  if (prop === 'bg') {
    const hasShort = /(?:^|;)\s*background\s*:/i.test(style);
    const hasLong = /(?:^|;)\s*background-color\s*:/i.test(style);
    if (hasShort && hasLong) return null; // ambiguous precedence, decline
    const key = hasShort ? 'background' : (hasLong ? 'background-color' : null);
    if (!key) return undefined;
    const matches = [...style.matchAll(new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+?)\\s*(?:;|$)`, 'gi'))];
    if (!matches.length) return undefined;
    return parseStaticColor(matches[matches.length - 1][1]); // last-in-block wins (well-defined, not cascade-guessing)
  }
  const matches = [...style.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+?)\s*(?:;|$)/gi)];
  if (!matches.length) return undefined;
  return parseStaticColor(matches[matches.length - 1][1]);
}

// Flat `prelude { body }` rules of a CSS string, in source order: the same pairs as
// css.matchAll(/([^{}]+)\{([^{}]*)\}/g), in linear time. That regex retried every brace-free
// run from each offset when the run ended at `}` rather than `{`, which made multi-MB inline
// stylesheets quadratic (survey snapshot 100348: 130 s, over the 120 s audit timeout, 2026-10-04).
// Splitting on braces gives the same answer: a rule is a non-empty segment closed by `{`
// whose following segment is closed by `}`; scanning resumes after that `}`.
function cssRuleBlocks(css) {
  const parts = css.split(/([{}])/); // segment, brace, segment, brace, ..., segment
  const rules = [];
  for (let i = 0; i + 3 < parts.length; ) {
    if (parts[i] !== '' && parts[i + 1] === '{' && parts[i + 3] === '}') {
      rules.push([parts[i], parts[i + 2]]);
      i += 4;
    } else {
      i += 2;
    }
  }
  return rules;
}

// Same-FILE <style> blocks only (never a linked stylesheet) -> Map<'.class'|'#id', color|null>
// per logical property ('color' | 'bg'). A selector redeclared anywhere in the file (even with
// the same value — ponytail: not worth an equality check for this rare case) becomes null.
function extractSameFileStyleRules(text) {
  const colorRules = new Map(), bgRules = new Map();
  const record = (map, selector, value) => {
    if (map.has(selector)) map.set(selector, null); // redeclared -> ambiguous
    else map.set(selector, value === undefined ? null : value);
  };
  for (const styleMatch of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = stripAtMedia(styleMatch[1]);
    // Capture the FULL prelude before `{` (hakuso HIGH, 2026-07-25): matching only a
    // trailing `[.#][\w-]+` token let `.c2a.c2b`, `.parent .child`, and `div.c4` get
    // mis-recorded under their bare tail token, resolving on ANY element carrying just
    // that one class/id — a false certainty for the exact reason this feature exists.
    // Split the prelude on `,` and keep only entries that are a WHOLE bare class or id
    // (`^[.#][\w-]+$`); a compound/descendant/element-qualified/pseudo/attribute selector
    // is simply never recorded — the same "unresolved by omission" treatment as an
    // external class, not a special block (nothing false gets INTO the map either way).
    for (const [prelude, body] of cssRuleBlocks(css)) {
      const selectors = prelude.split(',').map((s) => s.trim()).filter((s) => /^[.#][\w-]+$/.test(s));
      for (const selector of selectors) {
        // resolveInlineColor already returns null when both `background` and
        // `background-color` are present in the same block (ambiguous precedence).
        if (/(?:^|;)\s*background(?:-color)?\s*:/i.test(body)) record(bgRules, selector, resolveInlineColor(body, 'bg'));
        if (/(?:^|;)\s*color\s*:/i.test(body)) record(colorRules, selector, resolveInlineColor(body, 'color'));
      }
    }
  }
  return { colorRules, bgRules };
}

// Motion-bearing CSS properties only — never color/background/border-color/box-shadow/
// opacity alone (2026-08 hunt round 2, id 100635: 16x transition:color and 2x
// transition:opacity on that page were the whole "motion" signal, none of it visible
// motion). "transform" covers translate/rotate/scale/skew as a property, not just the
// two named in the verdict — a CSS transform IS movement by definition.
// 'all' counts as motion-bearing too (hakuso round 1, 2026-08): inspect.md's manual
// checklist already flags `transition: all` as a motion/reduced-motion concern, so the
// automated detector must be consistent with that, not stricter.
const MOTION_PROP_NAMES = new Set(['transform', 'top', 'left', 'right', 'bottom', 'margin', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom', 'all']);
// For a real property DECLARATION (`transform: translateX(0)` inside a @keyframes step) —
// property name followed by its own colon. NOT for `transition: transform 0.2s`, where
// "transform" is a bare VALUE token naming the transitioned property, not itself declared.
const MOTION_DECL_RE = /\b(transform|top|left|right|bottom|margin(?:-top|-left|-right|-bottom)?)\s*:/i;
// For a `transition`/`transition-property` VALUE list (comma-separated property names).
function transitionValueIsMotion(value) {
  return String(value).split(',').some((entry) => MOTION_PROP_NAMES.has(entry.trim().split(/\s+/)[0]?.toLowerCase()));
}

// Cheap reachability check (2026-08 hunt round 2, id 100571's own spec): tokenize the
// selector's RIGHTMOST compound only (tag + class + attribute names) and require each
// token to appear somewhere in the body markup. ponytail: rightmost-compound-only is a
// known ceiling — it does not verify the full ancestor chain (`details summary x` only
// checks `x`, not that a real `<details>` ancestor exists) — upgrade to a real selector
// engine if that gap starts producing wrong verdicts on real pages.
function motionSelectorReachable(selector, bodyText) {
  const normalized = String(selector).trim().replace(/\s*[>+~]\s*/g, ' ');
  const rightmost = normalized.split(/\s+/).filter(Boolean).pop() || '';
  const clean = rightmost.replace(/:[\w-]+(?:\([^)]*\))?/g, ''); // strip :hover, :nth-child(), etc.
  const tag = clean.match(/^[a-zA-Z][\w-]*/)?.[0];
  const classes = [...clean.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const attrs = [...clean.matchAll(/\[([\w-]+)/g)].map((m) => m[1]);
  if (tag && tag !== '*' && !new RegExp(`<${tag}\\b`, 'i').test(bodyText)) return false;
  for (const c of classes) if (!new RegExp(`\\bclass\\s*=\\s*["'][^"']*\\b${c}\\b`, 'i').test(bodyText)) return false;
  for (const a of attrs) if (!new RegExp(`[\\s<]${a}\\s*[=\\]]`, 'i').test(bodyText)) return false;
  return true;
}

// Replaces the old property-blind, reachability-blind /(animation|transition)\s*:/ scan
// (2026-08 hunt round 2, ids 100571 + 100635, both four-defect verdicts). Returns:
//   fires: motion-bearing evidence found on a markup-reachable selector, AND no
//          prefers-reduced-motion handling anywhere in the file
//   evidence: motion-bearing evidence found (fires OR handled) -- vs. no motion at all
//   hoverGatedOnly: every counted rule is :hover/:active-scoped (weaker evidence, note
//                   in the description rather than suppress -- it's review now)
//   captureGap: an external <link rel=stylesheet> exists that this static scan never
//               fetched, so an absent reduced-motion rule here is not a confirmed absence
function detectMotionEvidence(text) {
  const hasReducedMotionHandling = /prefers-reduced-motion/i.test(text);
  const captureGap = /<link\b[^>]*\srel\s*=\s*["']stylesheet["']/i.test(text);
  let evidence = false, hoverGatedOnly = true;

  // @keyframes bodies are real property DECLARATIONS ("transform: translateX(0)") --
  // built once, file-wide, so both inline `style=""` animation references and same-file
  // <style> block rules can resolve an `animation: name` against it.
  const motionKeyframes = new Set();
  for (const styleMatch of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const kf of styleMatch[1].matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/gi)) {
      if (MOTION_DECL_RE.test(kf[2])) motionKeyframes.add(kf[1]);
    }
  }
  // A `transition`/`animation` block is motion-bearing when either its `transition`
  // VALUE names a motion property ("transition: transform .2s" -- transform is a bare
  // value token here, never followed by its own colon) or its `animation` references a
  // motion-bearing keyframe.
  function isMotionBearing(body) {
    const transVal = body.match(/(?:^|;)\s*transition(?:-property)?\s*:\s*([^;]+)/i)?.[1];
    if (transVal && transitionValueIsMotion(transVal)) return true;
    const animVal = body.match(/(?:^|;)\s*animation(?:-name)?\s*:\s*([^;]+)/i)?.[1];
    if (!animVal) return false;
    // The `animation` shorthand is order-independent (duration/easing/delay/iteration/
    // direction/fill-mode/play-state/name can appear in any order: "1s spin" and
    // "1s ease-in spin" both name "spin"), and comma-separates multiple animations
    // (hakuso round 1, 2026-08: only the FIRST token was checked, missing both shapes).
    const tokens = animVal.split(',').flatMap((entry) => entry.trim().split(/\s+/));
    return tokens.some((t) => motionKeyframes.has(t));
  }

  // Inline style="" transitions/animations: the element IS the selector, always reachable.
  for (const m of text.matchAll(/\sstyle\s*=\s*["']([^"']*)["']/gi)) {
    if (isMotionBearing(m[1])) { evidence = true; hoverGatedOnly = false; } // inline is never :hover-scoped
  }

  // Same-file <style> block rules.
  for (const styleMatch of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const [prelude, body] of cssRuleBlocks(styleMatch[1])) {
      if (/@keyframes/i.test(prelude)) continue; // handled above
      if (!isMotionBearing(body)) continue;

      const selectors = prelude.split(',').map((s) => s.trim()).filter(Boolean);
      if (!selectors.some((s) => motionSelectorReachable(s, text))) continue;

      evidence = true;
      if (!/:hover|:active/i.test(prelude)) hoverGatedOnly = false;
    }
  }

  return { fires: evidence && !hasReducedMotionHandling, evidence, hoverGatedOnly: evidence && hoverGatedOnly, captureGap };
}

// id specificity always beats class (fixed by spec, not source-order-dependent -> safe to
// apply). Multiple classes matching the SAME property is a genuine tie (order-dependent) ->
// unresolved. Returns undefined (never declared) | null (declared, uncertain) | {r,g,b,a}.
function resolveClassIdColor(id, classNames, rulesMap) {
  if (id && rulesMap.has('#' + id)) return rulesMap.get('#' + id);
  let found;
  for (const cls of classNames) {
    if (!rulesMap.has('.' + cls)) continue;
    const v = rulesMap.get('.' + cls);
    if (found === undefined) found = v;
    else if (found === null || v === null || found.r !== v?.r || found.g !== v?.g || found.b !== v?.b || found.a !== v?.a) found = null;
  }
  return found;
}

function resolveElementProp(id, classNames, inlineStyle, prop, rulesMap) {
  const inline = resolveInlineColor(inlineStyle, prop);
  if (inline !== undefined) return inline;
  return resolveClassIdColor(id, classNames, rulesMap);
}

function certainOpaque(v) {
  return v && v.a === 1 ? v : (v === undefined ? undefined : null); // alpha != 1 (incl. null-sentinel) -> uncertain
}

// Walks the raw tag stream with an explicit ancestor stack (mirrors computeHiddenRanges'
// approach — no full DOM available). For each visible element with direct text, resolves a
// certain fg (self only) and bg (self, else nearest ancestor with a certain bg; stops
// unresolved at the first ancestor whose bg is declared-but-uncertain, or at the document
// root if no bg was ever declared). Findings go through the single addFinding() funnel like
// every other detector; check:'review' keeps this category out of scoring (P1 comment above).
function computeStaticContrastFindings(text, rel, hiddenRanges, maskedRanges, styleRules, stats, findings) {
  const inMasked = (i) => maskedRanges.some(([s, e]) => i >= s && i < e);
  const inHidden = (i) => hiddenRanges.some(([s, e]) => i >= s && i < e);
  let resolved = 0, subThreshold = 0;
  const stack = []; // { tag, bg: undefined|null|{r,g,b,a} }
  let m;
  TAG_ATTRS_RE.lastIndex = 0;
  while ((m = TAG_ATTRS_RE.exec(text))) {
    if (inMasked(m.index) || inHidden(m.index)) continue;
    const [full, close, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === 'script' || tag === 'style') continue;
    if (close) {
      for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { stack.splice(i); break; }
      continue;
    }
    const isVoid = VOID_TAGS.has(tag) || attrs.endsWith('/');
    const id = attrValue(attrs, 'id');
    const classAttr = attrValue(attrs, 'class');
    const classNames = classAttr ? classAttr.trim().split(/\s+/).filter(Boolean) : [];
    const style = attrValue(attrs, 'style');
    // WS-B broad FP pass (2026-07-26, 100291.html:2790): an <img> sibling records itself on
    // ITS PARENT frame so a later position:absolute sibling knows a real photographic
    // backdrop sits behind it -- see blocksClimb below.
    if (tag === 'img' && stack.length) stack[stack.length - 1].sawImgChild = true;
    let ownBg = certainOpaque(resolveElementProp(id, classNames, style, 'bg', styleRules.bgRules));
    // hakuso-style self-audit finding (calibration, 2026-07-25): a class that never appears in
    // this file's <style> blocks is NOT proof nothing sets this element's own background —
    // external/framework CSS commonly does (caught live: a Tailwind `bg-white` utility class on
    // an icon span was silently walked past, picking up an unrelated ANCESTOR's inline
    // background instead, i.e. a false-certainty 1:1 ratio). Any class we cannot resolve blocks
    // this level rather than passing the walk through it.
    if (ownBg === undefined && classNames.length > 0) ownBg = null;
    // WS-B broad FP pass (2026-07-26): a `position:absolute`/`fixed` element removes itself
    // from normal flow -- when its own parent already has a photographic <img> sibling (the
    // common "photo behind, absolutely-positioned caption on top" carousel/hero shape), the
    // ancestor chain ABOVE this point is not the real visual backdrop. Confirmed false
    // positive: 100291.html:2790, a caption `<a>` inside such an overlay resolved against a
    // distant, unrelated ancestor's white page background (1.00:1 white-on-white) because no
    // intervening <div> declared any background at all, so the walk climbed straight past the
    // photo. Same honesty rule as the background-image case: block the climb, don't guess.
    const posAbs = /(?:^|;)\s*position\s*:\s*(absolute|fixed)\b/i.test(style || '');
    const blocksClimb = posAbs && stack.length > 0 && stack[stack.length - 1].sawImgChild === true;
    if (!isVoid) stack.push({ tag, bg: ownBg, blocksClimb });

    // Direct text immediately following this open tag, up to the next '<'.
    const textStart = m.index + full.length;
    const nextLt = text.indexOf('<', textStart);
    const directText = text.slice(textStart, nextLt === -1 ? text.length : nextLt);
    const trimmedDirectText = directText.trim();
    if (isVoid || !trimmedDirectText) continue;
    // A node whose entire trimmed content is Private-Use-Area codepoints is an icon
    // glyph (e.g. Material Symbols), not human-language text — WCAG defines "text" as
    // characters expressing something in a language, and PUA codepoints have no
    // assigned meaning. Governed by 1.4.11 Non-text Contrast (3:1), not 1.4.3 (4.5:1)
    // (2026-08 hunt round 2, id 102783). Font-family icon-list matching (rule (b) in
    // the verdict) is left out — optional, and no font-family resolver exists yet.
    const isPuaGlyph = /^[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]+$/u.test(trimmedDirectText);

    const fg = certainOpaque(resolveElementProp(id, classNames, style, 'color', styleRules.colorRules));
    if (!fg) continue; // no certain fg on this element -> not a candidate pair

    let bg = ownBg;
    // hakuso MEDIUM-A (2026-07-27 final pass): the climb below starts one level ABOVE the
    // current element, so when the text sits DIRECTLY on the blocksClimb element itself
    // (not a descendant of it), its own flag was never consulted.
    if (bg === undefined && stack[stack.length - 1]?.blocksClimb) bg = null;
    if (bg === undefined) {
      for (let i = stack.length - 2; i >= 0; i--) { // stack top is this element itself
        bg = certainOpaque(stack[i].bg);
        if (bg !== undefined) break;
        // This ancestor declares nothing itself, but climbing PAST it is unsafe (see
        // blocksClimb comment above) -- stop here as unresolved rather than reaching a
        // further, visually-unrelated ancestor's background.
        if (stack[i].blocksClimb) { bg = null; break; }
      }
    }
    if (!bg) continue; // uncertain-ancestor block, or reached the root with nothing declared

    resolved += 1;
    const ratio = contrastRatio(fg, bg);
    const minRatio = isPuaGlyph ? NON_TEXT_CONTRAST_MIN : STATIC_CONTRAST_MIN;
    if (ratio >= minRatio) continue;
    subThreshold += 1;
    addFinding(findings, stats, isPuaGlyph ? {
      key: 'non-text-contrast-sub-threshold',
      category: 'contrast',
      severity: 'warning',
      check: 'review',
      wcag: 'WCAG 2.2: 1.4.11 Non-text Contrast',
      title: `Statically-resolvable icon contrast ${ratio.toFixed(2)}:1 is below 3:1`,
      affected_users: 'Low-vision users and users in high ambient light',
      location: `${rel}:${lineOf(text, m.index)}`,
      description: `Literal foreground rgb(${fg.r}, ${fg.g}, ${fg.b}) against literal background rgb(${bg.r}, ${bg.g}, ${bg.b}) yields ${ratio.toFixed(2)}:1, below the 3:1 minimum for a non-text (icon-font) glyph. Statically certain (inline/same-file styles only) — confirm in a real browser or with the tier-2 harness before treating as final.`,
      fix: 'Increase the icon/background contrast, or verify in a real browser — this pair was resolved from static markup only.',
      computed: { fg, bg, ratio: Number(ratio.toFixed(3)) },
    } : {
      key: 'static-contrast-sub-threshold',
      category: 'contrast',
      severity: 'warning',
      check: 'review',
      wcag: 'WCAG 2.2: 1.4.3 Contrast (Minimum)',
      title: `Statically-resolvable contrast ${ratio.toFixed(2)}:1 is below 4.5:1`,
      affected_users: 'Low-vision users and users in high ambient light',
      location: `${rel}:${lineOf(text, m.index)}`,
      description: `Literal foreground rgb(${fg.r}, ${fg.g}, ${fg.b}) against literal background rgb(${bg.r}, ${bg.g}, ${bg.b}) yields ${ratio.toFixed(2)}:1, below the 4.5:1 minimum. Statically certain (inline/same-file styles only) — confirm in a real browser or with the tier-2 harness before treating as final.`,
      fix: 'Increase the foreground/background contrast, or verify in a real browser — this pair was resolved from static markup only.',
      computed: { fg, bg, ratio: Number(ratio.toFixed(3)) },
    });
  }
  return { resolved, subThreshold };
}

function makeStats() {
  const stats = {};
  for (const id of CATEGORY_ORDER) stats[id] = { id, name: CATEGORY_NAMES[id], pass: 0, fail: 0, review: 0, score: 0, sev: { critical: 0, warning: 0, tip: 0 } };
  return stats;
}

function addCheck(stats, category, status) {
  if (status === 'pass') stats[category].pass += 1;
  else if (status === 'fail') stats[category].fail += 1;
  else stats[category].review += 1;
}

// 2.4.2 Page Titled: mirrors `document.title` — the first HTML <title>
// element ANYWHERE in the document (a browser's HTML parser accepts <title>
// outside <head> too, and hidden/body placement doesn't stop it from setting
// document.title; axe's doc-has-title agrees). An <svg><title> is a
// different, SVG-namespaced element, not this one, so it's stripped first.
// Returns the trimmed text content, or '' if no such <title> exists / it has
// no non-whitespace content (a "hasTitle" caller just checks truthiness).
function extractDocumentTitle(text) {
  const noSvg = text.replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ');
  const m = noSvg.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]*>/g, '').trim() : '';
}

function addFinding(findings, stats, f) {
  // `check` controls which stats bucket this finding lands in (default 'fail').
  // REVIEW-level findings pass check:'review' so they don't count as hard fails.
  // Keep it in the emitted finding so downstream remediation can distinguish
  // confirmed failures from review-only evidence.
  const { check = 'fail', ...rest } = f;
  // Single funnel for the severity matrix: native and merged findings normalise here.
  // The matrix asserts the severity of a CONFIRMED violation, so it only applies to
  // check:'fail'. An unverifiable (review) finding keeps its own softer severity — an
  // unconfirmed item must not be inflated to critical just because its criterion is.
  const severity = check === 'fail' ? mandatedSeverity(rest.wcag, rest.severity) : (rest.severity || 'warning');
  // `action` — what a human or agent is authorized to do with this finding, derived
  // here so every emitter (native detectors + --merge-findings) gets it for free
  // (user ruling 2026-08-29, judgment-precision spec item A2):
  //   'direct-fix'      check:'fail'   — a confirmed violation with a known remedy.
  //   'design-judgment' check:'review' AND key ends '-advisory' — a non-normative
  //                     best-practice suggestion (e.g. touch-target comfort sizing);
  //                     not a violation, a designer's call, nothing to verify.
  //   'human-verify'    check:'review', everything else — a heuristic or otherwise
  //                     unconfirmed signal that needs a human (or a live browser) to
  //                     confirm before it is treated as a real defect.
  const action = check === 'fail'
    ? 'direct-fix'
    : (String(rest.key || '').endsWith('-advisory') ? 'design-judgment' : 'human-verify');
  const effectiveLevel = rest.level || 'AA';
  // Jurisdiction-expansion spec (2026-08-29, item 3): the old default was one identical
  // "May affect ADA / EAA / JIS / Taiwan..." string on every finding regardless of its
  // actual WCAG level — an AAA best-practice item read exactly like a confirmed AA
  // violation. Derive from the finding's real level instead (jurisdictions.mjs is the
  // single source for which tracked jurisdictions' technical standards reach that level).
  findings.push({
    level: effectiveLevel,
    legal_exposure: rest.legal_exposure || legalExposureFor(effectiveLevel).en,
    ...rest,
    check,
    severity,
    action,
  });
  if (rest.score_effect === 'corroborating') return;
  addCheck(stats, rest.category, check);
  // Only confirmed violations (check:'fail') drive the severity penalty; unverifiable
  // (review) findings never reduce the score (inspect.md Step 4 three-state rule).
  if (check === 'fail') {
    const keyCounts = (stats[rest.category]._keyCounts ||= {});
    const seen = keyCounts[rest.key || 'external-finding'] = (keyCounts[rest.key || 'external-finding'] || 0) + 1;
    if (seen <= SEV_REPEAT_CAP) stats[rest.category].sev[severity] += 1;
    // A CONFIRMED critical on a life-safety criterion arms the overall-score gate.
    if (severity === 'critical') {
      for (const m of String(rest.wcag || '').matchAll(/\b([1-4]\.\d\.\d{1,2})\b/g)) {
        if (LIFE_SAFETY_CRITERIA.has(m[1])) stats._lifeSafety = true;
      }
    }
  }
}

function isMarkup(ext) {
  return ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
}

function isStyle(ext) {
  return ['css', 'scss', 'less'].includes(ext);
}

// PDFs are a separate accessibility surface and are binary — read as a Buffer
// and route to the PDF probe (assessPdf) instead of the utf8 text detectors.
function scanPdfFile(file, root, stats, findings) {
  const rel = (relative(root, file) || file).replace(/\\/g, '/');
  const result = assessPdf(readFileSync(file)); // no 'utf8' -> Buffer
  if (result.status === 'INSUFFICIENT') return;
  for (const f of result.findings) {
    if (f.band !== 'FLAG' && f.band !== 'REVIEW') continue;
    addFinding(findings, stats, {
      key: f.key,
      category: 'screenreader',
      severity: f.band === 'FLAG' ? 'warning' : 'tip',
      check: f.band === 'REVIEW' ? 'review' : 'fail',
      wcag: f.wcag,
      level: f.level || 'A',
      title: f.title,
      affected_users: f.affected_users,
      location: rel,
      description: f.description,
      fix: f.fix,
    });
  }
}

// Single left-to-right scan for masked <script>/<style>/<noscript> bodies and HTML comments
// (hakuso CRITICAL, 2026-08, reproduced live on fixtures p9/p11): three INDEPENDENT regex
// passes (script/style, then a raw noscript regex, then comments) let a `<noscript>`-shaped
// string inside a <script> or an HTML comment pair with the NEXT REAL `</noscript>` and mask
// everything between — silently swallowing every finding in between (the exact @7 bug class
// the noscript-image-twin fix reintroduced). <noscript> is a raw-text element per the HTML
// spec, exactly like <script>/<style>: its content is never re-parsed for nested tags, just
// scanned for the literal (case-insensitive) close tag. An "open" token is only ever
// recognized while the cursor is genuinely unmasked — never re-examining text already inside
// a prior masked range — which is what stops a fake open/close substring living INSIDE one
// of these from pairing across into another, and preserves the @7 comment-in-script fix by
// construction (an earlier real <script>/<noscript> open always wins the leftmost-match race
// over a `<!--` embedded inside its own body, so that body's phantom tokens are consumed
// wholesale as part of ITS mask and never independently examined).
// ponytail: a `<!--` inside an HTML ATTRIBUTE VALUE still leaks the same way as before —
// needs a real attribute-aware lexer to fix; deferred, not hit by any known benchmark site.
const OPEN_TOKEN = /<(script|style|noscript)\b[^>]*>|<!--/gi;

function scanMaskedRanges(text) {
  const ranges = [];
  let cursor = 0;
  for (;;) {
    OPEN_TOKEN.lastIndex = cursor;
    const m = OPEN_TOKEN.exec(text);
    if (!m) break;
    const kind = m[0] === '<!--' ? 'comment' : m[1].toLowerCase();
    const bodyStart = m.index + m[0].length;
    let end;
    if (kind === 'comment') {
      const close = text.indexOf('-->', bodyStart);
      end = close === -1 ? text.length : close + 3;
    } else {
      const closeRe = new RegExp(`<\\/${kind}\\s*>`, 'gi');
      closeRe.lastIndex = bodyStart;
      const close = closeRe.exec(text);
      end = close ? close.index + close[0].length : text.length;
    }
    ranges.push([m.index, end]);
    cursor = end;
  }
  return ranges;
}

function scanFile(file, root, stats, findings) {
  if (PDF_PATTERN.test(file)) return scanPdfFile(file, root, stats, findings);
  const text = readFileSync(file, 'utf8');
  // Forward slashes on every OS: location fields must not differ between Windows and
  // POSIX runs of the same input (cross-machine artifact stability).
  const rel = (relative(root, file) || file).replace(/\\/g, '/');
  const ext = file.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
  const markup = isMarkup(ext);
  const style = isStyle(ext);
  const jsLike = ['js', 'cjs', 'mjs', 'ts', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);

  if (markup) {
    // Char ranges of <script>/<style>/<noscript> bodies and HTML comments (see
    // scanMaskedRanges above). The structural detectors below skip matches inside them so
    // HTML-looking strings in JS/CSS, markup left in a comment, or a <noscript> fallback twin
    // (outside the a11y tree in a JS-enabled render) are not flagged as real elements. Also
    // fed into computeHiddenRanges/computeLabelRanges below (hakuso HIGH, 2026-07-07): those
    // two do their OWN tag-token scan of the raw text, so without this a phantom token inside
    // a masked region could open a range that never closes and silently swallows every later
    // finding to EOF.
    const masked = scanMaskedRanges(text);
    const inMasked = (i) => masked.some(([s, e]) => i >= s && i < e);
    // Subtrees hidden from the accessibility tree: no findings, no passes (see
    // computeHiddenRanges).
    const hiddenRanges = computeHiddenRanges(text, masked);
    const inHidden = (i) => hiddenRanges.some(([s, e]) => i >= s && i < e);
    const visible = (i) => !inMasked(i) && !inHidden(i);

    // Real `lang` attribute only — NOT `xml:lang=`/`data-lang=`, which end in the
    // same substring but are not a language declaration on <html> (a bare \b
    // still matches right after the ':' in xml:lang, so word-boundary alone
    // isn't enough). Require the whitespace that separates every real HTML
    // attribute from the previous one. Quoted or unquoted value.
    const langMatch = /\.html?$/.test(file) && text.match(/<html\b[^>]*\slang\s*=\s*["']?([^\s"'>]+)/i);

    addCheck(stats, 'screenreader', langMatch || !/\.html?$/.test(file) ? 'pass' : 'fail');
    if (/\.html?$/.test(file) && !langMatch) {
      addFinding(findings, stats, {
        key: 'html-lang-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 3.1.1 Language of Page',
        title: 'Page language is missing',
        affected_users: 'Screen-reader users and translation users',
        location: `${rel}:1`,
        description: 'The HTML page does not declare a lang attribute, so assistive technology may choose the wrong pronunciation rules.',
        fix: 'Add a language attribute such as <html lang="zh-Hant"> or the correct document language.',
        code_before: '<html>',
        code_after: '<html lang="zh-Hant">',
      });
    } else if (langMatch && !isWellFormedLangTag(langMatch[1])) {
      // Malformed tag (e.g. "english" — 7 letters, not a 2-3 letter primary
      // subtag): a real 3.1.1 failure regardless of content, and not something
      // content-language assessment below can meaningfully judge, so it gets
      // its own finding instead of falling through to assessLang.
      addFinding(findings, stats, {
        key: 'html-lang-invalid',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 3.1.1 Language of Page',
        title: 'Declared page language is not a valid language tag',
        affected_users: 'Screen-reader users and translation users',
        location: `${rel}:1`,
        description: `<html lang="${langMatch[1]}"> is not a well-formed BCP-47 language tag, so assistive technology and translation tools cannot reliably interpret it.`,
        fix: 'Use a valid BCP-47 language tag, such as <html lang="en"> or <html lang="zh-Hant">.',
        code_before: `<html lang="${langMatch[1]}">`,
        code_after: '<html lang="en">',
      });
    }

    // Declared lang present AND well-formed: does it match the actual content
    // language? (3.1.1) The wrong-lang case axe/Lighthouse structurally miss —
    // a declared lang is always syntactically valid. On JS-heavy pages the
    // static text is too thin to judge, so assessLang returns INSUFFICIENT and
    // we emit nothing (the Tier-2 rendered-DOM path covers those). See
    // core/scripts/lang-detect.mjs. A malformed tag (handled above) skips this
    // entirely — content-matching a tag that isn't a real language is moot,
    // and assessLang's own COUNTRY_AS_LANG path still covers shape-valid-but-
    // wrong codes like "jp"/"kr"/"cn"/"tw" via html-lang-mismatch below.
    if (langMatch && isWellFormedLangTag(langMatch[1])) {
      const verdict = assessLang(langMatch[1], extractText(text));
      const suggest = verdict.detectedLang || { han: 'zh-Hant', jpn: 'ja', hangul: 'ko', latin: 'en' }[verdict.detectedFamily] || 'the correct language';
      if (verdict.status === 'FLAG') {
        addFinding(findings, stats, {
          key: 'html-lang-mismatch',
          category: 'screenreader',
          severity: 'warning',
          wcag: 'WCAG 2.2: 3.1.1 Language of Page',
          title: 'Declared page language does not match the content',
          affected_users: 'Screen-reader users (wrong pronunciation rules) and machine-translation users',
          location: `${rel}:1`,
          description: `Content-language mismatch: ${verdict.note}. A wrong language declaration is worse than a missing one. Assistive technology applies confidently wrong pronunciation and translation rules.`,
          fix: `Set <html lang> to the actual content language (detected: ${verdict.detectedFamily}).`,
          code_before: `<html lang="${verdict.declared}">`,
          code_after: `<html lang="${suggest}">`,
        });
      } else if (verdict.status === 'REVIEW') {
        addFinding(findings, stats, {
          key: 'html-lang-mismatch-review',
          category: 'screenreader',
          severity: 'tip',
          check: 'review',
          wcag: 'WCAG 2.2: 3.1.1 Language of Page',
          title: 'Page language may not match the content',
          affected_users: 'Screen-reader users and machine-translation users',
          location: `${rel}:1`,
          description: `Possible content-language mismatch: ${verdict.note}. This can be legitimate untagged bilingual content, so verify the primary language before changing it.`,
          fix: 'Confirm <html lang> matches the primary content language, and mark other-language passages with their own lang attribute (3.1.2 Language of Parts).',
        });
      }

      // 3.1.2 Language of Parts: GATED OFF (not emitted). The char-counting
      // detectLangParts scored 0 true positives / 2 false positives on a 36-page
      // real-world calibration (2026-06-15): on real CJK pages the foreign script is
      // almost always proper names / brands, which 3.1.2 explicitly exempts, and
      // char-counting cannot model passage-vs-proper-name. Re-enable only after a
      // redesign (passage segmentation + per-segment language ID). The detectLangParts
      // function is retained for that redesign but is no longer wired into scoring.
    }

    // Document title (2.4.2): the first non-empty HTML <title> anywhere in
    // the document — matches document.title semantics (location, including
    // inside <body> or a hidden element, doesn't stop a browser from setting
    // it). An inline <svg><title> is a different element type, excluded.
    // Whitespace-only content (`<title>   </title>`) is treated as absent.
    const docTitle = /\.html?$/.test(file) ? extractDocumentTitle(text) : null;
    if (/\.html?$/.test(file) && !docTitle) {
      addFinding(findings, stats, {
        key: 'document-title-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 2.4.2 Page Titled',
        title: 'Document title is missing',
        affected_users: 'Screen-reader users, keyboard users, and users with many tabs open',
        location: rel,
        description: 'A missing or empty title makes the page difficult to identify in browser and assistive technology contexts.',
        fix: 'Add a concise, unique <title>.',
      });
    } else addCheck(stats, 'screenreader', 'pass');

    if (!/<main\b|role=["']main["']/.test(text)) {
      addFinding(findings, stats, {
        key: 'main-landmark-missing',
        category: 'screenreader',
        severity: 'tip',
        wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
        title: 'Main landmark is not statically visible',
        affected_users: 'Screen-reader and keyboard users navigating by landmarks',
        location: rel,
        description: 'No <main> or role="main" was found in this static file.',
        fix: 'Wrap primary page content in <main id="main-content">.',
      });
    } else addCheck(stats, 'screenreader', 'pass');

    // Build the AT-facing outline in document order. ARIA headings participate;
    // presentational native headings do not. Hidden/masked headings stay excluded.
    const headings = [];
    for (const m of text.matchAll(/<([a-z][\w:-]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
      if (!visible(m.index || 0)) continue;
      const tag = m[1].toLowerCase();
      const attrs = m[2];
      const roleMatch = attrs.match(/\brole\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const roles = (roleMatch?.[1] ?? roleMatch?.[2] ?? roleMatch?.[3] ?? '').toLowerCase().split(/\s+/);
      if (roles.includes('presentation') || roles.includes('none')) continue;
      const native = tag.match(/^h([1-6])$/);
      const ariaMatch = attrs.match(/\baria-level\s*=\s*(?:"([1-6])"|'([1-6])'|([1-6]))/i);
      const level = native ? Number(native[1]) : roles.includes('heading') ? Number(ariaMatch?.[1] ?? ariaMatch?.[2] ?? ariaMatch?.[3]) : 0;
      if (level) headings.push({ level, index: m.index || 0 });
    }
    if (headings.length === 0) {
      addFinding(findings, stats, {
        key: 'headings-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 2.4.6 Headings and Labels',
        title: 'No headings found',
        affected_users: 'Screen-reader users and users scanning the page',
        location: rel,
        description: 'The static markup has no heading structure.',
        fix: 'Add a meaningful h1 and nested headings that describe the page structure.',
      });
    } else {
      addCheck(stats, 'screenreader', 'pass');
      for (let i = 1; i < headings.length; i++) {
        if (headings[i].level > headings[i - 1].level + 1) {
          addFinding(findings, stats, {
            key: 'heading-level-skipped',
            category: 'screenreader',
            severity: 'tip',
            wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
            title: 'Heading level is skipped',
            affected_users: 'Screen-reader users navigating by heading',
            location: `${rel}:${lineOf(text, headings[i].index)}`,
            description: `Heading jumps from level ${headings[i - 1].level} to level ${headings[i].level}.`,
            fix: 'Use a continuous heading hierarchy or adjust the visual style without changing semantic level.',
          });
          break;
        }
      }
    }

    // Images removed from the accessibility tree need no alt: aria-hidden,
    // role=presentation/none, and inline display:none (tracking pixels, preloads) are
    // exempt — benchmark 2026-07-05 found 20+ false criticals from these classes.
    for (const m of text.matchAll(/<img\b(?![^>]*\balt=)(?![^>]*aria-hidden=["']true["'])(?![^>]*role=["'](?:presentation|none)["'])(?![^>]*style=["'][^"']*display\s*:\s*none)[^>]*>/gi)) {
      if (!visible(m.index || 0)) continue;
      addFinding(findings, stats, {
        key: 'image-alt-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.1.1 Non-text Content',
        title: 'Image is missing alt text',
        affected_users: 'Blind and low-vision users using screen readers',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'An image without alt text is silent or announced poorly by assistive technology.',
        fix: 'Add meaningful alt text, or alt="" for purely decorative images.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }
    // Images that DO carry alt are verified passes — they give the category its base.
    // Whitespace-anchored so data-alt= is not counted; alt="" stays a pass (correct
    // decorative markup is evidence).
    for (const m of text.matchAll(/<img\b[^>]*\salt\s*=/gi)) if (visible(m.index || 0)) addCheck(stats, 'screenreader', 'pass');

    // Frames need an accessible name (axe frame-title): statically detectable, and the
    // 2026-07-05 benchmark showed Lighthouse catching real instances Beacon had no rule
    // for. aria-hidden frames are out of the a11y tree and exempt.
    for (const m of text.matchAll(/<iframe\b(?![^>]*\btitle\s*=)(?![^>]*aria-hidden=["']true["'])[^>]*>/gi)) {
      if (!visible(m.index || 0)) continue;
      addFinding(findings, stats, {
        key: 'frame-title-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        level: 'A',
        title: 'Frame is missing a title',
        affected_users: 'Screen-reader users navigating between frames',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'An <iframe> without a title gives screen-reader users no way to know what the frame contains before entering it.',
        fix: 'Add title="..." describing the frame content.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }
    for (const m of text.matchAll(/<iframe\b[^>]*\btitle\s*=["'][^"']/gi)) if (visible(m.index || 0)) addCheck(stats, 'screenreader', 'pass');

    // List structure (axe "list"): a <ul>/<ol> whose first child is not <li>.
    // Conservative Tier-1 heuristic: inspect only the FIRST child after the open
    // tag (skipping whitespace + comments), tag-branch only, skip PascalCase
    // framework components, and skip lists with an explicit role= (author has
    // taken control of the semantics). Stray non-li children later in the list,
    // and visibility, are deferred to Tier-2 axe.
    // OPEN TAGS ONLY, non-consuming (same style as clickable-non-button below):
    // a CONSUMING match (the previous `([\s\S]*?)<\/\1>` version) advances
    // matchAll's cursor past the whole matched span, so an outer <ul> containing
    // a nested <ul> swallowed the inner list entirely — it was never separately
    // examined (hakuso-reported regression, round 2). Finding "this list's own
    // close" is instead a bounded, depth-counted forward scan: ul/ol opens push,
    // ul/ol closes pop, stop at depth 0. A few thousand chars is enough for
    // real-world nesting depth at Tier-1; if no close appears in the window,
    // examine what we have rather than skipping the list outright.
    const LIST_CLOSE_WINDOW = 4000;
    const LIST_BOUNDARY_RE = /<(\/?)\s*(?:ul|ol)\b/gi;
    const listInner = (openEnd) => {
      const window = text.slice(openEnd, Math.min(text.length, openEnd + LIST_CLOSE_WINDOW));
      LIST_BOUNDARY_RE.lastIndex = 0;
      let depth = 1;
      let b;
      while ((b = LIST_BOUNDARY_RE.exec(window))) {
        depth += b[1] === '/' ? -1 : 1;
        if (depth === 0) return window.slice(0, b.index);
      }
      return window; // no matching close within the window — use what we scanned
    };
    for (const m of text.matchAll(/<(ul|ol)\b([^>]*)>/gi)) {
      if (!visible(m.index)) continue; // scripted string or hidden subtree
      if (/\brole\s*=/.test(m[2]) || /\saria-hidden\s*=\s*["']true/i.test(m[2])) continue; // author-controlled ARIA / hidden from a11y tree
      const inner = listInner(m.index + m[0].length);
      // Each comment body stops at its own `-->` (tempered token). A lazy `[\s\S]*?` body
      // could also merge adjacent comments, so a window of many comments with no element
      // after them backtracked exponentially (survey page 106063: >300 s, 2026-10-04).
      const cm = inner.match(/^\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)*<([a-zA-Z][\w-]*)/);
      if (!cm) continue; // empty, whitespace-only, or comment-only list — no element child to flag
      const lc = cm[1].toLowerCase();
      if (lc === 'li' || lc === 'script' || lc === 'template') continue;
      if (/^[A-Z]/.test(cm[1])) continue; // framework component, not a literal element
      addFinding(findings, stats, {
        key: 'list-non-li-child',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
        level: 'A',
        title: 'List contains a non-list-item child',
        affected_users: 'Screen-reader users navigating by list semantics',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: `A <ul>/<ol> has a direct child that is not <li>, <script>, or <template> (found <${lc}>). Screen readers may not announce the list or its item count correctly.`,
        fix: 'Make <li> the only structural child; move wrapper elements inside an <li>, or use role="list"/role="listitem" if a non-standard structure is unavoidable.',
        code_before: snippetAt(text, m.index || 0, cm[0].length),
      });
    }

    let namelessButtons = 0;
    // Inner tag group must not swallow </button>: adjacent nameless buttons (icon rows)
    // otherwise merge into one greedy match and get undercounted.
    // wild-precision round 1 (2026-08-03), P=0.600: `title` is a valid last-resort accessible-
    // name source (accname spec) — same treatment the link detector already gives it below.
    // Round 2 (2026-08, adversarial gate): `title=` was unanchored inside the lookahead, so
    // it also matched mid-word inside `data-title=` / `data-original-title=` — neither is an
    // accessible-name source, but they silently suppressed the fail. `\s` anchors it to a
    // real attribute boundary.
    for (const m of text.matchAll(/<button\b((?!aria-label|aria-labelledby|\stitle=)[^>])*>\s*(<(?!\/?button\b)[^>]+>\s*)*<\/button>/gi)) {
      if (!visible(m.index || 0)) continue;
      // A descendant carrying aria-label(ledby) or title names the button (accessible-name
      // computation descends); the button's OWN attrs are already excluded above, so
      // any match inside the match comes from a child (e.g. a labelled <svg>). Anchored to
      // `(?:^|\s)` for the same reason as above.
      if (/(?:^|\s)(?:aria-label(?:ledby)?|title)\s*=\s*["'][^"']/i.test(m[0])) continue;
      namelessButtons += 1;
      addFinding(findings, stats, {
        key: 'button-name-missing',
        category: 'keyboard',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        title: 'Button may not have an accessible name',
        affected_users: 'Screen-reader and voice-control users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'A button with no visible text or accessible label is hard to understand or activate by name.',
        fix: 'Add visible text, aria-label, or aria-labelledby.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }
    // A button's OWN title="" blocks the lookahead above (the attribute is present, just
    // empty), so it never reaches the nameless-button loop. But an empty string is not an
    // accessible name either (accname treats it as absent) — this must still be a fail
    // (digi24.ro corpus regression: <button title="">), not a silent drop. Scoped to
    // title="" only — an empty aria-label/aria-labelledby keeps its pre-existing, separately
    // tested suppression (see "pass evidence is positive" in static-audit-scoring.test.mjs).
    for (const m of text.matchAll(/<button\b[^>]*>/gi)) {
      if (!visible(m.index || 0)) continue;
      if (attrState(m[0], 'title').state !== 'present-empty') continue;
      if (attrState(m[0], 'aria-label').state === 'present-value') continue;
      if (attrState(m[0], 'aria-labelledby').state === 'present-value') continue;
      namelessButtons += 1;
      addFinding(findings, stats, {
        key: 'button-name-missing',
        category: 'keyboard',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        title: 'Button may not have an accessible name',
        affected_users: 'Screen-reader and voice-control users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'A button with an empty title has no accessible name; an empty string is treated as absent.',
        fix: 'Add visible text, aria-label, or aria-labelledby.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }
    // Buttons that DO have a name (text or a NON-EMPTY aria-label/title) are verified
    // keyboard passes. An empty aria-label="" escapes the nameless detector (suppression),
    // but a suppressed fail is not a pass — exclude those from the count.
    const emptyAriaLabelButtons = [...text.matchAll(/<button\b[^>]*\saria-label(?:ledby)?\s*=\s*(?:""|'')[^>]*>/gi)].filter(m => visible(m.index || 0)).length;
    const visibleButtons = [...text.matchAll(/<button\b/gi)].filter(m => visible(m.index || 0)).length;
    const namedButtons = visibleButtons - namelessButtons - emptyAriaLabelButtons;
    for (let i = 0; i < Math.max(0, namedButtons); i++) addCheck(stats, 'keyboard', 'pass');

    // Link accessible-name. A link is "named" if it OR a descendant carries a
    // non-empty aria-label / aria-labelledby / title, OR it wraps ANY <img>
    // (deferred to the image-alt check above, which surfaces alt-less images), OR
    // an <svg><title> with text, OR it has visible text. Inspecting the BODY (not
    // just the <a> tag) means an icon link named by a child's aria-label is no
    // longer false-flagged. Tier-1: not DOM-aware, NOT visibility-aware (hidden
    // nameless links are over-reported vs axe — true of every static check here),
    // and skips matches inside <script>/<style>.
    for (const m of text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (!visible(m.index)) continue;
      const attrs = m[1], body = m[2];
      if (!/\shref\s*=/.test(attrs)) continue; // anchor without href is not a link
      if (/\saria-hidden\s*=\s*["']true/i.test(attrs)) continue; // removed from the a11y tree
      const svgTitle = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const named =
        /\s(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']/.test(attrs) ||
        /\s(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']/.test(body) ||
        (!!svgTitle && svgTitle[1].trim().length > 0) ||
        decodeCommonEntities(body.replace(/<[^>]*>/g, '')).trim().length > 0;
      if (named) { addCheck(stats, 'screenreader', 'pass'); continue; }
      // Wrapped images follow alt semantics: a NON-EMPTY alt names the link (pass); an
      // image with NO alt attribute stays deferred to the image-alt check; images that
      // ALL carry alt="" give the link no name at all -> real link-name violation.
      const wrappedImgs = [...body.matchAll(/<img\b[^>]*>/gi)];
      if (wrappedImgs.length) {
        if (wrappedImgs.some(im => /\salt\s*=\s*["'][^"']/i.test(im[0]))) { addCheck(stats, 'screenreader', 'pass'); continue; }
        if (wrappedImgs.some(im => !/\salt\s*=/i.test(im[0]))) continue;
        // all wrapped images are alt="" -> fall through to the finding
      }
      addFinding(findings, stats, {
        key: 'link-name-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        level: 'A',
        title: 'Link may not have an accessible name',
        affected_users: 'Screen-reader, voice-control, and keyboard users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'A link with no visible text, no aria-label/aria-labelledby/title (on it or a descendant), and no image alt or SVG title has no accessible name. Screen readers announce it as a bare "link".',
        fix: 'Add visible link text, an aria-label/aria-labelledby/title, give a wrapped <img> meaningful alt text, or add an <svg><title>.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }

    // Open tags ONLY (matchAll must not consume the body: capturing `([\s\S]*?)<\/\1>`
    // advances matchAll's cursor past the whole wrapper, so a NESTED <div onclick> inside got
    // skipped entirely — hakuso CRITICAL, 2026-08, reproduced live: thscore99 2683 -> 1733,
    // 950 real bare-onclick violations hidden; an unclosed wrapper also reported 0 instead of
    // 1). The native-control check instead uses a NON-CONSUMING bounded lookahead — the next
    // ~2000 chars up to the first same-tag OPEN OR CLOSE (case-insensitive), tested for a
    // <button> or <a href> without touching the match itself. Stopping at a nested same-tag
    // OPEN too (hakuso round 3, 2026-08), not just the close, enforces "the native control
    // must appear in the wrapper's own direct content" — thscore99:300 (pMsg) no longer
    // credits an unrelated <a href> several levels deep inside a nested carousel <div> as the
    // control for the outer bare onclick div. Surviving Tier-1 ceiling: 102191.html:3576
    // (lazada) — an analytics-only onclick wrapper (goldlog.record) whose direct body happens
    // to contain a real <a href> now flags too; a tracker-only handler is indistinguishable
    // from a real one statically. Accepted.
    const CLICKABLE_LOOKAHEAD = 2000;
    // attr-scan exact-name lookup (not a `\sonclick\s*=` substring test): an attribute
    // name that merely CONTAINS "onclick" (e.g. paginationclickable="true") must not
    // match — same bug class as data-reactid containing id=.
    for (const m of text.matchAll(/<(div|span)\b[^>]*>/gi)) {
      if (!visible(m.index || 0)) continue;
      if (attrState(m[0], 'onclick').state === 'absent') continue;
      const bodyStart = m.index + m[0].length;
      const window = text.slice(bodyStart, Math.min(text.length, bodyStart + CLICKABLE_LOOKAHEAD));
      const closeMatch = window.match(new RegExp(`<\\/?${m[1]}\\b`, 'i'));
      const scope = closeMatch ? window.slice(0, closeMatch.index) : window;
      if (/<button\b|<a\b[^>]*\shref\s*=/i.test(scope)) continue;
      addFinding(findings, stats, {
        key: 'clickable-non-button',
        category: 'keyboard',
        severity: 'critical',
        wcag: 'WCAG 2.2: 2.1.1 Keyboard',
        level: 'A',
        title: 'Clickable non-button element',
        affected_users: 'Keyboard-only, switch-control, screen-reader, and voice-control users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'Clickable <div> or <span> elements are not keyboard-operable by default.',
        fix: 'Use <button> for actions. If custom semantics are unavoidable, add role, tabindex, and Enter/Space handling.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }

    let unlabelledInputs = 0;
    let wrappedInputs = 0;
    let labelledInputs = 0;
    // Only this detector consumes labelRanges — a wrapping <label> is positive evidence
    // solely for the fail-side skip below, not a general-purpose range.
    const labelRanges = computeLabelRanges(text, masked);
    const inLabel = (i) => labelRanges.some(([s, e]) => i >= s && i < e);
    const INPUT_SKIP_TYPES = new Set(['submit', 'hidden', 'button', 'image', 'reset']);
    // HTML-AAM accessible-name fallback chain (2026-08 hunt round 2, ids 100545/103280/
    // 104362, three agents converged): aria-labelledby(resolving) -> aria-label ->
    // label[for=id]/wrapping <label> -> title -> placeholder. A bare `id` is no longer
    // "labelled" by itself — it must have a MATCHING `<label for="that id">` in the file.
    // The old id-presence exemption was both a false positive (an id with no real label
    // still passed) and its false-negative twin (VALIDATION.md:603 — an id WITH a
    // differently-targeted `for=` was never caught either); a single matching-for= check
    // fixes both. `for=` targets and element ids are collected once per file, not per
    // input.
    const labelForIds = new Set([...text.matchAll(/<label\b[^>]*\sfor\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
    const elementIds = new Set([...text.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]));
    for (const m of text.matchAll(/<input\b[^>]*>/gi)) {
      if (!visible(m.index || 0)) continue;
      const attrs = parseStartTag(m[0]);
      const typeValue = attrs.has('type') ? attrs.get('type').toLowerCase() : null;
      if (typeValue && INPUT_SKIP_TYPES.has(typeValue)) continue;

      const labelledbyIds = (attrs.get('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
      const ariaLabelledbyResolves = labelledbyIds.some((id) => elementIds.has(id));
      const ariaLabelNonEmpty = !!attrs.get('aria-label');
      const inputId = attrs.get('id');
      const hasMatchingForLabel = !!inputId && labelForIds.has(inputId);
      const isWrapped = inLabel(m.index || 0);
      const titleNonEmpty = !!attrs.get('title');
      const placeholderNonEmpty = !!attrs.get('placeholder');
      const strongName = ariaLabelledbyResolves || ariaLabelNonEmpty || hasMatchingForLabel || isWrapped;

      if (strongName) {
        if (isWrapped && !ariaLabelledbyResolves && !ariaLabelNonEmpty && !hasMatchingForLabel) wrappedInputs += 1;
        else labelledInputs += 1;
        continue;
      }
      if (titleNonEmpty || placeholderNonEmpty) {
        // Satisfies 4.1.2 name computation (axe's label-title-only / non-empty-placeholder
        // precedent) but not 3.3.2's instructive-label intent — placeholder text disappears
        // on input, title is not a visible persistent label. review, not a critical fail.
        addFinding(findings, stats, {
          key: 'input-label-weak',
          category: 'forms',
          check: 'review',
          severity: 'warning',
          wcag: 'WCAG 2.2: 3.3.2 Labels or Instructions',
          level: 'A',
          title: 'Input is named only by title or placeholder, not a persistent visible label',
          affected_users: 'Screen-reader, voice-control, and cognitive disability users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'The input has an accessible name (title or placeholder), so it is not nameless, but neither is a visible label that persists once the field has content.',
          fix: 'Add a visible <label for="..."> (or wrap the input in one) so the label persists once the user starts typing.',
          code_before: snippetAt(text, m.index || 0, m[0].length),
        });
        continue;
      }
      unlabelledInputs += 1;
      addFinding(findings, stats, {
        key: 'input-label-missing',
        category: 'forms',
        severity: 'warning',
        wcag: 'WCAG 2.2: 3.3.2 Labels or Instructions',
        level: 'A',
        title: 'Input may be missing an accessible label',
        affected_users: 'Screen-reader, voice-control, and cognitive disability users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'The input has no obvious id or ARIA label in static markup.',
        fix: 'Pair it with a <label for="..."> or use aria-labelledby when a visible label already exists.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
    }
    // A wrapping <label> with no OTHER strong name source is counted separately
    // (wrappedInputs); disjoint from labelledInputs by construction above.
    for (let i = 0; i < wrappedInputs; i++) addCheck(stats, 'forms', 'pass');
    for (let i = 0; i < labelledInputs; i++) addCheck(stats, 'forms', 'pass');

    // Authentication barriers (3.3.8): cognitive-function-test CAPTCHAs and
    // paste-blocked password fields that Lighthouse does not flag. INFO signals
    // (invisible reCAPTCHA / v3 / Turnstile) are not 3.3.8 barriers — skip them.
    // Object-recognition CAPTCHAs (reCAPTCHA v2 / hCaptcha) are REVIEW, not fail,
    // because 3.3.8 Minimum exempts them. See core/scripts/auth-detect.mjs.
    for (const sig of detectAuthBarriers(text)) {
      if (sig.band !== 'FLAG' && sig.band !== 'REVIEW') continue;
      addFinding(findings, stats, {
        key: sig.key,
        category: 'forms',
        severity: sig.band === 'FLAG' ? 'warning' : 'tip',
        check: sig.band === 'REVIEW' ? 'review' : 'fail',
        wcag: sig.wcag,
        level: sig.level || 'AA',
        title: sig.title,
        affected_users: sig.affected_users,
        location: `${rel}:${lineOf(text, sig.index || 0)}`,
        description: sig.description,
        fix: sig.fix,
        code_before: sig.code_before || snippetAt(text, sig.index || 0),
      });
    }

    // Content-quality red-flags (alt 1.1.1 / link purpose 2.4.4 / role-echo label):
    // axe checks these EXIST, not whether they are meaningful. All REVIEW (the
    // meaningful-vs-present judgment that needs an LLM is the gated 3b follow-up).
    for (const sig of detectQualityFlags(text)) {
      // detectQualityFlags is a pure regex scan of raw text with no DOM/ancestor
      // knowledge by design; every other loop in this file gates on visible(), this one
      // didn't (2026-08 hunt round 2, id 104733: 9 findings inside an aria-hidden modal).
      if (!visible(sig.index || 0)) continue;
      addFinding(findings, stats, {
        key: sig.key,
        category: 'screenreader',
        severity: 'tip',
        check: 'review',
        wcag: sig.wcag,
        level: sig.level || 'A',
        title: sig.title,
        affected_users: sig.affected_users,
        location: `${rel}:${lineOf(text, sig.index || 0)}`,
        description: sig.description,
        fix: sig.fix,
        code_before: sig.code_before || snippetAt(text, sig.index || 0),
      });
    }

    // Attribute-order agnostic: `content=` (or data-* from React Helmet) may precede
    // `name=` — benchmark 2026-07-05 found 4 sites falsely flagged by a first-attribute
    // anchored match.
    if (/\.html?$/.test(file) && !/<meta\b[^>]*name=["']viewport["']/i.test(text)) {
      addFinding(findings, stats, {
        key: 'viewport-meta-missing',
        category: 'responsive',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.4.10 Reflow',
        title: 'Viewport meta tag is missing',
        affected_users: 'Mobile users and low-vision users who zoom',
        location: rel,
        description: 'Without a viewport meta tag, mobile layout and zoom behavior can become unusable.',
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      });
    } else addCheck(stats, 'responsive', 'pass');

    // Viewport present but disables zoom (axe "meta-viewport", WCAG 1.4.4). The
    // presence check above only verifies the tag exists; this parses its content.
    if (/\.html?$/.test(file)) {
      for (const m of text.matchAll(/<meta\s+[^>]*name=["']viewport["'][^>]*>/gi)) {
        const cm = m[0].match(/content=["']([^"']*)["']/i);
        const content = cm ? cm[1].toLowerCase() : '';
        const noScale = /user-scalable\s*=\s*(?:no|0|false)/.test(content);
        const maxM = content.match(/maximum-scale\s*=\s*([0-9.]+)/);
        const lowMax = !!maxM && !Number.isNaN(parseFloat(maxM[1])) && parseFloat(maxM[1]) < 5;
        if (noScale || lowMax) {
          addFinding(findings, stats, {
            key: 'viewport-zoom-disabled',
            category: 'responsive',
            severity: 'warning',
            wcag: 'WCAG 2.2: 1.4.4 Resize Text',
            level: 'AA',
            title: 'Viewport meta disables zoom',
            affected_users: 'Low-vision users who pinch-zoom, and mobile users',
            location: `${rel}:${lineOf(text, m.index || 0)}`,
            description: `The viewport meta tag prevents zoom (${noScale ? 'user-scalable=no' : 'maximum-scale below 5'}), so users cannot enlarge text.`,
            fix: 'Remove user-scalable=no and any maximum-scale below 5; use content="width=device-width, initial-scale=1".',
            code_before: snippetAt(text, m.index || 0, m[0].length),
          });
        }
      }
    }

    if (/\.html?$/.test(file)) {
      // Find the tag regardless of attribute order, then require a non-empty content=
      // anywhere inside it.
      const descTag = (text.match(/<meta\b[^>]*name=["']description["'][^>]*>/i) || [null])[0];
      if (!descTag || !/content=["'][^"']/i.test(descTag)) {
        addFinding(findings, stats, {
          key: 'meta-description-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'Meta description is missing',
          affected_users: 'Search and answer-engine users evaluating whether to open the result',
          location: rel,
          description: 'No meta description was found in the static HTML.',
          fix: 'Add a concise page-specific meta description.',
          legal_exposure: 'Not a legal issue; affects search / answer-engine clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');

      if (!/<link\b[^>]*rel=["']canonical["']/i.test(text)) {
        addFinding(findings, stats, {
          key: 'canonical-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'Canonical link is missing',
          affected_users: 'Search and answer-engine users when duplicate URLs or variants exist',
          location: rel,
          description: 'No canonical URL was found in the static HTML, so crawlers may have to infer the preferred URL.',
          fix: 'Add <link rel="canonical" href="https://example.com/preferred-url"> for indexable public pages.',
          legal_exposure: 'Not a legal issue; affects search / answer-engine clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');

      // wild-precision round 2 (2026-08), P=0.933: the old presence regex assumed
      // type="application/ld+json" was the LAST attribute on the tag, so a trailing
      // attribute (e.g. data-gatsby-head="true") hid real JSON-LD. attr-scan tokenizes
      // every attribute on the tag, order irrelevant — same bug class as data-reactid
      // containing id=, an attribute containing onclick, and data-title matching title.
      const hasJsonLd = [...text.matchAll(/<script\b[^>]*>/gi)].some((m) => {
        const t = attrState(m[0], 'type');
        return t.state === 'present-value' && t.value.toLowerCase() === 'application/ld+json';
      });
      if (!hasJsonLd) {
        addFinding(findings, stats, {
          key: 'jsonld-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'JSON-LD structured data is missing',
          affected_users: 'Search and answer-engine users trying to identify the page entity and content type',
          location: rel,
          description: 'No JSON-LD structured data was found in the static HTML.',
          // hakuso medium-d (2026-08-29): six equally-weighted options with no default
          // reads as direct-fix-ready but forces a content/product decision an agent
          // shouldn't make arbitrarily. Lead with one concrete pick for the common case.
          fix: 'Add Schema.org JSON-LD. Default to WebSite for a general page (or Organization for a company/brand page); use a more specific type instead — Article, FAQPage, Product, or BreadcrumbList — only when the page is clearly that kind of content.',
          legal_exposure: 'Not a legal issue; affects answer-engine and search clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');
    }

    // Workstream B (engine @10): static contrast reference value — evidence only, see the
    // block comment above computeStaticContrastFindings. Aggregated across every scanned
    // file into stats.contrast._staticPairs; the single evidence-line finding is emitted
    // once in main() after the whole scan, not per file.
    const styleRules = extractSameFileStyleRules(text);
    const { resolved, subThreshold } = computeStaticContrastFindings(text, rel, hiddenRanges, masked, styleRules, stats, findings);
    const staticPairs = (stats.contrast._staticPairs ||= { resolved: 0, subThreshold: 0 });
    staticPairs.resolved += resolved;
    staticPairs.subThreshold += subThreshold;
  }

  if (style || markup) {
    // wild-precision, P=0.267 (4 tp / 11 fp): the old check matched ANY outline:none/0
    // ANYWHERE in the stylesheet and only required no "focus-visible" text in the whole
    // file — CSS-cascade semantics a static tier cannot resolve (tabindex="-1"
    // programmatic-focus wrappers, :hover/:active-only rules that never touch :focus,
    // compensating indicators elsewhere, non-focusable elements, mouse-only state
    // classes). True positives share one shape: an UNSCOPED selector — bare `:focus`,
    // universal `*`/`*:focus`, or a bare TYPE selector + `:focus` (input:focus, a:focus —
    // a type selector still reaches every element of that tag, same sitewide blast
    // radius; verified live on wild-corpus 101550 minhngoc's
    // "#lightbox-nav a,.ui-dialog,.ui-menu,input:focus{outline:0}", and 101337/102559
    // whose only outline reset is a bare `*`) — with zero focus-visible occurrences
    // anywhere in the file. NOT `.btn:focus`, not `[tabindex="-1"]:focus`, not
    // `:hover`/`:active` alone.
    // Known ceiling, not fixed here (unmeasured frequency, out of scope): at-rule
    // nesting is invisible to the `{`/`}`/`;` boundary scan below — a rule inside
    // `@media (...) { :focus { outline: none } }` reads its "selector" as
    // `@media (...) { :focus`, which is not a bare shape, so it silently does not fire.
    const UNSCOPED_FOCUS = /^(:focus|\*(:focus)?|[a-z][\w-]*:focus)$/i;
    for (const m of text.matchAll(/outline\s*:\s*(none|0)\b/gi)) {
      if (/focus-visible/.test(text)) continue;
      const openBrace = text.lastIndexOf('{', m.index);
      if (openBrace === -1) continue;
      if (text.lastIndexOf('}', m.index) > openBrace) continue; // not inside an open rule body
      // Bounded by the nearest preceding `}` (previous rule) or `;` (a declaration, can't
      // start mid-selector) — NOT `>`, which is also the CSS child combinator (`.a > :focus`
      // read as boundary-then-bare-`:focus` was a false positive on a properly scoped rule).
      // text is the WHOLE file, not CSS-only, so a <style> block's FIRST rule has no prior
      // `}`/`;` and the slice runs into the surrounding markup — only THEN, cut through the
      // last real HTML tag's `>` (an actual `<tag...>`, never a bare combinator `>`).
      const selStart = Math.max(
        text.lastIndexOf('}', openBrace - 1),
        text.lastIndexOf(';', openBrace - 1),
      ) + 1;
      let selector = text.slice(selStart, openBrace).trim();
      if (selector.includes('<')) {
        const scope = text.slice(0, openBrace);
        let lastTag = null, tm;
        for (const htmlTagRe = /<[a-zA-Z][^<>]*>/g; (tm = htmlTagRe.exec(scope));) lastTag = tm;
        if (lastTag) selector = scope.slice(lastTag.index + lastTag[0].length, openBrace).trim();
      }
      if (!selector.split(',').some((p) => UNSCOPED_FOCUS.test(p.trim()))) continue;
      addFinding(findings, stats, {
        key: 'focus-outline-removed',
        category: 'keyboard',
        severity: 'critical',
        wcag: 'WCAG 2.2: 2.4.7 Focus Visible',
        level: 'AA',
        title: 'Focus outline removed without replacement',
        affected_users: 'Sighted keyboard users and low-vision keyboard users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'Removing outline without a :focus-visible replacement makes keyboard location invisible.',
        fix: 'Restore outline or add a strong :focus-visible style.',
        code_before: snippetAt(text, m.index || 0, m[0].length),
      });
      break;
    }

    // wild-precision, P=0.133 (2 tp / 13 fp): matching `minmax(Npx` textually cannot see
    // grid semantics (auto-fit/auto-fill adapt column count instead of overflowing, the
    // rule may sit inside an @media that never applies this narrow, the matched axis may
    // be rows not columns, or the fixed value may be the MAX bound not the min). Narrowing
    // to exclude all of that was tried and reverted (coordinator review, 2026-08): the
    // residue is a rare literal shape, and one of only two known true positives was itself
    // an auto-fill case — a narrowed detector would almost never fire while still moving
    // the score. Kept broad, moved to REVIEW instead: still surfaced in the report (a human
    // or the Tier-2 live audit can resolve it), never confirmed as a fail, never scores.
    for (const m of text.matchAll(/minmax\(\s*\d+px/gi)) {
      if (!/minmax\(\s*min\(\s*\d+px\s*,\s*100%\s*\)/i.test(text)) {
        addFinding(findings, stats, {
          key: 'fixed-minmax-overflow',
          category: 'responsive',
          severity: 'tip',
          check: 'review',
          wcag: 'WCAG 2.2: 1.4.10 Reflow',
          title: 'Possible fixed minmax grid overflow',
          affected_users: 'Low-vision users, mobile users, and zoom users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'A minmax(Npx, ...) track has a fixed lower bound, but static CSS analysis cannot confirm it actually overflows at 320px: the track may be auto-fit/auto-fill (adapts column count instead of overflowing), the rule may sit inside an @media block that never applies this narrow, the matched axis may be grid-template-rows rather than columns, or the fixed value may be the max bound rather than the min. Verify with a Tier-2 live audit or a human look.',
          fix: 'Use minmax(min(Npx, 100%), 1fr), or confirm with a live 320px reflow check.',
          code_before: snippetAt(text, m.index || 0, m[0].length),
        });
        break;
      }
    }

    // Demoted out of AA scoring/legal mapping entirely (2026-08 hunt round 2, ids
    // 100571 + 100635, user ruling): 2.3.3 is AAA, this run's own standard is "WCAG 2.2
    // AA static baseline", and the old property/reachability-blind trigger fired on
    // dead CSS and color-only transitions. check:'review' -> motion never scores (an
    // evidence-only category returns to not-machine-checkable, same as contrast/touch/
    // cognitive/media); level:'AAA' -> criteriaFromFindings excludes it from
    // legal_risk.mapped_criteria and all six jurisdiction arrays (same array reference).
    const motion = detectMotionEvidence(text);
    if (motion.evidence) {
      const notes = [];
      if (motion.hoverGatedOnly) notes.push('The motion found is gated behind :hover/:active interaction, which is weaker evidence than an unconditional animation.');
      if (motion.captureGap) notes.push('This page links external stylesheets that a static single-file scan never fetches, so an absent reduced-motion rule here is not a confirmed absence — it may exist in CSS this scan could not see.');
      addFinding(findings, stats, {
        key: 'motion-reduced-motion-missing',
        category: 'motion',
        severity: 'warning',
        check: 'review', // always review — motion never scores under this ruling, fires or not
        wcag: 'WCAG 2.2: 2.3.3 Animation from Interactions',
        level: 'AAA',
        title: motion.fires ? 'Motion exists without reduced-motion handling' : 'Motion with reduced-motion handling present',
        affected_users: 'Vestibular disorder, migraine, and attention-sensitive users',
        location: rel,
        description: (motion.fires
          ? 'Motion-bearing CSS (transform, position offset, or a motion @keyframes animation) was found on a markup-reachable selector, with no prefers-reduced-motion handling anywhere in the file.'
          : 'Motion-bearing CSS was found on a markup-reachable selector, and prefers-reduced-motion handling is also present.') + (notes.length ? ' ' + notes.join(' ') : ''),
        fix: motion.fires ? 'Add @media (prefers-reduced-motion: reduce) to disable or shorten non-essential motion.' : 'No action needed.',
      });
    }

    // Boundary-anchored so the `width:` tail of max-width:/min-width: is not
    // matched: max-width is an upper bound (shrinks fine, never counts); min-width
    // is a floor (still counts). Widths inside @media blocks are breakpoint-scoped,
    // so drop them. Static cannot confirm real overflow (the element may be
    // max-width:100% or in a constrained/flex container), so this is REVIEW, not a
    // hard fail — the Tier-2 live audit owns the 320px scrollWidth check.
    if (/(?:^|[;{\s])(?:min-)?width\s*:\s*[4-9]\d{2,}px/.test(stripAtMedia(text))) {
      addFinding(findings, stats, {
        key: 'large-fixed-width',
        category: 'responsive',
        severity: 'tip',
        check: 'review',
        wcag: 'WCAG 2.2: 1.4.10 Reflow',
        title: 'Possible large fixed width',
        affected_users: 'Mobile and zoom users',
        location: rel,
        description: 'A large fixed width outside any @media block may overflow narrow viewports, but static analysis cannot confirm it (the element may use max-width:100% or sit in a constrained/flex container). Verify at 320px with a live audit.',
        fix: 'Use max-width, min(), clamp(), or container-relative sizing.',
      });
    }
  }

  if (jsLike) {
    // Source-level auth barriers (3.3.8) the markup scan misses: a JS-set
    // password type with clipboard blocking, and JS-rendered / tag-manager-
    // injected CAPTCHA. Source detection is heuristic (minified/indirected code
    // defeats it), so these are REVIEW/INFO, never a hard FLAG. The Tier-2
    // rendered-DOM snapshot is authoritative for the injected-widget case.
    const markupPasteFlagged = findings.some(
      (f) => f.key === 'auth-password-paste-blocked' && f.location.startsWith(rel + ':')
    );
    for (const sig of detectAuthBarriersInSource(text)) {
      if (sig.band !== 'FLAG' && sig.band !== 'REVIEW') continue;
      if (sig.key === 'auth-password-clipboard-blocked-js' && markupPasteFlagged) continue;
      addFinding(findings, stats, {
        key: sig.key,
        category: 'forms',
        severity: sig.band === 'FLAG' ? 'warning' : 'tip',
        check: sig.band === 'REVIEW' ? 'review' : 'fail',
        wcag: sig.wcag,
        level: sig.level || 'AA',
        title: sig.title,
        affected_users: sig.affected_users,
        location: `${rel}:${lineOf(text, sig.index || 0)}`,
        description: sig.description,
        fix: sig.fix,
        code_before: sig.code_before || snippetAt(text, sig.index || 0),
      });
    }
    for (const m of text.matchAll(/addEventListener\s*\(\s*['"]click['"]/g)) {
      const ctx = snippetAt(text, m.index || 0, m[0].length);
      if (!/keydown|keyup|<button|role\s*=\s*["']button["']/.test(ctx)) {
        // User ruling 2026-08-29 (judgment-precision spec item A1): this proximity
        // heuristic cannot see element semantics — it can't tell a native <button> a
        // click is bound to, or a passive/analytics listener, from a real keyboard
        // trap (reproduced live: 2/2 flags on this exact pattern were false positives
        // on chiehweihuang.github.io, one of each case). It must never emit
        // critical/fail; demote to review with a mandatory verification caveat.
        addFinding(findings, stats, {
          key: 'click-handler-keyboard-missing',
          category: 'keyboard',
          severity: 'warning',
          check: 'review',
          wcag: 'WCAG 2.2: 2.1.1 Keyboard',
          level: 'A',
          title: 'Click handler lacks nearby keyboard handling',
          affected_users: 'Keyboard-only, switch-control, and screen-reader users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'A click listener was found without nearby keyboard support in the same snippet. This heuristic cannot see element semantics: verify the target is not a native interactive element (e.g. a <button> the listener is bound to) or a passive/analytics listener before treating this as a confirmed defect.',
          fix: 'Prefer a native button, or add Enter/Space keyboard support and focus management.',
          code_before: ctx,
        });
      } else addCheck(stats, 'keyboard', 'pass');
    }
  }

  // Baseline review items that static scanning cannot verify.
  addCheck(stats, 'contrast', 'review');
  addCheck(stats, 'touch', 'review');
  addCheck(stats, 'cognitive', 'review');
  addCheck(stats, 'media', 'review');
}

function hasDirectoryInput(paths) {
  return paths.some(p => {
    try { return statSync(p).isDirectory(); }
    catch { return false; }
  });
}

function hasCollectedFile(files, root, name) {
  const lower = name.toLowerCase();
  return files.some(file => {
    const rel = relative(root, file).replace(/\\/g, '/').toLowerCase();
    return rel === lower || rel.endsWith('/' + lower);
  });
}

function addSiteAgentReadinessFindings(inputPaths, files, root, stats, findings) {
  if (!hasDirectoryInput(inputPaths)) return;

  if (!hasCollectedFile(files, root, 'robots.txt')) {
    addFinding(findings, stats, {
      key: 'robots-txt-missing',
      category: 'agent',
      severity: 'tip',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'robots.txt was not found in the scanned site files',
      affected_users: 'Search crawlers, answer-engine crawlers, and site operators controlling crawler access',
      location: 'site root',
      description: 'No robots.txt file was found in the scanned directory. Agents and crawlers may have less explicit guidance about what they can access.',
      fix: 'Add a site-root robots.txt. For public AI-facing sites, consider explicit sitemap and Content-Signal directives that match your policy.',
      legal_exposure: 'Not a legal issue; affects crawler and agent access clarity.',
    });
  } else addCheck(stats, 'agent', 'pass');

  if (!hasCollectedFile(files, root, 'sitemap.xml')) {
    addFinding(findings, stats, {
      key: 'sitemap-missing',
      category: 'agent',
      severity: 'tip',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'sitemap.xml was not found in the scanned site files',
      affected_users: 'Search and answer-engine crawlers discovering canonical public pages',
      location: 'site root',
      description: 'No sitemap.xml file was found in the scanned directory.',
      fix: 'Add a site-root sitemap.xml and reference it from robots.txt so crawlers can discover important public URLs.',
      legal_exposure: 'Not a legal issue; affects URL discovery for search and answer engines.',
    });
  } else addCheck(stats, 'agent', 'pass');

  if (!hasCollectedFile(files, root, 'llms.txt')) {
    addFinding(findings, stats, {
      key: 'llms-txt-missing',
      category: 'agent',
      severity: 'tip',
      check: 'review',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'llms.txt was not found in the scanned site files',
      affected_users: 'AI agents and answer engines looking for a concise site map or content guide',
      location: 'site root',
      description: 'No llms.txt file was found in the scanned directory. This proposed convention is optional, but can help agents find the most important content.',
      fix: 'Consider adding a site-root llms.txt that describes the site, key pages, docs, APIs, and crawl/use policy in plain text.',
      legal_exposure: 'Not a legal issue; affects optional AI-agent content discovery.',
    });
  } else addCheck(stats, 'agent', 'pass');
}

// inspect.md Step 4 category formula (single source): base = pass/auditable, then a
// severity penalty from confirmed-fail findings. unverifiable (review) is excluded from
// both auditable and the penalty. A category with no pass/fail evidence gets a STATE,
// never a number: review-only = not-machine-checkable, empty = not-applicable.
//
// A+ ruling (user decision 2026-08-08, VALIDATION.md L2): ANY auditable evidence (>=1
// pass/fail) scores. The old floor made the denominator itself (evidence count) a
// scoring input — dropping from 3 checks to 2 could re-state a category as
// insufficient-evidence and drop it out of the weighted average, so FIXING a violation
// (which removes evidence) could LOWER the overall score. That broke monotonicity in both
// directions (VALIDATION.md L2 KNOWN VIOLATION, fixed by @17). Thin evidence (auditable <
// THIN_EVIDENCE_MIN) is now a `thin: true` flag on an otherwise normal scored category —
// still a number, still in the weighted average and coverage, just visibly qualified in
// the report (never colour-alone) so a 100 from one check reads as "the one thing checked
// passed", not "nothing wrong here". Findings are unaffected either way.
function scoreCategory(cat) {
  const auditable = cat.pass + cat.fail;
  if (auditable === 0) return { state: cat.review > 0 ? 'not-machine-checkable' : 'not-applicable', score: null, thin: false };
  const base = (cat.pass / auditable) * 100;
  const sev = cat.sev || { critical: 0, warning: 0, tip: 0 };
  const score = base - sev.critical * 12 - sev.warning * 5 - sev.tip * 1;
  return { state: 'scored', score: Math.max(0, Math.min(100, Math.round(score))), thin: auditable < THIN_EVIDENCE_MIN };
}

function priorityFor(severity) {
  if (severity === 'critical') return 'P0';
  if (severity === 'warning') return 'P1';
  return 'P2';
}

function criteriaFromFindings(findings) {
  const criteria = new Set();
  for (const f of findings) {
    // AAA is never the legal baseline in any of the six mapped jurisdictions (all
    // reference WCAG AA) — keep AAA-level findings (e.g. motion-reduced-motion-missing's
    // 2.3.3) out of mapped_criteria and every jurisdiction's criteria array, which are
    // the same array reference (2026-08 hunt round 2, user ruling).
    if (f.level === 'AAA') continue;
    for (const m of String(f.wcag || '').matchAll(/\b([1-4]\.\d\.\d{1,2})\b/g)) {
      criteria.add(m[1]);
    }
  }
  return [...criteria].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function testingRecommendations(categories) {
  const byId = Object.fromEntries(categories.map(cat => [cat.id, cat]));
  const recommendations = [];
  // `review` is included, not just `fail`: click-handler-keyboard-missing (a heuristic
  // that can't confirm a real keyboard trap, 2026-08-29 demotion) now lands here, and
  // it still genuinely needs a human keyboard walkthrough to resolve either way.
  if (byId.keyboard?.fail || byId.keyboard?.review) recommendations.push({
    zh: '修復鍵盤發現項後，僅使用 Tab、Shift+Tab、Enter、Space 與方向鍵重跑主要流程。',
    en: 'After fixing the keyboard findings, rerun the primary flow using only Tab, Shift+Tab, Enter, Space, and arrow keys.',
  });
  if (byId.forms?.fail) recommendations.push({
    zh: '修復表單發現項後，驗證 label、必填狀態與錯誤訊息能被鍵盤及螢幕閱讀器正確使用。',
    en: 'After fixing the form findings, verify labels, required states, and error messages with both keyboard and screen reader.',
  });
  if (byId.screenreader?.fail) recommendations.push({
    zh: '修復語意結構發現項後，用 NVDA 或 VoiceOver 完成主要任務。',
    en: 'After fixing the semantic findings, complete the primary task with NVDA or VoiceOver.',
  });
  if (byId.contrast?.state === 'not-machine-checkable') recommendations.push({
    zh: '用 Beacon 原生的 tier2-audit.mjs（預設）或 axe-core 驗證計算後的文字與 UI 對比。',
    en: 'Verify computed text and UI contrast with Beacon-native tier2-audit.mjs (default) or axe-core.',
  });
  recommendations.push({
    zh: '在 320px 寬度與實際 200% 瀏覽器縮放下分別重跑主要流程，保留操作結果；靜態掃描本身不能證明回流或縮放已通過。',
    en: 'Repeat the primary flow at 320px width and, separately, at actual 200% browser zoom. Record both results; a static scan alone does not establish that reflow or zoom passed.',
  });
  if (byId.cognitive?.state === 'not-machine-checkable') recommendations.push({
    zh: '請一位不熟悉產品的使用者完成主要任務，觀察標籤、說明與下一步是否清楚。',
    en: 'Ask a user unfamiliar with the product to complete the primary task and observe whether labels, help, and next steps are clear.',
  });
  return recommendations;
}

// Numeric fields tier2MeasuredHTML (generate-report.mjs) interpolates raw into HTML with no
// escaping of its own (c.ratio, c.fg.r/g/b, c.bg.r/g/b, c.required, c.width, c.height) --
// merged findings are untrusted input (P1 comment below), so anything that doesn't coerce
// cleanly to a finite number is dropped rather than guessed or passed through raw.
function sanitizeComputed(computed) {
  if (!computed || typeof computed !== 'object') return undefined;
  // hakuso MEDIUM-B (2026-07-27 final pass): Number(null|''|false|[]) is 0 and finite, so a
  // missing field would coerce to a fabricated 0 instead of being dropped. Reject anything
  // that isn't already a number or numeric string before coercing.
  const n = (v) => {
    if (v === null || v === '' || (typeof v !== 'number' && typeof v !== 'string')) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
  };
  const rgb = (v) => {
    const r = n(v?.r), g = n(v?.g), b = n(v?.b);
    return (r === null || g === null || b === null) ? null : { r, g, b };
  };
  if (computed.ratio !== undefined) {
    const ratio = n(computed.ratio), fg = rgb(computed.fg), bg = rgb(computed.bg), required = n(computed.required);
    // LOW-C: a required that fails coercion would otherwise render "required undefined:1" --
    // drop the whole computed object, same as a missing ratio/fg/bg.
    if (ratio === null || !fg || !bg || required === null) return undefined;
    return { ratio, fg, bg, required };
  }
  if (computed.width !== undefined) {
    const width = n(computed.width), height = n(computed.height);
    if (width === null || height === null) return undefined;
    return { width, height, spacingExceptionMet: computed.spacingExceptionMet === false ? false : undefined };
  }
  // Merged multi-viewport touch measurement (judgment-precision spec item A3): one
  // element measured at N viewports, carried as a per-viewport list plus the min/max
  // range the report needs to show "37-40x44-46px across 2 viewports" instead of
  // presenting one arbitrary instance's numbers as if they applied to all of them.
  if (Array.isArray(computed.byViewport)) {
    const rows = computed.byViewport
      .map(v => {
        const width = n(v?.width), height = n(v?.height);
        if (width === null || height === null || typeof v?.viewport !== 'string') return null;
        return { viewport: v.viewport, width, height };
      })
      .filter(Boolean);
    if (!rows.length) return undefined;
    const widths = rows.map(r => r.width), heights = rows.map(r => r.height);
    return {
      width: { min: Math.min(...widths), max: Math.max(...widths) },
      height: { min: Math.min(...heights), max: Math.max(...heights) },
      byViewport: rows,
    };
  }
  return undefined;
}

// Tier-2 touch findings measure ONE DOM element per configured viewport; left flat, the
// same element becomes N separate "findings" (one per viewport) and the report ends up
// treating a single sizing decision as N independent work items (user ruling 2026-08-29,
// judgment-precision spec item A3 — reproduced live: 7 unique elements read as "x14"
// across 2 viewports). Group by (key, selector) before the per-item merge loop; every
// other finding type (contrast, non-touch, or a touch finding with no selector) is
// returned untouched, in its original position, so ordering/behavior elsewhere is
// unaffected. A selector that legitimately differs in `key` across viewports (e.g. it
// clears the 24px floor at one width but not another) forms two separate groups rather
// than one merged "worst case" finding — a known simplification, not yet seen in
// practice; each still renders correctly, just as two entries instead of one.
function groupTouchFindingsBySelector(list) {
  const out = [];
  const bySelector = new Map();
  for (const f of list) {
    // hakuso medium-a (2026-08-29): a touch finding with no `viewport` string can't be
    // viewport-labeled once merged (sanitizeComputed's byViewport branch would drop the row
    // entirely for failing the viewport-is-a-string check, silently losing its measurement).
    // Leave it out of grouping so it renders through the original single-instance path.
    const groupable = f && f.category === 'touch' && typeof f.selector === 'string' && f.selector
      && typeof f.viewport === 'string' && f.viewport && f.computed;
    if (!groupable) { out.push(f); continue; }
    const groupKey = `${f.key || ''} ${f.selector}`;
    const rec = bySelector.get(groupKey);
    if (!rec) {
      const merged = { ...f, byViewport: [{ viewport: f.viewport, width: f.computed?.width, height: f.computed?.height }] };
      bySelector.set(groupKey, merged);
      out.push(merged);
    } else {
      rec.byViewport.push({ viewport: f.viewport, width: f.computed?.width, height: f.computed?.height });
    }
  }
  return out;
}

// Every tier-2 touch title follows "Touch target WxHpx <verdict phrase>" with the
// verdict phrase fixed per detector key and only the numbers varying per instance —
// reuse that phrase instead of hand-writing per-key text, so a merged multi-viewport
// finding's title still matches whatever the detector actually said.
function mergedTouchTitle(sampleTitle, byViewport) {
  const range = (nums) => {
    if (!nums.length) return '?';
    const min = Math.min(...nums), max = Math.max(...nums);
    return min === max ? `${Math.round(min)}` : `${Math.round(min)}–${Math.round(max)}`;
  };
  const wRange = range(byViewport.map(v => v.width).filter(Number.isFinite));
  const hRange = range(byViewport.map(v => v.height).filter(Number.isFinite));
  const tailMatch = String(sampleTitle || '').match(/^Touch target\s+[\d.]+×[\d.]+px\s+(.*)$/);
  const tail = tailMatch ? tailMatch[1] : 'is outside the target-size baseline';
  // hakuso medium-a (2026-08-29): a row with a missing/invalid width or height still
  // occupied a raw array slot -- the "(N viewport)" count must reflect rows that actually
  // carried a valid measurement (what sanitizeComputed keeps), not the raw input length.
  const n = byViewport.filter(v => Number.isFinite(v.width) && Number.isFinite(v.height)).length;
  return `Touch target ${wRange}×${hRange}px ${tail} (${n} viewport${n === 1 ? '' : 's'})`;
}

// P1: the SOLE channel for Tier-2/manual findings (axe contrast, focus, human review) to
// enter the scored artifact. The agent feeds findings as data; the script — never the
// agent — applies the matrix and recomputes the verdict. Untrusted input: validated here.
// Returns the parsed raw payload so main() can inspect it for tier-2 provenance metadata.
function mergeExternalFindings(file, stats, findings) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`--merge-findings: cannot read/parse ${file}: ${e.message}`); process.exit(1); }
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.findings) ? raw.findings : null);
  if (!list) { console.error(`--merge-findings: ${file} must be a findings array or {"findings":[...]}`); process.exit(1); }
  const grouped = groupTouchFindingsBySelector(list);
  let merged = 0, skipped = 0, representedContrastSamples = 0;
  for (const f of grouped) {
    if (!f || !CATEGORY_ORDER.includes(f.category)) {
      skipped += 1;
      console.error(`--merge-findings: skipped finding with invalid category: ${JSON.stringify(f).slice(0, 80)}`);
      continue;
    }
    // check: absent -> confirmed fail (axe violations); pass/review/fail pass through;
    // anything else is malformed input and is SKIPPED, never silently coerced to fail.
    const check = f.check === undefined ? 'fail' : (['pass', 'review', 'fail'].includes(f.check) ? f.check : null);
    if (check === null) {
      skipped += 1;
      console.error(`--merge-findings: skipped finding with unknown check "${f.check}": ${JSON.stringify(f).slice(0, 80)}`);
      continue;
    }
    if (f.category === 'contrast') representedContrastSamples += 1;
    if (check === 'pass') {
      // External verified passes are evidence, not findings — they raise the category
      // base (and weight coverage) without entering the findings list.
      addCheck(stats, f.category, 'pass');
      merged += 1;
      continue;
    }
    const severity = ['critical', 'warning', 'tip'].includes(f.severity) ? f.severity : undefined;
    // A grouped multi-viewport touch finding: rewrite title/location/computed to
    // describe the element across all its viewports instead of one arbitrary instance.
    const isMergedTouch = Array.isArray(f.byViewport);
    // hakuso medium-a (2026-08-29): only viewports that actually carried a valid
    // measurement count/list here — a row with a missing/invalid width or height is
    // dropped by sanitizeComputed and must not still be named in the location string.
    const validRows = isMergedTouch ? f.byViewport.filter(v => Number.isFinite(v.width) && Number.isFinite(v.height)) : [];
    const title = isMergedTouch ? mergedTouchTitle(f.title, f.byViewport) : (f.title || 'External finding');
    const location = isMergedTouch
      ? `${f.selector} (${validRows.length} viewport${validRows.length === 1 ? '' : 's'}: ${validRows.map(v => v.viewport).join(', ')})`
      : (f.location || '');
    const computed = isMergedTouch ? sanitizeComputed({ byViewport: f.byViewport }) : sanitizeComputed(f.computed);
    addFinding(findings, stats, {
      category: f.category,
      severity,
      wcag: f.wcag || '',
      key: f.key || 'external-finding',
      title,
      location,
      // Previously dropped on the floor here (hakuso-visible bug, judgment-precision
      // spec item C8): the "who is affected" line on a merged tier-2 finding rendered
      // empty, and its blind-spot/limitation description was silently lost, even
      // though tier2-audit.mjs authors both fields on every finding it emits.
      affected_users: f.affected_users,
      description: f.description,
      fix: f.fix,
      source: f.source || 'merged',
      check,
      computed,
      selector: typeof f.selector === 'string' ? f.selector : undefined,
      viewport: isMergedTouch ? undefined : (typeof f.viewport === 'string' ? f.viewport : undefined),
    });
    merged += 1;
  }
  const tier2Rows = typeof raw?.metadata?.engine_fingerprint === 'string'
    && raw.metadata.engine_fingerprint.startsWith('beacon-tier2-audit')
    && Array.isArray(raw?.summary?.by_viewport)
    ? raw.summary.by_viewport
    : null;
  if (tier2Rows) {
    // hakuso CRITICAL 2026-08-29: `contrast_samples` is the RAW capture count and includes
    // samples tier2-audit.mjs's analyzer skips as "nothing to measure" (invisible/
    // transparent ink) — neither a pass nor a fail. Using it here let those inflate this
    // implicit "clean pass" count, violating the charter rule that absence/undecided never
    // reads as pass. `contrast_samples_decided` (tier2-audit.mjs countDecidedContrastSamples)
    // excludes them; fall back to the raw count only for older artifacts that predate the
    // field (hand-built fixtures, pre-existing test data), never for a fresh real run.
    const legacyRows = tier2Rows.filter(row => !Number.isFinite(row?.contrast_samples_decided) && Number.isFinite(row?.contrast_samples));
    if (legacyRows.length > 0) {
      console.error(`--merge-findings: ${file} has no contrast_samples_decided for ${legacyRows.length} viewport row(s) — falling back to raw contrast_samples (may overcount invisible/unmeasurable ink as passes)`);
    }
    const measuredContrastSamples = tier2Rows.reduce((sum, row) => {
      const decided = Number.isFinite(row?.contrast_samples_decided) ? row.contrast_samples_decided : row?.contrast_samples;
      return sum + (Number.isFinite(decided) ? Math.max(0, decided) : 0);
    }, 0);
    const implicitContrastPasses = Math.max(0, measuredContrastSamples - representedContrastSamples);
    for (let i = 0; i < implicitContrastPasses; i += 1) addCheck(stats, 'contrast', 'pass');
    if (implicitContrastPasses > 0) {
      // Tracked separately (not just logged) so the report can state accurately whether
      // the category's pass count is entirely derived or only partly (hakuso 2026-08-29
      // round 2, micro-fix 2) — "mostly" is a false claim when the real fraction is 100%.
      stats.contrast._derivedPass = (stats.contrast._derivedPass || 0) + implicitContrastPasses;
      console.error(`--merge-findings: derived ${implicitContrastPasses} clean contrast pass(es) from Tier-2 samples`);
    }
  }
  console.error(`--merge-findings: merged ${merged}, skipped ${skipped} from ${file}`);
  return raw;
}

// P8: the LLM's irreducible semantic judgment (meaningful-alt quality, reading-order sense,
// cognitive load — the ~60% no engine can touch) has a sanctioned, QUARANTINED home: a
// passthrough block the script copies verbatim, never scores, and labels "not reproducible".
// Keeping it structurally separate is what stops judgment variance from contaminating the
// deterministic machine layer. The script stays sole author of the file; the agent only
// supplies content for this clearly-walled-off block.
function loadLlmJudgment(file) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`--llm-judgment: cannot read/parse ${file}: ${e.message}`); process.exit(1); }
  const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : null);
  if (!list) { console.error(`--llm-judgment: ${file} must be an array or {"items":[...]}`); process.exit(1); }
  const items = list
    .filter((j) => j && typeof j.observation === 'string' && j.observation.trim())
    .map((j) => ({ criterion: j.criterion || j.wcag || null, category: j.category || null, observation: j.observation, note: j.note || null }));
  return {
    label: 'LLM judgment — not reproducible, excluded from the machine score',
    reproducible: false,
    scored: false,
    items,
  };
}

// Reader-oriented task evidence is a separate, non-scored artifact. Validate it at this
// trust boundary, then carry only its normalized shape into the authoritative audit JSON.
function loadReaderEvidence(file) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { console.error(`--reader-evidence: cannot read/parse ${file}: ${e.message}`); process.exit(1); }
  try { return normalizeReaderEvidence(raw); }
  catch (e) { console.error(`--reader-evidence: ${file} is invalid: ${e.message}`); process.exit(1); }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  // Sorted so the artifact is machine-independent: readdirSync order differs across
  // filesystems (NTFS vs ext4), and findings order follows scan order.
  const files = [...new Set(opts.paths.flatMap(p => collect(p)))].sort();
  const stats = makeStats();
  const findings = [];

  for (const file of files) scanFile(file, root, stats, findings);
  addSiteAgentReadinessFindings(opts.paths, files, root, stats, findings);
  const mergedRaw = opts.mergeFindings ? mergeExternalFindings(opts.mergeFindings, stats, findings) : null;
  // HIGH-1 (2026-07-26 merge audit): when the merged payload IS a tier-2 artifact (not just
  // a bare findings array), carry its metadata+summary through so the report can render the
  // provenance chip (computeTier2EvidenceByCategory) — findings themselves already merged
  // in above; this only adds the "how much was measured" denominator alongside them.
  const tier2 = (typeof mergedRaw?.metadata?.engine_fingerprint === 'string'
    && mergedRaw.metadata.engine_fingerprint.startsWith('beacon-tier2-audit')
    && Array.isArray(mergedRaw?.summary?.by_viewport))
    ? { metadata: mergedRaw.metadata, summary: mergedRaw.summary }
    : null;

  // Contrast verification gate (inspect.md "do not skip"; hakuso+codex found this was
  // doc-promised but not code-backed — the native scan only ever bumps a silent review
  // count). stats.contrast.pass/fail are set ONLY by merged external findings (axe or a
  // tier-2 contrast merge) — nothing else in this file ever reports contrast pass/fail —
  // so this is the single reliable "was contrast exercised by a browser this run" signal,
  // checked exactly once, after any merge. A tier-2/axe contrast merge cleanly supersedes
  // both the tip and requires_live_audit; nothing else needs to change downstream.
  // Bug 3 (HIGH, round 2 of the 2026-08 axe-integration audit): round 1's `Boolean(axe)`
  // over-claimed — ANY axe file present cleared the disclosure, even one that never touched
  // color-contrast at all (e.g. only a bypass-blocks violation), while the category still
  // read pass:0 fail:0. Axe merely running is not evidence contrast was checked; require
  // color-contrast to actually appear among violations/passes/incomplete (an inapplicable
  // verdict is not a check either). Pass-accounting (crediting axe.passes into
  // stats.contrast.pass) is left alone deliberately — that decision depends on bug 1's
  // corroboration fix already being in place and risks becoming its own score-inflation
  // vector; out of scope here.
  const contrastVerifiedByBrowser = stats.contrast.pass > 0 || stats.contrast.fail > 0;
  if (!contrastVerifiedByBrowser) {
    addFinding(findings, stats, {
      key: 'contrast-not-verified',
      category: 'contrast',
      severity: 'tip',
      check: 'review',
      wcag: 'WCAG 2.2: 1.4.3 Contrast (Minimum)',
      title: 'Contrast not verified, run Tier 2',
      affected_users: 'Low-vision users and users in high ambient light',
      location: 'site-wide (static scan only)',
      description: 'This run only scanned static markup/CSS. No browser-rendered contrast evidence (Beacon-native tier2-audit.mjs or axe-core) was merged in, so real computed-style contrast was never exercised by a rendering engine.',
      fix: 'Run node scripts/tier2-audit.mjs (default) or an axe-core pass, then fold its findings in with --merge-findings for verified contrast coverage.',
    });
  }

  // Workstream B evidence line — site-wide total, once, only when at least one pair was
  // statically resolvable at all (nothing to report otherwise). Never a score (check:'review').
  const staticPairs = stats.contrast._staticPairs;
  if (staticPairs && staticPairs.resolved > 0) {
    addFinding(findings, stats, {
      key: 'static-contrast-evidence',
      category: 'contrast',
      severity: 'tip',
      check: 'review',
      wcag: 'WCAG 2.2: 1.4.3 Contrast (Minimum)',
      title: `Statically-resolvable contrast pairs: ${staticPairs.subThreshold} of ${staticPairs.resolved} below 4.5:1`,
      affected_users: 'Low-vision users and users in high ambient light',
      location: 'site-wide (inline/same-file styles only)',
      description: `可靜態解析的 ${staticPairs.resolved} 組配對中，${staticPairs.subThreshold} 組低於 4.5:1。Static-only evidence (inline styles / same-file <style> blocks with no cascade ambiguity) — not a full contrast audit; most real contrast comes from external stylesheets this pass cannot see. See the tier-2 harness for browser-measured contrast.`,
      fix: 'Review the individual static-contrast-sub-threshold findings, and run the tier-2 browser harness (or axe-core) for full contrast coverage.',
      computed: { resolved: staticPairs.resolved, subThreshold: staticPairs.subThreshold },
    });
  }

  const categories = CATEGORY_ORDER.map(id => {
    const cat = stats[id];
    // `sev` is internal scoring state — keep it out of the emitted artifact.
    const { state, score, thin } = scoreCategory(cat);
    // derived_pass: how many of `pass` came from arithmetic derivation (currently only
    // contrast's implicit Tier-2 "clean sample" credit) rather than an itemized pass
    // finding — lets the report say "all derived" vs "mostly derived" accurately instead
    // of guessing (hakuso 2026-08-29 round 2, micro-fix 2).
    return { id: cat.id, name: cat.name, pass: cat.pass, fail: cat.fail, review: cat.review, state, score, thin, derived_pass: cat._derivedPass || 0 };
  });

  // Weighted average over SCORED categories only, weights renormalised (inspect.md
  // Step 4). An unmeasured category moves COVERAGE, never the score.
  const scoredCats = categories.filter(cat => cat.state === 'scored');
  const scoredWeight = scoredCats.reduce((sum, cat) => sum + (CATEGORY_WEIGHTS[cat.id] || 0), 0);
  const applicableWeight = categories
    .filter(cat => cat.state !== 'not-applicable')
    .reduce((sum, cat) => sum + (CATEGORY_WEIGHTS[cat.id] || 0), 0);
  const notApplicableWeight = WEIGHT_SUM - applicableWeight;
  const weightedScore = scoredWeight
    ? Math.round(scoredCats.reduce((sum, cat) => sum + cat.score * (CATEGORY_WEIGHTS[cat.id] || 0), 0) / scoredWeight)
    : null;
  const coverage = Math.round((scoredWeight / WEIGHT_SUM) * 100);
  const lifeSafety = stats._lifeSafety === true;
  // Life-safety gate: a confirmed 2.3.1 critical caps the overall inside the fail band.
  const overall = lifeSafety && weightedScore !== null ? Math.min(weightedScore, LIFE_SAFETY_CAP) : weightedScore;
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const tips = findings.filter(f => f.severity === 'tip').length;
  const legalCriteria = criteriaFromFindings(findings);

  const audit = {
    metadata: {
      date: resolveDate(opts.date),
      url: opts.url || undefined,
      scope: opts.scope,
      standard: 'WCAG 2.2 AA static baseline',
      jurisdictions: ['US ADA', 'EU EAA', 'Japan JIS', 'Taiwan', 'Canada ACA', 'Australia DDA'],
      platform: 'Web',
      tool_version: 'beacon codex static baseline',
      engine_fingerprint: engineFingerprint(),
      confidence_level: coverage >= 60 ? 'medium' : 'low', // derived from measured weight; a static pipeline never claims high
      requires_live_audit: !contrastVerifiedByBrowser,
      audit_tier: tier2
        ? 'Tier 1 + Tier 2 (static scan + native browser measurement)'
        : 'Tier 1 (static file scan only)',
      audit_methods: [
        `Static scan of ${files.length} UI-like file(s)`,
        'Pattern checks for semantic HTML, keyboard traps, labels, reflow, motion, AEO structure, and site-level agent-readiness files when a directory is scanned',
        ...(tier2 ? [
          `Tier 2 browser measurement at ${tier2.summary.by_viewport.map(v => v.viewport).join(', ')} for computed text contrast and touch-target size`,
          'Keyboard flow, dynamic interaction states, and screen-reader task completion still require manual verification',
        ] : [
          'Runtime behavior, contrast ratios, and screen-reader task completion were not fully verified',
        ]),
      ],
    },
    summary: {
      overall_score: overall,
      coverage_percent: coverage,
      category_weights: CATEGORY_WEIGHTS,
      scope_weight: WEIGHT_SUM,
      applicable_weight: applicableWeight,
      applicable_weight_percent: Math.round((applicableWeight / WEIGHT_SUM) * 100),
      scored_weight: scoredWeight,
      not_applicable_weight: notApplicableWeight,
      life_safety_flag: lifeSafety,
      score_bands: SCORE_BANDS,
      total_findings: findings.length,
      critical,
      warnings,
      tips,
      unverifiable: categories.reduce((sum, cat) => sum + cat.review, 0),
      categories,
    },
    findings,
    legal_risk: {
      assessment_mode: 'wcag_criteria_context',
      narrative: 'Technical WCAG criteria mapping only. This is not a legal opinion and is not derived from warning counts.',
      mapped_criteria: legalCriteria,
      jurisdictions: [
        { name: 'US ADA', law: 'ADA Title III / Section 508 context', detail: 'Use the mapped WCAG criteria as technical evidence; legal exposure depends on business model, sector, and jurisdiction-specific facts.', criteria: legalCriteria },
        { name: 'EU EAA', law: 'European Accessibility Act', detail: 'Use the mapped WCAG criteria as technical evidence for consumer digital-service accessibility planning.', criteria: legalCriteria },
        { name: 'Japan JIS', law: 'JIS X 8341-3 context', detail: 'Use the mapped WCAG criteria as technical evidence; confirm procurement or sector requirements separately.', criteria: legalCriteria },
        { name: 'Taiwan', law: 'Taiwan accessibility context', detail: 'Use the mapped WCAG criteria as technical evidence only; confirm current local program, certification, and seal requirements before making a compliance claim.', criteria: legalCriteria },
        { name: 'Canada ACA', law: 'Accessible Canada Act context', detail: 'Use the mapped WCAG criteria as technical evidence; applicability depends on organization type and regulated context.', criteria: legalCriteria },
        { name: 'Australia DDA', law: 'Disability Discrimination Act context', detail: 'Use the mapped WCAG criteria as technical evidence; legal assessment requires local context and counsel.', criteria: legalCriteria },
      ],
    },
    remediation: findings.filter(f => f.check !== 'review').map(f => ({
      priority: priorityFor(f.severity),
      key: f.key,
      title: f.title,
      location: f.location,
      wcag: f.wcag,
      fix: f.fix || 'Review and fix.',
    })),
    testing_recommendations: testingRecommendations(categories),
  };

  // Attach the quarantined LLM-judgment block AFTER scoring — it is never folded into
  // findings, stats, or any score (P8 structural separation).
  if (opts.llmJudgment) audit.llm_judgment = loadLlmJudgment(opts.llmJudgment);
  // Reader evidence is stronger than a prose recommendation but still not a machine
  // score: the browser surface is reproducible, while task interpretation and AT use
  // remain explicitly separate evidence streams.
  if (opts.readerEvidence) audit.reader_evidence = loadReaderEvidence(opts.readerEvidence);
  if (tier2) audit.tier2 = tier2;

  mkdirSync(dirname(opts.output), { recursive: true });
  writeFileSync(opts.output, JSON.stringify(audit, null, 2));
  console.log(`Wrote ${opts.output}`);
  console.log(`Static baseline score: ${overall ?? 'n/a'} at ${coverage}% weight coverage (${findings.length} finding(s), ${critical} critical, ${warnings} warning, ${tips} tip)${lifeSafety ? ' — LIFE-SAFETY GATE APPLIED' : ''}`);
}

main();

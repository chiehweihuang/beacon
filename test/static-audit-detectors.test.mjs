// Beacon Phase A · static-audit detector tests (black-box via CLI).
// static-audit.mjs runs main() on import, so we exercise it as the CLI it is:
// write a fixture, run the scanner, assert on the emitted audit-results JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

function runScanner(html, { timeout } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-detok-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'detector-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir, timeout,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runScannerDir(filesByName) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-detok-dir-'));
  try {
    const out = join(dir, 'audit-results.json');
    for (const [name, body] of Object.entries(filesByName)) {
      writeFileSync(join(dir, name), body);
    }
    execFileSync('node', [SCANNER, '--scope', 'detector-dir-test', '--output', out, dir], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const linkNameFindings = (audit) =>
  audit.findings.filter((f) => /link/i.test(f.title) && /4\.1\.2/.test(f.wcag));

test('link-name: icon-only link with no accessible name is flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href="/text">Proper text link</a>
<a href="/aria" aria-label="Search"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></a>
<a href="/icon"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></a>
</main></body></html>`);
  const hits = linkNameFindings(audit);
  assert.equal(hits.length, 1, `expected exactly 1 nameless-link finding, got ${hits.length}`);
  assert.match(hits[0].wcag, /4\.1\.2/);
  // P1: the severity matrix (single source) mandates 4.1.2 = critical; the script applies
  // it at addFinding, so this finding is normalised from its native 'warning' to 'critical'.
  assert.equal(hits[0].severity, 'critical');
});

test('link-name: text links and aria-labelled links are not flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href="/a">Home</a>
<a href="/b"><span>Nested text</span></a>
<a href="/c" aria-label="Close"><svg><path d="M0 0"/></svg></a>
<a href="/d" title="Help"><svg><path d="M0 0"/></svg></a>
</main></body></html>`);
  assert.equal(linkNameFindings(audit).length, 0, 'named links must not be flagged');
});

test('link-name: image-wrapped links defer to image-alt; whitespace-only link is flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href="/named"><img src="/a.png" alt="Home"></a>
<a href="/altless"><img src="/b.png"></a>
<a href="/blank">   </a>
</main></body></html>`);
  // Any link wrapping an <img> defers to the image-alt check (avoids double-
  // reporting and over-firing on hidden image links). Only the blank link is nameless.
  assert.equal(linkNameFindings(audit).length, 1, 'only the blank link is a link-name hit');
  const imgAlt = audit.findings.filter((f) => /image/i.test(f.title) && /1\.1\.1/.test(f.wcag));
  assert.ok(imgAlt.length >= 1, 'alt-less <img> is surfaced by image-alt');
});

test('link-name: link named by a descendant (svg aria-label / svg title) is not flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href="/s1"><svg aria-label="Search"><path d="M0 0"/></svg></a>
<a href="/s2"><svg><title>Menu</title><path d="M0 0"/></svg></a>
<a href="/s3"><i class="icon-x"></i></a>
<a href="/s4" aria-hidden="true" tabindex="-1"><i class="icon-x"></i></a>
</main></body></html>`);
  // s1 (descendant aria-label) and s2 (svg <title>) are named; s4 is aria-hidden (out of the
  // a11y tree). Only s3 (visible icon font, no name) should flag.
  assert.equal(linkNameFindings(audit).length, 1, 'only the unnamed, non-hidden icon-font link should flag');
});

test('link-name: attribute matching is whitespace-anchored (data-* safe, spaced =)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href = "/spaced"><svg><path d="M0 0"/></svg></a>
<a href="/ok" aria-label = "Home"><svg><path d="M0 0"/></svg></a>
<a data-href="/nothref"><svg><path d="M0 0"/></svg></a>
<a href="/dt" data-title="x"><svg><path d="M0 0"/></svg></a>
</main></body></html>`);
  // flagged: spaced-"=" real href, and real href whose only other attr is data-title.
  // not flagged: aria-label (named, even with spaced "="); data-href (no real href).
  const hits = linkNameFindings(audit);
  assert.equal(hits.length, 2, `expected 2 hits (spaced href + data-title link), got ${hits.length}`);
});

// wild-precision round 1 (2026-08-03), P=0.600: `title` is a valid last-resort accessible-
// name source per the accname spec (the link detector already accepted it); button-name-missing
// did not, and flagged named buttons like <button title="Close">.
const buttonNameFindings = (audit) => audit.findings.filter((f) => f.key === 'button-name-missing');

test('button-name-missing: title attribute names the button; a button with neither text nor title still flags', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<button title="Close"><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></button>
<button><svg viewBox="0 0 1 1"><path d="M0 0"/></svg></button>
<button>Save</button>
</main></body></html>`);
  const hits = buttonNameFindings(audit);
  assert.equal(hits.length, 1, 'only the icon button with no text, aria-label, or title should flag');
});

const findingsMatching = (audit, titleRe, wcagRe) =>
  audit.findings.filter((f) => titleRe.test(f.title) && wcagRe.test(f.wcag));

test('heading outline includes ARIA headings and excludes presentational native headings', () => {
  const bridged = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><main>
<h1>Title</h1><div role="heading" aria-level="2">Section</div><h3>Detail</h3>
</main></body></html>`);
  assert.equal(findingsMatching(bridged, /heading level/i, /1\.3\.1/).length, 0, 'ARIA level 2 must bridge h1 to h3');

  const presentational = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><main>
<h1>Title</h1><h2 role="presentation">Visual only</h2><h3>Detail</h3>
</main></body></html>`);
  const hits = findingsMatching(presentational, /heading level/i, /1\.3\.1/);
  assert.equal(hits.length, 1, 'presentational h2 must not bridge h1 to h3');
  assert.match(hits[0].description, /level 1 to level 3/);
});

test('meta-viewport: zoom-disabling viewport is flagged; zoomable is not', () => {
  const noScale = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"></head><body><main><h1>x</h1></main></body></html>`);
  assert.equal(findingsMatching(noScale, /viewport|zoom/i, /1\.4\.4/).length, 1, 'user-scalable=no must flag');
  const lowMax = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, maximum-scale=1"></head><body><main><h1>x</h1></main></body></html>`);
  assert.equal(findingsMatching(lowMax, /viewport|zoom/i, /1\.4\.4/).length, 1, 'maximum-scale<5 must flag');
  const ok = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5"></head><body><main><h1>x</h1></main></body></html>`);
  assert.equal(findingsMatching(ok, /viewport|zoom/i, /1\.4\.4/).length, 0, 'maximum-scale=5 is valid, must not flag');
});

test('list: ul/ol with a non-li first child is flagged; valid lists, components, empty are not', () => {
  const bad = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul><div>not an item</div></ul>
<ol><a href="/x">link</a></ol>
</main></body></html>`);
  assert.equal(findingsMatching(bad, /list/i, /1\.3\.1/).length, 2, 'two non-li-first-child lists must flag');
  const ok = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul>  <!-- c -->  <li>a</li><li>b</li></ul>
<ul><CategoryItem/></ul>
<ul role="list"><div role="listitem">x</div></ul>
<ul aria-hidden="true"><div>x</div></ul>
<ol></ol>
<script>var tpl = "<ul><div>x</div></ul>";</script>
</main></body></html>`);
  assert.equal(findingsMatching(ok, /list/i, /1\.3\.1/).length, 0, 'valid list, component, role-overridden list, empty list, and HTML string inside <script> must not flag');
});

// Regression (found live on round-2 page 100000.html after the comment-placeholder fix
// above): a CONSUMING match (`([\s\S]*?)<\/\1>`) advances matchAll's cursor past the
// whole matched span, so an outer <ul> containing a nested <ul> swallowed the inner list
// entirely — it was never separately examined, and a genuine non-li first child on the
// INNER list stopped firing. Fixed via a non-consuming open-tag match + bounded
// depth-counted scan for each list's own close tag.
test('list: a nested list is still examined on its own (matchAll must not consume the outer list body)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul><li>a</li><ul class="inner"><span>x</span><li>b</li></ul></ul>
</main></body></html>`);
  const hits = findingsMatching(audit, /list/i, /1\.3\.1/);
  assert.equal(hits.length, 1, 'exactly the inner list (first child <span>) must flag; the outer list (first child <li>) must not');
});

// wild-precision round 2, P=0.867: comment nodes are not elements. A <ul> whose ONLY
// children are Vue/Nuxt/React SSR conditional-render placeholders (<!---->) must not
// flag — the old code only skipped LEADING comments, so a comment-only list made the
// regex backtrack past the list's own </ul> and grab an unrelated later element.
test('list: comment-only children (SSR conditional-render placeholders) do not flag', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul class="a"><!----></ul>
<ul class="b"><!----><!----><!----></ul>
<div id="not-a-list-child">outside every list, must never be reported as one</div>
</main></body></html>`);
  assert.equal(findingsMatching(audit, /list/i, /1\.3\.1/).length, 0, 'comment-only lists must not flag, and must not attribute an unrelated sibling element as their child');
});
test('list: a real non-li child right after a comment-only sibling list still flags (near-miss negative)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul class="a"><!----></ul>
<ul class="b"><div>real bad child</div></ul>
</main></body></html>`);
  assert.equal(findingsMatching(audit, /list/i, /1\.3\.1/).length, 1, 'the second list has a genuine non-li child and must still flag exactly once');
});

// Regression (2026-10-04, survey snapshot 106063 and three 5 MB pages): a list
// whose 4000-char window opens with many comments and is cut before any element made the
// leading-comment skip `(?:<!--[\s\S]*?-->\s*)*` backtrack exponentially, because the lazy
// body could merge adjacent comments. The scan never finished (>300 s on one page).
const commentRun = (n) => Array.from({ length: n }, (_, i) => `<!-- <g><path d="M${i},0"/></g> -->\n`).join('');
test('list: a long run of leading comments cut by the scan window finishes quickly and does not flag', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul>${commentRun(60)}<!-- ${'x'.repeat(5000)} --><li>a</li></ul>
</main></body></html>`, { timeout: 10000 });
  assert.equal(findingsMatching(audit, /list/i, /1\.3\.1/).length, 0, 'no element child inside the window, so nothing to flag');
});
// The tempered comment token is deliberate: a stray `-->` after a closed comment is a text
// node, so the list's first child is text and the list is not flagged. The previous lazy body
// stretched the comment across the stray `-->` and reported the following <div>.
test('list: a stray --> after a comment is text, not part of the comment', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul><!-- a --> stray --> <div>x</div></ul>
<ul><!-- a --><div>flagged</div></ul>
</main></body></html>`);
  assert.equal(findingsMatching(audit, /list/i, /1\.3\.1/).length, 1, 'only the list whose first child is an element flags');
});
test('list: a non-li child after a long run of comments still flags', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<ul>${commentRun(60)}<div>bad</div></ul>
<ol>${commentRun(60)}<li>ok</li></ol>
</main></body></html>`, { timeout: 10000 });
  assert.equal(findingsMatching(audit, /list/i, /1\.3\.1/).length, 1, 'only the <ul> whose first element child is <div> flags');
});

// Regression (2026-10-04, survey snapshot 102618: 2,845 findings x 63,247 lines, 112 s):
// line numbers and evidence snippets re-split the whole file for every finding.
test('locations: many findings in a many-line file resolve lines without re-splitting per finding', () => {
  const filler = '<p>x</p>\n'.repeat(60000);
  const items = Array.from({ length: 2500 }, (_, i) => `<div onclick="go(${i})">item</div>\n`).join('');
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
${filler}${items}</main></body></html>`, { timeout: 8000 });
  const hits = audit.findings.filter((f) => f.key === 'clickable-non-button');
  assert.equal(hits.length, 2500);
  assert.equal(hits[0].location.split(':').pop(), '60003', 'first item sits after 2 header lines + 60,000 filler lines');
  assert.match(hits[0].code_before, /go\(0\)/);
});

test('AEO: missing canonical and JSON-LD produce actionable findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
</head><body><main><h1>x</h1></main></body></html>`);
  const keys = new Set(audit.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.ok(keys.has('canonical-missing'), 'missing canonical should be an actionable AEO finding');
  assert.ok(keys.has('jsonld-missing'), 'missing JSON-LD should be an actionable AEO finding');

  const ok = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
</head><body><main><h1>x</h1></main></body></html>`);
  const okKeys = new Set(ok.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.equal(okKeys.has('canonical-missing'), false, 'present canonical should not be flagged');
  assert.equal(okKeys.has('jsonld-missing'), false, 'present JSON-LD should not be flagged');
});

// wild-precision round 2, P=0.933: the old presence regex assumed type="application/ld+json"
// was the LAST attribute on the tag. Gatsby (and others) emit trailing attributes after type.
test('AEO: JSON-LD with type= as a NON-FINAL attribute (Gatsby data-gatsby-head=) is not missed', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script type="application/ld+json" data-gatsby-head="true">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
</head><body><main><h1>x</h1></main></body></html>`);
  const keys = new Set(audit.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.equal(keys.has('jsonld-missing'), false, 'type= followed by another attribute must still be recognized as JSON-LD');
});
test('AEO: a page with no JSON-LD at all still flags (near-miss negative)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script src="/app.js"></script>
</head><body><main><h1>x</h1></main></body></html>`);
  const keys = new Set(audit.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.ok(keys.has('jsonld-missing'), 'a page with only an unrelated <script> must still be flagged for missing JSON-LD');
});

test('AEO: directory scan checks site-level agent-readiness files', () => {
  const page = `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
</head><body><main><h1>x</h1></main></body></html>`;

  const missing = runScannerDir({ 'page.html': page });
  const missingKeys = new Set(missing.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.ok(missingKeys.has('robots-txt-missing'), 'directory scans should flag missing robots.txt');
  assert.ok(missingKeys.has('sitemap-missing'), 'directory scans should flag missing sitemap.xml');
  assert.ok(missingKeys.has('llms-txt-missing'), 'directory scans should flag missing llms.txt as optional agent-readiness guidance');
  assert.equal(
    missing.findings.find((f) => f.key === 'llms-txt-missing')?.check,
    'review',
    'optional llms.txt guidance must not count as a scored failure',
  );

  const present = runScannerDir({
    'page.html': page,
    'robots.txt': 'User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n',
    'sitemap.xml': '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
    'llms.txt': '# Example\n\nImportant pages: https://example.com/page\n',
  });
  const presentKeys = new Set(present.findings.filter((f) => f.category === 'agent').map((f) => f.key));
  assert.equal(presentKeys.has('robots-txt-missing'), false, 'present robots.txt should not be flagged');
  assert.equal(presentKeys.has('sitemap-missing'), false, 'present sitemap.xml should not be flagged');
  assert.equal(presentKeys.has('llms-txt-missing'), false, 'present llms.txt should not be flagged');
});

const largeWidth = (html) => runScanner(html).findings.filter((f) => f.key === 'large-fixed-width');

// 1.4.10 reflow FP fix: max-width is an upper bound (never a fixed-width problem)
// and @media-scoped widths are breakpoint-conditional, so neither is flagged.
test('large-fixed-width: max-width and @media-scoped width are not flagged', () => {
  const hits = largeWidth(`<!DOCTYPE html><html lang="en"><head><title>t</title><style>
    .wrap { max-width: 960px; margin: 0 auto; }
    @media (max-width: 767px) { .col { width: 960px; } }
  </style></head><body><main><h1>Hi</h1><p>content here</p></main></body></html>`);
  assert.equal(hits.length, 0);
});

// but a real bare fixed width / min-width floor is still surfaced — as review
// (severity stays 'tip', not upgraded to warning by the 1.4.10 matrix).
test('large-fixed-width: real bare width / min-width is flagged as review', () => {
  for (const decl of ['width: 960px', 'min-width: 842px']) {
    const hits = largeWidth(`<!DOCTYPE html><html lang="en"><head><title>t</title><style>.x { ${decl}; }</style></head><body><main><h1>Hi</h1><p>content here</p></main></body></html>`);
    assert.equal(hits.length, 1, `${decl} should flag`);
    assert.equal(hits[0].severity, 'tip', `${decl} stays review-soft, not warning`);
  }
});

const inputLabelFindings = (audit) => audit.findings.filter((f) => f.key === 'input-label-missing');

test('input-label-missing: bare input with no id/aria/wrapping label is flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'bare input must still flag');
});

// wild-precision round 1 (2026-08-03), P=0.417: type=submit/hidden flagged despite the
// ruleset excluding them. The old exclusion `type=["']hidden["']` was quote-sensitive
// (missed unquoted/single-quoted) and covered only "hidden", not the other out-of-scope
// types (submit/button/image/reset). Must hold across quoting and attribute order.
test('input-label-missing: out-of-scope input types (submit/hidden/button/image/reset) are excluded regardless of quoting or attribute order; type=text still flags', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" name="u">
<input type="submit" value="Go">
<input type='submit' value="Go">
<input type=submit value="Go">
<input value="Go" type="submit" name="s2">
<input type="hidden" name="h1">
<input type='hidden' name="h2">
<input type=hidden name="h3">
<input type="button" value="Go">
<input type="image" src="go.png">
<input type="reset" value="Go">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'only the bare type=text input should flag; every out-of-scope type variant must be excluded');
});

test('input-label-missing: input wrapped in <label>...</label> is not flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label>Username <input type="text" name="u"></label>
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0, 'a wrapping <label> already names the input, even with no id/aria and no matching for');
});

test('input-label-missing: input after a CLOSED label (not wrapped) is still flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label for="u">Username</label>
<input type="text" name="u2">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'an input outside the label range (label already closed) must still flag');
});

// === HTML-AAM accname fallback chain (engine @18, 2026-08 hunt round 2, ids
// 100545/103280/104362, three agents converged): aria-labelledby(resolving) ->
// aria-label -> label[for]/wrapping <label> -> title -> placeholder. A bare `id` no
// longer exempts an input by itself -- it must have a MATCHING <label for="that id">
// (fixes the false-negative twin of the old id-presence exemption, VALIDATION.md:603). ===
const inputLabelWeak = (audit) => audit.findings.filter((f) => f.key === 'input-label-weak');

test('input-label-missing: an `id` with NO matching <label for> is flagged, not exempted (false-negative twin fix)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label for="other">Other field</label>
<input type="text" id="savings" name="s">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'a bare id with no matching for= must still flag');
});

test('input-label-missing: an `id` WITH a matching <label for> is named (positive control)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label for="savings">Savings</label>
<input type="text" id="savings" name="s">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0);
  assert.equal(inputLabelWeak(audit).length, 0);
});

test('input-label: a resolving aria-labelledby names the input (no finding)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<span id="lbl">Search</span>
<input type="text" aria-labelledby="lbl">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0);
  assert.equal(inputLabelWeak(audit).length, 0);
});

test('input-label: a NON-resolving aria-labelledby (dangling IDREF) is flagged, not exempted', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" aria-labelledby="nowhere">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'a dangling aria-labelledby IDREF must not exempt the input');
});

test('input-label: title-only or placeholder-only is `input-label-weak` review, not a critical fail (axe precedent)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" title="Search term">
<input type="text" placeholder="Search">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0, 'title/placeholder must not count as fully nameless');
  const weak = inputLabelWeak(audit);
  assert.equal(weak.length, 2);
  for (const f of weak) {
    assert.equal(f.check, 'review', 'title/placeholder-only must be review, not a confirmed fail');
    assert.equal(f.severity, 'warning');
    assert.equal(f.level, 'A');
  }
});

test('input-label: a stronger name source (aria-label) takes precedence over title/placeholder — no weak finding', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" aria-label="Search" title="also has a title" placeholder="also has a placeholder">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0);
  assert.equal(inputLabelWeak(audit).length, 0, 'a real aria-label must win over the weak title/placeholder path');
});

test('input-label-missing: level is Level A (3.3.2), not the AA default', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit)[0].level, 'A');
});

// hakuso HIGH, 2026-07-07: a tag-shaped token inside a <script> string or an HTML comment
// must not open a phantom range in computeHiddenRanges/computeLabelRanges — the old
// unclosed-tail behavior would swallow every later finding on the page to EOF.
const imageAltFindings = (audit) => audit.findings.filter((f) => f.key === 'image-alt-missing');

test('input-label-missing: a <label>-shaped token inside a <script> string does not swallow later findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<script>var s = "<label>";</script>
<input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'the fake <label> token lives inside a script string, not real markup');
});

test('input-label-missing: a <label>-shaped token inside an HTML comment does not swallow later findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<!-- <label> -->
<input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'the fake <label> token lives inside a comment, not real markup');
});

test('input-label-missing: self-closing <label/> wraps nothing, does not swallow later findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label/>
<input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'self-closing <label/> has no content to wrap, so the next input is still bare');
});

test('input-label-missing: an unclosed <label> gives NO credit (conservative, does not suppress the fail)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<label>Username <input type="text" name="u">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 1, 'an unclosed <label> must not manufacture a wrapping range to EOF');
});

test('input-label-missing + image-alt-missing: a script-string aria-hidden div does not swallow downstream findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<script>var tpl = '<div aria-hidden="true">';</script>
<img src="x.png">
<input type="text" name="u">
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the alt-less image after the fake hidden div must still flag');
  assert.equal(inputLabelFindings(audit).length, 1, 'the bare input after the fake hidden div must still flag');
});

test('input-label-missing + image-alt-missing: a commented-out aria-hidden div does not swallow downstream findings', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<!-- <div aria-hidden="true"> -->
<img src="x.png">
<input type="text" name="u">
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the alt-less image after the fake hidden div must still flag');
  assert.equal(inputLabelFindings(audit).length, 1, 'the bare input after the fake hidden div must still flag');
});

// hakuso round 2, 2026-07-07: an unbalanced `<!--` inside a <script> string is not a real
// comment-open, but pairing it with the NEXT real `-->` outside the script masked
// everything in between (including a real comment's worth of live markup).
test('input-label-missing: an unbalanced <!-- inside a script does not pair with a later REAL comment and mask the input between them', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<script>var x = "a <!-- b";</script>
<input type="text" name="u1">
<!-- real -->
<input type="text" name="u2">
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 2, 'both inputs sit outside any real comment or script body and must both flag');
});

test('input-label-missing + image-alt-missing: an unbalanced <!-- inside a script does not mask an alt-less image before the next real comment', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<script>var x = "a <!-- b";</script>
<img src="x.png">
<input type="text" name="u">
<!-- real -->
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the alt-less image between the fake <!-- and the real comment must still flag');
  assert.equal(inputLabelFindings(audit).length, 1, 'the bare input between the fake <!-- and the real comment must still flag');
});

// === noscript-image-twin (100-site hunt, 2026-08): rendered-DOM snapshots come from
// JS-enabled Chromium, so <noscript> bodies never render and sit outside the a11y tree.
// Next.js legacy Image / lazyload libraries emit a <noscript><img></noscript> twin per real
// image; scanning it double-counted every image/link finding (girlschannel.net: 274/549
// image-alt findings were noscript twins). <noscript> ranges are masked the same way as
// <script>/<style> bodies. ===
test('image-alt-missing: an alt-less img inside <noscript> is masked and the real twin outside it still flags exactly once', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<img src="real.png">
<noscript><img src="real.png"></noscript>
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the noscript twin must not double-count the real image');
});

test('input-label-missing: an unlabelled input inside <noscript> is masked, not flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<noscript><input type="text" name="u"></noscript>
</main></body></html>`);
  assert.equal(inputLabelFindings(audit).length, 0, 'an input inside <noscript> is never in the rendered a11y tree');
});

test('image-alt-missing + input-label-missing: an unbalanced <!-- inside <noscript> does not leak masking past </noscript>', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<noscript><!-- a <img src="twin.png"></noscript>
<img src="real.png">
<input type="text" name="u">
<!-- real -->
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the real image after </noscript> must still flag, not be swallowed by the phantom comment');
  assert.equal(inputLabelFindings(audit).length, 1, 'the real input after </noscript> must still flag, not be swallowed by the phantom comment');
});

// hakuso CRITICAL, 2026-08: the @7 bug class reintroduced by the noscript-image-twin fix
// itself — a `<noscript>`-shaped SUBSTRING inside a <script> string or an HTML comment must
// not open a phantom mask that pairs with the NEXT real </noscript> and swallows everything
// between. Reproduced live on hunt fixtures p9 (script-string case) and p11 (comment case).
test('image-alt + input-label + clickable-non-button: a <noscript>-shaped string inside a <script> does not open a phantom mask to the next real </noscript>', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<script>var s="<noscript>";</script>
<img src="real.png">
<input type="text" name="u">
<div onclick="go()">bare</div>
<noscript><img src="twin.png"></noscript>
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the real image must still flag, not be swallowed by the fake <noscript> string');
  assert.equal(inputLabelFindings(audit).length, 1, 'the real input must still flag, not be swallowed by the fake <noscript> string');
  assert.equal(clickableFindings(audit).length, 1, 'the real onclick div must still flag, not be swallowed by the fake <noscript> string');
});

test('image-alt + input-label: a <noscript>-shaped token inside an HTML comment does not open a phantom mask to the next real </noscript>', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<!-- legacy <noscript> note -->
<img src="real.png">
<input type="text" name="u">
<noscript><img src="twin.png"></noscript>
</main></body></html>`);
  assert.equal(imageAltFindings(audit).length, 1, 'the real image must still flag, not be swallowed by the fake <noscript> token in the comment');
  assert.equal(inputLabelFindings(audit).length, 1, 'the real input must still flag, not be swallowed by the fake <noscript> token in the comment');
});

// === clickable wrapper with native control inside (100-site hunt, 2026-08): analytics
// wrappers put onclick on a <div>/<span> whose direct body already wraps a real <button> or
// <a href> — the native control is the interactive element (15min.lt: 404/408 findings were
// spans wrapping a real share/bookmark button). A wrapper with only text/img children stays
// a real violation (thscore99: 2,683 bare onclick divs, all real). ===
const clickableFindings = (audit) => audit.findings.filter((f) => f.key === 'clickable-non-button');

test('clickable-non-button: a span onclick wrapping a native <button> is not flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<span onclick="track()"><button type="button">Share</button></span>
</main></body></html>`);
  assert.equal(clickableFindings(audit).length, 0, 'the real <button> inside the span is the interactive element');
});

test('clickable-non-button: a div onclick with only an <img> child is still flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<div onclick="track()"><img src="icon.png" alt=""></div>
</main></body></html>`);
  assert.equal(clickableFindings(audit).length, 1, 'a bare onclick div with no native control is still a real keyboard-trap violation');
});

// hakuso CRITICAL, 2026-08, reproduced live: the body-capturing `([\s\S]*?)<\/\1>` regex
// advanced matchAll's cursor past the WHOLE outer wrapper, so a NESTED onclick div/span never
// got its own match at all (thscore99 2683 -> 1733, 950 real violations hidden). Open-tag-only
// matching + a non-consuming lookahead must find every onclick element independently.
test('clickable-non-button: a nested onclick div is not swallowed by the outer wrapper\'s match', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<div onclick="a"><div onclick="b">x</div></div>
</main></body></html>`);
  assert.equal(clickableFindings(audit).length, 2, 'both the outer and the nested onclick div are real violations; neither may be swallowed');
});

// wild-precision round 1 (2026-08-03), P=0.800: `paginationclickable="true"` contains the
// substring "onclick" and fired with no real handler. Same class as the 2026-07 data-reactid
// contains id= bug -- the attribute match must be whitespace-anchored, not a bare substring.
test('clickable-non-button: an attribute name that merely contains "onclick" as a substring is not flagged; real onclick/onClick attributes still are', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<div paginationclickable="true">no handler</div>
<div onclick="go()">real</div>
<span onClick="go()">real2</span>
</main></body></html>`);
  assert.equal(clickableFindings(audit).length, 2, 'paginationclickable is a substring match, not a real attribute; onclick and onClick must both still flag');
});

// hakuso round 3, 2026-08, reproduced live on thscore99:300 (pMsg): the bounded lookahead
// stopped only at the first same-tag CLOSE, so a real <a href> several levels deep inside a
// nested non-onclick <div> (not the wrapper's own direct content) still credited the outer
// bare onclick div as "wrapping a control" and wrongly suppressed it. Stopping at a nested
// same-tag OPEN too enforces "the control must appear in the wrapper's own direct content".
test('clickable-non-button: an <a href> nested inside a non-onclick sibling div (not the wrapper\'s direct content) does not suppress the outer bare onclick div', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<div onclick="close()"><i></i><div class="x"><a href="/y">t</a></div></div>
</main></body></html>`);
  assert.equal(clickableFindings(audit).length, 1, 'the <a href> lives inside a nested div, not directly in the onclick wrapper, so the wrapper is still a real violation');
});

// === regression: audit 2026-07-27 (plans/2026-07-27-wcag-coverage-measurement.md) ===
// The old check `/<title\b[^>]*>[^<]+<\/title>/` matched ANY <title> anywhere in the
// document (including inside an <svg>), and treated whitespace-only content as present.
const titleMissingFindings = (audit) => audit.findings.filter((f) => f.key === 'document-title-missing');

test('document-title-missing: an <svg><title> icon label is not a document title', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<svg aria-hidden="true"><title>icon label</title><path d="M0 0"/></svg>
</main></body></html>`);
  assert.equal(titleMissingFindings(audit).length, 1, 'a page with no real <title>, only an svg icon title, must still flag');
});

test('document-title-missing: whitespace-only <title> counts as absent', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>   </title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Hi</h1></main></body></html>`);
  assert.equal(titleMissingFindings(audit).length, 1, 'a whitespace-only <title> must flag the same as an empty one');
});

test('document-title-missing: positive control — a real title alongside an svg title does not flag', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>Real Page Title</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<svg aria-hidden="true"><title>icon label</title><path d="M0 0"/></svg>
</main></body></html>`);
  assert.equal(titleMissingFindings(audit).length, 0, 'a real head <title> must count even when an svg title also exists');
});

// regression (hakuso auditor, real Chromium): document.title is "first HTML <title>
// element in the document, non-empty after trim" — location (body, hidden ancestor)
// doesn't stop a browser from setting it, so a static check that scopes to <head> only
// over-flags real titled pages (confirmed on a linear.app snapshot, 86-site diff).
test('document-title-missing: a title inside a hidden body div still counts (matches document.title, not head-only scope)', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<div hidden=""><title>Real Page Title</title><meta name="description" content="x"></div>
<main><h1>Hi</h1></main>
</body></html>`);
  assert.equal(titleMissingFindings(audit).length, 0, 'a <title> anywhere in the document (even body, even hidden) must count as present');
});

// SKILL.md documents `--output reports/a11y/audit-results.json`, which does not exist on a
// project's first run. The scanner must create that parent directory, not crash after doing
// all the analysis work (hakuso HIGH-1, 2026-07-27 codex-adapter audit).
test('--output to a not-yet-existing nested directory: parent dirs are created, exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-detok-nested-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'reports', 'a11y', 'audit-results.json');
    writeFileSync(fixture, '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body></body></html>');
    execFileSync('node', [SCANNER, '--scope', 'nested-output-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
    });
    assert.ok(existsSync(out), 'audit-results.json should exist under the freshly created reports/a11y/ dir');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// === focus-outline-removed: wild-precision P=0.267 (4 tp / 11 fp) — narrowed to exactly
// "unscoped universal :focus { outline: none|0 }" with zero focus-visible in the file. ===
const page = (css) => `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><main><a href="/x">x</a></main></body></html>`;
const outlineFindings = (audit) => audit.findings.filter((f) => f.key === 'focus-outline-removed');

test('focus-outline-removed: unscoped universal :focus{outline:none} with no focus-visible anywhere flags', () => {
  assert.equal(outlineFindings(runScanner(page(':focus { outline: none; }'))).length, 1);
});
// Locked TP regression fixture: the shape all 4 real true positives share, embedded among
// unrelated rules like a real stylesheet — not just the one-line synthetic case above —
// so the selector-boundary logic (which had its own bug, see the test below) stays honest
// on something closer to what the narrowed rule is actually supposed to keep catching.
test('focus-outline-removed: TP fixture — a bare :focus reset amid a realistic multi-rule stylesheet still flags', () => {
  const css = `
    body { margin: 0; font-family: sans-serif; }
    .btn { padding: 8px 16px; border-radius: 4px; }
    .btn:hover { background: #eee; }
    a { color: #06c; text-decoration: none; }
    :focus { outline: none; }
    .card { box-shadow: 0 1px 2px rgba(0,0,0,.1); }
  `;
  assert.equal(outlineFindings(runScanner(page(css))).length, 1, 'the bare :focus reset must still flag amid unrelated surrounding rules');
});
// Gate blocker (2026-08, HIGH x2): the narrowed rule recognised ONLY exact `:focus` and
// went recall-0/3 on real corpus markup. Universal `*`/`*:focus` and a bare TYPE selector
// (input:focus, a:focus, button:focus) reach every element of that scope too — same
// sitewide blast radius as bare `:focus` — and are pinned here against the corpus shapes
// that were actually missed (101337/102559: a bare `*` reset with zero :focus rules in the
// file; 101550: input:focus inside a comma-separated selector list).
test('focus-outline-removed: universal * (with zero :focus rules anywhere) flags — recovers wild-corpus 101337/102559', () => {
  assert.equal(outlineFindings(runScanner(page('* { margin: 0; outline: none; }'))).length, 1);
});
test('focus-outline-removed: *:focus flags', () => {
  assert.equal(outlineFindings(runScanner(page('*:focus { outline: none; }'))).length, 1);
});
test('focus-outline-removed: a bare TYPE selector + :focus inside a comma list flags — recovers wild-corpus 101550', () => {
  assert.equal(outlineFindings(runScanner(page('#lightbox-nav a,.ui-dialog,.ui-menu,input:focus{outline:0}'))).length, 1);
});
// The 13 verified false positives from the same corpus must still NOT match any of the
// newly recognised shapes (reviewer-checked: none of them is bare `*`, `*:focus`, or a
// bare type selector).
test('focus-outline-removed: class-scoped :focus (verified corpus false positive) still does not flag', () => {
  assert.equal(outlineFindings(runScanner(page('.fba-usa-modal:focus { outline: none; }'))).length, 0);
});
test('focus-outline-removed: :active/:hover only (verified corpus false positive) still does not flag', () => {
  assert.equal(outlineFindings(runScanner(page('a:active,a:hover{outline:none}'))).length, 0);
});

// Gate blocker (2026-08, HIGH x2): `>` is also the CSS child combinator, not just an HTML
// tag close — including it in the selector-boundary bound mis-scoped `.a > :focus` down to
// bare `:focus` and fired CRITICAL on a properly scoped rule. Fixed by only cutting through
// an HTML tag's `>` when the slice still contains raw markup (`<`), and even then only
// through the LAST REAL `<tag...>`, never a bare `>` combinator.
test('focus-outline-removed: a properly scoped child-combinator rule (.a > :focus) does NOT flag', () => {
  assert.equal(outlineFindings(runScanner(page('.a > :focus { outline: none; }'))).length, 0);
});
test('focus-outline-removed: minified child-combinator rule (.x>:focus) does NOT flag', () => {
  assert.equal(outlineFindings(runScanner(page('.x>:focus{outline:none}'))).length, 0);
});
test('focus-outline-removed: bare :focus as the FIRST rule in <style> (no prior }/;) still flags — the >-boundary fix must not break this', () => {
  assert.equal(outlineFindings(runScanner(page(':focus{outline:none}'))).length, 1);
});

test('focus-outline-removed: tabindex=-1 programmatic-focus wrapper does not flag (near-miss negative)', () => {
  assert.equal(outlineFindings(runScanner(page('[tabindex="-1"]:focus { outline: none; }'))).length, 0);
});
test('focus-outline-removed: a rule scoped to :hover/:active only (never touches :focus) does not flag (near-miss negative)', () => {
  assert.equal(outlineFindings(runScanner(page('.btn:hover, .btn:active { outline: none; }'))).length, 0);
});
test('focus-outline-removed: a compensating indicator on a scoped selector elsewhere does not flag (near-miss negative)', () => {
  assert.equal(outlineFindings(runScanner(page('.modal:focus { outline: none; } :focus-within { box-shadow: 0 0 0 3px #06f; }'))).length, 0);
});
test('focus-outline-removed: outline:none on a non-focusable, class-scoped element does not flag (near-miss negative)', () => {
  assert.equal(outlineFindings(runScanner(page('.icon:focus { outline: none; }'))).length, 0);
});
test('focus-outline-removed: a bare :focus rule is suppressed when focus-visible is used anywhere in the file', () => {
  assert.equal(outlineFindings(runScanner(page(':focus { outline: none; } a:focus-visible { outline: 3px solid blue; }'))).length, 0);
});

// === fixed-minmax-overflow: wild-precision P=0.133 (2 tp / 13 fp). Narrowing (auto-fit/
// auto-fill, @media scoping, axis, minmax(auto,N)) was tried and REJECTED (coordinator
// review, 2026-08): after excluding those, the residual literal shape is rare enough — and
// one of only two known true positives was itself an auto-fill case — that the narrowed
// rule would almost never fire while still moving the score. Kept broad, moved to REVIEW:
// still surfaced in the report, never a confirmed fail, never affects the score. ===
const minmaxFindings = (audit) => audit.findings.filter((f) => f.key === 'fixed-minmax-overflow');

test('fixed-minmax-overflow: an unguarded repeat(9, minmax(116px, 1fr)) still produces a review finding that does NOT move the score', () => {
  const withDeclaration = runScanner(page('.g { grid-template-columns: repeat(9, minmax(116px, 1fr)); }'));
  const withoutDeclaration = runScanner(page('.g { color: #222; }'));
  const hits = minmaxFindings(withDeclaration);
  assert.equal(hits.length, 1, 'the finding must still fire — matching stays broad, not narrowed');
  assert.equal(hits[0].check, 'review', 'must be review, not a confirmed fail');
  assert.equal(withDeclaration.summary.overall_score, withoutDeclaration.summary.overall_score, 'a review-only finding must not move the score');
});

// === isHiddenAttrs quote-blindness (engine @18, 2026-08 hunt round 2, id 100594 / youku):
// a bare /\shidden/ regex over the raw attrs blob used to read "hidden" inside a quoted
// attribute VALUE as the boolean hidden ATTRIBUTE, opening a phantom hidden range that
// blacked out the rest of the document. ===
const namelessButtonFindings = (audit) => audit.findings.filter((f) => f.key === 'button-name-missing');
const framePage = (bodyInner) => `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>${bodyInner}</body></html>`;

test('isHiddenAttrs: "hidden" inside a quoted style VALUE must not hide the subtree', () => {
  const audit = runScanner(framePage('<div style="overflow: hidden overlay;"><main><button></button></main></div>'));
  assert.equal(namelessButtonFindings(audit).length, 1, 'the nameless button must still be seen, not blacked out by a phantom hidden range');
});

test('isHiddenAttrs: "hidden" inside a quoted class VALUE (Tailwind-style) must not hide the subtree', () => {
  const audit = runScanner(framePage('<div class="btn hidden md:block"><main><button></button></main></div>'));
  assert.equal(namelessButtonFindings(audit).length, 1, 'must still see the nameless button after a class="...hidden..." token');
});

test('isHiddenAttrs: real hidden markers still suppress their subtree (regression)', () => {
  const cases = [
    '<div hidden><button></button></div>',
    '<div hidden=""><button></button></div>',
    '<div aria-hidden="true"><button></button></div>',
    '<div style="display:none"><button></button></div>',
  ];
  for (const c of cases) {
    const audit = runScanner(framePage(`<main>${c}</main>`));
    assert.equal(namelessButtonFindings(audit).length, 0, `${c} must still hide its subtree`);
  }
});

// === quality-flags loop missing the visible() gate (engine @18, 2026-08 hunt round 2,
// id 104733): every other detector loop in this file gates on visible(); this one didn't,
// so a review-only signal inside an aria-hidden modal still fired. ===
const qualityAltGeneric = (audit) => audit.findings.filter((f) => f.key === 'quality-alt-generic');

test('quality-flags: a generic alt inside an aria-hidden ancestor is not emitted', () => {
  const audit = runScanner(framePage('<main><div aria-hidden="true"><img src="x.png" alt="icon"></div></main>'));
  assert.equal(qualityAltGeneric(audit).length, 0, 'hidden-subtree quality signals must not be reported');
});

test('quality-flags: the same generic alt OUTSIDE any hidden ancestor still fires (regression)', () => {
  const audit = runScanner(framePage('<main><img src="x.png" alt="icon"></main>'));
  assert.equal(qualityAltGeneric(audit).length, 1, 'visible quality signals must be unaffected by the gate');
});

// === link-name entity decoding (engine @18, 2026-08 hunt round 2, id 104362): entity
// character references were replaced with a SPACE before trimming, so an entity-only
// label ("&gt;&gt;" pagination controls) collapsed to '' and read as nameless. ===
const linkNameMissing = (audit) => audit.findings.filter((f) => f.key === 'link-name-missing');

test('link-name: an entity-only label ("&gt;&gt;") is a real accessible name, not nameless', () => {
  const audit = runScanner(framePage('<main><a href="/all/2.php">&gt;&gt;</a></main>'));
  assert.equal(linkNameMissing(audit).length, 0, 'a decoded ">>" is real link text');
});

test('link-name: common named entities (&raquo; &laquo; &hellip; &times; &rarr;) all count as real content', () => {
  for (const entity of ['&raquo;', '&laquo;', '&hellip;', '&times;', '&rarr;']) {
    const audit = runScanner(framePage(`<main><a href="/x">${entity}</a></main>`));
    assert.equal(linkNameMissing(audit).length, 0, `${entity} must decode to real, non-empty link text`);
  }
});

test('link-name: a label that is ONLY whitespace entities (&nbsp;) is still nameless (regression)', () => {
  const audit = runScanner(framePage('<main><a href="/x">&nbsp;&nbsp;</a></main>'));
  assert.equal(linkNameMissing(audit).length, 1, 'whitespace-only content must still read as no name');
});

test('link-name: mixed entity + word content keeps its word separator ("A&nbsp;B" reads as real text)', () => {
  const audit = runScanner(framePage('<main><a href="/x">A&nbsp;B</a></main>'));
  assert.equal(linkNameMissing(audit).length, 0);
});

test('link-name: a genuinely empty link (no text, no entities) is still nameless (regression)', () => {
  const audit = runScanner(framePage('<main><a href="/x"></a></main>'));
  assert.equal(linkNameMissing(audit).length, 1);
});

// === motion-reduced-motion-missing: demoted out of scoring + rewritten trigger (engine
// @18, 2026-08 hunt round 2, ids 100571 + 100635, user ruling 2026-08-09):
// property-blind, reachability-blind, AAA mislabelled as AA. Now check:'review' always
// (never scores, never enters legal_risk mapping), and only fires on motion-bearing CSS
// (transform/position offset/@keyframes) whose selector is reachable in the markup. ===
const motionFindings = (audit) => audit.findings.filter((f) => f.key === 'motion-reduced-motion-missing');
const motionCategory = (audit) => audit.summary.categories.find((c) => c.id === 'motion');

test('motion: a dead CSS rule (selector matches nothing in the markup) produces no finding at all (100571)', () => {
  const audit = runScanner(framePage(`
    <style>.dropdown-icon{transition:transform .2s;}</style>
    <main><button>No dropdown icon here</button></main>
  `));
  assert.equal(motionFindings(audit).length, 0);
  assert.equal(motionCategory(audit).state, 'not-applicable', 'zero motion evidence -> not-applicable, not not-machine-checkable');
});

test('motion: a color-only transition on a REACHABLE selector is not motion (100635)', () => {
  const audit = runScanner(framePage(`
    <style>.icon:hover{transition:color .2s;}</style>
    <main><span class="icon">i</span></main>
  `));
  assert.equal(motionFindings(audit).length, 0, 'transition:color is never motion-bearing, even when reachable');
  assert.equal(motionCategory(audit).state, 'not-applicable');
});

test('motion: @keyframes translate on a reachable selector, no reduced-motion handling, fires a review finding', () => {
  const audit = runScanner(framePage(`
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:spin 2s linear infinite;}</style>
    <main><div class="spinner"></div></main>
  `));
  const hits = motionFindings(audit);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].check, 'review', 'must be review, never a scored fail');
  assert.equal(hits[0].level, 'AAA');
  const cat = motionCategory(audit);
  assert.equal(cat.state, 'not-machine-checkable', 'review-only evidence returns motion to not-machine-checkable');
  assert.equal(cat.score, null);
});

test('motion: the same @keyframes case WITH prefers-reduced-motion handling still emits a review note (not a scored pass)', () => {
  const audit = runScanner(framePage(`
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:spin 2s linear infinite;}
    @media (prefers-reduced-motion: reduce){.spinner{animation:none;}}</style>
    <main><div class="spinner"></div></main>
  `));
  const hits = motionFindings(audit);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].check, 'review');
  const cat = motionCategory(audit);
  assert.equal(cat.state, 'not-machine-checkable', 'handled motion is still review-only, not a scored pass');
  assert.equal(cat.pass, 0);
});

test('motion: overall score and legal_risk never include the AAA 2.3.3 criterion, fires or not', () => {
  const withMotion = runScanner(framePage(`
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:spin 2s linear infinite;}</style>
    <main><div class="spinner"></div></main>
  `));
  assert.ok(!withMotion.legal_risk.mapped_criteria.includes('2.3.3'), 'AAA criterion must never enter legal_risk.mapped_criteria');
  for (const j of withMotion.legal_risk.jurisdictions) {
    assert.ok(!j.criteria.includes('2.3.3'), `${j.name} criteria must not include the AAA-only 2.3.3`);
  }
});

test('motion: a hover-gated micro-transition still fires (review), noted as weaker evidence in the description, not suppressed', () => {
  const audit = runScanner(framePage(`
    <style>.icon:hover{transform:scale(1.1);transition:transform .2s;}</style>
    <main><span class="icon">i</span></main>
  `));
  const hits = motionFindings(audit);
  assert.equal(hits.length, 1);
  assert.match(hits[0].description, /:hover/);
});

test('motion: an inline style="transition:transform" is always reachable (it IS the element)', () => {
  const audit = runScanner(framePage('<main><div style="transition:transform .2s;">x</div></main>'));
  assert.equal(motionFindings(audit).length, 1);
});

test('motion: linked external stylesheet + no visible motion evidence notes the capture gap only when motion evidence exists', () => {
  const noEvidence = runScanner(framePage('<link rel="stylesheet" href="/site.css"><main><p>text</p></main>'));
  assert.equal(motionFindings(noEvidence).length, 0, 'no motion evidence at all -> no finding, capture-gap note is irrelevant here');
});

test('motion: a linked external stylesheet alongside real motion evidence notes the capture gap in the description', () => {
  const audit = runScanner(framePage(`
    <link rel="stylesheet" href="/site.css">
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:spin 2s linear infinite;}</style>
    <main><div class="spinner"></div></main>
  `));
  const hits = motionFindings(audit);
  assert.equal(hits.length, 1);
  assert.match(hits[0].description, /external stylesheet/i);
});

// hakuso round 1 (2026-08): the `animation` shorthand is order-independent and the old
// code only checked the FIRST token, missing "1s spin" and "1s ease-in spin" entirely.
test('motion: animation shorthand with the name NOT first ("1s spin") is still recognized', () => {
  const audit = runScanner(framePage(`
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:1s spin;}</style>
    <main><div class="spinner"></div></main>
  `));
  assert.equal(motionFindings(audit).length, 1);
});

test('motion: animation shorthand with the name buried mid-token-list ("1s ease-in spin") is still recognized', () => {
  const audit = runScanner(framePage(`
    <style>@keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:1s ease-in spin;}</style>
    <main><div class="spinner"></div></main>
  `));
  assert.equal(motionFindings(audit).length, 1);
});

// Regression (2026-10-04, survey snapshot 100348 and three 5 MB survey pages, 125-220 s each): the
// same-file CSS rule scan `([^{}]+)\{([^{}]*)\}` retried a long brace-free run from every
// offset when it ended at `}` instead of `{`, so large inline stylesheets scanned in
// quadratic time and blew the 120 s audit timeout.
test('css rules: a long brace-free run before a stray } scans in linear time and later rules still count', () => {
  const audit = runScanner(framePage(`
    <style>${'a'.repeat(300000)}}
    @keyframes spin{from{transform:translateX(0)}to{transform:translateX(100px)}}
    .spinner{animation:1s spin;}</style>
    <main><div class="spinner"></div></main>
  `), { timeout: 10000 });
  assert.equal(motionFindings(audit).length, 1);
});

test('motion: transition:all is motion-bearing, matching inspect.md\'s manual checklist', () => {
  const audit = runScanner(framePage(`
    <style>.icon{transition:all .2s;}</style>
    <main><span class="icon">i</span></main>
  `));
  assert.equal(motionFindings(audit).length, 1);
});

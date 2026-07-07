// Beacon Phase A · static-audit detector tests (black-box via CLI).
// static-audit.mjs runs main() on import, so we exercise it as the CLI it is:
// write a fixture, run the scanner, assert on the emitted audit-results JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

function runScanner(html) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-detok-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'detector-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
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

const findingsMatching = (audit, titleRe, wcagRe) =>
  audit.findings.filter((f) => titleRe.test(f.title) && wcagRe.test(f.wcag));

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

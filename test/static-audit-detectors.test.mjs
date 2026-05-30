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
  assert.equal(hits[0].severity, 'warning');
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

test('link-name: image-wrapped links defer to img-alt; whitespace-only link is flagged', () => {
  const audit = runScanner(`<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main>
<a href="/named"><img src="/a.png" alt="Home"></a>
<a href="/altless"><img src="/b.png"></a>
<a href="/blank">   </a>
</main></body></html>`);
  // Links wrapping <img> are intentionally NOT flagged by link-name (avoids
  // false-positiving alt-named links); only the whitespace-only link is nameless.
  const linkHits = linkNameFindings(audit);
  assert.equal(linkHits.length, 1, `only the whitespace-only link should be a link-name hit, got ${linkHits.length}`);
  // The alt-less image is still surfaced — coverage is not silently lost.
  const imgAlt = audit.findings.filter((f) => /image/i.test(f.title) && /1\.1\.1/.test(f.wcag));
  assert.ok(imgAlt.length >= 1, 'alt-less <img> must still be flagged by img-alt');
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
<ol></ol>
</main></body></html>`);
  assert.equal(findingsMatching(ok, /list/i, /1\.3\.1/).length, 0, 'valid list, component, role-overridden list, empty list must not flag');
});

// Beacon validation charter L2/L3/L4 — executable property tests (see VALIDATION.md).
// L2 monotonicity: more confirmed violations never raise a score; fixing one never
//    lowers it.
// L3 injection dose-response: known violations injected into a clean page degrade the
//    score monotonically with dose (the ground truth is the injection itself).
// L4 cross-stack fairness: the same violation must be judged identically regardless of
//    framework markup dialect (React/Vue/web-component attribute noise).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

// A clean page that scores 100 on every Tier-1-scorable category.
const CLEAN = `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Readable page summary.">
<link rel="canonical" href="https://example.com/page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"x"}</script>
<style>.a{animation: spin 1s;} @media (prefers-reduced-motion: reduce){.a{animation: none;}}</style>
</head><body><main><h1>x</h1><a href="/x">Home</a>
<button>OK</button>
<label for="n">Name</label><input id="n" type="text">
<img alt="Team photo" src="t.png">
</main></body></html>`;

function audit(html) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-prop-'));
  try {
    writeFileSync(join(dir, 'page.html'), html);
    const out = join(dir, 'audit.json');
    execFileSync('node', [SCANNER, '--scope', 'prop', '--date', '2020-01-01', '--output', out, join(dir, 'page.html')], { stdio: 'pipe', cwd: dir });
    return JSON.parse(readFileSync(out, 'utf8'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const overall = (a) => a.summary.overall_score;
const catScore = (a, id) => a.summary.categories.find((c) => c.id === id).score;

// Injection library: each entry returns markup for ONE additional real violation.
const INJECTIONS = {
  'image-alt-missing': (i) => `<img src="v${i}.png">`,
  'button-name-missing': (i) => `<span data-x="${i}"></span><button></button>`,
  'link-name-missing': (i) => `<a href="/dead${i}"><img alt="" src="d${i}.png"></a>`,
  'input-label-missing': (i) => `<input type="text" name="u${i}">`,
  'frame-title-missing': (i) => `<iframe src="/f${i}.html"></iframe>`,
};

test('L3 injection dose-response: score degrades monotonically with injected dose', () => {
  const base = audit(CLEAN);
  assert.equal(overall(base), 100, 'the clean fixture must be clean');
  for (const [key, make] of Object.entries(INJECTIONS)) {
    let prev = 100;
    for (const dose of [1, 3, 6]) {
      const bad = CLEAN.replace('</main>', Array.from({ length: dose }, (_, i) => make(i)).join('\n') + '</main>');
      const score = overall(audit(bad));
      assert.ok(score < 100, `${key} x${dose} must cost points (got ${score})`);
      assert.ok(score <= prev, `${key}: dose ${dose} must not score above the smaller dose (${score} > ${prev})`);
      prev = score;
    }
  }
});

test('L2 monotonicity: fixing one violation never lowers any score', () => {
  const broken = CLEAN.replace('</main>', '<img src="a.png"><img src="b.png"><button></button></main>');
  const fixedOne = CLEAN.replace('</main>', '<img alt="A chart" src="a.png"><img src="b.png"><button></button></main>');
  const a = audit(broken), b = audit(fixedOne);
  assert.ok(overall(b) >= overall(a), `fixing an alt must not lower overall (${overall(b)} < ${overall(a)})`);
  assert.ok(catScore(b, 'screenreader') >= catScore(a, 'screenreader'), 'fixed category must not drop');
});

test('L2 monotonicity: adding a verified pass never lowers a score', () => {
  const more = CLEAN.replace('</main>', '<img alt="Second photo" src="s.png"><button>Send</button></main>');
  const a = audit(CLEAN), b = audit(more);
  assert.ok(overall(b) >= overall(a), 'extra compliant elements must not cost points');
});

// L4: identical violations dressed in different framework dialects must be judged the
// same. The React variant reproduces the data-rh attribute-order pattern that caused
// real false positives (booking.com); the web-component variant wraps in custom tags.
const STACK_VARIANTS = {
  plain: `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><main><h1>x</h1>
<img src="p.png"><button></button><input type="text">
</main></body></html>`,
  react: `<!DOCTYPE html><html lang="en"><head><title data-next-head="">t</title>
<meta data-rh="true" content="width=device-width, initial-scale=1" name="viewport">
</head><body data-reactroot=""><main><h1>x</h1>
<img data-reactid="7" src="p.png"><button data-reactid="8"></button><input data-reactid="9" type="text">
</main></body></html>`,
  vue: `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta content="width=device-width, initial-scale=1" name="viewport">
</head><body><main data-v-a1b2c3><h1 data-v-a1b2c3>x</h1>
<img data-v-a1b2c3 src="p.png"><button data-v-a1b2c3></button><input data-v-a1b2c3 type="text">
</main></body></html>`,
  webcomponent: `<!DOCTYPE html><html lang="en"><head><title>t</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><main class="hydrated"><h1>x</h1>
<my-card class="hydrated"><img src="p.png"><button></button><input type="text"></my-card>
</main></body></html>`,
};

test('L4 cross-stack fairness: the same violations get the same findings and scores in every dialect', () => {
  const results = Object.entries(STACK_VARIANTS).map(([stack, html]) => {
    const a = audit(html);
    const keys = a.findings.map((f) => f.key).sort().join(',');
    return { stack, keys, overall: overall(a) };
  });
  const [first, ...rest] = results;
  for (const r of rest) {
    assert.equal(r.keys, first.keys, `${r.stack} finding set must equal ${first.stack}'s`);
    assert.equal(r.overall, first.overall, `${r.stack} overall (${r.overall}) must equal ${first.stack}'s (${first.overall})`);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DESIGN_QA_VIEWPORTS, classifySnapshot, runDesignQa, summarizeRuns } from '../core/scripts/design-qa.mjs';
import { viewportsForLevel } from '../core/scripts/viewport-tiers.mjs';

// Fake Playwright: records newContext options, returns a snapshot-less page whose
// evaluate() yields a clean snapshot so classifySnapshot runs on real shapes.
function fakePlaywright(seen) {
  const snapshot = { document_scroll_width: 360, document_client_width: 360, element_overflows: [], text_columns: [], forbidden_fonts: [] };
  return {
    chromium: {
      async launch() {
        return {
          async newContext(options) {
            seen.push(options);
            return {
              async newPage() {
                return {
                  on() {}, async emulateMedia() {}, async goto() {}, async waitForLoadState() {},
                  async waitForTimeout() {}, async screenshot() {}, async evaluate() { return snapshot; }, async close() {},
                };
              },
              async close() { seen.push('closed'); },
            };
          },
          async close() {},
        };
      },
    },
  };
}

const clean = {
  document_scroll_width: 320,
  document_client_width: 320,
  element_overflows: [],
  text_columns: [{ selector: 'main p', width: 304 }],
  forbidden_fonts: [],
  page_errors: [],
  console_errors: [],
};

test('default matrix is the full level from viewport-tiers', () => {
  assert.deepEqual(DESIGN_QA_VIEWPORTS.map(item => item.width), [320, 360, 390, 744, 768, 844, 1280, 1920]);
  assert.deepEqual(DESIGN_QA_VIEWPORTS, viewportsForLevel('full'));
});

test('runDesignQa --level quick: two viewports, light only, mobile emulation passed to newContext, level in metadata', async () => {
  const seen = [];
  const dir = mkdtempSync(join(tmpdir(), 'beacon-dq-'));
  try {
    const artifact = await runDesignQa({ url: 'http://example.test', level: 'quick', screenshotDir: dir, playwrightModule: fakePlaywright(seen) });
    assert.equal(artifact.metadata.level, 'quick');
    assert.equal(artifact.metadata.engine_fingerprint, 'beacon-design-qa@2');
    assert.deepEqual(artifact.metadata.viewports, ['360x780', '1280x900']);
    assert.deepEqual(artifact.metadata.color_schemes, ['light']);
    assert.deepEqual(artifact.runs.map(r => r.viewport), ['360x780', '1280x900']);
    const contexts = seen.filter(x => x !== 'closed');
    assert.equal(contexts[0].isMobile, true);
    assert.equal(contexts[0].hasTouch, true);
    assert.equal(contexts[0].deviceScaleFactor, 3);
    assert.match(contexts[0].userAgent, /Mobile/);
    assert.deepEqual(contexts[0].viewport, { width: 360, height: 780 });
    assert.equal(contexts[1].isMobile, undefined);
    assert.equal(seen.filter(x => x === 'closed').length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runDesignQa defaults to level full with both schemes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-dq-'));
  try {
    const artifact = await runDesignQa({ url: 'http://example.test', screenshotDir: dir, playwrightModule: fakePlaywright([]) });
    assert.equal(artifact.metadata.level, 'full');
    assert.deepEqual(artifact.metadata.color_schemes, ['light', 'dark']);
    assert.equal(artifact.runs.length, 16);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI parses --level quick; unknown level exits non-zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-dq-cli-'));
  try {
    const fakePw = join(dir, 'fake-playwright.mjs');
    writeFileSync(fakePw, `
export const chromium = { async launch() { return {
  async newContext() { return {
    async newPage() { return { on() {}, async emulateMedia() {}, async goto() {}, async waitForLoadState() {}, async waitForTimeout() {}, async screenshot() {},
      async evaluate() { return { document_scroll_width: 360, document_client_width: 360, element_overflows: [], text_columns: [], forbidden_fonts: [] }; }, async close() {} }; },
    async close() {} }; },
  async close() {} }; } };
`);
    const out = join(dir, 'o', 'dq.json');
    const script = new URL('../core/scripts/design-qa.mjs', import.meta.url).pathname;
    const env = { ...process.env, PLAYWRIGHT_MODULE_PATH: fakePw };
    execFileSync('node', [script, '--url', 'http://example.test', '--level', 'quick', '--output', out, '--screenshots', join(dir, 's')], { env, stdio: 'pipe' });
    assert.ok(existsSync(out));
    assert.equal(JSON.parse(readFileSync(out, 'utf8')).metadata.level, 'quick');
    assert.throws(() => execFileSync('node', [script, '--url', 'http://example.test', '--level', 'bogus', '--output', out], { env, stdio: 'pipe' }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('clean machine checks pass while manual checks remain explicit', () => {
  const checks = classifySnapshot(clean, DESIGN_QA_VIEWPORTS[0]);
  const summary = summarizeRuns([{ checks }]);
  assert.equal(summary.machine_verdict, 'pass');
  assert.equal(summary.blocking_checks, 0);
  assert.match(summary.required_manual_checks[0], /browser zoom at 200%/i);
});

test('overflow, crushed text, forbidden fonts, and page errors block', () => {
  const checks = classifySnapshot({
    ...clean,
    document_scroll_width: 400,
    element_overflows: [{ selector: '.chips', scroll_width: 400, client_width: 300 }],
    text_columns: [{ selector: 'main p', width: 120 }],
    forbidden_fonts: [{ selector: 'body', font_family: 'PMingLiU' }],
    page_errors: ['boom'],
  }, DESIGN_QA_VIEWPORTS[0]);
  const summary = summarizeRuns([{ checks }]);
  assert.equal(summary.machine_verdict, 'blocked');
  assert.equal(summary.blocking_checks, 5);
});

test('capture failure makes the gate incomplete', () => {
  const summary = summarizeRuns([{ error: 'navigation failed', checks: [] }]);
  assert.equal(summary.machine_verdict, 'incomplete');
  assert.equal(summary.capture_failures, 1);
});

test('runDesignQa: newPage failure is recorded as a capture failure and the context is still closed', async () => {
  let closed = 0;
  const pw = { chromium: { async launch() { return {
    async newContext() { return { async newPage() { throw new Error('page boom'); }, async close() { closed++; } }; },
    async close() {},
  }; } } };
  const dir = mkdtempSync(join(tmpdir(), 'beacon-dq-'));
  try {
    const artifact = await runDesignQa({ url: 'http://example.test', level: 'quick', screenshotDir: dir, playwrightModule: pw });
    assert.equal(closed, 2);
    assert.equal(artifact.summary.capture_failures, 2);
    assert.match(artifact.runs[0].error, /page boom/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('category summary exposes completed states and inline disclosure controls', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-report-disclosure-'));
  try {
    const audit = join(dir, 'audit.json');
    const report = join(dir, 'report.html');
    writeFileSync(audit, JSON.stringify({
      metadata: { date: '2026-01-01', scope: 'test', url: 'https://example.com/test?page=1&mode=audit', standard: 'WCAG 2.2 AA' },
      summary: {
        overall_score: 100, coverage_percent: 10, total_findings: 0,
        critical: 0, warnings: 0, tips: 0,
        categories: [
          { id: 'contrast', name: 'Color & Contrast', pass: 0, fail: 0, review: 1, state: 'not-machine-checkable', score: null },
          { id: 'screenreader', name: 'Screen Reader', pass: 1, fail: 0, review: 0, state: 'scored', score: 100 },
        ],
      },
      findings: [],
      remediation: [{ priority: 'P0', key: 'html-lang-missing', title: 'Page language is missing', location: 'index.html:1', wcag: 'WCAG 2.2: 3.1.1', fix: 'Add lang.' }],
      testing_recommendations: [{ zh: '中文測試建議', en: 'English testing recommendation' }],
    }));
    execFileSync('node', [join(ROOT, 'core/scripts/generate-report.mjs'), audit, '--output', report]);
    const html = readFileSync(report, 'utf8');
    assert.match(html, /data-expand-categories/);
    assert.match(html, /data-category-toggle="contrast"[^>]*aria-expanded="false"/);
    assert.match(html, /id="detail-contrast" hidden/);
    assert.match(html, /已完成靜態掃描 · 需人工驗證/);
    assert.match(html, /受測網頁/);
    assert.match(html, /href="https:\/\/example\.com\/test\?page=1&amp;mode=audit" target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /P0/);
    assert.match(html, /index\.html:1/);
    assert.match(html, /加入正確的語言 attribute/);
    assert.match(html, /中文測試建議/);
    assert.match(html, /English testing recommendation/);
    assert.doesNotMatch(html, /category-row[^>]*role="button"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExtract } from '../core/scripts/lighthouse-extract.mjs';

// Minimal synthetic Lighthouse report (LH 13.x shape) exercising the paths that
// matter: accessibility exclusion, metric mapping, the dom-size-insight rename,
// opportunity filtering, and cross-cutting derivation.
function lhr({ nodes = 9868, tbtScore = 0.25, includeA11y = true } = {}) {
  const categories = {
    performance: { id: 'performance', title: 'Performance', score: 0.54 },
    'best-practices': { id: 'best-practices', title: 'Best Practices', score: 1, auditRefs: [{ id: 'valid-source-maps' }] },
    seo: { id: 'seo', title: 'SEO', score: 1, auditRefs: [{ id: 'document-title' }] },
  };
  if (includeA11y) categories.accessibility = { id: 'accessibility', title: 'Accessibility', score: 0.9 };
  return {
    lighthouseVersion: '13.3.0',
    fetchTime: '2026-06-06T00:00:00.000Z',
    requestedUrl: 'https://example.com/',
    finalDisplayedUrl: 'https://example.com/ja',
    configSettings: { formFactor: 'mobile' },
    categories,
    audits: {
      'first-contentful-paint': { title: 'First Contentful Paint', score: 0.67, numericValue: 2494, displayValue: '2.5 s' },
      'total-blocking-time': { title: 'Total Blocking Time', score: tbtScore, numericValue: 1067, displayValue: '1,070 ms' },
      'cumulative-layout-shift': { title: 'Cumulative Layout Shift', score: 1, numericValue: 0, displayValue: '0' },
      'mainthread-work-breakdown': {
        details: { items: [
          { groupLabel: 'Style & Layout', duration: 4011 },
          { groupLabel: 'Script Evaluation', duration: 1383 },
          { groupLabel: 'Idle', duration: 0 },
        ] },
      },
      // LH 13.x renamed dom-size -> dom-size-insight; node count lives in numericValue.
      'dom-size-insight': {
        title: 'Avoid an excessive DOM size', score: 1, numericValue: nodes,
        details: { type: 'table', items: [
          { statistic: 'Total elements', value: { type: 'numeric', value: nodes } },
          { statistic: 'DOM depth', value: { type: 'numeric', value: 15 } },
          { statistic: 'Most children', value: { type: 'numeric', value: 209 } },
        ] },
      },
      'unused-javascript': {
        title: 'Reduce unused JavaScript', score: 0, displayValue: 'Est savings of 102 KiB',
        details: { type: 'opportunity', overallSavingsMs: 450 },
      },
      // Opportunity-type but zero saving — must be filtered out.
      'render-blocking-resources': { title: 'Eliminate render-blocking resources', score: 1, details: { type: 'opportunity', overallSavingsMs: 0 } },
      'valid-source-maps': { title: 'Missing source maps for large first-party JavaScript', score: 0, scoreDisplayMode: 'metricSavings', displayValue: '' },
      'document-title': { title: 'Document has a <title> element', score: 1 },
    },
  };
}

test('excludes the accessibility category (axe-core owns a11y)', () => {
  const e = buildExtract(lhr());
  assert.deepEqual(e.categories.map((c) => c.id).sort(), ['best-practices', 'performance', 'seo']);
  assert.ok(!e.categories.some((c) => c.id === 'accessibility'));
});

test('maps category and metric scores to 0-100 integers', () => {
  const e = buildExtract(lhr());
  assert.equal(e.categories.find((c) => c.id === 'performance').score, 54);
  const tbt = e.metrics.find((m) => m.key === 'tbt');
  assert.equal(tbt.score, 25);
  assert.equal(tbt.ms, 1067);
  assert.equal(tbt.value, '1,070 ms');
});

test('reads node count from dom-size-insight (LH 13.x rename)', () => {
  const e = buildExtract(lhr({ nodes: 9868 }));
  assert.equal(e.dom.nodes, 9868);
  assert.equal(e.dom.depth, 15);
  assert.equal(e.dom.maxChildren, 209);
});

test('main-thread breakdown is sorted desc and drops zero-duration groups', () => {
  const e = buildExtract(lhr());
  assert.deepEqual(e.mainthread.map((m) => m.group), ['Style & Layout', 'Script Evaluation']);
  assert.equal(e.mainthread[0].ms, 4011);
});

test('opportunities keep only opportunity-type audits with real savings', () => {
  const e = buildExtract(lhr());
  assert.equal(e.opportunities.length, 1);
  assert.equal(e.opportunities[0].id, 'unused-javascript');
  assert.equal(e.opportunities[0].savings_ms, 450);
});

test('large-dom cross-cutting fires above 1400 nodes and spans three dimensions', () => {
  const e = buildExtract(lhr({ nodes: 9868 }));
  const large = e.cross_cutting.find((c) => c.signal === 'large-dom');
  assert.ok(large, 'large-dom signal should be present');
  assert.deepEqual(large.affects.sort(), ['a11y', 'aeo', 'performance']);
});

test('large-dom cross-cutting does NOT fire for a small DOM', () => {
  const e = buildExtract(lhr({ nodes: 600 }));
  assert.ok(!e.cross_cutting.some((c) => c.signal === 'large-dom'));
});

test('main-thread-blocking cross-cutting fires on low TBT score', () => {
  const e = buildExtract(lhr({ tbtScore: 0.25 }));
  assert.ok(e.cross_cutting.some((c) => c.signal === 'main-thread-blocking'));
  const ok = buildExtract(lhr({ tbtScore: 0.95 }));
  assert.ok(!ok.cross_cutting.some((c) => c.signal === 'main-thread-blocking'));
});

test('handles a sparse report (no audits) without throwing', () => {
  const e = buildExtract({ categories: { performance: { id: 'performance', title: 'Performance', score: 0.8 } } });
  assert.equal(e.dom, null);
  assert.deepEqual(e.metrics, []);
  assert.deepEqual(e.cross_cutting, []);
});

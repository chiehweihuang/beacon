#!/usr/bin/env node
/**
 * Lighthouse extractor — normalize a raw Lighthouse JSON report into the compact
 * `lighthouse` object that Beacon's audit-results.json carries and
 * generate-report.mjs renders.
 *
 * Beacon scores accessibility with axe-core (stronger than Lighthouse's a11y
 * subset). Lighthouse is used ONLY for the categories axe does not cover —
 * performance, best-practices, seo — and the result is a SUPPLEMENTARY signal:
 * it is NOT folded into the Beacon accessibility score. Performance numbers swing
 * run-to-run with device emulation, CPU throttle, and machine load, so they are
 * presented as directional, with cross-cutting root causes (e.g. an oversized DOM
 * that hurts a11y, performance, and AEO at once) called out explicitly.
 *
 * Usage:
 *   # Run Lighthouse first (exclude accessibility — axe covers it):
 *   npx lighthouse <url> --only-categories=performance,best-practices,seo \
 *     --output=json --output-path=lh.json --quiet --chrome-flags="--headless=new"
 *
 *   # Then normalize:
 *   node lighthouse-extract.mjs lh.json                 # prints normalized JSON to stdout
 *   node lighthouse-extract.mjs lh.json --output lh-extract.json
 *   node lighthouse-extract.mjs lh.json --merge audit-results.json
 *       # writes the normalized object into audit-results.json under the "lighthouse" key
 *
 * No external dependencies. Defensive: any audit Lighthouse omits is skipped, not
 * fatal. A report missing every performance category still produces a valid (if
 * sparse) object.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const NOTE_ZH =
  'Lighthouse 分數會隨裝置模擬、CPU 降速與機器負載逐次浮動，請當作方向性參考、非絕對值。' +
  '此區塊為輔助訊號，不計入 Beacon 的無障礙(a11y)主分數。';
const NOTE_EN =
  'Lighthouse scores swing run-to-run with device emulation, CPU throttle, and machine load — ' +
  'treat them as directional, not absolute. This section is a supplementary signal and is NOT ' +
  "folded into Beacon's accessibility score.";

// Core Web Vitals + lab metrics, in the order we want to present them.
const METRIC_DEFS = [
  { id: 'first-contentful-paint', key: 'fcp', label: 'First Contentful Paint' },
  { id: 'largest-contentful-paint', key: 'lcp', label: 'Largest Contentful Paint' },
  { id: 'total-blocking-time', key: 'tbt', label: 'Total Blocking Time' },
  { id: 'cumulative-layout-shift', key: 'cls', label: 'Cumulative Layout Shift' },
  { id: 'speed-index', key: 'si', label: 'Speed Index' },
  { id: 'interactive', key: 'tti', label: 'Time to Interactive' },
];

const pct = (score) => (score == null ? null : Math.round(score * 100));

function extractCategories(lhr) {
  const out = [];
  for (const cat of Object.values(lhr.categories || {})) {
    if (cat.id === 'accessibility') continue; // axe-core owns a11y
    out.push({ id: cat.id, title: cat.title, score: pct(cat.score) });
  }
  return out;
}

function extractMetrics(audits) {
  const out = [];
  for (const def of METRIC_DEFS) {
    const a = audits[def.id];
    if (!a) continue;
    out.push({
      id: def.id,
      key: def.key,
      label: def.label,
      value: a.displayValue || null,
      ms: a.numericValue != null ? Math.round(a.numericValue) : null,
      score: pct(a.score),
    });
  }
  return out;
}

function extractMainThread(audits) {
  const items = audits['mainthread-work-breakdown']?.details?.items || [];
  return items
    .map((i) => ({ group: i.groupLabel || i.group || 'Other', ms: Math.round(i.duration || 0) }))
    .filter((i) => i.ms > 0)
    .sort((a, b) => b.ms - a.ms);
}

// DOM size audit shape varies across Lighthouse versions: the audit id is
// `dom-size` (<=12) or `dom-size-insight` (13.x), and items carry {statistic,
// value} where value is a number OR {type:'numeric', value:N}.
function extractDom(audits) {
  const a = audits['dom-size'] || audits['dom-size-insight'];
  if (!a) return null;
  const num = (v) => (v && typeof v === 'object' ? v.value : v);
  const items = a.details?.items || [];
  const find = (re) => items.find((i) => re.test(i.statistic || i.title || ''));
  const total = find(/total|element/i);
  const depth = find(/depth/i);
  const child = find(/child/i);
  const dom = {
    nodes: total ? Number(num(total.value)) : a.numericValue != null ? Math.round(a.numericValue) : null,
    depth: depth ? Number(num(depth.value)) : null,
    maxChildren: child ? Number(num(child.value)) : null,
  };
  return dom.nodes ? dom : null;
}

// Actionable opportunities: audits Lighthouse marks as opportunity-type with a
// real estimated saving. Metric audits (FCP/LCP/TBT/…) are excluded — they are
// already rendered in the metrics table, not actions to take. Sorted by saving.
function extractOpportunities(audits) {
  const rows = [];
  for (const [id, a] of Object.entries(audits)) {
    if (!a || a.details?.type !== 'opportunity') continue;
    const savings = a.details?.overallSavingsMs || a.metricSavings?.LCP || 0;
    if (savings <= 0) continue;
    rows.push({ id, title: a.title, value: a.displayValue || '', savings_ms: Math.round(savings), score: pct(a.score) });
  }
  rows.sort((p, q) => (q.savings_ms || 0) - (p.savings_ms || 0));
  return rows.slice(0, 12);
}

// Failing audits within a specific category (best-practices / seo), by auditRef.
function extractCategoryIssues(lhr, categoryId) {
  const cat = lhr.categories?.[categoryId];
  if (!cat) return [];
  const issues = [];
  for (const ref of cat.auditRefs || []) {
    const a = lhr.audits?.[ref.id];
    if (!a || a.score == null || a.score >= 1) continue;
    if (a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'informative') continue;
    issues.push({ id: ref.id, title: a.title, value: a.displayValue || '' });
  }
  return issues;
}

// The value-add: signals where ONE root cause spans multiple Beacon dimensions.
// Lighthouse alone reports "performance slow"; this maps the cause to a11y + AEO.
function deriveCrossCutting(extract) {
  const out = [];
  const dom = extract.dom;
  if (dom && dom.nodes && dom.nodes > 1400) {
    out.push({
      signal: 'large-dom',
      title_zh: `超大 DOM(${dom.nodes.toLocaleString('en-US')} 個節點)`,
      title_en: `Oversized DOM (${dom.nodes.toLocaleString('en-US')} nodes)`,
      detail_zh:
        '過大的 DOM 同時拖累三個維度:瀏覽器樣式計算與排版變慢(performance)、螢幕報讀器要走完的節點過多(a11y)、' +
        'AI 爬蟲解析頁面結構困難(AEO)。建議分頁、虛擬化或摺疊長清單,把節點數壓到 1,400 以內。',
      detail_en:
        'An oversized DOM hurts three dimensions at once: slower style & layout (performance), too many nodes for a ' +
        'screen reader to traverse (a11y), and harder structure extraction for AI crawlers (AEO). Paginate, virtualize, ' +
        'or collapse long lists to bring node count under ~1,400.',
      affects: ['performance', 'a11y', 'aeo'],
    });
  }
  const tbt = (extract.metrics || []).find((m) => m.key === 'tbt');
  if (tbt && tbt.score != null && tbt.score < 50) {
    out.push({
      signal: 'main-thread-blocking',
      title_zh: `主執行緒長時間阻塞(TBT ${tbt.value || tbt.ms + 'ms'})`,
      title_en: `Main thread heavily blocked (TBT ${tbt.value || tbt.ms + 'ms'})`,
      detail_zh:
        '長任務占住主執行緒會同時延遲視覺繪製與互動回應;鍵盤與輔助技術使用者感受到的延遲往往更明顯。' +
        '減少 JS 執行、code-split、延後非關鍵 hydration。',
      detail_en:
        'Long tasks holding the main thread delay both paint and interactivity; keyboard and assistive-tech users often ' +
        'feel the lag more acutely. Reduce JS execution, code-split, and defer non-critical hydration.',
      affects: ['performance', 'a11y'],
    });
  }
  return out;
}

export function buildExtract(lhr) {
  const audits = lhr.audits || {};
  const extract = {
    source: 'lighthouse',
    version: lhr.lighthouseVersion || null,
    fetched_at: lhr.fetchTime || null,
    form_factor: lhr.configSettings?.formFactor || null,
    requested_url: lhr.requestedUrl || null,
    final_url: lhr.finalUrl || lhr.finalDisplayedUrl || null,
    note_zh: NOTE_ZH,
    note_en: NOTE_EN,
    categories: extractCategories(lhr),
    metrics: extractMetrics(audits),
    mainthread: extractMainThread(audits),
    dom: extractDom(audits),
    opportunities: extractOpportunities(audits),
    best_practices_issues: extractCategoryIssues(lhr, 'best-practices'),
    seo_issues: extractCategoryIssues(lhr, 'seo'),
  };
  extract.cross_cutting = deriveCrossCutting(extract);
  return extract;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: node lighthouse-extract.mjs <lighthouse-json> [--output <path>] [--merge <audit-results.json>]');
    process.exit(1);
  }
  const lhPath = resolve(args[0]);
  let outputPath = null;
  let mergePath = null;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) outputPath = resolve(args[++i]);
    if (args[i] === '--merge' && args[i + 1]) mergePath = resolve(args[++i]);
  }

  const lhr = JSON.parse(readFileSync(lhPath, 'utf8'));
  if (!lhr.categories && !lhr.audits) {
    console.error(`error: ${lhPath} does not look like a Lighthouse report (no categories/audits).`);
    process.exit(1);
  }
  const extract = buildExtract(lhr);

  if (mergePath) {
    const audit = JSON.parse(readFileSync(mergePath, 'utf8'));
    audit.lighthouse = extract;
    writeFileSync(mergePath, JSON.stringify(audit, null, 2));
    console.error(`merged lighthouse signal into ${mergePath}`);
  } else if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(extract, null, 2));
    console.error(`wrote ${outputPath}`);
  } else {
    process.stdout.write(JSON.stringify(extract, null, 2) + '\n');
  }
}

// Run the CLI only when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

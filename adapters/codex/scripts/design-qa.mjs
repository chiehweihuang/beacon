#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPlaywright } from './tier2-audit.mjs';
import { LEVELS, schemesForLevel, viewportsForLevel } from './viewport-tiers.mjs';

export const DESIGN_QA_VIEWPORTS = viewportsForLevel('full');

const ENGINE = 'beacon-design-qa@2';

function check(id, status, evidence) {
  return { id, status, evidence };
}

export function classifySnapshot(snapshot, viewport) {
  const minReadable = Math.max(240, Math.min(320, viewport.width - 16));
  const narrowText = snapshot.text_columns.filter(item => item.width + 1 < minReadable);
  return [
    check('document-horizontal-overflow', snapshot.document_scroll_width > snapshot.document_client_width + 1 ? 'blocked' : 'pass', {
      scroll_width: snapshot.document_scroll_width,
      client_width: snapshot.document_client_width,
    }),
    check('element-horizontal-overflow', snapshot.element_overflows.length ? 'blocked' : 'pass', snapshot.element_overflows),
    check('readable-text-width', narrowText.length ? 'blocked' : 'pass', {
      minimum_css_px: minReadable,
      narrow_columns: narrowText,
      sampled_columns: snapshot.text_columns.length,
    }),
    check('forbidden-font-fallback', snapshot.forbidden_fonts.length ? 'blocked' : 'pass', snapshot.forbidden_fonts),
    check('page-errors', snapshot.page_errors.length ? 'blocked' : 'pass', snapshot.page_errors),
    check('console-errors', snapshot.console_errors.length ? 'review' : 'pass', snapshot.console_errors),
  ];
}

export function summarizeRuns(runs) {
  const checks = runs.flatMap(run => run.checks || []);
  const blocking = checks.filter(item => item.status === 'blocked').length;
  const review = checks.filter(item => item.status === 'review').length;
  const captureFailures = runs.filter(run => run.error).length;
  return {
    machine_verdict: captureFailures ? 'incomplete' : blocking ? 'blocked' : 'pass',
    blocking_checks: blocking,
    review_checks: review,
    capture_failures: captureFailures,
    required_manual_checks: [
      'Actual browser zoom at 200%; CSS zoom, DPR, deviceScaleFactor, and narrow viewport substitution are not evidence.',
      'Viewport-level dead space and visual balance.',
      'Every supported locale, theme, and significant interaction state.',
      'Content hierarchy, cropping, overlap, and human visual quality.',
    ],
  };
}

function loadableUrl(input) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : pathToFileURL(resolve(input)).href;
}

async function captureSnapshot(page, pageErrors, consoleErrors) {
  const snapshot = await page.evaluate(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const selector = element => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const classes = [...element.classList].slice(0, 2).map(value => `.${CSS.escape(value)}`).join('');
      return `${element.tagName.toLowerCase()}${classes}`;
    };
    const all = [...document.querySelectorAll('*')].filter(visible);
    const elementOverflows = all
      .filter(element => element.scrollWidth > element.clientWidth + 1)
      .slice(0, 25)
      .map(element => ({ selector: selector(element), scroll_width: element.scrollWidth, client_width: element.clientWidth }));
    const textColumns = [...document.querySelectorAll('main p, main li, article p, article li, [role="main"] p, [role="main"] li')]
      .filter(element => visible(element) && (element.textContent || '').trim().length >= 80)
      .slice(0, 50)
      .map(element => ({ selector: selector(element), width: Math.round(element.getBoundingClientRect().width) }));
    const forbiddenFonts = all
      .filter(element => /(?:p?mingliu)/i.test(getComputedStyle(element).fontFamily))
      .slice(0, 25)
      .map(element => ({ selector: selector(element), font_family: getComputedStyle(element).fontFamily }));
    const root = document.documentElement;
    return {
      document_scroll_width: root.scrollWidth,
      document_client_width: root.clientWidth,
      element_overflows: elementOverflows,
      text_columns: textColumns,
      forbidden_fonts: forbiddenFonts,
    };
  });
  return { ...snapshot, page_errors: pageErrors, console_errors: consoleErrors };
}

export async function runDesignQa({ url, screenshotDir = 'reports/design-qa/screenshots', date, playwrightModule, level = 'full', viewports = viewportsForLevel(level), schemes = schemesForLevel(level) } = {}) {
  const pw = playwrightModule || await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true });
  const target = loadableUrl(url);
  const runs = [];
  mkdirSync(screenshotDir, { recursive: true });
  try {
    for (const scheme of schemes) {
      for (const viewport of viewports) {
        const { width, height, emulate } = viewport;
        const pageErrors = [];
        const consoleErrors = [];
        const screenshot = resolve(screenshotDir, `${scheme}-${viewport.width}.png`);
        let context;
        try {
          context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, ...emulate });
          const page = await context.newPage();
          page.on('pageerror', error => pageErrors.push(String(error.message || error)));
          page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
          await page.goto(target, { waitUntil: 'domcontentloaded' });
          await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(500);
          const snapshot = await captureSnapshot(page, pageErrors, consoleErrors);
          await page.screenshot({ path: screenshot, fullPage: true });
          const checks = classifySnapshot(snapshot, viewport);
          runs.push({ scheme, viewport: viewport.label, screenshot, checks });
        } catch (error) {
          runs.push({ scheme, viewport: viewport.label, screenshot: null, error: String(error.message || error), checks: [] });
        } finally {
          if (context) await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return {
    metadata: {
      date: date || new Date().toISOString().slice(0, 10),
      url,
      engine_fingerprint: ENGINE,
      level,
      viewports: viewports.map(item => item.label),
      color_schemes: schemes,
    },
    summary: summarizeRuns(runs),
    runs,
  };
}

function usage() {
  console.error('Usage: node design-qa.mjs --url <url-or-file> [--level quick|feature|full] [--output design-qa.json] [--screenshots dir] [--date yyyy-mm-dd]');
  process.exit(1);
}

function parseArgs(argv) {
  const options = { url: null, level: 'full', output: 'reports/design-qa/design-qa.json', screenshotDir: 'reports/design-qa/screenshots', date: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--url') options.url = argv[++index] || usage();
    else if (arg === '--level') options.level = LEVELS.includes(argv[index + 1]) ? argv[++index] : usage();
    else if (arg === '--output') options.output = argv[++index] || usage();
    else if (arg === '--screenshots') options.screenshotDir = argv[++index] || usage();
    else if (arg === '--date') options.date = argv[++index] || usage();
    else usage();
  }
  if (!options.url) usage();
  return options;
}

if (process.argv[1] && basename(process.argv[1]) === 'design-qa.mjs') {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await runDesignQa(options);
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${options.output}`);
  console.log(`Design QA: ${artifact.summary.machine_verdict}; ${artifact.summary.blocking_checks} blocking, ${artifact.summary.review_checks} review, ${artifact.summary.capture_failures} capture failure(s).`);
  process.exitCode = artifact.summary.capture_failures ? 3 : artifact.summary.blocking_checks ? 2 : 0;
}

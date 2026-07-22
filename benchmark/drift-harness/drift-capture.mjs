// Drift experiment capture (VALIDATION.md L0): recapture the drift subset from the
// target registry (targets.json) and audit with the CURRENT engine, emitting a
// results.json comparable by beacon/tools/drift-compare.mjs. Never touches run-2026-07-05.
//
//   node drift-capture.mjs --run run-2026-07-07-drift --date 2026-07-07
//
// Site selection comes from targets.mjs (role 'drift', status 'active'); every capture
// outcome is written back so the registry maintains itself.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { select, recordCapture } from './targets.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright-core');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const RUN = resolve(ROOT, arg('--run', null) ?? (() => { throw new Error('--run required'); })());
const DATE = arg('--date', null) ?? (() => { throw new Error('--date required'); })();
const SNAP = resolve(RUN, 'snapshots');
const AUD = resolve(RUN, 'audits');
const SCANNER = 'C:/Code/personal/beacon/core/scripts/static-audit.mjs';
const CHROME = 'C:/Users/tacit/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const CONCURRENCY = 3;

mkdirSync(SNAP, { recursive: true });
mkdirSync(AUD, { recursive: true });

const sites = select({ role: 'drift' }).map((t) => ({ idx: t.id, url: t.url, band: t.band }));
if (!sites.length) throw new Error('registry returned no active drift sites — check targets.json');

const BOT_WALL = /just a moment|attention required|access denied|are you a robot|verify you are human|enable javascript and cookies|checking your browser|challenge-platform/i;

async function captureOne(browser, site) {
  const out = { idx: site.idx, url: site.url, band: site.band, capture: 'ok', error: null };
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title().catch(() => '');
    if (BOT_WALL.test(title) || BOT_WALL.test(html.slice(0, 4000))) out.capture = 'bot_protected';
    writeFileSync(resolve(SNAP, `${site.idx}.html`), html);
    out.bytes = html.length;
  } catch (e) {
    out.capture = 'failed';
    out.error = String(e.message || e).slice(0, 200);
  } finally {
    await ctx.close().catch(() => {});
  }
  return out;
}

async function captureAll() {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const queue = [...sites];
  const results = [];
  async function worker() {
    while (queue.length) {
      const site = queue.shift();
      let r = await captureOne(browser, site);
      if (r.capture === 'failed') r = await captureOne(browser, site);
      results.push(r);
      const flip = recordCapture(site.idx, r.capture, DATE);
      console.log(`[${results.length}/${sites.length}] ${r.capture} ${site.url}${r.error ? ' — ' + r.error : ''}`);
      if (flip) console.log(`REGISTRY: ${flip}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  return results.sort((a, b) => a.idx - b.idx);
}

function auditOne(site) {
  const out = resolve(AUD, `${site.idx}.json`);
  execFileSync('node', [SCANNER, '--scope', site.url, '--url', site.url, '--date', DATE, '--output', out, resolve(SNAP, `${site.idx}.html`)], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

const captures = await captureAll();
writeFileSync(resolve(RUN, 'capture-log.json'), JSON.stringify(captures, null, 2));
const rows = [];
for (const site of sites) {
  const cap = captures.find((c) => c.idx === site.idx) || { capture: 'missing' };
  let audit = null;
  if (cap.capture !== 'failed') {
    try { audit = auditOne(site); }
    catch (e) { console.error(`audit failed for ${site.idx}: ${String(e.message).slice(0, 120)}`); }
  }
  rows.push({
    idx: site.idx,
    url: site.url,
    band: site.band,
    capture: cap.capture,
    beacon_overall: audit?.summary?.overall_score ?? null,
    coverage_percent: audit?.summary?.coverage_percent ?? null,
    findings: audit?.summary?.total_findings ?? null,
    engine: audit?.metadata?.engine_fingerprint ?? null,
  });
}
writeFileSync(resolve(RUN, 'results.json'), JSON.stringify(rows, null, 2));
console.log(`done: ${rows.filter((r) => r.capture === 'ok').length}/${rows.length} ok -> ${resolve(RUN, 'results.json')}`);

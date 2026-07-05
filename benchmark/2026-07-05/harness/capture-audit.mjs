// Beacon benchmark run: capture rendered DOM for the 88 benchmark sites, run the
// static-audit@3 engine on each snapshot, and emit paired results against the
// existing Lighthouse data (raw/*-rec.json).
//
//   node capture-audit.mjs            full run (capture + audit + pairs)
//   node capture-audit.mjs --audit-only   re-run audits on existing snapshots
//
// Output: run-2026-07-05/{snapshots,audits}/*, results.json, pairs.csv

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright-core');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const RUN = resolve(ROOT, 'run-2026-07-05');
const SNAP = resolve(RUN, 'snapshots');
const AUD = resolve(RUN, 'audits');
const SCANNER = 'C:/Code/personal/beacon/core/scripts/static-audit.mjs';
const CHROME = 'C:/Users/tacit/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DATE = '2026-07-05';
const CONCURRENCY = 3;
const AUDIT_ONLY = process.argv.includes('--audit-only');

mkdirSync(SNAP, { recursive: true });
mkdirSync(AUD, { recursive: true });

// Load the site list from raw/*-rec.json (index = filename prefix).
const sites = readdirSync(resolve(ROOT, 'raw'))
  .filter((f) => /^\d+-rec\.json$/.test(f)) // skip stray non-numeric artifacts (test-rec.json)
  .map((f) => {
    const idx = Number(f.split('-')[0]);
    const rec = JSON.parse(readFileSync(resolve(ROOT, 'raw', f), 'utf8'));
    return { idx, ...rec };
  })
  .sort((a, b) => a.idx - b.idx);

const BOT_WALL = /just a moment|attention required|access denied|are you a robot|verify you are human|enable javascript and cookies|checking your browser|challenge-platform/i;

async function captureOne(browser, site) {
  const out = { idx: site.idx, url: site.url, band: site.band, capture: 'ok', error: null };
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000); // settle lazy renders
    const html = await page.content();
    const title = await page.title().catch(() => '');
    if (BOT_WALL.test(title) || BOT_WALL.test(html.slice(0, 4000))) {
      out.capture = 'bot_protected';
    }
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
      if (r.capture === 'failed') r = await captureOne(browser, site); // one retry
      results.push(r);
      console.log(`[${results.length}/${sites.length}] ${r.capture} ${site.url}${r.error ? ' — ' + r.error : ''}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  return results.sort((a, b) => a.idx - b.idx);
}

function auditOne(site) {
  const snap = resolve(SNAP, `${site.idx}.html`);
  if (!existsSync(snap)) return null;
  const out = resolve(AUD, `${site.idx}.json`);
  execFileSync('node', [SCANNER, '--scope', site.url, '--url', site.url, '--date', DATE, '--output', out, snap], { stdio: 'pipe' });
  return JSON.parse(readFileSync(out, 'utf8'));
}

function main() {
  return (AUDIT_ONLY ? Promise.resolve(JSON.parse(readFileSync(resolve(RUN, 'capture-log.json'), 'utf8'))) : captureAll())
    .then((captures) => {
      if (!AUDIT_ONLY) writeFileSync(resolve(RUN, 'capture-log.json'), JSON.stringify(captures, null, 2));

      const rows = [];
      for (const site of sites) {
        const cap = captures.find((c) => c.idx === site.idx) || { capture: 'missing' };
        let audit = null;
        try { audit = auditOne(site); }
        catch (e) { console.error(`audit failed for ${site.idx}: ${String(e.message).slice(0, 120)}`); }
        const cats = Object.fromEntries((audit?.summary?.categories || []).map((c) => [c.id, { state: c.state, score: c.score, pass: c.pass, fail: c.fail }]));
        rows.push({
          idx: site.idx,
          url: site.url,
          band: site.band,
          lh_ok: site.ok,
          lh_a11y: site.a11y ?? null,
          capture: cap.capture,
          beacon_overall: audit?.summary?.overall_score ?? null,
          coverage_percent: audit?.summary?.coverage_percent ?? null,
          confidence: audit?.metadata?.confidence_level ?? null,
          life_safety: audit?.summary?.life_safety_flag ?? null,
          findings: audit?.summary?.total_findings ?? null,
          critical: audit?.summary?.critical ?? null,
          engine: audit?.metadata?.engine_fingerprint ?? null,
          categories: cats,
        });
      }
      writeFileSync(resolve(RUN, 'results.json'), JSON.stringify(rows, null, 2));

      const csvHead = 'idx,band,lh_ok,lh_a11y,capture,beacon_overall,coverage_percent,confidence,findings,critical,url';
      const csv = rows.map((r) => [r.idx, r.band, r.lh_ok, r.lh_a11y, r.capture, r.beacon_overall, r.coverage_percent, r.confidence, r.findings, r.critical, r.url].join(','));
      writeFileSync(resolve(RUN, 'pairs.csv'), [csvHead, ...csv].join('\n'));

      const paired = rows.filter((r) => r.lh_ok && r.lh_a11y != null && r.capture === 'ok' && r.beacon_overall != null);
      console.log(`done: ${rows.length} sites, ${paired.length} clean pairs -> ${resolve(RUN, 'pairs.csv')}`);
    });
}

main().catch((e) => { console.error(e); process.exit(1); });

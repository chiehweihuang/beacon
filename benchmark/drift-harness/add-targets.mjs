// Candidate intake: validate and register NEW benchmark targets automatically.
//
//   node add-targets.mjs candidates.json
//
// For each candidate {url, band, tags}: capture with the pinned recipe → if the page
// is reachable and not bot-walled, run Lighthouse (accessibility only) for pairing
// data → write raw/{id}-rec.json → register in targets.json (role 'benchmark').
// Bot-walled/failed candidates are registered too (status walled/dead) so the attempt
// is on record and nothing retries them blindly. Ids start at 100 and never reuse.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { registerTarget, nextFreeId } from './targets.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright-core');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const CHROME = 'C:/Users/tacit/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DATE = new Date().toISOString().slice(0, 10);
const BOT_WALL = /just a moment|attention required|access denied|are you a robot|verify you are human|enable javascript and cookies|checking your browser|challenge-platform/i;

const candidatesFile = process.argv[2];
if (!candidatesFile) { console.error('usage: node add-targets.mjs <candidates.json>'); process.exit(1); }
const candidates = JSON.parse(readFileSync(resolve(ROOT, candidatesFile), 'utf8'));

mkdirSync(resolve(ROOT, 'intake-snapshots'), { recursive: true });

async function captureProbe(browser, url) {
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title().catch(() => '');
    if (BOT_WALL.test(title) || BOT_WALL.test(html.slice(0, 4000))) return { outcome: 'bot_protected' };
    return { outcome: 'ok', html };
  } catch (e) {
    return { outcome: 'failed', error: String(e.message || e).slice(0, 150) };
  } finally {
    await ctx.close().catch(() => {});
  }
}

function lighthouseA11y(url) {
  const out = resolve(ROOT, 'intake-snapshots', `lh-tmp.json`);
  rmSync(out, { force: true });
  try {
    execFileSync('npx', ['lighthouse', url, '--only-categories=accessibility', '--output=json', `--output-path=${out}`, '--quiet', '--chrome-flags=--headless=new'], { stdio: 'pipe', timeout: 180000, shell: true });
  } catch {
    // chrome-launcher's temp-profile cleanup hits EPERM on Windows and exits 1
    // AFTER the report is written — always try the output file, whatever the exit.
  }
  try {
    const lh = JSON.parse(readFileSync(out, 'utf8'));
    const score = lh.categories?.accessibility?.score;
    return score == null ? null : Math.round(score * 100);
  } catch {
    return null;
  }
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const added = [];
for (const c of candidates) {
  const probe = await captureProbe(browser, c.url);
  // Fresh id at registration time: the registry is re-read per entry (never held
  // across the run), so concurrent intake processes cannot clobber each other.
  const id = nextFreeId(100);
  let a11y = null;
  if (probe.outcome === 'ok') {
    writeFileSync(resolve(ROOT, 'intake-snapshots', `${id}.html`), probe.html);
    a11y = lighthouseA11y(c.url);
    writeFileSync(resolve(ROOT, 'raw', `${id}-rec.json`), JSON.stringify({ url: c.url, band: c.band, ok: a11y != null, a11y }, null, 2));
  }
  const target = {
    id,
    url: c.url,
    band: c.band,
    tags: c.tags || [],
    roles: ['benchmark'],
    status: probe.outcome === 'ok' ? 'active' : probe.outcome === 'bot_protected' ? 'walled' : 'dead',
    capture_streak: probe.outcome === 'ok' ? 0 : 1,
    last_ok: probe.outcome === 'ok' ? DATE : null,
    added: DATE,
    notes: probe.outcome === 'ok' ? (a11y == null ? 'lighthouse failed at intake; no pairing data' : '') : `${probe.outcome} at intake${probe.error ? ': ' + probe.error : ''}`,
  };
  if (!registerTarget(target)) { console.log(`skip (already registered): ${c.url}`); continue; }
  added.push(target);
  console.log(`[${added.length}/${candidates.length}] id ${id}  ${target.status.padEnd(6)}  lh_a11y ${a11y ?? '—'}  ${c.url}`);
}
await browser.close();

const okN = added.filter((t) => t.status === 'active').length;
console.log(`registered ${added.length} candidates (${okN} active)`);

// Nightly survey-tier intake: consume the next chunk of survey-queue.json.
//
//   node survey-intake.mjs [--chunk 300]
//
// Per site: capture with the pinned recipe (3 workers) → gzip snapshot into
// survey-snapshots/ → run the CURRENT Beacon engine → store the audit JSON in
// survey-audits/ → register in targets.json (role 'survey'; status per outcome;
// language tag read from the captured <html lang>). No Lighthouse at this tier.
// Appends one summary line per run to survey-log.jsonl and advances the queue cursor.
// Scheduled as Windows task 'beacon-survey-intake' (nightly); ~300 sites/night
// reaches 10,000 in about a month. Pure measurement bookkeeping — no AI.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { registerTarget, nextFreeId } from './targets.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright-core');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const CHROME = 'C:/Users/tacit/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const SCANNER = 'C:/Code/personal/beacon/core/scripts/static-audit.mjs';
const DATE = new Date().toISOString().slice(0, 10);
const BOT_WALL = /just a moment|attention required|access denied|are you a robot|verify you are human|enable javascript and cookies|checking your browser|challenge-platform/i;
const CONCURRENCY = 3;

const chunkIdx = process.argv.indexOf('--chunk');
const CHUNK = chunkIdx !== -1 ? Number(process.argv[chunkIdx + 1]) : 300;

mkdirSync(resolve(ROOT, 'survey-snapshots'), { recursive: true });
mkdirSync(resolve(ROOT, 'survey-audits'), { recursive: true });

const qFile = resolve(ROOT, 'survey-queue.json');
const q = JSON.parse(readFileSync(qFile, 'utf8'));
const batch = q.queue.slice(q.cursor, q.cursor + CHUNK);
if (!batch.length) { console.log('survey queue exhausted — run source-targets.mjs --build to extend'); process.exit(0); }

const stats = { ok: 0, bot_protected: 0, failed: 0 };
// Per-entry registration (targets.mjs registerTarget) re-reads the registry at each
// insert, so this long-running batch never clobbers concurrent writers. Id allocation
// + registration are serialized through one in-process mutex to keep workers from
// racing each other.
let regLock = Promise.resolve();

async function captureOne(browser, url) {
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
  } catch {
    return { outcome: 'failed' };
  } finally {
    await ctx.close().catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
const work = [...batch];
let done = 0;
function processRegistration(c, r) {
  regLock = regLock.then(() => {
    const id = nextFreeId(100000);
    let langTag = null, score = null;
    if (r.outcome === 'ok') {
      writeFileSync(resolve(ROOT, 'survey-snapshots', `${id}.html.gz`), gzipSync(r.html));
      langTag = (r.html.match(/<html[^>]*\slang=["']?([a-zA-Z-]{2,12})/)?.[1] || '').toLowerCase() || null;
      try {
        const tmp = resolve(ROOT, 'survey-snapshots', `${id}.tmp.html`);
        writeFileSync(tmp, r.html);
        const out = resolve(ROOT, 'survey-audits', `${id}.json`);
        execFileSync('node', [SCANNER, '--scope', c.url, '--url', c.url, '--date', DATE, '--output', out, tmp], { stdio: 'pipe', timeout: 120000 });
        score = JSON.parse(readFileSync(out, 'utf8')).summary?.overall_score ?? null;
        rmSync(tmp, { force: true });
      } catch { /* audit failure recorded via score null */ }
    }
    stats[r.outcome]++;
    registerTarget({
      id, url: c.url, band: 'survey', tags: ['survey', `tranco-${c.stratum}`, ...(langTag ? [`lang:${langTag.split('-')[0]}`] : [])],
      roles: ['survey'], status: r.outcome === 'ok' ? 'active' : r.outcome === 'bot_protected' ? 'walled' : 'dead',
      capture_streak: r.outcome === 'ok' ? 0 : 1, last_ok: r.outcome === 'ok' ? DATE : null, added: DATE,
      rank: c.rank, beacon_score: score,
    });
    done++;
    if (done % 25 === 0) console.log(`[${done}/${batch.length}] ok ${stats.ok} walled ${stats.bot_protected} failed ${stats.failed}`);
  });
  return regLock;
}

async function worker() {
  while (work.length) {
    const c = work.shift();
    const r = await captureOne(browser, c.url);
    await processRegistration(c, r);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

q.cursor += batch.length;
writeFileSync(qFile, JSON.stringify(q, null, 1));
const survey_total = (await import('./targets.mjs')).load().targets.filter((t) => (t.roles || []).includes('survey')).length;
const entry = { date: DATE, engine_batch: batch.length, ...stats, cursor: q.cursor, queue_total: q.queue.length, survey_total };
appendFileSync(resolve(ROOT, 'survey-log.jsonl'), JSON.stringify(entry) + '\n');
console.log(`survey intake: ${JSON.stringify(entry)}`);

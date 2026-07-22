// Periodic re-probe of excluded CORE sites (walled/dead): bot walls come and go, so
// any excluded site whose last failure is older than config.walled_recheck_days gets
// one fresh capture attempt; recordCapture auto-recovers it to 'active' on success.
// Called by drift-weekly.mjs every run — self-filters to stale entries, so most runs
// probe nothing. Survey-tier sites are never re-probed here.
import { createRequire } from 'node:module';
import { load, recordCapture } from './targets.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/nvm4w/nodejs/node_modules/@playwright/cli/node_modules/playwright-core');
const CHROME = 'C:/Users/tacit/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BOT_WALL = /just a moment|attention required|access denied|are you a robot|verify you are human|enable javascript and cookies|checking your browser|challenge-platform/i;

const reg = load();
const days = reg.config?.walled_recheck_days ?? 28;
const cutoff = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
const stale = reg.targets.filter((t) =>
  (t.roles || []).includes('benchmark') &&
  (t.status === 'walled' || t.status === 'dead') &&
  (String(t.last_fail || '').slice(0, 10) || '0000') <= cutoff);

if (!stale.length) { console.log('probe-walled: nothing stale'); process.exit(0); }

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
for (const t of stale) {
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let outcome = 'failed';
  try {
    await page.goto(t.url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const html = await page.content();
    const title = await page.title().catch(() => '');
    outcome = BOT_WALL.test(title) || BOT_WALL.test(html.slice(0, 4000)) ? 'bot_protected' : 'ok';
  } catch { /* stays failed */ } finally {
    await ctx.close().catch(() => {});
  }
  const note = recordCapture(t.id, outcome);
  console.log(`probe-walled: ${outcome.padEnd(13)} ${t.url}${note ? '  << ' + note : ''}`);
}
await browser.close();

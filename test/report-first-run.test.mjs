import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadPlaywright } from '../core/scripts/tier2-audit.mjs';

test('first-run report separates advice, counts only displayed priorities, and leaves non-URLs unlinked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-first-run-'));
  try {
    const json = join(dir, 'audit.json');
    const htmlPath = join(dir, 'report.html');
    execFileSync(process.execPath, ['core/scripts/static-audit.mjs', '--scope', 'fixture', '--output', json, 'test/golden/dirty.html']);
    const audit = JSON.parse(readFileSync(json, 'utf8'));
    assert.ok(!JSON.stringify(audit.testing_recommendations).includes('reflow result is recorded'));
    assert.ok(JSON.stringify(audit.testing_recommendations).includes('actual 200% browser zoom'));
    audit.metadata.url = 'beacon-golden-fixture';
    writeFileSync(json, JSON.stringify(audit));
    execFileSync(process.execPath, ['core/scripts/generate-report.mjs', json, '--output', htmlPath]);
    const html = readFileSync(htmlPath, 'utf8');
    assert.match(html, /目前有 <b>14<\/b> 個已確認問題/);
    assert.match(html, /另有 <b>3<\/b> 項改善建議/);
    assert.match(html, /以下 3 組涵蓋 <b>5<\/b> 個問題；本次共有 <b>14<\/b>/);
    assert.doesNotMatch(html, /涵蓋全部/);
    const advice = html.split('id="fg-meta-description-missing"')[1].split('id="fg-canonical-missing"')[0];
    assert.match(advice, /改善建議/);
    assert.doesNotMatch(advice, /行動：直接修/);
    assert.doesNotMatch(html, /href="beacon-golden-fixture"/);
    assert.match(html, /重測與本輪停止條件/);
    assert.match(html, /Retest and close this round/);
    assert.match(html, /偵測精確率 precision/);
    assert.ok(html.indexOf('id="layer-findings"') < html.indexOf('id="retest"'));
    assert.match(html, /id="review-touch"/);
    assert.match(html, /此分類仍需取得人工或瀏覽器測試證據/);
    assert.doesNotMatch(html, /data-filter=/);
    const contrast = html.split('id="fg-contrast-not-verified"')[1].split('</article>')[0];
    const front = contrast.split('<details')[0];
    assert.match(front, /待瀏覽器檢查/);
    assert.match(front, /不需要現在就修改顏色/);
    assert.doesNotMatch(front, /fg-count|&times;|共 1|需人工|tier2-audit|--merge-findings/);
    assert.match(contrast, /tier2-audit\.mjs/);
    assert.match(contrast, /1\.4\.3 Contrast \(Minimum\)/);
    const priority = html.split('href="#fg-contrast-not-verified"')[1].split('</h3>')[0];
    assert.doesNotMatch(priority, /&times;/);
    const actualFailure = html.split('id="fg-image-alt-missing"')[1].split('</article>')[0];
    assert.match(actualFailure, /fg-count/);
    assert.match(actualFailure, /&times;2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('demo evidence is paired with the exact audited source, without a fabricated fixture URL', () => {
  for (const name of ['broken-fixture', 'landing-self-audit']) {
    const audit = JSON.parse(readFileSync(`docs/reports/${name}.json`, 'utf8'));
    const source = readFileSync(`docs/reports/${name}.source.html.txt`);
    assert.equal(audit.metadata.source_sha256, createHash('sha256').update(source).digest('hex'));
    const html = readFileSync(`docs/reports/${name}.html`, 'utf8');
    assert.ok(html.includes(`href="${name}.json"`));
    assert.ok(html.includes(`href="${name}.source.html.txt"`));
    if (name === 'broken-fixture') assert.ok(!audit.metadata.url);
  }
});

test('repairing a title on the same input removes only the title finding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-title-retest-'));
  try {
    const input = join(dir, 'page.html');
    const json = join(dir, 'audit.json');
    const source = readFileSync('test/golden/dirty.html', 'utf8');
    const scan = content => {
      writeFileSync(input, content);
      execFileSync(process.execPath, ['scripts/static-audit.mjs', '--scope', 'first-check', '--output', json, input]);
      return JSON.parse(readFileSync(json, 'utf8'));
    };
    const before = scan(source);
    const after = scan(source.replace('<title></title>', '<title>Beacon fixture: title repair</title>'));
    assert.ok(before.findings.some(f => f.key === 'document-title-missing'));
    assert.deepEqual(after.findings.map(f => f.key).sort(), before.findings.filter(f => f.key !== 'document-title-missing').map(f => f.key).sort());
    assert.equal(before.metadata.engine_fingerprint, after.metadata.engine_fingerprint);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

let playwright;
try { playwright = await loadPlaywright(); } catch { /* Optional browser suite, like the Tier 2 tests. */ }

test('three-step navigation keeps scores optional and region selection reference-only', {
  skip: !playwright && 'Playwright unavailable on this machine',
}, async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(readFileSync('docs/reports/broken-fixture.html', 'utf8'));
    assert.deepEqual(await page.locator('.jump a').evaluateAll(links => links.map(a => a.getAttribute('href'))), ['#layer-decision', '#layer-findings', '#retest']);
    assert.equal(await page.locator('.score-metric').isVisible(), false);
    const score = await page.locator('.score-metric').textContent();
    const findings = await page.locator('.fgroup').count();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.jump a').first().click();
    assert.ok(await page.evaluate(() => document.querySelector('#layer-decision .eyebrow').getBoundingClientRect().top >= document.querySelector('.jump').getBoundingClientRect().bottom));
    await page.locator('#layer-legal > .wrap > details > summary').click();
    await page.locator('#jurisdiction-choice').selectOption('tw');
    assert.equal(await page.locator('.jurisdiction-entry:visible').count(), 1);
    assert.equal(await page.locator('[data-jurisdiction="tw"]').isVisible(), true);
    assert.equal(await page.locator('.score-metric').textContent(), score);
    assert.equal(await page.locator('.fgroup').count(), findings);
    await page.locator('#jurisdiction-choice').selectOption('all');
    assert.equal(await page.locator('.jurisdiction-entry:visible').count(), await page.locator('.jurisdiction-entry').count());
    await page.locator('a[href="#layer-methodology"]:visible').first().click();
    assert.equal(await page.locator('#layer-methodology details.layer-fold').getAttribute('open'), '');
    for (const theme of ['light', 'dark']) {
      await page.getByRole('button', { name: theme === 'light' ? 'Light mode / 淺色' : 'Dark mode / 深色', exact: true }).click();
      const ratios = await page.evaluate(() => {
        const luminance = color => {
          const channels = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => {
            const s = v / 255;
            return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
          });
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const bg = luminance(getComputedStyle(document.body).backgroundColor);
        return [...document.querySelectorAll('.jump a,.review-controls button,#jurisdiction-choice')].map(el => {
          const fg = luminance(getComputedStyle(el).borderBottomColor);
          return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
        });
      });
      assert.ok(ratios.every(r => r >= 3), `${theme}: border contrast ${ratios}`);
    }
  } finally { await browser.close(); }
});

test('finding summaries remain visible while evidence supports independent and bulk disclosure', {
  skip: !playwright && 'Playwright unavailable on this machine',
}, async () => {
  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(readFileSync('docs/reports/broken-fixture.html', 'utf8'));
    assert.equal(await page.locator('[data-filter]').count(), 0);
    assert.equal(await page.locator('details.review-category').count(), 0);
    const link = page.locator('.fixcard a').first();
    const href = await link.getAttribute('href');
    assert.equal(await page.locator(href).isVisible(), true);
    await link.click();
    assert.equal(await page.locator(href).isVisible(), true);
    assert.equal(await page.locator('#review-keyboard').isVisible(), true);
    assert.equal(await page.locator('#review-screenreader').isVisible(), true);
    await page.locator('[data-review-open="true"]').click();
    assert.equal(await page.locator('.finding-evidence:not([open])').count(), 0);
    await page.locator('[data-review-open="false"]').click();
    assert.equal(await page.locator('.finding-evidence[open]').count(), 0);
    assert.equal(await page.locator('.fgroup:visible').count(), await page.locator('.fgroup').count());
    assert.equal(await page.locator('.fix-line:visible').count(), await page.locator('.fix-line').count());
    assert.equal(await page.locator('.blindspot-line:visible').count(), await page.locator('.blindspot-line').count());
    await page.locator('#review-forms .finding-evidence > summary').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#review-forms .finding-evidence[open]').count(), 1);
    assert.ok((await page.locator('#review-forms').innerText()).includes('3.3.2 Labels or Instructions'));
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    assert.equal(await page.locator('.finding-evidence:not([open])').count(), 0);
    await page.evaluate(() => dispatchEvent(new Event('afterprint')));
    assert.equal(await page.locator('.finding-evidence[open]').count(), 1);
  } finally {
    await browser.close();
  }
});

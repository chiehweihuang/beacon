import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadPlaywright } from '../core/scripts/tier2-audit.mjs';

test('all three generator surfaces preserve audit input and produce identical standalone HTML', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-report-modules-'));
  const input = 'docs/reports/broken-fixture.json';
  const before = readFileSync(input, 'utf8');
  try {
    // The build suite temporarily bumps the live manifest; isolate this parity check.
    mkdirSync(join(dir, '.claude-plugin'));
    writeFileSync(join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ version: '0.0.0' }));
    const outputs = ['core/scripts', 'scripts', 'adapters/codex/scripts'].map((path, i) => {
      const isolated = join(dir, path);
      mkdirSync(isolated, {recursive:true});
      for (const module of ['generate-report', 'jurisdictions', 'report-components', 'report-styles', 'report-interactions']) {
        copyFileSync(`${path}/${module}.mjs`, join(isolated, `${module}.mjs`));
      }
      const target = join(dir, `${i}.html`);
      execFileSync(process.execPath, [join(isolated, 'generate-report.mjs'), input, '--output', target]);
      return readFileSync(target, 'utf8');
    });
    assert.equal(outputs[0], outputs[1]);
    assert.equal(outputs[1], outputs[2]);
    assert.equal(readFileSync(input, 'utf8'), before);
    assert.doesNotMatch(outputs[0], /<script[^>]+src=|<link[^>]+rel="stylesheet"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('evidence hover, focus, geometry and state labels work in both themes and languages', async () => {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent(readFileSync('docs/reports/broken-fixture.html', 'utf8'));
    for (const lang of ['zh', 'en']) {
      await page.locator(`[data-lang-btn="${lang}"]`).click();
      for (const theme of ['light', 'dark']) {
        await page.locator(`[data-theme-btn="${theme}"]`).click();
        const detail = page.locator('#fg-image-alt-missing .finding-evidence');
        const summary = detail.locator('summary');
        await summary.hover();
        assert.equal(await summary.evaluate(el=>getComputedStyle(el).textDecorationThickness),'3px');
        assert.match(await summary.innerText(), lang==='zh' ? /查看證據/ : /View evidence/);
        if (lang === 'en') assert.equal(await summary.locator('.disclosure-closed .lang-en').evaluate(el=>getComputedStyle(el).display), 'inline');
        await page.mouse.move(0,0);
        await summary.focus();
        await summary.press('Enter');
        assert.match(await summary.innerText(), lang==='zh' ? /收合證據/ : /Hide evidence/);
        assert.equal(await summary.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
        assert.equal(await summary.evaluate(el=>getComputedStyle(el).textDecorationThickness),'3px');
        const link = detail.locator('a').first();
        await link.focus();
        await page.locator('[data-review-open="false"]').evaluate(el=>el.click());
        assert.equal(await page.locator('[data-review-open="false"]').evaluate(el=>el===document.activeElement),true);
        assert.equal(await page.locator('.fgroup:visible').count(),await page.locator('.fgroup').count());
        assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>el.getBoundingClientRect().height>0).flatMap(el=>['', '::before', '::after'].flatMap(pseudo=>{
          const style=getComputedStyle(el,pseudo||null);
          return ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].filter(key=>style[key]!=='0px').map(key=>`${el.tagName}:${pseudo}:${key}=${style[key]}`);
        }))),[]);
      }
    }
  } finally { await browser.close(); }
});

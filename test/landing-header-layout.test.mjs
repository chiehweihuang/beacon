import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlaywright } from '../core/scripts/tier2-audit.mjs';

test('landing headers share bilingual geometry and keyboard order', async () => {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const css = readFileSync('docs/style.css', 'utf8');
    for (const width of [320,430,431,768,832,833,900,960,1000,1023,1024,1025,1060,1100,1152,1280,1440,1742,1920]) {
      await page.setViewportSize({ width, height: 900 });
      const heights = [];
      for (const file of ['index.html','zh-Hant.html']) {
        await page.setContent(readFileSync(`docs/${file}`, 'utf8').replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`));
        const geometry = await page.locator('header.site').evaluate(header => {
          const brand = header.querySelector('.brand').getBoundingClientRect();
          const language = header.querySelector('.lang-switch').getBoundingClientRect();
          const nav = header.querySelector('nav').getBoundingClientRect();
          return { height: header.getBoundingClientRect().height, brandTop: brand.top, languageTop: language.top, navTop: nav.top, brandBottom: brand.bottom, overflow: header.scrollWidth > header.clientWidth };
        });
        assert.equal(geometry.brandTop, geometry.languageTop);
        assert.ok(geometry.navTop >= geometry.brandBottom);
        assert.equal(geometry.overflow, false);
        heights.push(geometry.height);
        const wrapped = await page.locator('nav.site-nav a').evaluateAll(links => links.filter(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight);
        }).map(el => el.textContent));
        assert.deepEqual(wrapped, [], `${file} navigation wrapped at ${width}`);
        if (width > 832) {
          const gaps = await page.locator('nav.site-nav li').evaluateAll(items => items.slice(1).map((el, i) => el.getBoundingClientRect().left - items[i].getBoundingClientRect().right));
          assert.ok(Math.max(...gaps) - Math.min(...gaps) < 1, 'navigation gaps are even');
        }
        for (const colorScheme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme });
          const rounded = await page.evaluate(() => [...document.querySelectorAll('*')]
            .filter(el => el.getBoundingClientRect().height > 0)
            .flatMap(el => [null, '::before', '::after'].flatMap(pseudo => {
              const style = getComputedStyle(el, pseudo);
              return ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius']
                .filter(key => style[key] !== '0px').map(key => `${el.tagName}:${key}`);
            })));
          assert.deepEqual(rounded, []);
        }
        await page.locator('.brand').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('.lang-switch a').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('nav.site-nav a').first().evaluate(el => el === document.activeElement), true);
      }
      assert.equal(heights[0], heights[1], `header height at ${width}`);
    }
  } finally { await browser.close(); }
});

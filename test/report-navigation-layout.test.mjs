import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlaywright } from '../core/scripts/tier2-audit.mjs';

test('report steps align after navigation and languages share header geometry', async () => {
  const pw=await loadPlaywright();
  const browser=await pw.chromium.launch({headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.setContent(readFileSync('docs/reports/broken-fixture.html','utf8'));
    for (const width of [320,768,1024,1280,1440,1742,1920]) {
    await page.setViewportSize({width,height:900});
    const geometries=[];
    for (const lang of ['zh','en']) {
      await page.locator(`[data-lang-btn="${lang}"]`).click();
      geometries.push(await page.locator('.metagrid').evaluate(el=>({height:el.getBoundingClientRect().height,children:[...el.children].map(c=>({x:c.getBoundingClientRect().x,width:c.getBoundingClientRect().width}))})));
      const gaps=[];
      for (const id of ['layer-decision','layer-findings','retest']) {
        await page.locator(`.jump a[href="#${id}"]`).click();
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        gaps.push(await page.locator(`#${id} .layer-h`).first().evaluate(el=>{
          const nav=document.querySelector('.jump');
          return el.getBoundingClientRect().top-(getComputedStyle(nav).position==='sticky' ? nav.getBoundingClientRect().bottom : 0);
        }));
        assert.equal(await page.locator(`.jump a[href="#${id}"]`).getAttribute('aria-current'),'step');
        assert.equal(await page.locator(`#${id} .layer-h`).first().evaluate(el=>el===document.activeElement),true);
      }
      assert.ok(Math.max(...gaps)-Math.min(...gaps)<2,JSON.stringify({width,lang,gaps}));
    }
    assert.deepEqual(geometries[0],geometries[1]);
    }
    for(const theme of ['light','dark']) {
      await page.locator(`[data-theme-btn="${theme}"]`).click();
      const backgrounds=await page.locator('.jump a').evaluateAll(links=>links.map(el=>getComputedStyle(el).backgroundColor));
      assert.equal(new Set(backgrounds).size,3);
      const bands=await page.locator('[data-report-step]').evaluateAll(sections=>sections.map(section=>{
        const band=section.querySelector('.eyebrow');
        const link=document.querySelector(`.jump a[href="#${section.id}"]`);
        return {background:getComputedStyle(band).backgroundColor,expected:getComputedStyle(link.parentElement).getPropertyValue('--step-bg').trim(),color:getComputedStyle(band).color};
      }));
      assert.equal(new Set(bands.map(b=>b.background)).size,3);
      assert.ok(bands.every(b=>b.background!=='rgba(0, 0, 0, 0)'));
    }
  } finally {await browser.close();}
});

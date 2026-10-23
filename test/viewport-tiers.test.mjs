import assert from 'node:assert/strict';
import test from 'node:test';

import { LEVELS, VIEWPORT_TIERS, schemesForLevel, viewportsForLevel } from '../core/scripts/viewport-tiers.mjs';

const labels = level => viewportsForLevel(level).map(v => v.label);

test('levels nest: quick is inside feature is inside full', () => {
  assert.deepEqual(LEVELS, ['quick', 'feature', 'full']);
  for (const [small, big] of [['quick', 'feature'], ['feature', 'full']]) {
    for (const label of labels(small)) assert.ok(labels(big).includes(label), `${label} in ${big}`);
  }
  assert.ok(labels('full').length > labels('feature').length);
  assert.ok(labels('feature').length > labels('quick').length);
});

test('quick is exactly the phone plus the laptop', () => {
  assert.deepEqual(labels('quick'), ['360x780', '1280x900']);
});

test('full lists 320 first, sorted by width ascending, 1280x900 in every level', () => {
  assert.equal(viewportsForLevel('full')[0].label, '320x720');
  for (const level of LEVELS) {
    const widths = viewportsForLevel(level).map(v => v.width);
    assert.deepEqual(widths, [...widths].sort((a, b) => a - b), level);
    assert.ok(labels(level).includes('1280x900'), level);
  }
});

test('labels are unique and equal WxH of width and height', () => {
  const all = viewportsForLevel('full');
  assert.equal(new Set(all.map(v => v.label)).size, all.length);
  for (const v of all) assert.equal(v.label, `${v.width}x${v.height}`);
  assert.equal(new Set(all.map(v => v.name)).size, all.length);
});

test('emulated viewports carry isMobile, hasTouch, userAgent, a mobile-looking UA; 320 and desktops are not emulated', () => {
  for (const v of viewportsForLevel('full')) {
    if (!v.emulate) continue;
    assert.equal(typeof v.emulate.isMobile, 'boolean', v.label);
    assert.equal(typeof v.emulate.hasTouch, 'boolean', v.label);
    assert.equal(typeof v.emulate.deviceScaleFactor, 'number', v.label);
    assert.match(v.emulate.userAgent, /Mobile|iPad/, v.label);
  }
  const byLabel = Object.fromEntries(viewportsForLevel('full').map(v => [v.label, v]));
  for (const unemulated of ['320x720', '1280x900', '1920x1080']) assert.equal(byLabel[unemulated].emulate, undefined, unemulated);
  assert.ok(byLabel['360x780'].emulate && byLabel['744x860'].emulate && byLabel['844x390'].emulate);
});

test('unknown level throws; VIEWPORT_TIERS exposes the three levels', () => {
  assert.throws(() => viewportsForLevel('nope'), /unknown level/i);
  assert.deepEqual(Object.keys(VIEWPORT_TIERS), LEVELS);
});

test('schemesForLevel: quick is light only, others light and dark', () => {
  assert.deepEqual(schemesForLevel('quick'), ['light']);
  assert.deepEqual(schemesForLevel('feature'), ['light', 'dark']);
  assert.deepEqual(schemesForLevel('full'), ['light', 'dark']);
  assert.throws(() => schemesForLevel('nope'), /unknown level/i);
});

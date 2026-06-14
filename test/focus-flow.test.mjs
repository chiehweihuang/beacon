// Beacon · keyboard focus-flow analyzer (2.1.2 / 2.4.3 / 2.4.7 / 2.4.11 / 2.1.1).
// Pure analyzer over synthetic focus traces — the runtime behaviors axe cannot see.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFocusTrace } from '../core/scripts/focus-flow.mjs';

const keys = (t) => analyzeFocusTrace(t).findings.map((f) => f.key);
const stop = (over = {}) => ({ tag: 'button', name: 'x', focusVisible: true, rect: { x: 0, y: 0, width: 40, height: 20 }, obscuredBy: null, ...over });

// A clean, ordered trace that reached the end.
const clean = {
  reachedEnd: true, interactiveTotal: 3,
  stops: [stop({ rect: { x: 0, y: 0, width: 40, height: 20 } }), stop({ rect: { x: 0, y: 60, width: 40, height: 20 } }), stop({ rect: { x: 0, y: 120, width: 40, height: 20 } })],
};

test('clean ordered trace -> no findings', () => {
  assert.deepEqual(analyzeFocusTrace(clean).findings, []);
});

test('empty trace -> no findings, with a note', () => {
  const r = analyzeFocusTrace({ stops: [] });
  assert.deepEqual(r.findings, []);
  assert.match(r.note, /empty/);
});

test('reachedEnd:false -> FLAG keyboard trap', () => {
  assert.ok(keys({ ...clean, reachedEnd: false }).includes('kbd-trap'));
});

test('a stop with focusVisible:false -> FLAG focus-not-visible', () => {
  const t = { ...clean, stops: [stop(), stop({ focusVisible: false, name: 'hidden-focus' })] };
  assert.ok(keys(t).includes('focus-not-visible'));
});

test('a stop obscured by another element -> FLAG focus-obscured', () => {
  const t = { ...clean, stops: [stop(), stop({ obscuredBy: 'header.sticky' })] };
  assert.ok(keys(t).includes('focus-obscured'));
});

test('repeated upward jumps -> REVIEW focus-order-suspect', () => {
  const t = {
    reachedEnd: true, interactiveTotal: 4,
    stops: [
      stop({ rect: { x: 0, y: 300, width: 40, height: 20 } }),
      stop({ rect: { x: 0, y: 10, width: 40, height: 20 } }),  // jump up
      stop({ rect: { x: 0, y: 320, width: 40, height: 20 } }),
      stop({ rect: { x: 0, y: 20, width: 40, height: 20 } }),  // jump up again
    ],
  };
  assert.ok(keys(t).includes('focus-order-suspect'));
});

test('fewer stops than interactive elements -> REVIEW focus-unreachable', () => {
  assert.ok(keys({ ...clean, interactiveTotal: 7 }).includes('focus-unreachable'));
});

test('a single upward jump is tolerated (not flagged)', () => {
  const t = {
    reachedEnd: true, interactiveTotal: 2,
    stops: [stop({ rect: { x: 0, y: 200, width: 40, height: 20 } }), stop({ rect: { x: 0, y: 10, width: 40, height: 20 } })],
  };
  assert.ok(!keys(t).includes('focus-order-suspect'));
});

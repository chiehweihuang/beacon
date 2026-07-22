// Target registry for all Beacon measurement scripts (VALIDATION.md L0/L3).
// Single source of truth: targets.json. Scripts SELECT sites by criteria instead of
// hardcoding lists, and every capture run WRITES BACK per-site outcomes so the
// registry maintains itself (3 consecutive failures auto-flip a site out of rotation).
//
//   import { select, recordCapture, health } from './targets.mjs';
//   const sites = select({ role: 'drift' });          // active drift-subset sites
//   recordCapture(97, 'ok');                          // after each capture attempt
//
// Statuses: active (in rotation) · walled (bot-protected, excluded) ·
//           dead (unreachable, excluded) · retired (manual decision, excluded).
// Ids are permanent and never reused — historical runs stay comparable.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'targets.json');
const AUTO_EXCLUDE_STREAK = 3;

export function load() {
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

function save(reg) {
  reg.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(FILE, JSON.stringify(reg, null, 2));
}

// criteria: { role?: 'benchmark'|'drift'|'gt', tag?: string, status?: string|'any' }
// Default returns only status:'active' — the safe rotation for any capture script.
export function select(criteria = {}) {
  const { role, tag, status = 'active' } = criteria;
  return load().targets.filter((t) =>
    (status === 'any' || t.status === status) &&
    (!role || (t.roles || []).includes(role)) &&
    (!tag || (t.tags || []).includes(tag)));
}

// outcome: 'ok' | 'bot_protected' | 'failed'. Auto-flips status after
// AUTO_EXCLUDE_STREAK consecutive non-ok captures; returns the flip note if any.
export function recordCapture(id, outcome, date = new Date().toISOString().slice(0, 10)) {
  const reg = load();
  const t = reg.targets.find((x) => x.id === id);
  if (!t) return null;
  let note = null;
  if (outcome === 'ok') {
    t.capture_streak = 0;
    t.last_ok = date;
    if (t.status === 'walled' || t.status === 'dead') {
      t.status = 'active';
      note = `${t.url} recovered (${outcome}) — back in rotation`;
    }
  } else {
    t.capture_streak = (t.capture_streak || 0) + 1;
    t.last_fail = `${date}:${outcome}`;
    if (t.status === 'active' && t.capture_streak >= AUTO_EXCLUDE_STREAK) {
      t.status = outcome === 'bot_protected' ? 'walled' : 'dead';
      note = `${t.url} auto-excluded after ${t.capture_streak} consecutive failures (${outcome}) — pick a same-band replacement`;
    }
  }
  save(reg);
  return note;
}

export function health() {
  const reg = load();
  const by = {};
  for (const t of reg.targets) by[t.status] = (by[t.status] || 0) + 1;
  return { total: reg.targets.length, ...by };
}

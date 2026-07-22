// One-time migration: assemble targets.json from the scattered sources
// (raw/*-rec.json site list + 2026-07-05 capture outcomes + drift SUBSET + GT list).
// Safe to re-run: overwrites targets.json from the same inputs.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const DRIFT = new Set([0, 12, 23, 26, 33, 44, 60, 65, 72, 84, 93, 96, 97]);
const GT = new Set([96, 97, 87, 90, 95, 27, 67, 8, 24, 29, 25, 43, 64, 9, 31, 70, 84, 0, 13, 17]);

const results = JSON.parse(readFileSync(resolve(ROOT, 'run-2026-07-05/results.json'), 'utf8'));
const targets = readdirSync(resolve(ROOT, 'raw'))
  .filter((f) => /^\d+-rec\.json$/.test(f))
  .map((f) => {
    const id = Number(f.split('-')[0]);
    const rec = JSON.parse(readFileSync(resolve(ROOT, 'raw', f), 'utf8'));
    const run = results.find((r) => r.idx === id);
    const roles = ['benchmark'];
    if (DRIFT.has(id)) roles.push('drift');
    if (GT.has(id)) roles.push('gt');
    const tags = [rec.band];
    if (rec.band === 'jp-tw') tags.push('cjk');
    const capture = run?.capture ?? 'never';
    return {
      id,
      url: rec.url,
      band: rec.band,
      tags,
      roles,
      status: capture === 'ok' ? 'active' : capture === 'bot_protected' ? 'walled' : 'dead',
      capture_streak: capture === 'ok' ? 0 : 1,
      last_ok: capture === 'ok' ? '2026-07-05' : null,
      notes: capture === 'ok' ? '' : `${capture} on 2026-07-05 full run`,
    };
  })
  .sort((a, b) => a.id - b.id);

writeFileSync(resolve(ROOT, 'targets.json'), JSON.stringify({ updated: null, targets }, null, 2));
console.log(`targets.json: ${targets.length} sites — active ${targets.filter((t) => t.status === 'active').length}, walled ${targets.filter((t) => t.status === 'walled').length}, dead ${targets.filter((t) => t.status === 'dead').length}; drift ${targets.filter((t) => t.roles.includes('drift')).length}, gt ${targets.filter((t) => t.roles.includes('gt')).length}`);

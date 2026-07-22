// Automated candidate sourcing for the SURVEY tier (the road to 10,000 sites).
//
//   node source-targets.mjs --refresh          # download the current Tranco top-1M list
//   node source-targets.mjs --build 10000      # (re)build survey-queue.json: stratified sample
//
// Source: the Tranco research list (https://tranco-list.eu — rank-aggregated, widely
// used in web-measurement papers). Stratified sampling across rank bands so the queue
// is not just mega-sites; deterministic given the same list file and seed. Domains
// already in the registry are skipped. survey-intake.mjs consumes the queue nightly.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { load } from './targets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const LIST = resolve(ROOT, 'tranco-top1m.csv');

// rank strata: [label, from, to, share of the sample]
const STRATA = [
  ['top1k', 1, 1000, 0.15],
  ['1k-10k', 1001, 10000, 0.25],
  ['10k-100k', 10001, 100000, 0.35],
  ['100k-1m', 100001, 1000000, 0.25],
];

if (process.argv.includes('--refresh')) {
  console.log('downloading Tranco top-1M…');
  execFileSync('curl', ['-sL', 'https://tranco-list.eu/top-1m.csv.zip', '-o', resolve(ROOT, 'tranco.zip')], { stdio: 'inherit', timeout: 300000 });
  // Windows bsdtar (System32) reads zip; git-bash GNU tar does not.
  execFileSync('C:\\Windows\\System32\\tar.exe', ['-xf', resolve(ROOT, 'tranco.zip'), '-C', ROOT], { stdio: 'inherit' });
  renameSync(resolve(ROOT, 'top-1m.csv'), LIST);
  console.log('saved', LIST);
}

const buildIdx = process.argv.indexOf('--build');
if (buildIdx !== -1) {
  const total = Number(process.argv[buildIdx + 1] || 10000);
  if (!existsSync(LIST)) { console.error('no list file — run --refresh first'); process.exit(1); }
  const rows = readFileSync(LIST, 'utf8').split('\n').filter(Boolean).map((l) => l.split(','));
  const registered = new Set(load().targets.map((t) => t.url.replace(/https?:\/\/(www\.)?/, '').split('/')[0]));

  // deterministic PRNG (mulberry32) so the same list + seed reproduce the same queue
  let s = 20260722;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const queue = [];
  for (const [label, from, to, share] of STRATA) {
    const want = Math.round(total * share);
    const pool = rows.slice(from - 1, to);
    const picked = new Set();
    let guard = 0;
    while (picked.size < want && guard++ < want * 30) {
      const row = pool[Math.floor(rnd() * pool.length)];
      const domain = row?.[1]?.trim();
      if (!domain || picked.has(domain) || registered.has(domain)) continue;
      picked.add(domain);
      queue.push({ url: `https://${domain}`, stratum: label, rank: Number(row[0]) });
    }
    console.log(`${label}: ${picked.size}/${want}`);
  }
  writeFileSync(resolve(ROOT, 'survey-queue.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), seed: 20260722, cursor: 0, queue }, null, 1));
  console.log(`survey-queue.json: ${queue.length} candidates, cursor 0`);
}

// Beacon Phase A · build — regenerate every GENERATED output from core/.
// Assembles into a staging tree first, then copies only declared outputs.
//   node build.mjs           regenerate outputs in place
//   node build.mjs --check    build to staging, diff vs committed, exit non-zero on any diff
//   node build.mjs --prune    remove orphan outputs (whose core source is gone)

import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { GENERATED, validateCoreMapping, findOrphans } from './tools/manifest.mjs';
import { buildVariant, assertNoStrayTokens, findDuplicatedLines } from './tools/markers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const PRUNE = args.includes('--prune');

const readLF = (abs) => readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n'); // normalize CRLF→LF (autocrlf working tree)

function render(entry) {
  const src = readLF(resolve(ROOT, entry.src));
  if (entry.kind === 'copy') return src;
  const keep = entry.kind === 'variant:cc' ? 'cc' : 'codex';
  const out = buildVariant(src, keep);
  assertNoStrayTokens(out, entry.out);
  return out;
}

function main() {
  const mapErrors = validateCoreMapping(ROOT);
  if (mapErrors.length) { console.error('core mapping errors:\n  ' + mapErrors.join('\n  ')); process.exit(1); }

  const orphans = findOrphans(ROOT);
  if (orphans.length) {
    console.error('orphan outputs (core source missing):\n  ' + orphans.join('\n  '));
    if (PRUNE) { for (const o of orphans) rmSync(resolve(ROOT, o), { force: true }); console.error('pruned.'); }
    else { console.error('re-run with --prune to remove, or restore the core source.'); process.exit(1); }
  }

  // Advisory: duplicated (reordered) content lines per content file.
  for (const e of GENERATED.filter((x) => x.kind === 'variant:cc')) {
    const dup = findDuplicatedLines(readLF(resolve(ROOT, e.src)));
    if (dup.length) console.error(`note: ${e.src} has ${dup.length} duplicated (reordered) line(s) — edit both @cc/@codex copies`);
  }

  const staging = mkdtempSync(join(tmpdir(), 'beacon-build-'));
  const built = [];
  for (const e of GENERATED) {
    if (!existsSync(resolve(ROOT, e.src))) continue;
    const text = render(e);
    const stagePath = join(staging, e.out);
    mkdirSync(dirname(stagePath), { recursive: true });
    writeFileSync(stagePath, text);
    built.push({ ...e, text });
  }

  if (CHECK) {
    let diff = 0;
    for (const b of built) {
      const cur = existsSync(resolve(ROOT, b.out)) ? readLF(resolve(ROOT, b.out)) : null;
      if (cur !== b.text) { console.error(`--check: ${b.out} differs from core regeneration`); diff++; }
    }
    rmSync(staging, { recursive: true, force: true });
    if (diff) { console.error(`--check: ${diff} stale output(s).`); process.exit(1); }
    console.log(`--check: all ${built.length} outputs match core.`);
    return;
  }

  for (const b of built) {
    if (!b.overwrite) continue;
    const dest = resolve(ROOT, b.out);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, b.text);
  }
  rmSync(staging, { recursive: true, force: true });
  console.log(`build: wrote ${built.length} generated files from core/.`);
}

main();

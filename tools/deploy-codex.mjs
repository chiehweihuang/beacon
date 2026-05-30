// Beacon Phase A · deploy-codex — copy the built codex adapter from the repo to
// the live Codex skill location (~/.codex/skills/beacon/). Manual, out-of-CI
// (writes to the user's home, not the repo). LF-normalized (build already writes
// LF). Only copies files that differ (after LF normalization), leaving codex-only
// hand-kept files intact except the ones the build owns.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'adapters/codex');
const DEST = resolve(homedir(), '.codex/skills/beacon');

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const readLF = (p) => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'); // normalize CRLF→LF; codex skill wants LF
let copied = 0;
for (const srcFile of walk(SRC)) {
  const rel = relative(SRC, srcFile);
  const destFile = join(DEST, rel);
  const srcText = readLF(srcFile);
  const destText = existsSync(destFile) ? readLF(destFile) : null;
  if (destText !== srcText) {
    mkdirSync(dirname(destFile), { recursive: true });
    writeFileSync(destFile, srcText);
    console.log(`  deployed ${rel}`);
    copied++;
  }
}
console.log(`deploy-codex: ${copied} file(s) updated at ${DEST}`);

// Beacon Phase A · extract — bootstrap / regenerate core/ from the committed
// surface variants. Kept (not deleted): re-run any time the committed variants
// are edited directly, to re-derive the marked core. Run from the repo root.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lcsMerge } from './tools/lcs.mjs';
import { validateMarkers, findDuplicatedLines } from './tools/markers.mjs';
import { CONTENT } from './tools/manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REFERENCES = ['wcag-quick', 'patterns', 'legal-brief', 'disabilities', 'cases', 'documents'];
const SCRIPTS = ['static-audit', 'generate-report'];
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n?/g, '\n'); // normalize CRLF→LF (autocrlf working tree)
const write = (p, t) => { mkdirSync(dirname(resolve(ROOT, p)), { recursive: true }); writeFileSync(resolve(ROOT, p), t); };

for (const n of CONTENT) {
  const core = lcsMerge(read(`commands/${n}.md`), read(`adapters/codex/references/beacon-${n}.md`));
  validateMarkers(core);
  write(`core/content/${n}.md`, core);
  const dup = findDuplicatedLines(core);
  if (dup.length) console.log(`  ${n}: ${dup.length} duplicated (reordered) line(s) — edit both @cc/@codex copies`);
}
for (const n of REFERENCES) write(`core/references/${n}.md`, read(`references/${n}.md`));
for (const n of SCRIPTS) write(`core/scripts/${n}.mjs`, read(`scripts/${n}.mjs`));
console.log('extract: wrote core/ from committed variants.');

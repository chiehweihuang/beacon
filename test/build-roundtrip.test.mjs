import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lcsMerge } from '../tools/lcs.mjs';
import { buildVariant, findDuplicatedLines } from '../tools/markers.mjs';
import { CONTENT } from '../tools/manifest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8').replace(/\r\n?/g, '\n'); // normalize CRLF→LF (autocrlf working tree)

for (const n of CONTENT) {
  test(`${n}: marked core round-trips to both committed variants byte-identically`, () => {
    const cc = read(`commands/${n}.md`);
    const codex = read(`adapters/codex/references/beacon-${n}.md`);
    const core = lcsMerge(cc, codex);
    assert.equal(buildVariant(core, 'cc'), cc, `${n} CC mismatch`);
    assert.equal(buildVariant(core, 'codex'), codex, `${n} codex mismatch`);
  });
}

test('references + scripts are already content-identical across surfaces', () => {
  const shared = [
    ['references/wcag-quick.md', 'adapters/codex/references/wcag-quick.md'],
    ['references/patterns.md', 'adapters/codex/references/patterns.md'],
    ['references/legal-brief.md', 'adapters/codex/references/legal-brief.md'],
    ['references/disabilities.md', 'adapters/codex/references/disabilities.md'],
    ['references/cases.md', 'adapters/codex/references/cases.md'],
    ['references/documents.md', 'adapters/codex/references/documents.md'],
    ['scripts/static-audit.mjs', 'adapters/codex/scripts/static-audit.mjs'],
    ['scripts/generate-report.mjs', 'adapters/codex/scripts/generate-report.mjs'],
  ];
  for (const [a, b] of shared) assert.equal(read(a), read(b), `${a} != ${b}`);
});

test('inspect has duplicated (reordered) content — advisory present, sync held', () => {
  const core = lcsMerge(read('commands/inspect.md'), read('adapters/codex/references/beacon-inspect.md'));
  assert.ok(Array.isArray(findDuplicatedLines(core)));
});

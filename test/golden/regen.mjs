// Regenerate the golden expected JSONs after an INTENTIONAL scoring/detector change.
// Run from the repo root:  node test/golden/regen.mjs
// Then inspect the diff (git diff test/golden/) before committing — every changed line
// must be explainable by the change you just made. See VALIDATION.md L0.

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GOLDEN = resolve(dirname(fileURLToPath(import.meta.url)));
const ROOT = resolve(GOLDEN, '../..');

for (const name of ['clean', 'dirty']) {
  execFileSync('node', [
    resolve(ROOT, 'core/scripts/static-audit.mjs'),
    '--scope', 'golden', '--date', '2020-01-01',
    '--output', resolve(GOLDEN, `${name}.expected.json`),
    `test/golden/${name}.html`,
  ], { cwd: ROOT, stdio: 'inherit' });
}
console.log('golden vectors regenerated — inspect git diff test/golden/ before committing');

// Beacon Phase A · the GENERATED manifest — the ONLY files build.mjs writes and
// --check compares. Output dirs MIX generated + hand-kept files, so build must
// drive off this explicit table, never whole-dir operations.

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REFERENCES = ['wcag-quick', 'patterns', 'legal-brief', 'disabilities', 'cases', 'documents'];
const SCRIPTS = ['static-audit', 'generate-report'];
export const CONTENT = ['guide', 'inspect', 'advisor'];

export const GENERATED = [
  // CC plugin (repo root)
  ...CONTENT.map((n) => ({ out: `commands/${n}.md`, src: `core/content/${n}.md`, kind: 'variant:cc', overwrite: true })),
  ...REFERENCES.map((n) => ({ out: `references/${n}.md`, src: `core/references/${n}.md`, kind: 'copy', overwrite: true })),
  ...SCRIPTS.map((n) => ({ out: `scripts/${n}.mjs`, src: `core/scripts/${n}.mjs`, kind: 'copy', overwrite: true })),
  // Codex adapter
  ...CONTENT.map((n) => ({ out: `adapters/codex/references/beacon-${n}.md`, src: `core/content/${n}.md`, kind: 'variant:codex', overwrite: true })),
  ...REFERENCES.map((n) => ({ out: `adapters/codex/references/${n}.md`, src: `core/references/${n}.md`, kind: 'copy', overwrite: true })),
  ...SCRIPTS.map((n) => ({ out: `adapters/codex/scripts/${n}.mjs`, src: `core/scripts/${n}.mjs`, kind: 'copy', overwrite: true })),
];

// Every file present in core/ must map to >=1 GENERATED entry, else it would be
// silently un-built. Returns an array of error strings (empty = OK).
export function validateCoreMapping(root) {
  const srcSet = new Set(GENERATED.map((e) => e.src));
  const errors = [];
  for (const dir of ['core/content', 'core/references', 'core/scripts']) {
    const abs = resolve(root, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      const rel = `${dir}/${f}`;
      if (!srcSet.has(rel)) errors.push(`${rel} exists in core/ but has no GENERATED entry`);
    }
  }
  return errors;
}

// Outputs whose core source no longer exists (report-only; --prune removes).
export function findOrphans(root) {
  return GENERATED.filter((e) => !existsSync(resolve(root, e.src))).map((e) => e.out);
}

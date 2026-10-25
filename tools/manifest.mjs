// Beacon Phase A · the GENERATED manifest — the ONLY files build.mjs writes and
// --check compares. Output dirs MIX generated + hand-kept files, so build must
// drive off this explicit table, never whole-dir operations.

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REFERENCES = ['wcag-quick', 'patterns', 'legal-brief', 'disabilities', 'cases', 'documents', 'auth-detect-fp', 'pdf-detect-fp'];
const SCRIPTS = ['static-audit', 'generate-report', 'lighthouse-extract', 'lang-detect', 'auth-detect', 'pdf-detect', 'pdf-triage', 'quality-detect', 'focus-flow', 'pattern-runtime', 'viewport-tiers', 'tier2-audit', 'reader-task-audit', 'design-qa', 'attr-scan', 'jurisdictions', 'report-components', 'report-styles', 'report-interactions'];
const PATTERNS = ['web', 'pdf', 'wcag-catalog']; // declarative detector records + wcag catalog; shipped to both surfaces
export const CONTENT = ['guide', 'inspect', 'advisor'];

// Static (non-version) fields for the Codex plugin manifest. `version` is a
// placeholder here — build.mjs always overwrites it from the canonical
// `.claude-plugin/plugin.json`, so there is exactly one version number and
// `--check` catches drift instead of a hand-edited copy going stale.
export const CODEX_PLUGIN_TEMPLATE = {
  name: 'beacon',
  version: '0.0.0',
  description: 'Accessibility + AEO inspection for Codex. Lighthouse-style 0-100 scoring across 10 categories, interactive HTML reports, jurisdiction-aware WCAG context, framework-specific fixes, and repeat-testing CLI helpers for advisor/static-audit/report generation.',
  author: { name: 'chiehweihuang', url: 'https://github.com/chiehweihuang' },
  homepage: 'https://github.com/chiehweihuang/beacon',
  repository: 'https://github.com/chiehweihuang/beacon',
  license: 'MIT',
  keywords: ['codex', 'accessibility', 'a11y', 'aeo', 'wcag', 'inspection', 'inclusive-design'],
  skills: './skills/',
  interface: {
    displayName: 'Beacon',
    shortDescription: 'Accessibility + AEO inspection for Codex',
    longDescription: 'Review UI code and rendered pages for accessibility and answer-engine optimization risks. Beacon combines static checks, optional browser evidence, WCAG 2.2 AA guidance, and local HTML reports; it is a baseline, not a compliance certificate.',
    developerName: 'chiehweihuang',
    category: 'Engineering',
    capabilities: ['Interactive', 'Read', 'Write'],
    defaultPrompt: [
      'Review this UI for accessibility and AEO risks.',
      'Apply Beacon while implementing this UI change.',
      'Run a repeatable Beacon audit and summarize remaining risks.',
    ],
  },
};

export const GENERATED = [
  // CC plugin (repo root)
  ...CONTENT.map((n) => ({ out: `commands/${n}.md`, src: `core/content/${n}.md`, kind: 'variant:cc', overwrite: true })),
  ...REFERENCES.map((n) => ({ out: `references/${n}.md`, src: `core/references/${n}.md`, kind: 'copy', overwrite: true })),
  ...SCRIPTS.map((n) => ({ out: `scripts/${n}.mjs`, src: `core/scripts/${n}.mjs`, kind: 'copy', overwrite: true })),
  ...PATTERNS.map((n) => ({ out: `scripts/patterns/${n}.json`, src: `core/patterns/${n}.json`, kind: 'copy', overwrite: true })),
  // Codex adapter
  ...CONTENT.map((n) => ({ out: `adapters/codex/references/beacon-${n}.md`, src: `core/content/${n}.md`, kind: 'variant:codex', overwrite: true })),
  ...REFERENCES.map((n) => ({ out: `adapters/codex/references/${n}.md`, src: `core/references/${n}.md`, kind: 'copy', overwrite: true })),
  ...SCRIPTS.map((n) => ({ out: `adapters/codex/scripts/${n}.mjs`, src: `core/scripts/${n}.mjs`, kind: 'copy', overwrite: true })),
  ...PATTERNS.map((n) => ({ out: `adapters/codex/scripts/patterns/${n}.json`, src: `core/patterns/${n}.json`, kind: 'copy', overwrite: true })),
  // Codex plugin manifest: version sourced from the canonical CC plugin.json.
  { out: 'adapters/codex/.codex-plugin/plugin.json', src: '.claude-plugin/plugin.json', kind: 'codex-plugin-manifest', overwrite: true },
];

// Every file present in core/ must map to >=1 GENERATED entry, else it would be
// silently un-built. Returns an array of error strings (empty = OK).
export function validateCoreMapping(root) {
  const srcSet = new Set(GENERATED.map((e) => e.src));
  const errors = [];
  for (const dir of ['core/content', 'core/references', 'core/scripts', 'core/patterns']) {
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

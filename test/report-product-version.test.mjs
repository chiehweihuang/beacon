// readProductVersion() in generate-report.mjs: reads the product version at RUNTIME by
// walking up from the script's own location, never injected at build time (that recreates
// the known release trap where a version-stamped generated file lags one release behind).
// Covers the found path (real repo, any of its deployment copies) and the fallback path
// (no plugin manifest anywhere in the ancestor chain -> render nothing, never guess).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(ROOT, 'core/scripts/generate-report.mjs');

function writeMinimalAudit(path) {
  writeFileSync(path, JSON.stringify({
    metadata: { date: '2026-01-01', scope: 't', standard: 'WCAG 2.2 AA', engine_fingerprint: 'beacon-static-audit@19+ruleset.test' },
    summary: { overall_score: 90, coverage_percent: 40, total_findings: 0, critical: 0, warnings: 0, tips: 0, categories: [] },
    findings: [], legal_risk: {},
  }));
}

test('found path: real repo -> footer shows "Beacon <version>" matching .claude-plugin/plugin.json', () => {
  const expected = JSON.parse(readFileSync(resolve(ROOT, '.claude-plugin/plugin.json'), 'utf8')).version;
  const dir = mkdtempSync(join(tmpdir(), 'beacon-version-found-'));
  try {
    const audit = join(dir, 'audit.json');
    const report = join(dir, 'report.html');
    writeMinimalAudit(audit);
    execFileSync('node', [REPORT, audit, '--output', report]);
    const html = readFileSync(report, 'utf8');
    assert.match(html, new RegExp(`class="foot-engine">Beacon ${expected.replace(/\./g, '\\.')} &middot;`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fallback path: no plugin manifest in the ancestor chain -> renders nothing, never a wrong number', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-version-fallback-'));
  try {
    // Isolate the script and its presentation dependencies away from any .claude-plugin/
    // ancestor -- os.tmpdir()'s own ancestry never contains one.
    cpSync(REPORT, join(dir, 'generate-report.mjs'));
    for (const name of ['jurisdictions', 'report-components', 'report-styles', 'report-interactions']) {
      cpSync(resolve(ROOT, `core/scripts/${name}.mjs`), join(dir, `${name}.mjs`));
    }
    const audit = join(dir, 'audit.json');
    const report = join(dir, 'report.html');
    writeMinimalAudit(audit);
    execFileSync('node', [join(dir, 'generate-report.mjs'), audit, '--output', report]);
    const html = readFileSync(report, 'utf8');
    assert.doesNotMatch(html, /class="foot-engine">Beacon \d/, 'no manifest found in the ancestor chain -- must not render any version number');
    assert.match(html, /class="foot-engine">engine /, 'the engine fingerprint must still render on its own');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

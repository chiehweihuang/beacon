// Beacon · improvement loop evidence freeze (IC-04): copy the minimum source files into a
// private, digest-pinned evidence directory. Sources are never modified.
// Not a CLI. Test hook: env IMPROVE_FAIL_AFTER_FILE=1 throws after the first copied file.

import { copyFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { atomicWrite, evidenceDigest, sha256, sha256File, ImproveError } from './state.mjs';

const HYPOTHESIS = {
  engine: 'engine output for the targeted finding key differs between stored and current scanner',
  timeout: 'scanner exceeds the time limit on the stored snapshot',
  missing: 'a report should exist for a capture that succeeded but none was written',
};

export const sourcesFor = (id, date) => [
  `survey-audits/${id}.json`, `survey-snapshots/${id}.html.gz`,
  `daily-history/${date}/${id}/result.json`, `daily-history/${date}/${id}/before.json`,
];

export function freezeEvidence({ config, candidate }) {
  const { observation: o } = candidate;
  const dir = join(config.evidence, candidate.id);
  const ids = o.examples.slice(0, config.maxExamples ?? 5);
  const source_digests = {}, missing = [], files = [];
  let copied = 0;
  for (const id of ids) {
    for (const rel of sourcesFor(id, o.date)) {
      const src = join(config.ops, rel);
      if (!existsSync(src)) { missing.push(rel); continue; }
      source_digests[rel] = sha256File(src);
      const dst = join(dir, 'files', rel);
      if (!existsSync(dst) || sha256File(dst) !== source_digests[rel]) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, `${dst}.next`);
        renameSync(`${dst}.next`, dst);
        if (++copied === 1 && process.env.IMPROVE_FAIL_AFTER_FILE === '1') throw new Error('injected failure after first file');
      }
      files.push({ path: `files/${rel}`, sha256: source_digests[rel] });
    }
  }
  const body = {
    candidate: candidate.id,
    source_digests,
    sampling: { rule: 'first N examples', n: ids.length, of: o.examples.length },
    observations: [
      { signature: candidate.signature, last_seen: o.date, count_last: o.count, examples: ids, engine_fingerprints: o.engine_fingerprints, missing_sources: missing },
    ],
    interpretations: [{ class: candidate.class, hypothesis: HYPOTHESIS[candidate.class] }],
    unknowns: ['no independent label', ...missing.map((m) => `source absent: ${m}`)],
    test_evidence: [],
  };
  const text = `${JSON.stringify(body, null, 2)}\n`;
  if (/https?:\/\//i.test(text) || text.includes(config.ops) || text.includes(config.evidence)) {
    throw new ImproveError('evidence.json would contain a URL or an absolute path', 1);
  }
  atomicWrite(join(dir, 'evidence.json'), text);
  return { dir: candidate.id, digest: evidenceDigest(sha256(text), files), files };
}

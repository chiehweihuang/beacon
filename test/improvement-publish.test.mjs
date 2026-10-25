import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { publish } from '../tools/improvement/publish.mjs';

let tmp, repo, ops, evidence, state, store, out, config;

const write = (p, body) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
const approved = (over = {}) => ({
  id: 'cand_0123456789abcdef', status: 'awaiting-review', review: { approved_by: 'owner' }, ...over,
});
const manifest = (files, candidate = 'cand_0123456789abcdef') => ({ candidate, files });
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'imp-pub-')));
  repo = path.join(tmp, 'beacon'); ops = path.join(tmp, 'ops'); evidence = path.join(tmp, 'evidence');
  state = path.join(tmp, 'state'); store = path.join(tmp, 'store'); out = path.join(tmp, 'out');
  for (const d of [repo, ops, evidence, state, store]) fs.mkdirSync(d, { recursive: true });
  config = {
    ops, state, evidence, beaconRepo: repo,
    yume: { store },
    publish: { allow: ['core/**', 'test/**', 'plans/*.md'], denyRoots: ['<ops>', '<evidence>', '<state>', '<yume.store>'] },
  };
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('approved candidate with allowed files is staged with a manifest and receipt', async () => {
  write(path.join(repo, 'core/scripts/a.mjs'), 'export const a = 1;\n');
  write(path.join(repo, 'test/a.test.mjs'), 'ok\n');
  const m = manifest([
    { from: 'core/scripts/a.mjs', to: 'core/scripts/a.mjs' },
    { from: path.join(repo, 'test/a.test.mjs'), to: 'test/a.test.mjs' },
  ]);
  const r = await publish({ config, candidate: approved(), manifest: m, out });
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.deepEqual(r.reasons, []);
  assert.equal(r.receipt.action, 'published');
  assert.ok(r.receipt.at && r.receipt.ref);
  assert.equal(fs.readFileSync(path.join(out, 'core/scripts/a.mjs'), 'utf8'), 'export const a = 1;\n');
  const written = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  assert.equal(written.candidate, 'cand_0123456789abcdef');
  assert.deepEqual(written.files.map((f) => f.to).sort(), ['core/scripts/a.mjs', 'test/a.test.mjs']);
  assert.equal(written.files.find((f) => f.to === 'test/a.test.mjs').sha256, sha('ok\n'));
  assert.deepEqual(written.receipt, r.receipt);
  assert.ok(!fs.readdirSync(out).some((f) => f.endsWith('.next')));
});

test('unapproved candidate is refused and nothing is written', async () => {
  write(path.join(repo, 'core/a.mjs'), 'x');
  const m = manifest([{ from: 'core/a.mjs', to: 'core/a.mjs' }]);
  for (const c of [approved({ review: undefined }), approved({ review: {} }), approved({ status: 'validated' })]) {
    const r = await publish({ config, candidate: c, manifest: m, out });
    assert.equal(r.ok, false);
    assert.ok(r.reasons.length >= 1);
    assert.equal(r.receipt, null);
  }
  assert.ok(!fs.existsSync(out));
});

test('manifest for another candidate is refused', async () => {
  write(path.join(repo, 'core/a.mjs'), 'x');
  const r = await publish({ config, candidate: approved(), manifest: manifest([{ from: 'core/a.mjs', to: 'core/a.mjs' }], 'cand_other'), out });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /candidate/);
});

test('private sources and files outside the repo are refused', async () => {
  const secretOps = write(path.join(ops, 'quality/issues.json'), '{}');
  const ev = write(path.join(evidence, 'x/evidence.json'), '{}');
  const outside = write(path.join(tmp, 'elsewhere.mjs'), 'x');
  // a deny root nested inside the repo is still denied
  const nested = path.join(repo, 'core/private-state');
  config.publish.denyRoots.push(nested);
  const inNested = write(path.join(nested, 's.json'), '{}');
  for (const from of [secretOps, ev, outside, inNested, path.join(repo, '../ops/quality/issues.json')]) {
    const r = await publish({ config, candidate: approved(), manifest: manifest([{ from, to: 'core/x' }]), out });
    assert.equal(r.ok, false, from);
  }
  assert.ok(!fs.existsSync(out));
});

test('a symlink out of the repo is refused', async () => {
  const target = write(path.join(ops, 'secret.txt'), 'x');
  fs.mkdirSync(path.join(repo, 'core'), { recursive: true });
  fs.symlinkSync(target, path.join(repo, 'core/link.txt'));
  const r = await publish({ config, candidate: approved(), manifest: manifest([{ from: 'core/link.txt', to: 'core/link.txt' }]), out });
  assert.equal(r.ok, false);
});

test('destination outside the allow list or escaping out is refused', async () => {
  write(path.join(repo, 'core/a.mjs'), 'x');
  for (const to of ['.github/workflows/x.yml', 'package.json', 'plans/sub/x.md', '../escape', '/abs/x', 'core/../package.json']) {
    const r = await publish({ config, candidate: approved(), manifest: manifest([{ from: 'core/a.mjs', to }]), out });
    assert.equal(r.ok, false, to);
  }
  assert.ok(!fs.existsSync(out));
});

test('a file mentioning a deny-root path is refused', async () => {
  write(path.join(repo, 'core/leak.mjs'), `const p = '${evidence}/x';\n`);
  const r = await publish({ config, candidate: approved(), manifest: manifest([{ from: 'core/leak.mjs', to: 'core/leak.mjs' }]), out });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /deny/);
});

test('missing source, empty manifest, and missing publish config are refused', async () => {
  let r = await publish({ config, candidate: approved(), manifest: manifest([{ from: 'core/nope.mjs', to: 'core/nope.mjs' }]), out });
  assert.equal(r.ok, false);
  r = await publish({ config, candidate: approved(), manifest: manifest([]), out });
  assert.equal(r.ok, false);
  r = await publish({ config: { ...config, publish: undefined }, candidate: approved(), manifest: manifest([]), out });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /publish/);
});

test('every violation is listed, not just the first', async () => {
  write(path.join(repo, 'core/a.mjs'), 'x');
  const r = await publish({
    config, candidate: approved({ status: 'validated' }),
    manifest: manifest([{ from: 'core/a.mjs', to: 'package.json' }]), out,
  });
  assert.ok(r.reasons.length >= 2);
});

test('publish never spawns a process', async () => {
  const src = fs.readFileSync(new URL('../tools/improvement/publish.mjs', import.meta.url), 'utf8');
  assert.ok(!/child_process|git /.test(src));
});

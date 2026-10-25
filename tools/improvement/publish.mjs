// Publication boundary (IC-05): stage approved files into an output directory.
// Pure filesystem work. It never runs a VCS, never touches schedules, never deploys.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const inside = (child, root) => {
  const rel = path.relative(root, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// ponytail: only `**` (any depth) and `*` (one segment); no `?` or classes.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*' && glob[i + 1] === '*') { re += '.*'; i++; }
    else if (ch === '*') re += '[^/]*';
    else re += ch.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function denyRoots(config) {
  const sub = { '<ops>': config.ops, '<evidence>': config.evidence, '<state>': config.state, '<yume.store>': config.yume?.store };
  const roots = new Set();
  for (const raw of config.publish?.denyRoots ?? []) {
    const p = sub[raw] ?? raw;
    if (!p) continue;
    roots.add(path.resolve(p));
    const r = real(p);
    if (r) roots.add(r);
  }
  return [...roots];
}

export async function publish({ config, candidate, manifest, out }) {
  const reasons = [];
  const pub = config?.publish;
  if (!pub?.allow?.length) reasons.push('publish config missing: no allow list');
  if (!config?.beaconRepo) reasons.push('publish config missing: beaconRepo');
  if (candidate?.status !== 'awaiting-review') reasons.push(`candidate status is ${candidate?.status}, not awaiting-review`);
  if (!candidate?.review?.approved_by) reasons.push('review.approved_by is missing');
  if (manifest?.candidate !== candidate?.id) reasons.push('manifest candidate does not match the candidate');
  const files = manifest?.files ?? [];
  if (!files.length) reasons.push('manifest has no files');
  if (reasons.some((r) => r.startsWith('publish config missing'))) return { ok: false, reasons, receipt: null };

  const allow = pub.allow.map(globToRegExp);
  const denies = denyRoots(config);
  const repoReal = real(config.beaconRepo) ?? path.resolve(config.beaconRepo);
  if (denies.some((d) => inside(path.resolve(out), d))) reasons.push('out is under a deny root');

  const staged = [];
  const seen = new Set();
  for (const f of files) {
    const abs = path.resolve(config.beaconRepo, f.from ?? '');
    const r = real(abs);
    if (!r) { reasons.push(`missing source: ${f.from}`); continue; }
    if (!fs.statSync(r).isFile()) { reasons.push(`source is not a file: ${f.from}`); continue; }
    if (!inside(r, repoReal)) reasons.push(`source outside beaconRepo: ${f.from}`);
    if (denies.some((d) => inside(abs, d) || inside(r, d))) reasons.push(`source under a deny root: ${f.from}`);

    const to = String(f.to ?? '');
    const segs = to.split('/');
    if (!to || path.isAbsolute(to) || segs.includes('..') || segs.includes('.')) reasons.push(`bad destination: ${to}`);
    else if (!allow.some((re) => re.test(to))) reasons.push(`destination not allowed: ${to}`);
    if (seen.has(to)) reasons.push(`duplicate destination: ${to}`);
    seen.add(to);

    const body = fs.readFileSync(r);
    const text = body.toString('latin1');
    if (denies.some((d) => text.includes(d))) reasons.push(`file mentions a deny root path: ${to}`);
    staged.push({ to, body });
  }
  if (reasons.length) return { ok: false, reasons, receipt: null };

  const entries = staged.map(({ to, body }) => ({ to, sha256: sha(body), bytes: body.length }));
  const receipt = {
    action: 'published', at: new Date().toISOString(),
    ref: sha(entries.map((e) => `${e.to}:${e.sha256}`).sort().join('\n')),
  };
  const put = (file, body) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.next`, body);
    fs.renameSync(`${file}.next`, file);
  };
  for (const { to, body } of staged) put(path.join(out, to), body);
  put(path.join(out, 'manifest.json'), JSON.stringify({ candidate: candidate.id, files: entries, receipt }, null, 2));
  return { ok: true, reasons: [], receipt };
}

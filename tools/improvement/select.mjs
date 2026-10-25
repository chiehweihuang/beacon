// Beacon · improvement loop selection: class by signature, ranking, exclusions (pure).
// Not a CLI. See plans/2026-10-25-improvement-loop.md "Classes and ranking".

export const RANK = { engine: 1, timeout: 2, missing: 3 };

export function classify(signature) {
  if (signature.startsWith('rules-diff:')) return 'engine';
  if (signature === 'audit-timeout' || signature === 'baseline-timeout') return 'timeout';
  if (signature === 'missing-report') return 'missing';
  if (signature.startsWith('capture:') || signature === 'bot-protected') return 'external';
  return null;
}

// reproduced/candidate are in hand: the next step (a fix candidate) happens outside the run loop.
const SETTLED = new Set(['validated', 'awaiting-review', 'excluded', 'reproduced', 'candidate']);
const settled = (c) => SETTLED.has(c.status) || (['failed', 'blocked'].includes(c.status) && !(c.failure ?? c.blocked)?.retry_eligible);

// candidates: current heads only. Returns { ranked: [candidate], exclude: [{id, reason}] }.
export function planSelect(candidates) {
  const ranked = [], exclude = [];
  for (const c of candidates) {
    if (settled(c)) continue;
    if (c.class === 'external') exclude.push({ id: c.id, reason: 'external cause (capture or bot protection), not a Beacon defect' });
    else if (!RANK[c.class]) exclude.push({ id: c.id, reason: 'unclassified signature, no reproducible class' });
    else ranked.push(c);
  }
  const failed = (c) => c.status === 'failed';
  ranked.sort((a, b) => failed(a) - failed(b) ||
    (failed(a) && ((a.failure?.attempts ?? 0) - (b.failure?.attempts ?? 0) || String(a.failure?.at ?? '').localeCompare(String(b.failure?.at ?? '')))) ||
    RANK[a.class] - RANK[b.class] || b.observation.count - a.observation.count || a.signature.localeCompare(b.signature));
  return { ranked, exclude };
}

// A candidate superseded by a newer one is history, not a head.
export function heads(candidates) {
  const old = new Set(candidates.map((c) => c.supersedes).filter(Boolean));
  return candidates.filter((c) => !old.has(c.id));
}

// Beacon Phase A · LCS line-merge: two committed surface variants -> one marked core.

const lines = (s) => s.split('\n');

function lcsOps(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push(['common', a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['cc', a[i]]); i++; }
    else { ops.push(['codex', b[j]]); j++; }
  }
  while (i < n) { ops.push(['cc', a[i]]); i++; }
  while (j < m) { ops.push(['codex', b[j]]); j++; }
  return ops;
}

export function lcsMerge(ccText, codexText) {
  const ops = lcsOps(lines(ccText), lines(codexText));
  const out = [];
  let mode = null;
  const close = () => { if (mode) out.push(`<!--/@${mode}-->`); mode = null; };
  for (const [tag, line] of ops) {
    if (tag === 'common') { close(); out.push(line); }
    else {
      if (mode !== tag) { close(); out.push(`<!--@${tag}-->`); mode = tag; }
      out.push(line);
    }
  }
  close();
  return out.join('\n');
}

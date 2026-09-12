// Regenerate the landing page's demo reports and inject the site nav bar.
// Run from the repo root:  node docs/make-demos.mjs
// Keeps the demo artifacts reproducible: the generated product report has no
// site navigation by design, so the back-links are injected here, not hand-edited.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = join(ROOT, 'core/scripts/static-audit.mjs');
const REPORTER = join(ROOT, 'core/scripts/generate-report.mjs');
const TMP = mkdtempSync(join(tmpdir(), 'beacon-demos-'));

const DEMOS = [
  {
    input: join(ROOT, 'docs/index.html'),
    scope: 'https://chiehweihuang.github.io/beacon/',
    url: 'https://chiehweihuang.github.io/beacon/',
    source: 'docs/index.html',
    out: join(ROOT, 'docs/reports/landing-self-audit.html'),
  },
  {
    input: join(ROOT, 'test/golden/dirty.html'),
    scope: 'beacon-golden-fixture',
    source: 'test/golden/dirty.html',
    out: join(ROOT, 'docs/reports/broken-fixture.html'),
  },
];

// Explicit font stack: the bar must never fall back to a default CJK serif.
const NAV = `<nav aria-label="Beacon site" style="font-family:Arial,'Noto Sans TC','Microsoft JhengHei','Noto Sans JP','Yu Gothic',sans-serif;font-size:15px;padding:10px 16px;background:#eef0f5;color:#1f2430;border-bottom:1px solid #c9cdd8;overflow-wrap:anywhere;">
  <a href="../index.html" style="color:#3730a3;font-weight:600;">&larr; Beacon</a>
  <span aria-hidden="true"> &middot; </span>
  <a href="../zh-Hant.html" lang="zh-Hant" style="color:#3730a3;font-weight:600;">回 Beacon 首頁（繁體中文）</a>
  <span aria-hidden="true"> &middot; </span>
  <span>本機生成快照 · Generated snapshot</span>
</nav>`;

for (const d of DEMOS) {
  const audit = join(TMP, 'audit.json');
  const dateArg = process.env.SOURCE_DATE_EPOCH ? [] : ['--date', new Date().toISOString().slice(0, 10)];
  execFileSync('node', [SCANNER, '--scope', d.scope, ...(d.url ? ['--url', d.url] : []), ...dateArg, '--output', audit, d.input], { stdio: 'pipe' });
  const data = JSON.parse(readFileSync(audit, 'utf8'));
  data.metadata.source_file = d.source;
  data.metadata.source_sha256 = createHash('sha256').update(readFileSync(d.input)).digest('hex');
  const jsonPath = d.out.replace(/\.html$/, '.json');
  const sourcePath = d.out.replace(/\.html$/, '.source.html.txt');
  writeFileSync(sourcePath, readFileSync(d.input));
  writeFileSync(audit, JSON.stringify(data, null, 2) + '\n');
  writeFileSync(jsonPath, readFileSync(audit));
  execFileSync('node', [REPORTER, audit, '--output', d.out], { stdio: 'pipe' });
  const html = readFileSync(d.out, 'utf8');
  if (!html.includes('<body>')) throw new Error(`no <body> tag in ${d.out}`);
  const evidenceLinks = `<p style="margin:.5rem 0 0"><a href="${jsonPath.split(/[\\/]/).pop()}" style="color:#3730a3">JSON 證據 · JSON evidence</a> · <a href="${sourcePath.split(/[\\/]/).pop()}" style="color:#3730a3">本次受測原始碼 · Audited source snapshot</a> · <a href="../zh-Hant.html#install" style="color:#3730a3">安裝與使用 · Install and use</a></p>`;
  writeFileSync(d.out, html.replace('<body>', `<body>\n${NAV.replace('</nav>', `${evidenceLinks}</nav>`)}`));
  const score = JSON.parse(readFileSync(audit, 'utf8')).summary.overall_score;
  console.log(`${d.out.split(/[\\/]/).pop()}  score ${score}  nav injected`);
}

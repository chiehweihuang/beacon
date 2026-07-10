// Regenerate the landing page's demo reports and inject the site nav bar.
// Run from the repo root:  node docs/make-demos.mjs
// Keeps the demo artifacts reproducible: the generated product report has no
// site navigation by design, so the back-links are injected here, not hand-edited.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = join(ROOT, 'core/scripts/static-audit.mjs');
const REPORTER = join(ROOT, 'core/scripts/generate-report.mjs');
const TMP = mkdtempSync(join(tmpdir(), 'beacon-demos-'));

const DEMOS = [
  {
    input: join(ROOT, 'docs/index.html'),
    scope: 'https://chiehweihuang.github.io/beacon/',
    out: join(ROOT, 'docs/reports/landing-self-audit.html'),
  },
  {
    input: join(ROOT, 'test/golden/dirty.html'),
    scope: 'beacon-golden-fixture',
    out: join(ROOT, 'docs/reports/broken-fixture.html'),
  },
];

// Explicit font stack: the bar must never fall back to a default CJK serif.
const NAV = `<nav aria-label="Beacon site" style="font-family:'Segoe UI',system-ui,-apple-system,'Noto Sans TC','Microsoft JhengHei',sans-serif;font-size:15px;padding:10px 16px;background:#eef0f5;color:#1f2430;border-bottom:1px solid #c9cdd8;">
  <a href="../index.html" style="color:#3730a3;font-weight:600;">&larr; Beacon</a>
  <span aria-hidden="true"> &middot; </span>
  <a href="../zh-Hant.html" lang="zh-Hant" style="color:#3730a3;font-weight:600;">回 Beacon 首頁（繁體中文）</a>
  <span aria-hidden="true"> &middot; </span>
  <span>live demo report</span>
</nav>`;

for (const d of DEMOS) {
  const audit = join(TMP, 'audit.json');
  const dateArg = process.env.SOURCE_DATE_EPOCH ? [] : ['--date', new Date().toISOString().slice(0, 10)];
  execFileSync('node', [SCANNER, '--scope', d.scope, '--url', d.scope, ...dateArg, '--output', audit, d.input], { stdio: 'pipe' });
  execFileSync('node', [REPORTER, audit, '--output', d.out], { stdio: 'pipe' });
  const html = readFileSync(d.out, 'utf8');
  if (!html.includes('<body>')) throw new Error(`no <body> tag in ${d.out}`);
  writeFileSync(d.out, html.replace('<body>', `<body>\n${NAV}`));
  const score = JSON.parse(readFileSync(audit, 'utf8')).summary.overall_score;
  console.log(`${d.out.split(/[\\/]/).pop()}  score ${score}  nav injected`);
}

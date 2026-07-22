// Ingest community reports (GitHub issue forms on chiehweihuang/beacon) into
// beacon-lab.db. Submissions are explicit, user-reviewed, and public by nature —
// the consented channel for "users' findings flow into the lab database".
//
//   node ingest-reports.mjs        # pull open+closed issues labeled false-positive
//
// Parses the structured form fields (### headings in the issue body) into
// community_reports; idempotent by issue number + updated_at.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const db = new DatabaseSync(resolve(ROOT, 'beacon-lab.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS community_reports (
  issue INTEGER PRIMARY KEY, updated_at TEXT, state TEXT, title TEXT,
  report_type TEXT, engine TEXT, key TEXT, markup TEXT, reason TEXT, url TEXT
);
`);

const raw = execFileSync('gh', ['api', 'repos/chiehweihuang/beacon/issues?state=all&labels=false-positive&per_page=100'], { encoding: 'utf8', timeout: 60000 });
const issues = JSON.parse(raw);

// Issue-form bodies render as "### <field label>\n\n<value>" blocks.
function field(body, label) {
  const m = String(body || '').match(new RegExp(`###\\s*${label}\\s*\\n+([\\s\\S]*?)(?=\\n###\\s|$)`, 'i'));
  return m ? m[1].trim().replace(/^```[a-z]*\n?|\n?```$/g, '').trim() : null;
}

const up = db.prepare(`INSERT OR REPLACE INTO community_reports(issue, updated_at, state, title, report_type, engine, key, markup, reason, url)
  VALUES (?,?,?,?,?,?,?,?,?,?)`);
let n = 0;
for (const i of issues) {
  const known = db.prepare('SELECT updated_at FROM community_reports WHERE issue = ?').get(i.number);
  if (known && known.updated_at === i.updated_at) continue;
  up.run(i.number, i.updated_at, i.state, i.title, 'false-positive',
    field(i.body, 'Engine fingerprint'), field(i.body, 'Finding key'),
    field(i.body, 'Minimal sanitized markup that reproduces the finding'),
    field(i.body, 'Why this is not a violation'), i.html_url);
  n++;
}
console.log(`community reports: ${issues.length} issues seen, ${n} ingested/updated`);

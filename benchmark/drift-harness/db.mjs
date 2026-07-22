// beacon-lab.db — one queryable SQLite view over everything this workspace measures.
// The JSON files stay the operational source of truth; this ingests them (idempotent,
// incremental by file mtime) so results are one SQL statement away.
//
//   node db.mjs sync                     # ingest registry + all audits + usage ledger
//   node db.mjs q "SELECT ..."           # raw SQL (read-only intent)
//   node db.mjs summary                  # counts by tier/band/status
//   node db.mjs site <url-substring>     # everything measured for matching sites
//   node db.mjs findings-top [N]         # most-fired finding keys across all audits
//   node db.mjs langs                    # score stats per language tag (survey tier)
//   node db.mjs fp                       # false-positive marks from the usage ledger
//
// Uses node:sqlite (built into Node >= 22.5) — no dependencies.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const db = new DatabaseSync(resolve(ROOT, 'beacon-lab.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS targets (
  id INTEGER PRIMARY KEY, url TEXT, band TEXT, status TEXT, tags TEXT, roles TEXT,
  important INTEGER DEFAULT 0, rank INTEGER, added TEXT, last_ok TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS audits (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER, url TEXT, source TEXT, run TEXT, date TEXT, engine TEXT,
  score INTEGER, coverage INTEGER, total_findings INTEGER,
  UNIQUE(target_id, source, run)
);
CREATE TABLE IF NOT EXISTS findings (
  audit_id INTEGER, key TEXT, category TEXT, severity TEXT, wcag TEXT, line INTEGER
);
CREATE INDEX IF NOT EXISTS idx_findings_key ON findings(key);
CREATE INDEX IF NOT EXISTS idx_findings_audit ON findings(audit_id);
CREATE TABLE IF NOT EXISTS usage_ledger (
  date TEXT, type TEXT, engine TEXT, project TEXT, score INTEGER, coverage INTEGER,
  key TEXT, location TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS ingested (path TEXT PRIMARY KEY, mtime INTEGER);
`);

function fresh(path) {
  const m = Math.floor(statSync(path).mtimeMs);
  const row = db.prepare('SELECT mtime FROM ingested WHERE path = ?').get(path);
  if (row && row.mtime === m) return false;
  db.prepare('INSERT OR REPLACE INTO ingested(path, mtime) VALUES (?, ?)').run(path, m);
  return true;
}

function ingestAudit(targetId, url, source, run, path) {
  if (!fresh(path)) return 0;
  let a;
  try { a = JSON.parse(readFileSync(path, 'utf8')); } catch { return 0; }
  const old = db.prepare('SELECT audit_id FROM audits WHERE target_id = ? AND source = ? AND run = ?').get(targetId, source, run);
  if (old) {
    db.prepare('DELETE FROM findings WHERE audit_id = ?').run(old.audit_id);
    db.prepare('DELETE FROM audits WHERE audit_id = ?').run(old.audit_id);
  }
  const s = a.summary || {};
  const info = db.prepare('INSERT INTO audits(target_id, url, source, run, date, engine, score, coverage, total_findings) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(targetId, url, source, run, a.metadata?.audit_date ?? null, a.metadata?.engine_fingerprint ?? null,
      s.overall_score ?? null, s.coverage_percent ?? null, s.total_findings ?? (a.findings || []).length);
  const auditId = Number(info.lastInsertRowid);
  const ins = db.prepare('INSERT INTO findings(audit_id, key, category, severity, wcag, line) VALUES (?,?,?,?,?,?)');
  for (const f of a.findings || []) {
    const line = Number(String(f.location || '').split(':').pop());
    ins.run(auditId, f.key ?? 'external', f.category ?? null, f.severity ?? null, f.wcag ?? null, Number.isFinite(line) ? line : null);
  }
  return 1;
}

function sync() {
  // registry: full refresh (cheap, always authoritative)
  const reg = JSON.parse(readFileSync(resolve(ROOT, 'targets.json'), 'utf8'));
  db.exec('DELETE FROM targets');
  const it = db.prepare('INSERT INTO targets(id, url, band, status, tags, roles, important, rank, added, last_ok, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const byId = new Map();
  for (const t of reg.targets) {
    it.run(t.id, t.url, t.band ?? null, t.status ?? null, (t.tags || []).join(','), (t.roles || []).join(','),
      t.important ? 1 : 0, t.rank ?? null, t.added ?? null, t.last_ok ?? null, t.notes ?? null);
    byId.set(t.id, t);
  }
  let n = 0;
  // survey audits (filename = target id)
  if (existsSync(resolve(ROOT, 'survey-audits'))) {
    for (const f of readdirSync(resolve(ROOT, 'survey-audits'))) {
      const id = Number(f.replace('.json', ''));
      const t = byId.get(id);
      if (t) n += ingestAudit(id, t.url, 'survey', 'intake', resolve(ROOT, 'survey-audits', f));
    }
  }
  // benchmark + drift runs (audits/ under each run dir; filename = target id)
  for (const d of readdirSync(ROOT).filter((x) => /^run-/.test(x))) {
    const ad = resolve(ROOT, d, 'audits');
    if (!existsSync(ad)) continue;
    const source = /weekly|drift/.test(d) ? 'drift' : 'benchmark';
    for (const f of readdirSync(ad).filter((x) => x.endsWith('.json'))) {
      const id = Number(f.replace('.json', ''));
      const t = byId.get(id);
      if (t) n += ingestAudit(id, t.url, source, d, join(ad, f));
    }
  }
  // plugin usage ledger (this machine's own inspects + FP marks)
  const ledger = join(homedir(), '.beacon', 'usage.jsonl');
  if (existsSync(ledger) && fresh(ledger)) {
    db.exec('DELETE FROM usage_ledger');
    const il = db.prepare('INSERT INTO usage_ledger(date, type, engine, project, score, coverage, key, location, reason) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const line of readFileSync(ledger, 'utf8').split('\n').filter(Boolean)) {
      try {
        const e = JSON.parse(line);
        il.run(e.date ?? null, e.type ?? null, e.engine ?? null, e.project ?? null, e.score ?? null,
          e.coverage ?? null, e.key ?? null, e.location ?? null, e.user_reason ?? null);
      } catch { /* skip malformed line */ }
    }
  }
  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  console.log(`sync: +${n} audits ingested | targets ${c('targets')} | audits ${c('audits')} | findings ${c('findings')} | ledger ${c('usage_ledger')}`);
}

function table(rows) {
  if (!rows.length) { console.log('(no rows)'); return; }
  console.table(rows);
}

const cmd = process.argv[2] || 'summary';
if (cmd === 'sync') sync();
else if (cmd === 'q') table(db.prepare(process.argv[3]).all());
else if (cmd === 'summary') {
  table(db.prepare(`SELECT CASE WHEN roles LIKE '%survey%' THEN 'survey' ELSE 'core' END tier, band, status, COUNT(*) n FROM targets GROUP BY 1, 2, 3 ORDER BY 1, 2`).all());
  table(db.prepare(`SELECT source, COUNT(*) audits, ROUND(AVG(score),1) avg_score, SUM(total_findings) findings FROM audits GROUP BY source`).all());
} else if (cmd === 'site') {
  const pat = `%${process.argv[3] || ''}%`;
  table(db.prepare(`SELECT a.url, a.source, a.run, a.engine, a.score, a.coverage, a.total_findings FROM audits a WHERE a.url LIKE ? ORDER BY a.run`).all(pat));
  table(db.prepare(`SELECT f.key, COUNT(*) n FROM findings f JOIN audits a ON a.audit_id = f.audit_id WHERE a.url LIKE ? GROUP BY f.key ORDER BY n DESC LIMIT 15`).all(pat));
} else if (cmd === 'findings-top') {
  table(db.prepare(`SELECT f.key, COUNT(*) instances, COUNT(DISTINCT a.target_id) sites FROM findings f JOIN audits a ON a.audit_id = f.audit_id GROUP BY f.key ORDER BY instances DESC LIMIT ?`).all(Number(process.argv[3] || 20)));
} else if (cmd === 'langs') {
  table(db.prepare(`SELECT SUBSTR(t.tags, INSTR(t.tags, 'lang:') + 5, 2) lang, COUNT(*) sites, ROUND(AVG(a.score),1) avg_score, MIN(a.score) min, MAX(a.score) max
    FROM targets t JOIN audits a ON a.target_id = t.id AND a.source = 'survey'
    WHERE t.tags LIKE '%lang:%' GROUP BY 1 HAVING sites >= 2 ORDER BY sites DESC`).all());
} else if (cmd === 'fp') {
  table(db.prepare(`SELECT date, engine, key, location, reason FROM usage_ledger WHERE type = 'fp-report' ORDER BY date DESC`).all());
} else {
  console.log('commands: sync | q "SQL" | summary | site <substr> | findings-top [N] | langs | fp');
}

// Batch site-PDF triage — turns one HTML page (URL or local file) into an
// accessibility audit artifact for PDF-heavy sites (gov / municipal / .edu):
// collect every linked PDF, probe each with the pdf-detect engine, and report
// "N of M linked PDFs are untagged (unreadable by a screen reader)".
//
// This is the single most useful sales/audit headline for the document layer —
// Deque charges for PDF checking and there is no free batch tool. It reuses the
// real assessPdf contract: assessPdf(buffer) -> { status, findings:[{key,...}], note }.
// status is 'FLAG'|'REVIEW'|'PASS'|'INSUFFICIENT'; "untagged" is the presence of
// a finding with key 'pdf-untagged' (NOT a top-level field). The pure functions
// are exported so tests exercise the REAL probe, not a stubbed contract.
//
// Usage: node pdf-triage.mjs <url-or-local-html> [--max N] [--timeout MS] [--json]

import { readFileSync } from 'node:fs';
import { assessPdf } from './pdf-detect.mjs';

const DEFAULT_MAX = 200;       // cap PDFs probed; excess is logged, never silently dropped
const DEFAULT_TIMEOUT = 20000; // per-fetch ms
const CONCURRENCY = 6;

// --- link collection (pure) -----------------------------------------------
// Pull href targets that look like PDFs and resolve them against baseUrl.
// baseUrl may be null (local file with no base) — then only absolute http(s)
// PDF links are usable; relative ones are returned as null and counted.
export function collectPdfLinks(html, baseUrl) {
  const hrefs = [];
  for (const m of String(html).matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) hrefs.push(m[1]);
  const isPdf = (u) => /\.pdf(?:[?#]|$)/i.test(u);
  const seen = new Set();
  const out = [];
  for (const href of hrefs) {
    if (!isPdf(href)) continue;
    let abs = null;
    try { abs = baseUrl ? new URL(href, baseUrl).href : new URL(href).href; }
    catch { abs = null; } // relative href with no base -> unresolvable
    const key = abs || href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ href, url: abs });
  }
  return out;
}

// --- per-PDF classification (pure, uses the REAL probe) --------------------
export function classifyPdf(buffer) {
  const r = assessPdf(buffer);
  const untagged = r.findings.some((f) => f.key === 'pdf-untagged');
  return {
    status: r.status,                 // FLAG | REVIEW | PASS | INSUFFICIENT
    untagged,                         // the headline metric
    findingKeys: r.findings.map((f) => f.key),
    note: r.note,
  };
}

// --- aggregate (pure) ------------------------------------------------------
export function summarize(results) {
  const tally = { total: results.length, fetched: 0, untagged: 0, fail: 0, review: 0, ok: 0, notPdf: 0, fetchError: 0 };
  for (const r of results) {
    if (r.error) { tally.fetchError++; continue; }
    tally.fetched++;
    if (r.status === 'INSUFFICIENT') { tally.notPdf++; continue; }
    if (r.untagged) tally.untagged++;
    if (r.status === 'FLAG') tally.fail++;
    else if (r.status === 'REVIEW') tally.review++;
    else if (r.status === 'PASS') tally.ok++;
  }
  return tally;
}

export function headline(t) {
  if (t.fetched === 0) return `No linked PDFs could be fetched (${t.total} found, ${t.fetchError} fetch error(s)).`;
  const pct = Math.round((t.untagged / t.fetched) * 100);
  return `${t.untagged} of ${t.fetched} linked PDFs are untagged (${pct}%) — unreadable in correct order by a screen reader.`;
}

// --- orchestration ---------------------------------------------------------
// fetchImpl is injectable for tests: async (url, {timeout}) -> { bytes:Buffer } | { error:string }.
async function defaultFetchBytes(url, { timeout }) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { bytes: buf };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// triage(input, opts) -> { links, results, tally, headline, truncated }
// input: a URL (http/https) or local HTML file path.
export async function triage(input, opts = {}) {
  const max = opts.max || DEFAULT_MAX;
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  const fetchBytes = opts.fetchBytes || defaultFetchBytes;
  const log = opts.log || (() => {});

  const isUrl = /^https?:\/\//i.test(input);
  let html, baseUrl;
  if (isUrl) {
    const got = await fetchBytes(input, { timeout });
    if (got.error) throw new Error(`could not fetch page ${input}: ${got.error}`);
    html = got.bytes.toString('utf8');
    baseUrl = input;
  } else {
    html = readFileSync(input, 'utf8');
    baseUrl = opts.base || null; // relative links unresolvable without --base
  }

  let links = collectPdfLinks(html, baseUrl);
  const unresolved = links.filter((l) => !l.url).length;
  let truncated = 0;
  const fetchable = links.filter((l) => l.url);
  if (fetchable.length > max) {
    truncated = fetchable.length - max;
    log(`capping at ${max} PDFs; ${truncated} more linked PDFs NOT probed (raise --max to include them).`);
  }
  const toProbe = fetchable.slice(0, max);

  const results = await mapLimit(toProbe, CONCURRENCY, async (link) => {
    const got = await fetchBytes(link.url, { timeout });
    if (got.error) return { url: link.url, error: got.error };
    return { url: link.url, ...classifyPdf(got.bytes) };
  });

  const tally = summarize(results);
  tally.unresolved = unresolved;
  return { links, results, tally, headline: headline(tally), truncated };
}

// --- CLI -------------------------------------------------------------------
function parseArgs(argv) {
  const o = { input: null, max: DEFAULT_MAX, timeout: DEFAULT_TIMEOUT, json: false, base: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') o.max = parseInt(argv[++i], 10) || DEFAULT_MAX;
    else if (a === '--timeout') o.timeout = parseInt(argv[++i], 10) || DEFAULT_TIMEOUT;
    else if (a === '--base') o.base = argv[++i];
    else if (a === '--json') o.json = true;
    else if (!a.startsWith('--')) o.input = a;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.input) {
    console.error('Usage: node pdf-triage.mjs <url-or-local-html> [--max N] [--timeout MS] [--base URL] [--json]');
    process.exit(2);
  }
  const r = await triage(o.input, { max: o.max, timeout: o.timeout, base: o.base, log: (m) => console.error('note: ' + m) });
  if (o.json) { console.log(JSON.stringify(r, null, 2)); return; }
  console.log(r.headline);
  const t = r.tally;
  console.log(`  fetched ${t.fetched}/${t.total}  |  untagged ${t.untagged}  fail ${t.fail}  review ${t.review}  ok ${t.ok}  not-a-pdf ${t.notPdf}  fetch-error ${t.fetchError}` + (t.unresolved ? `  unresolved-relative ${t.unresolved}` : ''));
  for (const res of r.results) {
    if (res.error) { console.log(`  [fetch-error: ${res.error}] ${res.url}`); continue; }
    const tag = res.untagged ? 'UNTAGGED' : res.status;
    console.log(`  [${tag}] ${res.url}`);
  }
}

// Run only as a CLI, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('pdf-triage.mjs')) {
  main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
}

// Beacon · batch site-PDF triage. Tests the pure functions against the REAL
// pdf-detect probe (no stubbed assessPdf — the synthesis flagged that a wrong-
// shaped stub masked a contract bug), stubbing ONLY the network via an injected
// fetchBytes so triage() runs end-to-end deterministically and offline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectPdfLinks, classifyPdf, summarize, headline, triage } from '../core/scripts/pdf-triage.mjs';

const B = (s) => Buffer.from(s, 'latin1');
// Minimal real PDFs (same shapes the pdf-detect suite validates).
const UNTAGGED = B('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const TAGGED = B('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n5 0 obj\n<< /Title (Report) >>\nendobj\ntrailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF\n');

// --- collectPdfLinks ------------------------------------------------------
test('collectPdfLinks resolves relative links against base, dedupes, keeps query', () => {
  const html = `
    <a href="/docs/a.pdf">A</a>
    <a href="report.pdf?v=2">B</a>
    <a href="https://other.test/c.PDF">C</a>
    <a href="/docs/a.pdf">dup</a>
    <a href="/page.html">not a pdf</a>`;
  const links = collectPdfLinks(html, 'https://site.test/sub/');
  const urls = links.map((l) => l.url);
  assert.ok(urls.includes('https://site.test/docs/a.pdf'));
  assert.ok(urls.includes('https://site.test/sub/report.pdf?v=2'));
  assert.ok(urls.includes('https://other.test/c.PDF'));
  assert.equal(urls.filter((u) => u === 'https://site.test/docs/a.pdf').length, 1, 'deduped');
  assert.ok(!urls.some((u) => /page\.html/.test(u)), 'non-pdf excluded');
});

test('collectPdfLinks marks relative links unresolvable when no base', () => {
  const links = collectPdfLinks('<a href="x.pdf">x</a><a href="https://a.test/y.pdf">y</a>', null);
  assert.equal(links.find((l) => l.href === 'x.pdf').url, null);
  assert.equal(links.find((l) => l.href.endsWith('y.pdf')).url, 'https://a.test/y.pdf');
});

// --- classifyPdf (real probe) ---------------------------------------------
test('classifyPdf flags an untagged PDF and passes a tagged one (real assessPdf)', () => {
  const u = classifyPdf(UNTAGGED);
  assert.equal(u.status, 'FLAG');
  assert.equal(u.untagged, true);
  const t = classifyPdf(TAGGED);
  assert.equal(t.status, 'PASS');
  assert.equal(t.untagged, false);
});

// --- summarize / headline -------------------------------------------------
test('summarize tallies buckets and headline reports untagged ratio', () => {
  const results = [
    { status: 'FLAG', untagged: true },
    { status: 'FLAG', untagged: true },
    { status: 'PASS', untagged: false },
    { status: 'REVIEW', untagged: false },
    { error: 'timeout' },
  ];
  const t = summarize(results);
  assert.equal(t.total, 5);
  assert.equal(t.fetched, 4);
  assert.equal(t.untagged, 2);
  assert.equal(t.fail, 2);
  assert.equal(t.review, 1);
  assert.equal(t.ok, 1);
  assert.equal(t.fetchError, 1);
  assert.match(headline(t), /2 of 4 linked PDFs are untagged \(50%\)/);
});

// --- triage end-to-end with injected network ------------------------------
test('triage runs end-to-end against the real probe with a stubbed fetcher', async () => {
  const page = 'https://gov.test/forms/';
  const html = `<a href="a.pdf">a</a><a href="/b.pdf">b</a><a href="https://gov.test/c.pdf">c</a><a href="d.pdf">missing</a>`;
  const bytesByUrl = {
    'https://gov.test/forms/': B(html),
    'https://gov.test/forms/a.pdf': UNTAGGED,
    'https://gov.test/b.pdf': UNTAGGED,
    'https://gov.test/c.pdf': TAGGED,
    'https://gov.test/forms/d.pdf': null, // simulate fetch error
  };
  const fetchBytes = async (url) => {
    if (!(url in bytesByUrl) || bytesByUrl[url] === null) return { error: '404' };
    return { bytes: bytesByUrl[url] };
  };
  const r = await triage(page, { fetchBytes });
  assert.equal(r.tally.total, 4);          // 4 distinct pdf links
  assert.equal(r.tally.fetched, 3);        // d.pdf errored
  assert.equal(r.tally.untagged, 2);       // a.pdf + b.pdf
  assert.equal(r.tally.ok, 1);             // c.pdf
  assert.equal(r.tally.fetchError, 1);
  assert.match(r.headline, /2 of 3 linked PDFs are untagged/);
});

test('triage caps at --max and reports the truncation, never silently drops', async () => {
  const links = Array.from({ length: 5 }, (_, i) => `<a href="https://g.test/${i}.pdf">${i}</a>`).join('');
  const fetchBytes = async (url) => (url === 'https://g.test/' ? { bytes: B(links) } : { bytes: UNTAGGED });
  const notes = [];
  const r = await triage('https://g.test/', { fetchBytes, max: 2, log: (m) => notes.push(m) });
  assert.equal(r.truncated, 3);
  assert.equal(r.tally.fetched, 2);
  assert.ok(notes.some((n) => /capping at 2/.test(n)), 'truncation logged, not silent');
});

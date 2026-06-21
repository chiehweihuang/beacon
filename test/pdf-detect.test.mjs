// Beacon · PDF accessibility probe (WCAG 1.3.1 / 2.4.2 / 3.1.1 / 4.1.2 + PDF/UA).
// Unit tests on the pure detector (each band + the compressed-objstm inflate path
// + FP/FN guards), plus black-box tests confirming static-audit reads .pdf files
// as Buffers, wires findings through to the screenreader category, and emits
// nothing for a clean tagged PDF.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { deflateSync, deflateRawSync } from 'node:zlib';

import { assessPdf } from '../core/scripts/pdf-detect.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');
const B = (s) => Buffer.from(s, 'latin1');
const concat = (...parts) => Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : B(p))));

// --- fixture builders -----------------------------------------------------
const untagged = () => B('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

const taggedGood = () => B(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en-US) /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n4 0 obj\n<< /Type /StructTreeRoot >>\nendobj\n5 0 obj\n<< /Title (Quarterly Accessibility Report) >>\nendobj\ntrailer\n<< /Root 1 0 R /Info 5 0 R >>\n%%EOF\n');

// StructTreeRoot only inside a zlib-deflated ObjStm — exercises the inflate path.
const compressedTagged = () => {
  const payload = '1 0 << /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (zh-Hant) /ViewerPreferences << /DisplayDocTitle true >> >>\n5 0 << /Title (Compressed Title) >>';
  const deflated = deflateSync(Buffer.from(payload, 'latin1'));
  return concat(
    `%PDF-1.5\n2 0 obj\n<< /Type /Pages >>\nendobj\n6 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`,
    deflated,
    '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
};

// raw-deflate (no zlib header) variant of the same — exercises inflateRawSync.
const compressedTaggedRaw = () => {
  const payload = '1 0 << /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en) /Title (Raw) /ViewerPreferences << /DisplayDocTitle true >> >>';
  const raw = deflateRawSync(Buffer.from(payload, 'latin1'));
  return concat(
    `%PDF-1.5\n6 0 obj\n<< /Type /ObjStm /Filter /FlateDecode /Length ${raw.length} >>\nstream\n`,
    raw,
    '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
};

const P_BOTH_CLEARED = (-1 & ~0b11) & ~16 & ~512; // copy(16) + a11y(512) bits cleared
const P_A11Y_ONLY = (-1 & ~0b11) & ~512; // only a11y bit cleared

// Encrypted + tagged, with NO /Lang and NO /Title. /P = -1 leaves all permission bits
// set (encClass 'ok'), so the only candidate findings are the secondary lang/title
// REVIEWs — which MUST be suppressed under encryption: their markers may be locked
// inside encrypted streams we cannot read, so "missing" is unverifiable, not a fail.
const encryptedTaggedNoSecondary = () => B(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> >>\nendobj\n4 0 obj\n<< /Type /StructTreeRoot >>\nendobj\n9 0 obj\n<< /Filter /Standard /P -1 >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n%%EOF\n');

test('encrypted tagged PDF suppresses the secondary lang/title checks (no false REVIEW)', () => {
  const r = assessPdf(encryptedTaggedNoSecondary());
  const keys = r.findings.map((f) => f.key);
  assert.equal(keys.includes('pdf-lang-missing'), false, 'lang check is suppressed under encryption');
  assert.equal(keys.includes('pdf-title-not-shown'), false, 'title check is suppressed under encryption');
  assert.match(r.note, /Encrypted/, 'the note records that secondary checks were skipped');
});

const encryptedAtBlocked = () => B(
  `%PDF-1.6\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en) /Title (Locked) /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n4 0 obj\n<< /Type /StructTreeRoot >>\nendobj\n7 0 obj\n<< /Filter /Standard /V 2 /R 3 /P ${P_BOTH_CLEARED} >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 7 0 R >>\n%%EOF\n`);

const encryptedA11yBitOnly = () => B(
  `%PDF-1.6\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en) /Title (Doc) /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n7 0 obj\n<< /Filter /Standard /P ${P_A11Y_ONLY} >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 7 0 R >>\n%%EOF\n`);

const taggedNoLangNoTitle = () => B('%PDF-1.7\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> >>\nendobj\n4 0 obj\n<< /Type /StructTreeRoot >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

const notPdf = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// --- unit: bands ----------------------------------------------------------
test('untagged PDF -> FLAG pdf-untagged', () => {
  const r = assessPdf(untagged());
  assert.equal(r.status, 'FLAG');
  assert.ok(r.findings.some((f) => f.key === 'pdf-untagged' && f.band === 'FLAG'));
});

test('fully tagged PDF (lang + shown title) -> PASS, no findings', () => {
  const r = assessPdf(taggedGood());
  assert.equal(r.status, 'PASS');
  assert.equal(r.findings.length, 0);
});

test('StructTreeRoot only inside a zlib-deflated ObjStm -> PASS (inflate path)', () => {
  const r = assessPdf(compressedTagged());
  assert.equal(r.status, 'PASS');
  assert.match(r.note, /inflated object streams/);
});

test('StructTreeRoot inside a raw-deflate stream -> PASS (inflateRawSync fallback)', () => {
  assert.equal(assessPdf(compressedTaggedRaw()).status, 'PASS');
});

test('encrypted with copy+accessibility bits cleared -> FLAG pdf-encrypt-blocks-at', () => {
  const r = assessPdf(encryptedAtBlocked());
  assert.equal(r.status, 'FLAG');
  assert.ok(r.findings.some((f) => f.key === 'pdf-encrypt-blocks-at'));
});

test('encrypted clearing ONLY the deprecated accessibility bit -> REVIEW', () => {
  const r = assessPdf(encryptedA11yBitOnly());
  assert.equal(r.status, 'REVIEW');
  assert.ok(r.findings.some((f) => f.key === 'pdf-encrypt-a11y-bit-cleared'));
});

test('tagged but missing /Lang and title -> REVIEW (lang + title findings)', () => {
  const r = assessPdf(taggedNoLangNoTitle());
  assert.equal(r.status, 'REVIEW');
  assert.ok(r.findings.some((f) => f.key === 'pdf-lang-missing'));
  assert.ok(r.findings.some((f) => f.key === 'pdf-title-not-shown'));
});

test('non-PDF byte blob -> INSUFFICIENT, no findings (never a false untagged)', () => {
  const r = assessPdf(notPdf());
  assert.equal(r.status, 'INSUFFICIENT');
  assert.equal(r.findings.length, 0);
});

// --- unit: FP / robustness guards -----------------------------------------
test('empty buffer -> INSUFFICIENT (not a false untagged)', () => {
  assert.equal(assessPdf(Buffer.alloc(0)).status, 'INSUFFICIENT');
});

test('a stray /P outside any /Encrypt dict does not trigger an encryption finding', () => {
  const pdf = B('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /StructTreeRoot 4 0 R /MarkInfo << /Marked true >> /Lang (en) /Title (T) /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n4 0 obj\n<< /Type /StructTreeRoot >>\nendobj\n3 0 obj\nstream\n/P -999 BT (x) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  const r = assessPdf(pdf);
  assert.equal(r.status, 'PASS');
  assert.ok(!r.findings.some((f) => String(f.key).startsWith('pdf-encrypt')));
});

test('untagged + a FlateDecode image stream (not the catalog) stays FLAG untagged', () => {
  const img = deflateSync(Buffer.from('\x00\x01\x02 pixels not a catalog', 'latin1'));
  const pdf = concat(`%PDF-1.5\n1 0 obj\n<< /Type /Catalog >>\nendobj\n8 0 obj\n<< /Filter /FlateDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
  assert.equal(assessPdf(pdf).status, 'FLAG');
});

test('Uint8Array input is accepted (coerced to Buffer)', () => {
  const u8 = new Uint8Array(taggedGood());
  assert.equal(assessPdf(u8).status, 'PASS');
});

// --- black-box: findings flow through static-audit ------------------------
function runScannerPdf(name, buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-pdf-'));
  try {
    const fixture = join(dir, name);
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, buffer);
    execFileSync('node', [SCANNER, '--scope', 'pdf-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('static-audit reads a .pdf as a Buffer and emits pdf-untagged (screenreader)', () => {
  const audit = runScannerPdf('doc.pdf', untagged());
  const hit = audit.findings.filter((f) => f.key === 'pdf-untagged');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].category, 'screenreader');
  assert.match(hit[0].wcag, /1\.3\.1/);
});

test('static-audit emits no PDF finding for a fully tagged PDF', () => {
  const audit = runScannerPdf('good.pdf', taggedGood());
  assert.equal(audit.findings.filter((f) => String(f.key).startsWith('pdf-')).length, 0);
});

test('static-audit maps the compressed-objstm tagged PDF to PASS (no pdf finding)', () => {
  const audit = runScannerPdf('compressed.pdf', compressedTagged());
  assert.equal(audit.findings.filter((f) => String(f.key).startsWith('pdf-')).length, 0);
});

test('static-audit routes a REVIEW pdf finding to the review bucket, not a hard fail', () => {
  const audit = runScannerPdf('nolang.pdf', taggedNoLangNoTitle());
  const langF = audit.findings.find((f) => f.key === 'pdf-lang-missing');
  assert.ok(langF);
  assert.equal(langF.severity, 'tip');
  // REVIEW findings land in stats.review (check:'review'), increasing screenreader.review.
  const sr = audit.summary.categories.find((c) => c.id === 'screenreader');
  assert.ok(sr.review >= 1);
});

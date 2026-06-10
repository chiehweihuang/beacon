// Beacon · WCAG 3.1.1 declared-lang vs content-language detector.
// Unit tests on the pure functions (all bands + thresholds), plus black-box
// tests confirming static-audit wires the finding through to the audit JSON.
// Calibrated against a 9-real + 9-synthetic set (see beacon-detector-sim FINDINGS).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { assessLang, extractText, detectContentLanguage } from '../core/scripts/lang-detect.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

const HAN = '中文內容測試範例文字資料庫系統設計';
const JPN = 'これはひらがなとカタカナと漢字の日本語のテキストです';
const HANGUL = '안녕하세요한국어콘텐츠테스트데이터베이스시스템설계웹페이지내용';

// Build plain text with exactly `cjk` fraction of meaningful chars being Han.
function mix(cjk, n = 1400) {
  const h = Math.round(n * cjk);
  let han = '';
  while ([...han].length < h) han += HAN;
  han = [...han].slice(0, h).join('');
  return 'a'.repeat(n - h) + ' ' + han;
}

// --- pure detector: bands ------------------------------------------------
test('PASS: latin content on a latin-declared page', () => {
  assert.equal(assessLang('en', mix(0)).status, 'PASS');
  assert.equal(assessLang('fr', mix(0)).status, 'PASS');          // non-English latin
  assert.equal(assessLang('en', mix(0.10)).status, 'PASS');       // incidental CJK tolerated
});

test('FLAG: substantial CJK on a latin-declared page (a real-world latin-declared case)', () => {
  const v = assessLang('en', mix(0.58));
  assert.equal(v.status, 'FLAG');
  assert.equal(v.detectedFamily, 'han');
});

test('REVIEW: uncertain band (25-40% CJK) is its own output, not a hard flag', () => {
  assert.equal(assessLang('en', mix(0.30)).status, 'REVIEW');
});

test('FLAG: latin content on a CJK-declared page', () => {
  assert.equal(assessLang('zh', mix(0)).status, 'FLAG');
});

test('PASS: correctly declared CJK pages', () => {
  assert.equal(assessLang('zh-tw', mix(0.95)).status, 'PASS');
  assert.equal(assessLang('ja', JPN.repeat(40)).status, 'PASS');
});

test('FLAG: Japanese content declared as Chinese (kana disambiguation)', () => {
  const v = assessLang('zh', JPN.repeat(40));
  assert.equal(v.status, 'FLAG');
  assert.equal(v.detectedFamily, 'jpn');
});

test('CJK cross-script mismatches flag (regression: codex-found gap)', () => {
  assert.equal(assessLang('ko', HANGUL.repeat(20)).status, 'PASS');   // Korean correctly declared
  assert.equal(assessLang('ko', mix(0.95)).status, 'FLAG');           // ko declared, Chinese (han) content
  assert.equal(assessLang('zh', HANGUL.repeat(20)).status, 'FLAG');   // zh declared, Korean content
  assert.equal(assessLang('ko', JPN.repeat(40)).status, 'FLAG');      // ko declared, Japanese content
  assert.equal(assessLang('ja', mix(0.95)).status, 'REVIEW');         // ja declared, all-Han: kanji-heavy JA or Chinese?
});

test('BCP47 script subtag overrides the language guess', () => {
  assert.equal(assessLang('zh-Latn-pinyin', 'a'.repeat(1400)).status, 'PASS'); // explicitly Latin script
  assert.equal(assessLang('zh-Hant', mix(0.95)).status, 'PASS');               // explicitly Han script
});

test('FLAG: Japanese content on a latin-declared page', () => {
  assert.equal(assessLang('en', JPN.repeat(40)).status, 'FLAG');
});

test('INSUFFICIENT: too little text to judge (SPA guardrail)', () => {
  assert.equal(assessLang('en', 'Loading...').status, 'INSUFFICIENT');
});

test('NO_LANG / UNMODELLED edge cases', () => {
  assert.equal(assessLang(null, mix(0.5)).status, 'NO_LANG');
  assert.equal(assessLang('ar', mix(0)).status, 'UNMODELLED');     // script not modelled yet
});

// --- helpers -------------------------------------------------------------
test('extractText strips script/style and decodes entities', () => {
  assert.equal(extractText('<p>中文</p><script>console.log("hi")</script>'), '中文');
  assert.equal(extractText('<p>caf&#xe9;</p>'), 'café');
});

test('detectContentLanguage reports family and ratio', () => {
  const d = detectContentLanguage(mix(0.58));
  assert.equal(d.family, 'han');
  assert.ok(Math.abs(d.cjkRatio - 0.58) < 0.02);
});

// --- black-box: finding flows through static-audit to the JSON -----------
function runScanner(html) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-lang-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'lang-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('static-audit emits html-lang-mismatch for en page with Chinese content', () => {
  const audit = runScanner(`<!doctype html><html lang="en"><head><title>t</title></head><body><main><p>${mix(0.7)}</p></main></body></html>`);
  const hit = audit.findings.filter((f) => f.key === 'html-lang-mismatch');
  assert.equal(hit.length, 1, 'wrong lang must flag once');
  assert.match(hit[0].wcag, /3\.1\.1/);
});

test('static-audit does not flag a correctly declared zh-Hant page', () => {
  const audit = runScanner(`<!doctype html><html lang="zh-Hant"><head><title>t</title></head><body><main><p>${mix(0.95)}</p></main></body></html>`);
  assert.equal(audit.findings.filter((f) => String(f.key).startsWith('html-lang-mismatch')).length, 0);
});

test('static-audit reads UNQUOTED <html lang=..> (regression: codex follow-up)', () => {
  const audit = runScanner(`<!doctype html><html lang=en><head><title>t</title></head><body><main><p>${mix(0.7)}</p></main></body></html>`);
  assert.equal(audit.findings.filter((f) => f.key === 'html-lang-mismatch').length, 1, 'unquoted lang=en + CJK must flag');
});

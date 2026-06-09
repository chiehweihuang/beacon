// Beacon · WCAG 3.3.8 Accessible Authentication (Minimum) detector.
// Unit tests on the pure detector (each vendor/mode + band, plus FP guards),
// plus black-box tests confirming static-audit wires findings through and
// correctly skips INFO signals (invisible reCAPTCHA / Turnstile / clean forms).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { detectAuthBarriers } from '../core/scripts/auth-detect.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

const one = (html, key) => detectAuthBarriers(html).find((s) => s.key === key);
const bandsOf = (html) => detectAuthBarriers(html).map((s) => s.band);

// --- exemptions: not a 3.3.8 barrier -> INFO (no finding) ----------------
test('reCAPTCHA v3 (render param) and invisible are INFO, not flagged', () => {
  assert.equal(one('<script src="https://www.google.com/recaptcha/api.js?render=K"></script>', 'auth-recaptcha-invisible').band, 'INFO');
  assert.equal(one('<div class="g-recaptcha" data-sitekey="x" data-size="invisible"></div>', 'auth-recaptcha-invisible').band, 'INFO');
});

test('Cloudflare Turnstile is INFO (managed, non-interactive)', () => {
  assert.equal(one('<div class="cf-turnstile" data-sitekey="x"></div>', 'auth-turnstile').band, 'INFO');
});

test('clean login form produces no signals', () => {
  assert.deepEqual(detectAuthBarriers('<form><input type="email" autocomplete="email"><input type="password" autocomplete="current-password"></form>'), []);
});

// --- object-recognition CAPTCHAs: REVIEW (exempt under Minimum) -----------
test('interactive reCAPTCHA v2 is REVIEW, not a hard fail', () => {
  const s = one('<div class="g-recaptcha" data-sitekey="x"></div><script src="https://www.google.com/recaptcha/api.js"></script>', 'auth-recaptcha-v2');
  assert.equal(s.band, 'REVIEW');
  assert.match(s.wcag, /3\.3\.8/);
});

test('hCaptcha is REVIEW', () => {
  assert.equal(one('<div class="h-captcha" data-sitekey="x"></div><script src="https://js.hcaptcha.com/1/api.js"></script>', 'auth-hcaptcha').band, 'REVIEW');
});

// --- no exemption: hard FAIL ---------------------------------------------
test('distorted-text CAPTCHA (img + transcribe prompt) is FLAG', () => {
  const s = one('<form><img src="/captcha.php" alt="captcha image"><input name="captcha" type="text"><p>Enter the characters you see above</p></form>', 'auth-text-captcha');
  assert.equal(s.band, 'FLAG');
});

test('password field intercepting paste is FLAG', () => {
  assert.equal(one('<input type="password" name="pw" onpaste="return false">', 'auth-password-paste-blocked').band, 'FLAG');
});

test('password field with autocomplete=off is REVIEW', () => {
  assert.equal(one('<input type="password" name="pw" autocomplete="off">', 'auth-password-autocomplete-off').band, 'REVIEW');
});

// --- false-positive guards -----------------------------------------------
test('prose that merely mentions "captcha" is not flagged', () => {
  assert.deepEqual(detectAuthBarriers('<article><p>This article explains how a CAPTCHA protects forms.</p></article>'), []);
});

test('Chinese transcribe-prompt alone is REVIEW, not FLAG', () => {
  assert.equal(one('<form><input name="vcode"><p>請輸入圖片中的驗證碼</p></form>', 'auth-text-captcha').band, 'REVIEW');
});

test('autocomplete="current-password" / "new-password" do not flag', () => {
  assert.equal(bandsOf('<input type="password" autocomplete="current-password">').length, 0);
  assert.equal(bandsOf('<input type="password" autocomplete="new-password">').length, 0);
});

// --- black-box: findings flow through static-audit -----------------------
function runScanner(html) {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-auth-'));
  try {
    const fixture = join(dir, 'page.html');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, html);
    execFileSync('node', [SCANNER, '--scope', 'auth-test', '--output', out, fixture], {
      stdio: ['ignore', 'pipe', 'pipe'], cwd: dir,
    });
    return JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('static-audit emits auth-password-paste-blocked (3.3.8, forms)', () => {
  const audit = runScanner('<!doctype html><html lang="en"><head><title>t</title></head><body><form><input type="password" name="pw" onpaste="return false"></form></body></html>');
  const hit = audit.findings.filter((f) => f.key === 'auth-password-paste-blocked');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].category, 'forms');
  assert.match(hit[0].wcag, /3\.3\.8/);
});

test('static-audit does not emit any auth finding for v3 reCAPTCHA or clean form', () => {
  const v3 = runScanner('<!doctype html><html lang="en"><head><title>t</title></head><body><script src="https://www.google.com/recaptcha/api.js?render=K"></script><form><input type="password" autocomplete="current-password"></form></body></html>');
  assert.equal(v3.findings.filter((f) => String(f.key).startsWith('auth-')).length, 0);
});

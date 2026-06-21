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

import { detectAuthBarriers, detectAuthBarriersInSource } from '../core/scripts/auth-detect.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER = resolve(ROOT, 'core/scripts/static-audit.mjs');

const one = (html, key) => detectAuthBarriers(html).find((s) => s.key === key);
const bandsOf = (html) => detectAuthBarriers(html).map((s) => s.band);

test('FP guard: id "refresh-captcha" must not false-match hCaptcha (word boundary)', () => {
  const html = '<form><img id="refresh-captcha" src="r.png" alt="refresh"><input name="cap"></form>';
  assert.equal(detectAuthBarriers(html).some((s) => /hcaptcha/i.test(s.key)), false,
    'the substring "h-captcha" inside "refresh-captcha" must not trigger an hCaptcha signal');
});

test('regression: a real h-captcha class still flags after the word-boundary fix', () => {
  assert.ok(one('<form><div class="h-captcha" data-sitekey="x"></div></form>', 'auth-hcaptcha'),
    'a genuine h-captcha widget must still be detected');
});

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

test('unquoted HTML attribute values are detected (regression: codex-found gap)', () => {
  assert.equal(one('<input type=password name=pw onpaste="return false">', 'auth-password-paste-blocked').band, 'FLAG');
  assert.equal(one('<input type=password autocomplete=off>', 'auth-password-autocomplete-off').band, 'REVIEW');
});

test('data-type="password" does not trigger the password scan', () => {
  assert.equal(bandsOf('<input data-type="password" type="text">').length, 0);
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

// === source-level auth barriers (JS/JSX/TS) — appended ===

const src1 = (code, key) => detectAuthBarriersInSource(code).find((s) => s.key === key);
const srcBands = (code) => detectAuthBarriersInSource(code).map((s) => s.band);

// --- (a)/(b) JS-set password type + clipboard block -> REVIEW (never FLAG) --
test('source: el.type=password then addEventListener(paste, preventDefault) is REVIEW', () => {
  const code = `const el = document.getElementById('pw'); el.type = 'password';\n el.addEventListener('paste', e => e.preventDefault());`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

test('source: setAttribute(type,password) + onpaste property returning false is REVIEW', () => {
  const code = `input.setAttribute('type','password'); input.onpaste = function(e){ return false; };`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

test('source: querySelector password field + paste preventDefault is REVIEW', () => {
  const code = `const pw = document.querySelector('input[type=password]');\n pw.addEventListener('paste', (e) => { e.preventDefault(); });`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

test('source: JSX passwordInput ref + onPaste preventDefault is REVIEW', () => {
  const code = `function F(){ return <input ref={passwordInput} type="password" onPaste={(e)=>e.preventDefault()} />; }`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

test('source: Django PasswordInput attrs onpaste/return false is REVIEW', () => {
  const code = `password = forms.CharField(widget=forms.PasswordInput(attrs={'class':'c','onpaste':'return false;'}))`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

test('source: WTForms PasswordField render_kw onpaste is REVIEW', () => {
  const code = `password = PasswordField('Password', render_kw={'onpaste': 'return false;'})`;
  assert.equal(src1(code, 'auth-password-clipboard-blocked-js').band, 'REVIEW');
});

// --- FP guards: clipboard block NOT on a password field -> nothing ---------
test('source: copy-protected article body is not a password barrier', () => {
  const code = `document.querySelector('.article-body').addEventListener('copy', e => e.preventDefault());`;
  assert.equal(srcBands(code).length, 0);
});

test('source: paste listener that does not prevent default is not flagged', () => {
  const code = `pwInput.addEventListener('paste', e => analytics.track('pasted'));`;
  assert.equal(srcBands(code).length, 0);
});

test('source: Django oncopy on a non-password Textarea is not flagged', () => {
  const code = `notes = forms.CharField(widget=forms.Textarea(attrs={'oncopy':'return false;'}))`;
  assert.equal(srcBands(code).length, 0);
});

// --- (c) JS-rendered / injected CAPTCHA -----------------------------------
test('source: grecaptcha.render (no static div) is REVIEW', () => {
  assert.equal(src1(`grecaptcha.render('c', { sitekey: 'k' });`, 'auth-recaptcha-js-render').band, 'REVIEW');
});

test('source: grecaptcha.enterprise.render is REVIEW', () => {
  assert.equal(src1(`grecaptcha.enterprise.render('c', { sitekey: 'k' });`, 'auth-recaptcha-js-render').band, 'REVIEW');
});

test('source: grecaptcha.render size:invisible emits nothing', () => {
  assert.equal(srcBands(`grecaptcha.render('c', { sitekey: 'k', size: 'invisible' });`).length, 0);
});

test('source: grecaptcha.execute (v3) alone emits nothing (markup detector owns it as INFO)', () => {
  assert.equal(srcBands(`grecaptcha.execute('s', { action: 'login' }).then(t => send(t));`).length, 0);
});

test('source: hcaptcha.render (no static div) is REVIEW; invisible emits nothing', () => {
  assert.equal(src1(`hcaptcha.render('h', { sitekey: 'k' });`, 'auth-hcaptcha-js-render').band, 'REVIEW');
  assert.equal(srcBands(`hcaptcha.render('h', { sitekey: 'k', size: 'invisible' });`).length, 0);
});

test('source: dynamic injection of recaptcha api.js is INFO (no finding emitted by audit)', () => {
  const code = `const s = document.createElement('script'); s.src = 'https://www.google.com/recaptcha/api.js'; document.head.appendChild(s);`;
  assert.equal(src1(code, 'auth-captcha-injected-script').band, 'INFO');
});

test('source: grecaptcha.render alongside a static g-recaptcha div emits nothing (markup detector owns it)', () => {
  const code = `<div class="g-recaptcha"></div><script>grecaptcha.render('c',{sitekey:'k'});</script>`;
  assert.equal(detectAuthBarriersInSource(code).length, 0);
});

// --- black-box: source findings flow through static-audit for JS-like files -
test('static-audit emits auth-recaptcha-js-render (tip/review) for a .ts file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-auth-src-'));
  try {
    const fixture = join(dir, 'captcha.ts');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, `export function mount(): void { grecaptcha.render('recap', { sitekey: 'abc' }); }`);
    execFileSync('node', [SCANNER, '--scope', 'src-test', '--output', out, fixture], { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
    const audit = JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
    const hit = audit.findings.filter((f) => f.key === 'auth-recaptcha-js-render');
    assert.equal(hit.length, 1);
    assert.equal(hit[0].category, 'forms');
    assert.equal(hit[0].severity, 'tip');
    assert.match(hit[0].wcag, /3\.3\.8/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('static-audit emits source clipboard REVIEW for a pure .js file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-auth-src-'));
  try {
    const fixture = join(dir, 'login.js');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, `const pw = document.querySelector('input[type=password]');\n pw.addEventListener('paste', (e) => { e.preventDefault(); });`);
    execFileSync('node', [SCANNER, '--scope', 'src-test', '--output', out, fixture], { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
    const audit = JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
    const hit = audit.findings.filter((f) => f.key === 'auth-password-clipboard-blocked-js');
    assert.equal(hit.length, 1);
    assert.equal(hit[0].severity, 'tip');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('static-audit does NOT double-report a JSX password field (markup FLAG + source REVIEW de-dup)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-auth-src-'));
  try {
    const fixture = join(dir, 'Signup.jsx');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, `export default function S(){ return <input ref={passwordInput} type="password" onPaste={(e)=>e.preventDefault()} />; }`);
    execFileSync('node', [SCANNER, '--scope', 'src-test', '--output', out, fixture], { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
    const audit = JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
    const authHits = audit.findings.filter((f) => String(f.key).startsWith('auth-'));
    assert.equal(authHits.length, 1, 'exactly one auth finding, not two');
    assert.equal(authHits[0].key, 'auth-password-paste-blocked', 'the stronger markup FLAG wins');
    assert.equal(authHits[0].severity, 'warning');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('static-audit emits no source-auth finding for a clean .js form builder or v3 inject', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beacon-auth-src-'));
  try {
    const fixture = join(dir, 'clean.js');
    const out = join(dir, 'audit-results.json');
    writeFileSync(fixture, `const f = document.createElement('form'); const e = document.createElement('input'); e.type='email'; f.appendChild(e);`);
    execFileSync('node', [SCANNER, '--scope', 'src-test', '--output', out, fixture], { stdio: ['ignore', 'pipe', 'pipe'], cwd: dir });
    const audit = JSON.parse(readFileSync(out, 'utf8').replace(/\r\n?/g, '\n'));
    assert.equal(audit.findings.filter((f) => String(f.key).startsWith('auth-')).length, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

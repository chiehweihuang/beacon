// Authentication-barrier detection for WCAG 3.3.8 Accessible Authentication
// (Minimum), Level AA. Catches cognitive-function-test barriers in auth/forms
// that Lighthouse does not flag. Pure, no deps — signature + DOM-pattern scan.
// Reused by static-audit (Tier 1) and the Playwright path (Tier 2).
//
// The nuance that makes this more than "found reCAPTCHA -> fail": 3.3.8 Minimum
// EXEMPTS object-recognition and personal-content tests. So:
//   - Distorted-text / character-transcription CAPTCHA  -> FAIL (no exemption)
//   - Password field that blocks paste / password managers -> FAIL (removes the
//     "mechanism" that makes remembering a password acceptable)
//   - reCAPTCHA v2 image / hCaptcha (object recognition) -> REVIEW (exempt under
//     Minimum, but verify an accessible alternative exists; fails Enhanced 3.3.9)
//   - reCAPTCHA v3 invisible / Cloudflare Turnstile -> not a user-facing test, no finding
//
// Returns an array of signals; the caller maps band -> severity and adds the
// source location. band: 'FLAG' (hard fail) | 'REVIEW' (risk, verify) | 'INFO'
// (present but not a 3.3.8 barrier; caller emits nothing).

const WCAG = 'WCAG 2.2: 3.3.8 Accessible Authentication (Minimum)';

function indexOfMatch(text, re) {
  const m = text.match(re);
  return m ? (m.index || 0) : 0;
}

export function detectAuthBarriers(text) {
  const signals = [];
  const has = re => re.test(text);

  // --- reCAPTCHA -----------------------------------------------------------
  const reRecaptcha = /g-recaptcha|recaptcha\/api(?:2)?\.js|grecaptcha/i;
  if (has(reRecaptcha)) {
    const v3 = /recaptcha\/api\.js\?[^"'<>]*\brender=/i.test(text) || /grecaptcha\s*\.\s*execute\s*\(/i.test(text);
    const invisible = /data-size\s*=\s*["']invisible["']/i.test(text) || /size\s*:\s*["']invisible["']/i.test(text);
    if (v3 || invisible) {
      signals.push({ key: 'auth-recaptcha-invisible', band: 'INFO', wcag: WCAG,
        index: indexOfMatch(text, reRecaptcha),
        title: 'reCAPTCHA (invisible / v3) present',
        description: 'Invisible/score-based reCAPTCHA imposes no user-facing cognitive test, so it does not fail 3.3.8 Minimum.' });
    } else {
      signals.push({ key: 'auth-recaptcha-v2', band: 'REVIEW', wcag: WCAG, level: 'AA',
        index: indexOfMatch(text, reRecaptcha),
        title: 'Interactive reCAPTCHA may be an authentication barrier',
        affected_users: 'Users with cognitive, low-vision, and motor disabilities',
        description: 'An interactive reCAPTCHA is present. Image (object-recognition) challenges are exempt under 3.3.8 Minimum, but a distorted-text fallback is not, and AAA 3.3.9 (Enhanced) removes the exemption. Verify an accessible alternative authentication path exists.',
        fix: 'Offer a non-cognitive alternative (email link, passkey, or an accessible challenge), and avoid forcing the text-transcription fallback.' });
    }
  }

  // --- hCaptcha ------------------------------------------------------------
  const reHcaptcha = /h-captcha|hcaptcha\.com|js\.hcaptcha/i;
  if (has(reHcaptcha)) {
    const invisible = /data-size\s*=\s*["']invisible["']/i.test(text);
    signals.push({
      key: invisible ? 'auth-hcaptcha-invisible' : 'auth-hcaptcha',
      band: invisible ? 'INFO' : 'REVIEW', wcag: WCAG, level: 'AA',
      index: indexOfMatch(text, reHcaptcha),
      title: invisible ? 'hCaptcha (invisible) present' : 'hCaptcha may be an authentication barrier',
      affected_users: 'Users with cognitive, low-vision, and motor disabilities',
      description: invisible
        ? 'Invisible hCaptcha imposes no user-facing cognitive test.'
        : 'hCaptcha object-recognition challenges are exempt under 3.3.8 Minimum but fail AAA 3.3.9. Verify an accessible alternative exists.',
      fix: 'Offer a non-cognitive alternative authentication path; enable hCaptcha accessibility cookie / audio path where applicable.',
    });
  }

  // --- Cloudflare Turnstile (managed, non-interactive) ---------------------
  if (has(/challenges\.cloudflare\.com\/turnstile|cf-turnstile/i)) {
    signals.push({ key: 'auth-turnstile', band: 'INFO', wcag: WCAG,
      index: indexOfMatch(text, /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i),
      title: 'Cloudflare Turnstile present',
      description: 'Turnstile is a managed, non-interactive challenge with no user-facing cognitive test, so it does not fail 3.3.8.' });
  }

  // --- Distorted-text / transcription CAPTCHA (no exemption -> hard fail) ---
  // An <img> captcha that is NOT the reCAPTCHA/hCaptcha widget, plus a prompt to
  // transcribe what is shown, is a character-transcription test = a 3.3.8 fail.
  const imgCaptcha = /<img\b[^>]*captcha[^>]*>/i;   // quoted or unquoted; matches stripWidgets()
  const transcribePhrase = /(?:enter|type|input)\b[^<>]{0,30}\b(?:characters|letters|code|text)\b[^<>]{0,20}\b(?:you see|shown|above|in the image|below)\b|請?輸入(?:圖片中|上方|下列)?(?:的)?驗證碼|看不清楚.{0,6}(?:換一張|刷新)/i;
  const isWidget = /g-recaptcha|h-captcha|cf-turnstile|recaptcha\/api/i;
  if ((imgCaptcha.test(text) || transcribePhrase.test(text)) && !partOfWidget(text, imgCaptcha, isWidget)) {
    const strong = imgCaptcha.test(text) && transcribePhrase.test(text);
    signals.push({
      key: 'auth-text-captcha', band: strong ? 'FLAG' : 'REVIEW', wcag: WCAG, level: 'AA',
      index: indexOfMatch(text, imgCaptcha.test(text) ? imgCaptcha : transcribePhrase),
      title: 'Text/character CAPTCHA requires a cognitive function test',
      affected_users: 'Users with cognitive disabilities, dyslexia, and low vision',
      description: 'A distorted-text or character-transcription CAPTCHA is a cognitive function test (transcription) with no 3.3.8 exemption. It blocks users who cannot read or transcribe the characters.',
      fix: 'Replace with object-recognition, a non-cognitive method (email/SMS link, passkey), or provide a documented accessible alternative.',
    });
  }

  // --- Password field that blocks paste / password managers ----------------
  for (const m of text.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    // Accept quoted OR unquoted attribute values (both are valid HTML); the
    // lookbehind stops `data-type="password"` / custom-*-type from matching.
    if (!/(?<![-\w])type\s*=\s*["']?password\b/i.test(tag)) continue;
    if (/\bonpaste\s*=/i.test(tag)) {
      signals.push({ key: 'auth-password-paste-blocked', band: 'FLAG', wcag: WCAG, level: 'AA',
        index: m.index || 0,
        title: 'Password field intercepts paste',
        affected_users: 'Password-manager users and users who cannot transcribe long secrets',
        description: 'An onpaste handler on a password field typically blocks pasting, removing the password-manager / copy-paste mechanism that makes password entry acceptable under 3.3.8.',
        fix: 'Remove the paste restriction; allow password managers and paste.',
        code_before: tag.slice(0, 120) });
    } else if (/autocomplete\s*=\s*["']?(?:off|false)\b/i.test(tag)) {
      signals.push({ key: 'auth-password-autocomplete-off', band: 'REVIEW', wcag: WCAG, level: 'AA',
        index: m.index || 0,
        title: 'Password field disables autocomplete',
        affected_users: 'Password-manager users',
        description: 'autocomplete="off" on a password field discourages password-manager autofill. Many managers ignore it, so this is a risk to verify rather than a certain failure.',
        fix: 'Use autocomplete="current-password" or "new-password" so managers can assist.',
        code_before: tag.slice(0, 120) });
    }
  }

  return signals;
}

// True if the only captcha <img> evidence is inside a known managed widget
// (so we do not double-flag reCAPTCHA's own iframe/img as a text captcha).
function partOfWidget(text, imgCaptcha, isWidget) {
  if (!imgCaptcha.test(text)) return false;       // matched on phrase, not an img -> not a widget artefact
  // If a managed widget is present and there is no standalone captcha <img>
  // outside it, treat the img signal as belonging to the widget.
  return isWidget.test(text) && !/<img\b[^>]*captcha[^>]*>/i.test(stripWidgets(text));
}
function stripWidgets(text) {
  return text
    .replace(/<div\b[^>]*\bg-recaptcha\b[\s\S]*?<\/div>/gi, ' ')
    .replace(/<div\b[^>]*\bh-captcha\b[\s\S]*?<\/div>/gi, ' ')
    .replace(/<div\b[^>]*\bcf-turnstile\b[\s\S]*?<\/div>/gi, ' ');
}

// ===========================================================================
// SOURCE-LEVEL auth-barrier detection (JS/JSX/TS/Python). Complements the
// markup-pattern detectAuthBarriers above with barriers expressed in *code*:
//   (a) a field made type="password" via JS that then blocks paste/copy/cut;
//   (b) onpaste/oncopy/oncut suppressed via addEventListener / on* property /
//       Django-WTForms attrs|render_kw dict, on a password-like field;
//   (c) reCAPTCHA/hCaptcha rendered via JS or injected by a tag manager, where
//       static markup has no widget container.
// Source detection is heuristic: minified bundles, indirection (aliased refs,
// computed keys) and templating defeat it. So every signal here is REVIEW or
// INFO, never a hard FLAG — a static FLAG would over-claim on code we cannot
// fully resolve. The Tier-2 rendered-DOM snapshot is the authoritative check
// for the GTM-injected-widget case at runtime. Reuses WCAG + indexOfMatch above.

function lineAround(text, index, span = 140) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index);
  if (end === -1) end = text.length;
  return text.slice(start, Math.min(end, start + span)).trim();
}

// Does this source set an element's input type to "password"? Returns index or -1.
function passwordTypeSetInSource(text) {
  const res = [
    /\.\s*type\s*=\s*["'`]password["'`]/i,                                  // el.type = "password"
    /setAttribute\s*\(\s*["'`]type["'`]\s*,\s*["'`]password["'`]\s*\)/i,     // setAttribute('type','password')
    /\btype\s*:\s*["'`]password["'`]/i,                                      // { type: 'password' } (React props / config)
    /\btype\s*=\s*["'`]?password\b/i,                                        // type="password" in a JSX / template literal
  ];
  for (const re of res) { const m = text.match(re); if (m) return m.index || 0; }
  return -1;
}

// Clipboard-event suppression: addEventListener / on* handler for paste|copy|cut
// whose handler (sampled in a small window) calls preventDefault / returns false.
// Window-scoped so an unrelated preventDefault elsewhere does not falsely match.
const CLIPBOARD_EVENTS = 'paste|copy|cut';
function clipboardBlockInSource(text) {
  const hits = [];
  const reAEL = new RegExp(`addEventListener\\s*\\(\\s*["'\`](${CLIPBOARD_EVENTS})["'\`]\\s*,([\\s\\S]{0,160})`, 'gi');
  for (const m of text.matchAll(reAEL)) {
    if (/preventDefault\s*\(|return\s+false|\bstopImmediatePropagation\b/i.test(m[2] || ''))
      hits.push({ index: m.index || 0, evt: m[1].toLowerCase() });
  }
  // Property / attr-dict handlers: el.onpaste=, onPaste={...} (JSX),
  // { 'onpaste': 'return false;' } (Django attrs / WTForms render_kw). The
  // optional closing quote lets the quoted-key Python/JSON form match.
  const reProp = new RegExp(`\\bon(${CLIPBOARD_EVENTS})\\b["'\`]?\\s*[=:]\\s*([\\s\\S]{0,140})`, 'gi');
  for (const m of text.matchAll(reProp)) {
    if (/preventDefault\s*\(|return\s+false/i.test(m[2] || ''))
      hits.push({ index: m.index || 0, evt: m[1].toLowerCase() });
  }
  return hits;
}

// Password-field intent: JS-set password type, a selector/ref naming a password
// field, a Django/WTForms PasswordInput/PasswordField, or a name="password".
// Gates clipboard findings so a copy-protected ARTICLE body is not mis-flagged.
function looksPasswordRelated(text) {
  if (passwordTypeSetInSource(text) !== -1) return true;
  return /querySelector\w*\s*\(\s*["'`][^"'`]*(?:password|passwd|\[type=["']?password)/i.test(text)
    || /getElementById\s*\(\s*["'`][^"'`]*pass(?:word|wd)?/i.test(text)
    || /\bpassword(?:Field|Input|Ref|El|Element|Box)\b/i.test(text)  // JS refs + Django/WTForms PasswordInput/PasswordField
    || /\bname\s*[:=]\s*["'`](?:password|passwd|pwd|pass)["'`]/i.test(text);
}

// reCAPTCHA/hCaptcha rendered or injected in JS, where the markup detector sees
// no container. v3 (grecaptcha.execute), invisible size, and Turnstile are
// already INFO in detectAuthBarriers — here we add only the render/inject gaps.
function scriptInjectedCaptcha(text) {
  const signals = [];
  const idx = (re) => indexOfMatch(text, re);

  const reGrecRender = /grecaptcha\s*(?:\.\s*enterprise)?\s*\.\s*render\s*\(/i;
  if (reGrecRender.test(text) && !/g-recaptcha\b/i.test(text)) {
    const v3 = /grecaptcha\s*(?:\.\s*enterprise)?\s*\.\s*execute\s*\(/i.test(text)
      || /recaptcha\/(?:enterprise|api)\.js\?[^"'`<>]*\brender=/i.test(text);
    const invisible = /size\s*:\s*["'`]invisible["'`]/i.test(text);
    if (!v3 && !invisible) signals.push({
      key: 'auth-recaptcha-js-render', band: 'REVIEW', wcag: WCAG, level: 'AA', index: idx(reGrecRender),
      title: 'reCAPTCHA rendered via JavaScript may be an authentication barrier',
      affected_users: 'Users with cognitive, low-vision, and motor disabilities',
      description: 'grecaptcha.render() builds an interactive reCAPTCHA widget in code, so the challenge is not visible in static markup. Image (object-recognition) challenges are exempt under 3.3.8 Minimum, but a distorted-text fallback is not, and AAA 3.3.9 removes the exemption. Source detection cannot confirm the rendered size/variant — verify in a rendered audit.',
      fix: 'Offer a non-cognitive alternative (email link, passkey, or an accessible challenge), and confirm the rendered widget is not the text-transcription fallback.',
      code_before: lineAround(text, idx(reGrecRender)),
    });
  }

  const reHcapRender = /hcaptcha\s*\.\s*render\s*\(/i;
  if (reHcapRender.test(text) && !/h-captcha\b/i.test(text)) {
    const invisible = /size\s*:\s*["'`]invisible["'`]/i.test(text);
    if (!invisible) signals.push({
      key: 'auth-hcaptcha-js-render', band: 'REVIEW', wcag: WCAG, level: 'AA', index: idx(reHcapRender),
      title: 'hCaptcha rendered via JavaScript may be an authentication barrier',
      affected_users: 'Users with cognitive, low-vision, and motor disabilities',
      description: 'hcaptcha.render() builds an interactive hCaptcha widget in code, so it is not visible in static markup. Object-recognition challenges are exempt under 3.3.8 Minimum but fail AAA 3.3.9. Verify an accessible alternative exists and confirm the rendered size in a rendered audit.',
      fix: 'Offer a non-cognitive alternative authentication path; enable the hCaptcha accessibility/audio path where applicable.',
      code_before: lineAround(text, idx(reHcapRender)),
    });
  }

  // Dynamic / GTM injection of a CAPTCHA api.js -> INFO breadcrumb (Tier-2 owns it).
  const injectsCaptchaScript =
    /(?:createElement\s*\(\s*["'`]script["'`]|\.src\s*=)[\s\S]{0,200}(?:recaptcha\/(?:api|enterprise)\.js|hcaptcha\.com\/1?\/?api\.js|js\.hcaptcha\.com)/i.test(text)
    || (/googletagmanager\.com\/gtm\.js/i.test(text) && /recaptcha|hcaptcha/i.test(text));
  const alreadyFlagged = signals.length > 0
    || /g-recaptcha\b|h-captcha\b/i.test(text)
    || /grecaptcha\s*(?:\.\s*enterprise)?\s*\.\s*(?:render|execute)\s*\(/i.test(text)
    || /hcaptcha\s*\.\s*(?:render|execute)\s*\(/i.test(text);
  if (injectsCaptchaScript && !alreadyFlagged) signals.push({
    key: 'auth-captcha-injected-script', band: 'INFO', wcag: WCAG, index: idx(/recaptcha|hcaptcha|gtm\.js/i),
    title: 'CAPTCHA appears to be injected at runtime (verify in a rendered audit)',
    description: 'A CAPTCHA script (reCAPTCHA/hCaptcha) appears to be injected dynamically or via a tag manager, so the widget is not present in static markup. Whether this is a 3.3.8 barrier depends on the runtime variant; the Tier-2 rendered-DOM snapshot resolves it.',
  });

  return signals;
}

// Public: source-level auth barriers for JS/JSX/TS/Python files. Same signal
// shape as detectAuthBarriers; the caller maps band -> severity/check + location.
export function detectAuthBarriersInSource(text) {
  const signals = [];
  const clipHits = clipboardBlockInSource(text);
  if (clipHits.length && looksPasswordRelated(text)) {
    const first = clipHits[0];
    const events = [...new Set(clipHits.map((h) => h.evt))].join('/');
    signals.push({
      key: 'auth-password-clipboard-blocked-js', band: 'REVIEW', wcag: WCAG, level: 'AA', index: first.index,
      title: 'Password field appears to block clipboard (paste/copy) in JavaScript',
      affected_users: 'Password-manager users and users who cannot transcribe long secrets',
      description: `A ${events} handler that calls preventDefault()/returns false is attached near password-field code. Blocking paste removes the password-manager / copy-paste mechanism that makes password entry acceptable under 3.3.8. Source detection cannot guarantee the listener targets the password field, so verify in a rendered audit.`,
      fix: 'Remove the paste/clipboard restriction on password (and confirmation) fields; allow password managers and paste.',
      code_before: lineAround(text, first.index),
    });
  }
  signals.push(...scriptInjectedCaptcha(text));
  return signals;
}

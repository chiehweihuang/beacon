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
  const imgCaptcha = /<img\b[^>]*\b(?:src|alt|id|class|name)\s*=\s*["'][^"']*captcha[^"']*["'][^>]*>/i;
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
    if (!/type\s*=\s*["']password["']/i.test(tag)) continue;
    if (/\bonpaste\s*=/i.test(tag)) {
      signals.push({ key: 'auth-password-paste-blocked', band: 'FLAG', wcag: WCAG, level: 'AA',
        index: m.index || 0,
        title: 'Password field intercepts paste',
        affected_users: 'Password-manager users and users who cannot transcribe long secrets',
        description: 'An onpaste handler on a password field typically blocks pasting, removing the password-manager / copy-paste mechanism that makes password entry acceptable under 3.3.8.',
        fix: 'Remove the paste restriction; allow password managers and paste.',
        code_before: tag.slice(0, 120) });
    } else if (/autocomplete\s*=\s*["'](?:off|false)["']/i.test(tag)) {
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

# auth-detect — published false-positive table (WCAG 3.3.8)

Validation of `scripts/auth-detect.mjs` (Accessible Authentication, Minimum) against a
real-world corpus. Same treatment as the lang-detect validation: real source, deterministic
detector run, then a TP/FP judgement per flag.

## Method

- **Corpus**: 36 real auth/login source files `curl`-ed from public GitHub repos, spanning
  reCAPTCHA v2, hCaptcha/Turnstile, classic text/image CAPTCHAs, paste-blocking password
  fields, server-rendered framework auth, and a clean-control slice (7 production auth forms:
  Mastodon, Ghost, base Keycloak, Nextcloud, Open-WebUI, Django admin, Mattermost).
- **Verification**: each FLAG/REVIEW signal judged TP/FP by an independent reviewer reading the
  source (the paste-block FLAGs were additionally confirmed by direct source inspection).
- **Provenance**: 4/4 re-fetched files matched on-disk md5.

## Result — 24 flags, 21 TP, 3 FP. FP rate among flags = 12%.

| Signal | Band | TP | FP | Precision |
|---|---|---|---|---|
| `auth-recaptcha-v2` | REVIEW | 5 | 0 | 100% |
| `auth-text-captcha` | REVIEW/FLAG | 3 | 0 | 100% |
| `auth-password-paste-blocked` | FLAG | 5 | 0 | 100% |
| `auth-password-clipboard-blocked-js` | REVIEW | 5 | 0 | 100% |
| `auth-password-autocomplete-off` | REVIEW | 2 | 0 | 100% |
| `auth-hcaptcha` | REVIEW | 1 | 3 | 25% |

**Clean controls: 7 real production auth forms produced 0 false flags.**

## What is solid (ship as Tier-1)

- The hard-fail **FLAG** signals — `auth-password-paste-blocked` and `auth-text-captcha` — are
  100% precise on this corpus. The highest-harm claims the detector makes are correct.
- `auth-recaptcha-v2`, `auth-password-autocomplete-off`, and the exemption logic (invisible/v3
  reCAPTCHA and Turnstile correctly emit no flag) all hold.

## The weak signal: `auth-hcaptcha` (1 TP / 3 FP)

All three false positives are here, with two distinct root causes:

1. **Substring match (fixable bug).** `a3-sample-form-with-validate.html` has no hCaptcha at
   all; the regex `/h-captcha/i` matched the id `refresh-captcha` (it contains "…**h-captcha**").
   Fix: anchor the class/script match on a word boundary (`/\bh-captcha\b/`) or require the
   `data-sitekey` / `hcaptcha.com` form.
2. **Context blindness (harder).** `a2-hcaptcha.js` and `a2-index.html` contain real hCaptcha
   widgets, but the files are developer token-generator tools, not auth challenges gating a
   login. The detector cannot tell a tool from a real auth form. Acceptable as a documented
   limitation; the rendered Tier-2 path with surrounding form context narrows it.

## Note: paste-block is double-reported

`onpaste="return false"` on a password field fires BOTH `auth-password-paste-blocked` (markup
FLAG) and `auth-password-clipboard-blocked-js` (source REVIEW) on the same attribute. The
barrier is real (both TP), but it is one issue reported twice. Consider de-duplicating so a
single attribute does not inflate the finding count.

## Verdict

auth-detect is **publishable as a Tier-1 detector**, with one caveat: fix the `auth-hcaptcha`
substring bug and document the tool-vs-form context limitation. The FLAG-band claims (the ones
that lower a score) are 100% precise here. Re-run on a held-out set before any external
"published FP rate" claim.

Raw: `beacon-detector-sim/p5-results.json`, `corpus-auth/`.

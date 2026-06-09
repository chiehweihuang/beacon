// Content-language detection for WCAG 3.1.1 (Language of Page).
//
// Catches the wrong-language case axe/Lighthouse structurally miss: <html lang>
// is present and syntactically valid but does not match the actual content
// language (e.g. lang="en" over Traditional Chinese content). Pure, no deps —
// regex + Unicode code-point counting. Reused by static-audit (Tier 1) and the
// Playwright path (Tier 2, fed rendered DOM text).
//
// Core principle: script families are ASYMMETRIC. Latin text bleeds into CJK
// pages constantly (brand names, loanwords, URLs) so a Chinese page is
// legitimately 30-45% Latin; CJK almost never appears incidentally on a real
// Latin-language page. So the rule is "is there a substantial amount of a script
// incompatible with the declared language", not "which family is dominant".
// Calibrated on a 9-real + 9-synthetic set: 0 hard FP, 0 hard FN.

const MIN_SAMPLE = 200;   // meaningful chars needed to judge at all
const LATIN_DOM  = 0.60;  // latin share to call a CJK-declared page latin-dominant
const KANA_HINT  = 0.02;  // >2% kana among content => Japanese, not Chinese
const CJK_FLAG   = 0.40;  // CJK share on a latin-declared page => hard mismatch
const CJK_REVIEW = 0.25;  // 25-40% CJK on a latin-declared page => uncertain band

const LATIN_LANGS = new Set(['en','es','fr','de','it','pt','nl','sv','no','da','fi','pl','cs','tr','id','ms','vi','ro','hu','ca','gl','eu']);

export function declaredFamily(primary) {
  if (LATIN_LANGS.has(primary)) return 'latin';
  if (primary === 'zh') return 'han';
  if (primary === 'ja') return 'jpn';
  if (primary === 'ko') return 'hangul';
  return 'other';
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}
function safeFromCodePoint(n) {
  try { return Number.isFinite(n) && n >= 0 && n <= 0x10FFFF ? String.fromCodePoint(n) : ' '; }
  catch { return ' '; }
}

// Strip script/style/svg/comments and tags; decode entities; collapse whitespace.
// Idempotent enough to also accept already-plain text.
export function extractText(html) {
  const noBlocks = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return decodeEntities(noBlocks.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function countScripts(text) {
  let han = 0, kana = 0, hangul = 0, latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF)) han++;
    else if (c >= 0x3040 && c <= 0x30FF) kana++;                 // hiragana + katakana
    else if (c >= 0xAC00 && c <= 0xD7A3) hangul++;
    else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0xC0 && c <= 0x24F)) latin++;
  }
  return { han, kana, hangul, latin, total: han + kana + hangul + latin };
}

// Which CJK language, given CJK content is present.
function cjkFamily({ han, kana, hangul, total }) {
  if (kana / total > KANA_HINT) return 'jpn';
  if (hangul >= han && hangul >= kana) return 'hangul';
  return 'han';
}

export function detectContentLanguage(plainText) {
  const counts = countScripts(plainText);
  const { latin, total } = counts;
  if (total < MIN_SAMPLE) return { family: 'unknown', cjkRatio: 0, latinRatio: 0, total };
  const cjkRatio = (counts.han + counts.kana + counts.hangul) / total;
  const latinRatio = latin / total;
  let family;
  if (cjkRatio >= CJK_REVIEW) family = cjkFamily(counts);
  else if (latinRatio > LATIN_DOM) family = 'latin';
  else family = 'mixed';
  return { family, cjkRatio, latinRatio, total, counts };
}

// declaredLang: the raw <html lang> value (e.g. "en", "zh-Hant").
// plainText: extracted visible text (use extractText first if you have HTML).
export function assessLang(declaredLang, plainText) {
  if (!declaredLang) return { status: 'NO_LANG', note: '<html lang> absent' };
  const declared = String(declaredLang).toLowerCase();
  const dFam = declaredFamily(declared.split('-')[0]);
  const det = detectContentLanguage(plainText);
  const { cjkRatio, latinRatio } = det;
  const pct = x => (x * 100).toFixed(0) + '%';

  if (det.family === 'unknown')
    return { status: 'INSUFFICIENT', declared, detectedFamily: 'unknown', total: det.total,
             note: `only ${det.total} meaningful chars (< ${MIN_SAMPLE}); requires Tier-2 render` };

  // Declared a Latin-script language.
  if (dFam === 'latin') {
    if (cjkRatio >= CJK_FLAG)
      return { status: 'FLAG', declared, detectedFamily: cjkFamily(det.counts), confidence: cjkRatio,
               note: `declared "${declared}" but ${pct(cjkRatio)} of content is CJK` };
    if (cjkRatio >= CJK_REVIEW)
      return { status: 'REVIEW', declared, detectedFamily: cjkFamily(det.counts), confidence: cjkRatio,
               note: `declared "${declared}" with ${pct(cjkRatio)} CJK; likely mismatch or untagged bilingual content` };
    return { status: 'PASS', declared, detectedFamily: 'latin', confidence: 1 - cjkRatio,
             note: 'latin/latin; specific European language not distinguishable by script' };
  }

  // Declared a CJK language.
  if (dFam === 'han' || dFam === 'jpn' || dFam === 'hangul') {
    if (latinRatio > LATIN_DOM && cjkRatio < 0.10)
      return { status: 'FLAG', declared, detectedFamily: 'latin', confidence: latinRatio,
               note: `declared "${declared}" but ${pct(latinRatio)} latin / only ${pct(cjkRatio)} CJK` };
    const cf = cjkFamily(det.counts);
    if (dFam === 'han' && cf === 'jpn')
      return { status: 'FLAG', declared, detectedFamily: 'jpn', confidence: cjkRatio,
               note: `declared Chinese ("${declared}") but kana present; content is Japanese` };
    if (cjkRatio >= CJK_REVIEW || cf === dFam)
      return { status: 'PASS', declared, detectedFamily: cf, confidence: cjkRatio };
    return { status: 'REVIEW', declared, detectedFamily: cf, confidence: cjkRatio,
             note: `declared ${dFam}; content unclear (${pct(cjkRatio)} CJK)` };
  }

  // Family not modelled yet (ar / he / ru / th ...).
  return { status: 'UNMODELLED', declared, note: `declared family for "${declared}" not modelled` };
}

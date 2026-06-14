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

// A BCP47 script subtag (4 letters: zh-Latn, ja-Hira, zh-Hant) explicitly states
// the script, which overrides the primary-language guess. Returns null for
// scripts we do not model (so the caller can treat it as 'other').
function scriptFamily(script) {
  switch (script) {
    case 'latn': return 'latin';
    case 'hans': case 'hant': case 'hani': return 'han';
    case 'hang': return 'hangul';
    case 'hira': case 'kana': case 'jpan': return 'jpn';
    default: return null; // cyrl / arab / thai / ... not modelled
  }
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
  // Unicode script properties cover all extension blocks (Han Ext-B+, halfwidth
  // kana, Hangul Jamo) and exclude non-letters (digits and symbols like x/division
  // are Common, not Latin) — more correct than hand-rolled BMP ranges.
  const count = (re) => (text.match(re) || []).length;
  const han = count(/\p{Script=Han}/gu);
  const kana = count(/\p{Script=Hiragana}|\p{Script=Katakana}/gu);
  const hangul = count(/\p{Script=Hangul}/gu);
  const latin = count(/\p{Script=Latin}/gu);
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
  const parts = declared.split('-');
  const scriptTag = parts.slice(1).find((p) => /^[a-z]{4}$/.test(p)); // BCP47 script subtag
  const dFam = scriptTag ? (scriptFamily(scriptTag) || 'other') : declaredFamily(parts[0]);
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
    // The content's CJK script must match the DECLARED CJK script. A high CJK
    // ratio alone is not enough: zh/ja/ko are three different scripts (han / han+
    // kana / hangul), so declaring one over another (lang="ko" on Chinese,
    // lang="zh" on Korean) is a real mismatch, not a pass.
    const cf = cjkFamily(det.counts);
    if (cf === dFam)
      return { status: 'PASS', declared, detectedFamily: cf, confidence: cjkRatio };
    if (dFam === 'han' && cf === 'jpn')
      return { status: 'FLAG', declared, detectedFamily: 'jpn', confidence: cjkRatio,
               note: `declared Chinese ("${declared}") but kana present; content is Japanese` };
    if (dFam === 'jpn' && cf === 'han')
      // Japanese can be kanji-heavy with little kana in a short sample, so this is
      // ambiguous (genuinely Japanese, or actually Chinese) rather than a hard fail.
      return { status: 'REVIEW', declared, detectedFamily: 'han', confidence: cjkRatio,
               note: `declared Japanese ("${declared}") but no kana in the sampled text; verify it is not Chinese` };
    return { status: 'FLAG', declared, detectedFamily: cf, confidence: cjkRatio,
             note: `declared ${dFam} ("${declared}") but content script is ${cf}` };
  }

  // Family not modelled yet (ar / he / ru / th ...).
  return { status: 'UNMODELLED', declared, note: `declared family for "${declared}" not modelled` };
}

const PARTS_FOREIGN_MIN = 60;          // a foreign-script run worth flagging (3.1.2)
const PARTS_FOREIGN_MAX_RATIO = 0.40;  // above this it is a 3.1.1 page mismatch, not parts

// WCAG 3.1.2 Language of Parts: a passage in a different language from the page
// should carry its own lang attribute. axe checks only the page-level lang (3.1.1).
// Heuristic (regex, no DOM): the page declares lang X and is mostly X's script,
// but a substantial amount of a DIFFERENT script appears with NO inline lang=
// markup -> foreign passages are likely unmarked. REVIEW only (FP-prone: brand
// names, loanwords). Coarse: any inline lang= is taken as "the author marks parts",
// and it cannot pinpoint which passage. Takes raw HTML.
export function detectLangParts(html) {
  const m = String(html).match(/<html[^>]*\blang=["']?([^"'\s>]+)/i);
  if (!m) return { status: 'SKIP' };
  const pageFam = declaredFamily(m[1].toLowerCase().split('-')[0]);
  if (pageFam === 'other') return { status: 'SKIP' };
  const innerLang = (html.match(/<(?!html\b)[a-z][^>]*\blang\s*=/gi) || []).length;
  const counts = countScripts(extractText(html));
  if (counts.total < MIN_SAMPLE) return { status: 'INSUFFICIENT' };
  // Native script = the page's declared family; everything else is "foreign".
  const foreign = pageFam === 'latin' ? (counts.han + counts.kana + counts.hangul) : counts.latin;
  const ratio = foreign / counts.total;
  if (foreign < PARTS_FOREIGN_MIN) return { status: 'PASS', foreign };
  if (ratio > PARTS_FOREIGN_MAX_RATIO)
    return { status: 'PASS_311', foreign, note: 'foreign script is dominant — a 3.1.1 page-language mismatch, not 3.1.2 parts' };
  if (innerLang > 0)
    return { status: 'PASS', foreign, innerLang, note: `${innerLang} inline lang= attribute(s) present; assume foreign parts are marked` };
  return {
    status: 'REVIEW', declared: m[1], foreign,
    note: `~${foreign} chars of a different script in a lang="${m[1]}" page with no inline lang= markup; foreign passages may be unmarked`,
  };
}

// PDF accessibility probe for WCAG 1.3.1 (Info and Relationships), 2.4.2 (Page
// Titled), 3.1.1 (Language of Page), 4.1.2 (Name, Role, Value) and PDF/UA
// (ISO 14289). Pure, no external parser — raw-byte scan + Node zlib for the
// compressed case. Reused by static-audit (Tier 1, given a Buffer).
//
// What this catches that a generic a11y tool aimed at HTML misses: a PDF linked
// from a page is a separate accessibility surface. The single most damaging PDF
// failure is an UNTAGGED document — with no /StructTreeRoot a screen reader has
// to guess reading order from glyph positions, which collapses tables, columns,
// and lists into noise. We probe the document for the structural markers that
// the PDF/UA family and WCAG require:
//   - /StructTreeRoot        -> the tag tree exists (document is "tagged")
//   - /MarkInfo /Marked true -> the producer asserts the tags are real, not stubs
//   - /Lang                  -> document language (3.1.1) for correct pronunciation
//   - document Title + /ViewerPreferences /DisplayDocTitle true
//                            -> the viewer shows the title, not the filename (2.4.2)
//   - /Encrypt with a /P that clears the copy/extract AND accessibility bits
//                            -> assistive tech cannot pull the text out at all
//
// CRITICAL robustness note (the whole reason this is more than a grep):
// PDF 1.5+ may store the document catalog INSIDE a compressed object stream
// (/Type /ObjStm, almost always /FlateDecode). A raw-byte scan then never sees
// /StructTreeRoot even on a perfectly tagged file, which would FALSE-POSITIVE
// "untagged" — the worst possible error for this check. So: scan raw bytes
// first (fast path); only if /StructTreeRoot is absent from the raw bytes AND
// the file contains /FlateDecode do we inflate every FlateDecode stream with
// zlib and re-scan the inflated bytes. We return INSUFFICIENT only when the
// input is not a parseable PDF (no %PDF header) — never a false "untagged".
//
// Bands (caller maps band -> severity/check exactly like the other detectors):
//   FLAG   -> hard fail (severity 'warning', check 'fail'): untagged, or
//             encrypted with assistive-tech extraction blocked.
//   REVIEW -> verify (severity 'tip', check 'review'): tagged but missing
//             /Lang, or missing a shown document title.
//   PASS   -> tagged + lang + shown title. No finding.
//   INSUFFICIENT -> not a PDF / unparseable. No finding.

import { inflateSync, inflateRawSync } from 'node:zlib';

const WCAG_TAGGED = 'WCAG 2.2: 1.3.1 Info and Relationships (PDF/UA Tagged PDF)';
const WCAG_LANG   = 'WCAG 2.2: 3.1.1 Language of Page (PDF/UA)';
const WCAG_TITLE  = 'WCAG 2.2: 2.4.2 Page Titled (PDF/UA DisplayDocTitle)';
const WCAG_AT     = 'WCAG 2.2: 1.3.1 / 4.1.2 (PDF/UA assistive-tech extraction)';

const HEADER_WINDOW = 1024; // %PDF-x.y must appear in the first bytes per spec

// --- low-level helpers ----------------------------------------------------

// PDF must begin with "%PDF-" (the spec allows a few junk bytes before it, so
// search a small window rather than requiring offset 0). Returns the version
// string ("1.7", "2.0", ...) or null.
function pdfVersion(buf) {
  const head = buf.slice(0, HEADER_WINDOW).toString('latin1');
  const m = head.match(/%PDF-(\d+\.\d+)/);
  return m ? m[1] : null;
}

// Decode raw PDF bytes as latin1: every byte maps 1:1 to a code point, so the
// ASCII markers we look for (/StructTreeRoot etc.) survive intact and binary
// stream bytes never throw. Never decode PDF as utf8 — multibyte sequences in
// binary streams would corrupt or drop following bytes.
function latin1(buf) {
  return buf.toString('latin1');
}

// Inflate one zlib-or-raw-deflate block. PDF /FlateDecode is zlib-wrapped
// (RFC 1950, 0x78 header), but truncated/odd producers and the raw variant
// show up in the wild, so try zlib first then raw. Returns '' on failure so a
// single bad stream never aborts the whole scan.
function inflateOne(slice) {
  try { return inflateSync(slice).toString('latin1'); } catch { /* fall through */ }
  try { return inflateRawSync(slice).toString('latin1'); } catch { /* fall through */ }
  return '';
}

// Find each `stream ... endstream` body and inflate it. We do NOT try to parse
// the cross-reference table or object graph — we just locate stream bodies by
// the literal `stream`/`endstream` keywords (per spec the body starts after the
// CRLF/LF that follows `stream` and ends right before `endstream`) and feed each
// to zlib. Only streams that actually inflate contribute text; the rest (images,
// fonts, already-uncompressed streams) inflate to '' and are ignored. This is
// deliberately over-broad: we want the catalog/objstm markers, wherever they are.
function inflateAllStreams(buf) {
  const out = [];
  const s = latin1(buf);
  const re = /stream(\r\n|\r|\n)/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const bodyStart = m.index + m[0].length;
    const end = s.indexOf('endstream', bodyStart);
    if (end === -1) continue;
    // Trim a single trailing EOL before `endstream` (the spec puts one there).
    let bodyEnd = end;
    if (s[bodyEnd - 1] === '\n') bodyEnd--;
    if (s[bodyEnd - 1] === '\r') bodyEnd--;
    if (bodyEnd <= bodyStart) continue;
    const slice = buf.slice(bodyStart, bodyEnd);
    const inflated = inflateOne(slice);
    if (inflated) out.push(inflated);
  }
  return out.join('\n');
}

// --- marker probes (run over a latin1 text view) --------------------------

const hasStructTreeRoot = (t) => /\/StructTreeRoot\b/.test(t);

// /MarkInfo << ... /Marked true >> — the dict may have other keys and arbitrary
// whitespace, so look for /Marked followed by true within a small window.
const hasMarkedTrue = (t) => /\/Marked\s+true\b/.test(t);

// /Lang ( ... ) string or /Lang <hex>. Empty string /Lang () does not count.
function langValue(t) {
  const lit = t.match(/\/Lang\s*\(([^)]*)\)/);
  if (lit) return lit[1].trim();
  const hex = t.match(/\/Lang\s*<([0-9A-Fa-f]*)>/);
  if (hex && hex[1].length >= 2) {
    // Decode hex string pairs to chars (e.g. <656E> -> "en").
    let s = '';
    for (let i = 0; i + 1 < hex[1].length; i += 2) s += String.fromCharCode(parseInt(hex[1].slice(i, i + 2), 16));
    return s.replace(/\0+$/, '').trim();
  }
  return '';
}
const hasLang = (t) => langValue(t).length > 0;

// Document title: /Title (...) in the Info dict, or dc:title / <pdf:Title> in
// embedded XMP. We only need presence of a non-empty value.
function hasTitle(t) {
  const info = t.match(/\/Title\s*\(([^)]*)\)/);
  if (info && info[1].trim().length > 0) return true;
  const infoHex = t.match(/\/Title\s*<([0-9A-Fa-f]{2,})>/);
  if (infoHex) return true;
  // XMP: <dc:title> ... <rdf:li ...>text</rdf:li> or <pdf:Title>text</pdf:Title>.
  if (/<dc:title>[\s\S]*?<rdf:li[^>]*>\s*\S[\s\S]*?<\/rdf:li>/.test(t)) return true;
  if (/<pdf:Title>\s*\S[\s\S]*?<\/pdf:Title>/.test(t)) return true;
  if (/\bpdf:Title\s*=\s*"[^"]*\S[^"]*"/.test(t)) return true; // attribute-form XMP
  return false;
}

// /ViewerPreferences << ... /DisplayDocTitle true >> — without this the viewer
// shows the filename in the title bar / tab instead of the document title.
const hasDisplayDocTitle = (t) => /\/DisplayDocTitle\s+true\b/.test(t);

// --- encryption / permissions --------------------------------------------

// Parse the /P integer from the /Encrypt dictionary. /P is a 32-bit signed
// (two's-complement) integer; negative values are normal. Bits are 1-based in
// the spec, so bit N has value (1 << (N-1)). We need:
//   bit 5  (1<<4  = 16)  copy/extract text & graphics
//   bit 10 (1<<9  = 512) extract text & graphics for ACCESSIBILITY
// A cleared bit (value 0) means the permission is DENIED. Returns { p, present }.
function encryptPermissions(t) {
  if (!/\/Encrypt\b/.test(t)) return { present: false };
  // /P may appear as part of the Encrypt dict; grab the first /P integer.
  const m = t.match(/\/P\s+(-?\d+)/);
  if (!m) return { present: true, p: null };
  // Coerce to a signed 32-bit int (the field is defined as 32-bit two's complement).
  const p = (parseInt(m[1], 10) | 0);
  return { present: true, p };
}

const BIT_COPY = 1 << 4;   // bit 5  : copy/extract
const BIT_A11Y = 1 << 9;   // bit 10 : extract for accessibility

// True if assistive-tech text extraction is hard-blocked. Bit 10 alone is
// DEPRECATED in PDF 2.0 (conforming readers must allow accessibility regardless),
// so clearing only bit 10 is REVIEW, not FLAG. We hard-FLAG only when BOTH the
// general copy bit AND the accessibility bit are cleared — that is an
// unambiguous attempt to prevent any extraction, which legacy AT honoured.
function classifyEncrypt(p) {
  if (p === null || p === undefined) return 'unknown';
  const copyDenied = (p & BIT_COPY) === 0;
  const a11yDenied = (p & BIT_A11Y) === 0;
  if (copyDenied && a11yDenied) return 'at-blocked';   // FLAG
  if (a11yDenied) return 'at-deprecated-bit';          // REVIEW (bit 10 only)
  return 'ok';                                          // extraction allowed
}

// --- catalog-aware marker resolution --------------------------------------
// Map every object number -> its body text: regular `N G obj ... endobj` from the
// raw bytes, PLUS objects packed inside a /Type /ObjStm (parsed via its /N + /First
// header). This lets us read the catalog's OWN /Lang, /MarkInfo, /ViewerPreferences
// and the Info dict's /Title even when they sit in compressed object streams — and,
// crucially, only those objects, so a stray /Title in an outline never counts.
function buildObjectMap(buf) {
  const raw = buf.toString('latin1');
  const map = new Map();
  for (const m of raw.matchAll(/(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g)) map.set(+m[1], m[3]);
  for (const m of raw.matchAll(/<<([^>]*\/Type\s*\/ObjStm[\s\S]*?)>>\s*stream\r?\n/g)) {
    const N = +(m[1].match(/\/N\s+(\d+)/)?.[1] || 0);
    const First = +(m[1].match(/\/First\s+(\d+)/)?.[1] || 0);
    if (!N || !First) continue;
    const sStart = m.index + m[0].length;
    const sEnd = raw.indexOf('endstream', sStart);
    if (sEnd < 0) continue;
    const inf = inflateOne(buf.subarray(sStart, sEnd));
    if (!inf) continue;
    const h = inf.slice(0, First).trim().split(/\s+/).map(Number);
    for (let i = 0; i < N; i++) {
      const start = First + h[2 * i + 1];
      const end = (i + 1 < N) ? First + h[2 * i + 3] : inf.length;
      if (Number.isFinite(start)) map.set(h[2 * i], inf.slice(start, end));
    }
  }
  return map;
}

// A boolean key that may be inline (`/Key true`) or an indirect reference to a boolean.
function boolFrom(text, inlineRe, refRe, get) {
  const i = text.match(inlineRe);
  if (i) return i[1] === 'true';
  const r = text.match(refRe);
  if (r) { const o = get(+r[1]); if (/(^|[^A-Za-z])true\b/.test(o)) return true; if (/(^|[^A-Za-z])false\b/.test(o)) return false; }
  return null;
}

// Resolve the document catalog (/Root) and Info dict, then read THEIR markers only.
// Returns { foundCatalog, lang (''=missing), marked (bool|null), disp (bool|null), title }.
export function catalogMarkers(buf) {
  const map = buildObjectMap(buf);
  const raw = buf.toString('latin1');
  const last = (re) => { const a = [...raw.matchAll(re)]; return a.length ? +a[a.length - 1][1] : null; };
  const rootN = last(/\/Root\s+(\d+)\s+\d+\s+R/g);
  const infoN = last(/\/Info\s+(\d+)\s+\d+\s+R/g);
  const get = (n) => n != null ? (map.get(n) || '') : '';
  const cat = get(rootN), info = get(infoN);

  let lang = '';
  if (cat) {
    const l = cat.match(/\/Lang\s*\(([^)]*)\)/);
    const hx = cat.match(/\/Lang\s*<([0-9A-Fa-f]+)>/);
    if (l) lang = l[1];
    else if (hx) lang = 'hex';
    else { const r = cat.match(/\/Lang\s+(\d+)\s+\d+\s+R/); if (r) { const o = get(+r[1]); const s = o.match(/\(([^)]*)\)/) || o.match(/<([0-9A-Fa-f]+)>/); if (s) lang = s[1] || 'hex'; } }
  }
  let miText = cat; if (cat) { const r = cat.match(/\/MarkInfo\s+(\d+)\s+\d+\s+R/); if (r) miText = get(+r[1]); }
  const marked = cat ? boolFrom(miText, /\/Marked\s+(true|false)\b/, /\/Marked\s+(\d+)\s+\d+\s+R/, get) : null;
  let vpText = cat; if (cat) { const r = cat.match(/\/ViewerPreferences\s+(\d+)\s+\d+\s+R/); if (r) vpText = get(+r[1]); }
  const disp = cat ? boolFrom(vpText, /\/DisplayDocTitle\s+(true|false)\b/, /\/DisplayDocTitle\s+(\d+)\s+\d+\s+R/, get) : null;
  // /Title normally lives in the Info dict, but some producers put it in the catalog;
  // check both (each is a single resolved object, so no stray-marker risk).
  const titleIn = (t) => !!t && (/\/Title\s*\(([^)]*\S[^)]*)\)/.test(t) || /\/Title\s*<([0-9A-Fa-f]{2,})>/.test(t));
  const title = titleIn(info) || titleIn(cat);
  return { foundCatalog: !!cat, lang, marked, disp, title };
}

// --- public API -----------------------------------------------------------

// assessPdf(buffer) -> { status, findings, note }
//   buffer: a Node Buffer of the .pdf file contents.
//   status: 'FLAG' | 'REVIEW' | 'PASS' | 'INSUFFICIENT'
//   findings: array of { key, band, title, affected_users, description, fix,
//                        wcag, level } the caller turns into Beacon findings.
//   note: short human summary of why the band was chosen.
export function assessPdf(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const version = pdfVersion(buf);
  if (!version) {
    return { status: 'INSUFFICIENT', findings: [],
      note: 'No %PDF header in the first 1KB; not a parseable PDF.' };
  }

  // Fast path: scan raw bytes.
  let text = latin1(buf);
  let usedInflate = false;

  // If the tag tree is not visible in the raw bytes but the file uses FlateDecode,
  // the catalog is probably inside a compressed object stream — inflate and re-scan
  // before concluding anything about TAGGING. This inflated `text` is used ONLY for the
  // tagging check; the secondary markers (/Lang, /Title, /MarkInfo, /DisplayDocTitle) are
  // resolved separately via catalogMarkers() below, which reads the catalog/Info objects
  // specifically so stray occurrences in other objects can't cause false negatives.
  if (!hasStructTreeRoot(text) && /\/FlateDecode\b/.test(text)) {
    const inflated = inflateAllStreams(buf);
    if (inflated) { text = text + '\n' + inflated; usedInflate = true; }
  }

  const tagged = hasStructTreeRoot(text);
  const enc = encryptPermissions(text);

  // Secondary markers come from the RESOLVED catalog + Info objects, not a whole-document
  // byte scan: that reads values locked in compressed object streams (no false positive)
  // while ignoring stray /Title / /Lang in non-catalog objects like outlines (no false
  // negative). If the catalog cannot be resolved (or the doc is encrypted, so its streams
  // are unreadable), fall back to the byte scan; encrypted docs are suppressed below anyway.
  let cm; try { cm = catalogMarkers(buf); } catch { cm = { foundCatalog: false }; }
  const useCat = cm.foundCatalog && !enc.present;
  const marked = useCat ? cm.marked === true : hasMarkedTrue(text);
  const lang = useCat ? cm.lang !== '' : hasLang(text);
  const langVal = useCat ? (cm.lang === 'hex' ? '' : cm.lang) : langValue(text);
  const title = useCat ? cm.title : hasTitle(text);
  const displayTitle = useCat ? cm.disp !== false : hasDisplayDocTitle(text);
  const encClass = enc.present ? classifyEncrypt(enc.p) : 'none';

  const findings = [];
  const inflateNote = usedInflate ? ' (markers resolved from inflated object streams)' : '';

  // --- FLAG-level: encryption blocks assistive tech ------------------------
  if (encClass === 'at-blocked') {
    findings.push({
      key: 'pdf-encrypt-blocks-at',
      band: 'FLAG',
      wcag: WCAG_AT,
      level: 'A',
      title: 'PDF encryption blocks assistive-technology text extraction',
      affected_users: 'Screen-reader users and any AT that must extract the text layer',
      description: `The PDF is encrypted with a permissions integer (/P = ${enc.p}) that clears both the copy/extract bit (bit 5) and the accessibility-extraction bit (bit 10). Legacy assistive technology that honours these bits cannot pull the text out, leaving the document unreadable by a screen reader.`,
      fix: 'Re-export with the accessibility extraction permission enabled (set bit 10, ideally bit 5 too). Permission-based content locking must never block assistive technology.',
    });
  }

  // --- FLAG-level: untagged document --------------------------------------
  if (!tagged) {
    findings.push({
      key: 'pdf-untagged',
      band: 'FLAG',
      wcag: WCAG_TAGGED,
      level: 'A',
      title: 'PDF is untagged (no structure tree)',
      affected_users: 'Screen-reader users, reflow/Read-Aloud users, and Braille-display users',
      description: `No /StructTreeRoot was found${inflateNote}. An untagged PDF has no defined reading order or element semantics, so assistive technology must guess the order from glyph positions, which collapses tables, multi-column layouts, and lists into scrambled text. This is the most damaging single PDF accessibility failure.`,
      fix: 'Produce a tagged PDF: enable "tagged PDF" / "document structure tags" on export (Word, InDesign, LibreOffice all support this) and add a /MarkInfo << /Marked true >>, or run a remediation pass (e.g. Acrobat "Autotag", or veraPDF to verify PDF/UA).',
    });
  } else if (!marked && !enc.present) {
    // Tagged but not asserted /Marked true: the tree exists but the producer did
    // not confirm it is real. Lower severity — verify the tags are meaningful.
    // Suppressed when encrypted: encrypted object streams will not inflate, so a
    // "missing" marker cannot be distinguished from one we simply cannot read.
    findings.push({
      key: 'pdf-marked-false',
      band: 'REVIEW',
      wcag: WCAG_TAGGED,
      level: 'A',
      title: 'PDF has a structure tree but /MarkInfo /Marked is not true',
      affected_users: 'Screen-reader users relying on a valid tag tree',
      description: `A /StructTreeRoot is present${inflateNote} but /MarkInfo << /Marked true >> was not found, so the document does not formally assert that its tags conform to the tagged-PDF rules. The tags may be incomplete or auto-generated stubs.`,
      fix: 'Set /MarkInfo << /Marked true >> and verify the tag tree (reading order, table headers, alt text) with a checker such as veraPDF or the PDF/UA validator.',
    });
  }

  // --- REVIEW-level: missing language (only meaningful on a tagged doc) ----
  // Suppressed under encryption (markers in encrypted streams are unverifiable).
  if (tagged && !lang && !enc.present) {
    findings.push({
      key: 'pdf-lang-missing',
      band: 'REVIEW',
      wcag: WCAG_LANG,
      level: 'A',
      title: 'PDF does not declare a document language',
      affected_users: 'Screen-reader users (wrong pronunciation rules) and Read-Aloud users',
      description: `No /Lang entry was found in the document catalog${inflateNote}. Without a default language the screen reader applies the user\'s system language, which mispronounces content in another language.`,
      fix: 'Set the document language (catalog /Lang, e.g. /Lang (en-US) or (zh-Hant)); in authoring tools this is the document "Language" property.',
    });
  }

  // --- REVIEW-level: title not shown to the viewer -------------------------
  // 2.4.2 for PDF requires BOTH a title AND DisplayDocTitle true, so the viewer
  // shows the human title instead of the filename. Report on a tagged doc.
  if (tagged && (!title || !displayTitle) && !enc.present) {
    const why = !title
      ? 'no document title (/Title or XMP dc:title) was found'
      : '/ViewerPreferences << /DisplayDocTitle true >> was not set, so the viewer shows the filename instead of the title';
    findings.push({
      key: 'pdf-title-not-shown',
      band: 'REVIEW',
      wcag: WCAG_TITLE,
      level: 'A',
      title: 'PDF title is missing or not shown in the viewer',
      affected_users: 'Screen-reader users and users identifying the document among open tabs/windows',
      description: `For a PDF, "Page Titled" needs a document title AND /DisplayDocTitle true: here ${why}${inflateNote}. Users then hear or see the filename (e.g. "report_final_v3.pdf") rather than a meaningful title.`,
      fix: 'Set a meaningful document title (document Properties → Title) and enable "Show document title in title bar" so /ViewerPreferences << /DisplayDocTitle true >> is written.',
    });
  }

  // --- REVIEW-level: bit-10-only accessibility lock (deprecated) -----------
  if (encClass === 'at-deprecated-bit') {
    findings.push({
      key: 'pdf-encrypt-a11y-bit-cleared',
      band: 'REVIEW',
      wcag: WCAG_AT,
      level: 'A',
      title: 'PDF clears the (deprecated) accessibility-extraction permission bit',
      affected_users: 'Screen-reader users on older PDF readers that still honour bit 10',
      description: `The encryption permissions (/P = ${enc.p}) clear the accessibility-extraction bit (bit 10) but leave the general copy bit set. Bit 10 is deprecated in PDF 2.0 (conforming readers must allow accessibility regardless), so modern AT is unaffected, but older readers that honour it may block extraction.`,
      fix: 'Set bit 10 (accessibility extraction) in the permissions so legacy readers also allow assistive technology, or remove the permissions password entirely.',
    });
  }

  // --- decide overall status ----------------------------------------------
  // When encrypted, the secondary checks (lang/title/Marked) were skipped because
  // their markers may be locked inside encrypted streams we cannot read — flag the
  // limitation so a clean status is not read as "verified accessible".
  const encNote = (enc.present && tagged) ? ' Encrypted: lang/title/Marked not verifiable (secondary checks skipped).' : '';
  if (findings.some((f) => f.band === 'FLAG'))
    return { status: 'FLAG', findings,
      note: `Tagged=${tagged}; ${encClass === 'at-blocked' ? 'encryption blocks AT; ' : ''}${!tagged ? 'untagged' : 'critical PDF/UA failure'}.${encNote}` };
  if (findings.some((f) => f.band === 'REVIEW'))
    return { status: 'REVIEW', findings,
      note: `Tagged=${tagged}, lang=${lang ? langVal || 'yes' : 'no'}, title=${title}, displayDocTitle=${displayTitle}.${encNote}` };
  return { status: 'PASS', findings: [],
    note: `Tagged + /Marked true + /Lang (${langVal}) + shown title.${usedInflate ? ' (resolved via inflated object streams)' : ''}${encNote}` };
}

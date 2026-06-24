// Beacon · pattern-runtime — the ONE interpreter that runs declarative detector
// records (core/patterns/*.json) against file content. Imported by BOTH the CC
// PostToolUse hook and the codex advisor so the two surfaces never drift again.
//
// Pure except loadRecords(): scanRecords(records, content, fileKind) takes data
// in and returns findings out. Matcher kinds: regex / regex-guarded / regex-count.
// An unknown matcher.kind is SKIPPED (never throws) and reported, so a record
// authored against a future kind degrades to "ignored + upgrade prompt".

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Single source of truth for PDF-generation detection (mirrors both runtimes).
export const PDF_GEN_INDICATORS = /jsPDF|pdfmake|pdfkit|new PDFDocument\s*\(|page\.pdf\s*\(|printToPDF|html2pdf|wkhtmltopdf|dompdf|TCPDF|mpdf|reportlab|weasyprint|xhtml2pdf|fpdf/i;

// Map a file extension to the canonical fileKind used in record.applies_to.
export function fileKindForExt(ext) {
  ext = String(ext || '').toLowerCase().replace(/^\./, '');
  if (['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext)) return 'html';
  if (['css', 'scss', 'less'].includes(ext)) return 'css';
  if (['js', 'cjs', 'mjs'].includes(ext)) return 'js';
  if (ext === 'ts') return 'ts';
  if (ext === 'py') return 'py';
  if (ext === 'tex') return 'tex';
  if (ext === 'typ') return 'typ';
  return null;
}

export function isPdfGenContext(fileKind, content) {
  return fileKind === 'tex' || fileKind === 'typ' || PDF_GEN_INDICATORS.test(content);
}

function applies(record, fileKind, content) {
  const a = record.applies_to;
  if (!a || !a.fileKinds.includes(fileKind)) return false;
  if (a.requireIndicatorSet === 'pdf-gen' && !isPdfGenContext(fileKind, content)) return false;
  return true;
}

function guardHolds(guard, text) {
  if (guard.mustContain !== undefined && !new RegExp(guard.mustContain).test(text)) return false;
  if (guard.mustNotContain !== undefined && new RegExp(guard.mustNotContain).test(text)) return false;
  return true;
}

// Evaluate one matcher against content. Returns { fired, match?, unknownKind? }.
function evalMatcher(matcher, content) {
  const flags = matcher.flags || '';
  if (matcher.kind === 'regex') {
    const m = content.match(new RegExp(matcher.pattern, flags));
    return m ? { fired: true, match: m[0] } : { fired: false };
  }
  if (matcher.kind === 'regex-count') {
    const g = new RegExp(matcher.pattern, flags.includes('g') ? flags : flags + 'g');
    const count = (content.match(g) || []).length;
    return { fired: count > (matcher.threshold ?? 1) };
  }
  if (matcher.kind === 'regex-guarded') {
    const guards = matcher.guard || [];
    const wholeGuards = guards.filter((g) => g.scope === 'whole-file');
    const localGuards = guards.filter((g) => g.scope !== 'whole-file');
    if (!wholeGuards.every((g) => guardHolds(g, content))) return { fired: false };
    const lineFlags = flags.replace('g', '');
    const re = new RegExp(matcher.pattern, lineFlags);
    if (localGuards.length === 0) {
      const m = content.match(new RegExp(matcher.pattern, flags));
      return m ? { fired: true, match: m[0] } : { fired: false };
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      const ok = localGuards.every((g) => {
        const text = g.scope === 'line'
          ? lines[i]
          : lines.slice(Math.max(0, i - (g.before || 0)), i + (g.after || 0) + 1).join('\n');
        return guardHolds(g, text);
      });
      if (ok) return { fired: true, match: (lines[i].match(re) || [])[0] };
    }
    return { fired: false };
  }
  return { fired: false, unknownKind: matcher.kind };
}

function composeFlag(message, match) {
  if (!message.capture || match == null) return message.flag;
  let m = match;
  if (message.capture.strip) {
    const drop = new Set(message.capture.strip.split(''));
    m = [...m].filter((ch) => !drop.has(ch)).join('').trim();
  }
  return message.flag.replace('$0', m);
}

// Run every applicable record against content. Returns the fired findings plus
// any unknown matcher kinds encountered (so the caller can prompt an upgrade).
export function scanRecords(records, content, fileKind) {
  const findings = [];
  const unknownKinds = new Set();
  for (const r of records) {
    if (!applies(r, fileKind, content)) continue;
    const res = evalMatcher(r.matcher, content);
    if (res.unknownKind) { unknownKinds.add(res.unknownKind); continue; }
    if (res.fired) {
      findings.push({
        id: r.id,
        band: r.band,
        wcag: r.wcag,
        flag: composeFlag(r.message, res.match),
        hint: r.fix && r.fix.hint,
      });
    }
  }
  return { findings, unknownKinds: [...unknownKinds] };
}

// Load every record file in a patterns dir (skips the wcag catalog).
export function loadRecords(patternsDir) {
  const records = [];
  for (const f of readdirSync(patternsDir)) {
    if (!f.endsWith('.json') || f === 'wcag-catalog.json') continue;
    const arr = JSON.parse(readFileSync(join(patternsDir, f), 'utf8'));
    if (Array.isArray(arr)) records.push(...arr);
  }
  return records;
}

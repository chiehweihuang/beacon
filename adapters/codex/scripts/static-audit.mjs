#!/usr/bin/env node
// Beacon static baseline audit for Codex.
// Produces JSON compatible with Beacon's generate-report.mjs.
//
// Usage:
//   node static-audit.mjs --scope "My page" --output audit-results.json <file-or-dir>...

import { readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { basename, join, relative } from 'path';
import { extractText, assessLang, detectLangParts } from './lang-detect.mjs';
import { detectAuthBarriers, detectAuthBarriersInSource } from './auth-detect.mjs';
import { assessPdf } from './pdf-detect.mjs';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', 'coverage']);
const FILE_PATTERN = /\.(html?|css|scss|less|jsx|tsx|vue|svelte|js|cjs|mjs|ts|pdf)$/i;
const PDF_PATTERN = /\.pdf$/i;
const AGENT_FILE_NAMES = new Set(['robots.txt', 'sitemap.xml', 'llms.txt', 'openapi.json', 'openapi.yaml', 'openapi.yml', 'mcp.json', 'server-card.json']);

const CATEGORY_NAMES = {
  contrast: 'Color & Contrast',
  keyboard: 'Keyboard Navigation',
  screenreader: 'Screen Reader',
  forms: 'Forms',
  responsive: 'Responsive & Reflow',
  touch: 'Touch & Targets',
  cognitive: 'Cognitive',
  motion: 'Motion & Animation',
  media: 'Media',
  agent: 'Agent Operability & AEO',
};

const CATEGORY_ORDER = ['contrast', 'keyboard', 'screenreader', 'forms', 'responsive', 'touch', 'cognitive', 'motion', 'media', 'agent'];

function usage() {
  console.error('Usage: node static-audit.mjs [--scope name] [--url url] [--output audit-results.json] <file-or-dir>...');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { scope: 'Static UI audit', url: null, output: 'audit-results.json', paths: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--scope') opts.scope = argv[++i] || usage();
    else if (arg === '--url') opts.url = argv[++i] || usage();
    else if (arg === '--output') opts.output = argv[++i] || usage();
    else opts.paths.push(arg);
  }
  if (opts.paths.length === 0) usage();
  return opts;
}

function collect(inputPath, out = []) {
  const stat = statSync(inputPath);
  if (stat.isDirectory()) {
    for (const name of readdirSync(inputPath)) {
      if (SKIP_DIRS.has(name)) continue;
      collect(join(inputPath, name), out);
    }
    return out;
  }
  if (FILE_PATTERN.test(inputPath) || AGENT_FILE_NAMES.has(basename(inputPath).toLowerCase())) out.push(inputPath);
  return out;
}

function lineOf(text, index) {
  return text.slice(0, Math.max(index, 0)).split('\n').length;
}

function snippetAt(text, index) {
  const lines = text.split('\n');
  const line = lineOf(text, index);
  return lines.slice(Math.max(0, line - 2), Math.min(lines.length, line + 1)).join('\n').trim();
}

function makeStats() {
  const stats = {};
  for (const id of CATEGORY_ORDER) stats[id] = { id, name: CATEGORY_NAMES[id], pass: 0, fail: 0, review: 0, score: 0 };
  return stats;
}

function addCheck(stats, category, status) {
  if (status === 'pass') stats[category].pass += 1;
  else if (status === 'fail') stats[category].fail += 1;
  else stats[category].review += 1;
}

function addFinding(findings, stats, f) {
  // `check` controls which stats bucket this finding lands in (default 'fail').
  // REVIEW-level findings pass check:'review' so they don't count as hard fails.
  // It is stripped from the emitted finding object.
  const { check = 'fail', ...rest } = f;
  findings.push({
    level: rest.level || 'AA',
    legal_exposure: rest.legal_exposure || 'May affect ADA / EAA / JIS / Taiwan accessibility expectations depending on deployment context.',
    ...rest,
  });
  addCheck(stats, rest.category, check);
}

function isMarkup(ext) {
  return ['html', 'htm', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);
}

function isStyle(ext) {
  return ['css', 'scss', 'less'].includes(ext);
}

// PDFs are a separate accessibility surface and are binary — read as a Buffer
// and route to the PDF probe (assessPdf) instead of the utf8 text detectors.
function scanPdfFile(file, root, stats, findings) {
  const rel = relative(root, file) || file;
  const result = assessPdf(readFileSync(file)); // no 'utf8' -> Buffer
  if (result.status === 'INSUFFICIENT') return;
  for (const f of result.findings) {
    if (f.band !== 'FLAG' && f.band !== 'REVIEW') continue;
    addFinding(findings, stats, {
      key: f.key,
      category: 'screenreader',
      severity: f.band === 'FLAG' ? 'warning' : 'tip',
      check: f.band === 'REVIEW' ? 'review' : 'fail',
      wcag: f.wcag,
      level: f.level || 'A',
      title: f.title,
      affected_users: f.affected_users,
      location: rel,
      description: f.description,
      fix: f.fix,
    });
  }
}

function scanFile(file, root, stats, findings) {
  if (PDF_PATTERN.test(file)) return scanPdfFile(file, root, stats, findings);
  const text = readFileSync(file, 'utf8');
  const rel = relative(root, file) || file;
  const ext = file.match(/\.(\w+)$/)?.[1]?.toLowerCase() || '';
  const markup = isMarkup(ext);
  const style = isStyle(ext);
  const jsLike = ['js', 'cjs', 'mjs', 'ts', 'jsx', 'tsx', 'vue', 'svelte'].includes(ext);

  if (markup) {
    // Char ranges of <script>/<style> bodies. The structural detectors below skip
    // matches inside them so HTML-looking strings in JS/CSS are not flagged as real
    // elements (e.g. a `"<ul><div>"` template string inside an inline script).
    const masked = [...text.matchAll(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi)].map(s => [s.index, s.index + s[0].length]);
    const inMasked = (i) => masked.some(([s, e]) => i >= s && i < e);

    addCheck(stats, 'screenreader', /<html[^>]+lang=/.test(text) || !/\.html?$/.test(file) ? 'pass' : 'fail');
    if (/\.html?$/.test(file) && !/<html[^>]+lang=/.test(text)) {
      addFinding(findings, stats, {
        key: 'html-lang-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 3.1.1 Language of Page',
        title: 'Page language is missing',
        affected_users: 'Screen-reader users and translation users',
        location: `${rel}:1`,
        description: 'The HTML page does not declare a lang attribute, so assistive technology may choose the wrong pronunciation rules.',
        fix: 'Add a language attribute such as <html lang="zh-Hant"> or the correct document language.',
        code_before: '<html>',
        code_after: '<html lang="zh-Hant">',
      });
    }

    // Declared lang present: does it match the actual content language? (3.1.1)
    // The wrong-lang case axe/Lighthouse structurally miss — a declared lang is
    // always syntactically valid. On JS-heavy pages the static text is too thin
    // to judge, so assessLang returns INSUFFICIENT and we emit nothing (the
    // Tier-2 rendered-DOM path covers those). See core/scripts/lang-detect.mjs.
    const langDecl = /\.html?$/.test(file) && text.match(/<html[^>]*\blang=["']?([^\s"'>]+)/i); // quoted or unquoted
    if (langDecl) {
      const verdict = assessLang(langDecl[1], extractText(text));
      const suggest = { han: 'zh-Hant', jpn: 'ja', hangul: 'ko', latin: 'en' }[verdict.detectedFamily] || 'the correct language';
      if (verdict.status === 'FLAG') {
        addFinding(findings, stats, {
          key: 'html-lang-mismatch',
          category: 'screenreader',
          severity: 'warning',
          wcag: 'WCAG 2.2: 3.1.1 Language of Page',
          title: 'Declared page language does not match the content',
          affected_users: 'Screen-reader users (wrong pronunciation rules) and machine-translation users',
          location: `${rel}:1`,
          description: `Content-language mismatch: ${verdict.note}. A wrong language declaration is worse than a missing one. Assistive technology applies confidently wrong pronunciation and translation rules.`,
          fix: `Set <html lang> to the actual content language (detected: ${verdict.detectedFamily}).`,
          code_before: `<html lang="${verdict.declared}">`,
          code_after: `<html lang="${suggest}">`,
        });
      } else if (verdict.status === 'REVIEW') {
        addFinding(findings, stats, {
          key: 'html-lang-mismatch-review',
          category: 'screenreader',
          severity: 'tip',
          check: 'review',
          wcag: 'WCAG 2.2: 3.1.1 Language of Page',
          title: 'Page language may not match the content',
          affected_users: 'Screen-reader users and machine-translation users',
          location: `${rel}:1`,
          description: `Possible content-language mismatch: ${verdict.note}. This can be legitimate untagged bilingual content, so verify the primary language before changing it.`,
          fix: 'Confirm <html lang> matches the primary content language, and mark other-language passages with their own lang attribute (3.1.2 Language of Parts).',
        });
      }

      // 3.1.2 Language of Parts: a foreign-language passage with no inline lang.
      // Independent of the 3.1.1 verdict — a page can pass 3.1.1 yet have unmarked parts.
      const parts = detectLangParts(text);
      if (parts.status === 'REVIEW') {
        addFinding(findings, stats, {
          key: 'html-lang-parts-unmarked',
          category: 'screenreader',
          severity: 'tip',
          check: 'review',
          wcag: 'WCAG 2.2: 3.1.2 Language of Parts',
          title: 'Foreign-language passage may not carry its own lang attribute',
          affected_users: 'Screen-reader users (wrong pronunciation rules on the foreign passage)',
          location: `${rel}:1`,
          description: `${parts.note}. A passage in a language other than the page default needs its own lang so assistive tech switches pronunciation. Heuristic (cannot pinpoint the passage), so verify.`,
          fix: 'Wrap each foreign-language passage in an element with the correct lang, e.g. <span lang="ja">...</span> or <blockquote lang="fr">...</blockquote>.',
        });
      }
    }

    if (/\.html?$/.test(file) && !/<title>[^<]+<\/title>/i.test(text)) {
      addFinding(findings, stats, {
        key: 'document-title-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 2.4.2 Page Titled',
        title: 'Document title is missing',
        affected_users: 'Screen-reader users, keyboard users, and users with many tabs open',
        location: rel,
        description: 'A missing or empty title makes the page difficult to identify in browser and assistive technology contexts.',
        fix: 'Add a concise, unique <title>.',
      });
    } else addCheck(stats, 'screenreader', 'pass');

    if (!/<main\b|role=["']main["']/.test(text)) {
      addFinding(findings, stats, {
        key: 'main-landmark-missing',
        category: 'screenreader',
        severity: 'tip',
        wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
        title: 'Main landmark is not statically visible',
        affected_users: 'Screen-reader and keyboard users navigating by landmarks',
        location: rel,
        description: 'No <main> or role="main" was found in this static file.',
        fix: 'Wrap primary page content in <main id="main-content">.',
      });
    } else addCheck(stats, 'screenreader', 'pass');

    const headings = [...text.matchAll(/<h([1-6])\b/gi)].map(m => ({ level: Number(m[1]), index: m.index || 0 }));
    if (headings.length === 0) {
      addFinding(findings, stats, {
        key: 'headings-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 2.4.6 Headings and Labels',
        title: 'No headings found',
        affected_users: 'Screen-reader users and users scanning the page',
        location: rel,
        description: 'The static markup has no heading structure.',
        fix: 'Add a meaningful h1 and nested headings that describe the page structure.',
      });
    } else {
      addCheck(stats, 'screenreader', 'pass');
      for (let i = 1; i < headings.length; i++) {
        if (headings[i].level > headings[i - 1].level + 1) {
          addFinding(findings, stats, {
            key: 'heading-level-skipped',
            category: 'screenreader',
            severity: 'tip',
            wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
            title: 'Heading level is skipped',
            affected_users: 'Screen-reader users navigating by heading',
            location: `${rel}:${lineOf(text, headings[i].index)}`,
            description: `Heading jumps from h${headings[i - 1].level} to h${headings[i].level}.`,
            fix: 'Use a continuous heading hierarchy or adjust the visual style without changing semantic level.',
          });
          break;
        }
      }
    }

    for (const m of text.matchAll(/<img\b(?![^>]*\balt=)[^>]*>/gi)) {
      addFinding(findings, stats, {
        key: 'image-alt-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.1.1 Non-text Content',
        title: 'Image is missing alt text',
        affected_users: 'Blind and low-vision users using screen readers',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'An image without alt text is silent or announced poorly by assistive technology.',
        fix: 'Add meaningful alt text, or alt="" for purely decorative images.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    // List structure (axe "list"): a <ul>/<ol> whose first child is not <li>.
    // Conservative Tier-1 heuristic: inspect only the FIRST child after the open
    // tag (skipping whitespace + comments), tag-branch only, skip PascalCase
    // framework components, and skip lists with an explicit role= (author has
    // taken control of the semantics). Stray non-li children later in the list,
    // and visibility, are deferred to Tier-2 axe.
    for (const m of text.matchAll(/<(?:ul|ol)\b([^>]*)>\s*(?:<!--[\s\S]*?-->\s*)*<([a-zA-Z][\w-]*)/gi)) {
      if (inMasked(m.index)) continue; // HTML-looking string inside <script>/<style>
      if (/\brole\s*=/.test(m[1]) || /\saria-hidden\s*=\s*["']true/i.test(m[1])) continue; // author-controlled ARIA / hidden from a11y tree
      const lc = m[2].toLowerCase();
      if (lc === 'li' || lc === 'script' || lc === 'template') continue;
      if (/^[A-Z]/.test(m[2])) continue; // framework component, not a literal element
      addFinding(findings, stats, {
        key: 'list-non-li-child',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.3.1 Info and Relationships',
        level: 'A',
        title: 'List contains a non-list-item child',
        affected_users: 'Screen-reader users navigating by list semantics',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: `A <ul>/<ol> has a direct child that is not <li>, <script>, or <template> (found <${lc}>). Screen readers may not announce the list or its item count correctly.`,
        fix: 'Make <li> the only structural child; move wrapper elements inside an <li>, or use role="list"/role="listitem" if a non-standard structure is unavoidable.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    for (const m of text.matchAll(/<button\b((?!aria-label|aria-labelledby)[^>])*>\s*(<[^>]+>\s*)*<\/button>/gi)) {
      addFinding(findings, stats, {
        key: 'button-name-missing',
        category: 'keyboard',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        title: 'Button may not have an accessible name',
        affected_users: 'Screen-reader and voice-control users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'A button with no visible text or accessible label is hard to understand or activate by name.',
        fix: 'Add visible text, aria-label, or aria-labelledby.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    // Link accessible-name. A link is "named" if it OR a descendant carries a
    // non-empty aria-label / aria-labelledby / title, OR it wraps ANY <img>
    // (deferred to the image-alt check above, which surfaces alt-less images), OR
    // an <svg><title> with text, OR it has visible text. Inspecting the BODY (not
    // just the <a> tag) means an icon link named by a child's aria-label is no
    // longer false-flagged. Tier-1: not DOM-aware, NOT visibility-aware (hidden
    // nameless links are over-reported vs axe — true of every static check here),
    // and skips matches inside <script>/<style>.
    for (const m of text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (inMasked(m.index)) continue;
      const attrs = m[1], body = m[2];
      if (!/\shref\s*=/.test(attrs)) continue; // anchor without href is not a link
      if (/\saria-hidden\s*=\s*["']true/i.test(attrs)) continue; // removed from the a11y tree
      const svgTitle = body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const named =
        /\s(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']/.test(attrs) ||
        /\s(?:aria-label|aria-labelledby|title)\s*=\s*["'][^"']/.test(body) ||
        /<img\b/i.test(body) || // wraps an image -> defer to the image-alt check
        (!!svgTitle && svgTitle[1].trim().length > 0) ||
        body.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim().length > 0;
      if (named) continue;
      addFinding(findings, stats, {
        key: 'link-name-missing',
        category: 'screenreader',
        severity: 'warning',
        wcag: 'WCAG 2.2: 4.1.2 Name, Role, Value',
        level: 'A',
        title: 'Link may not have an accessible name',
        affected_users: 'Screen-reader, voice-control, and keyboard users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'A link with no visible text, no aria-label/aria-labelledby/title (on it or a descendant), and no image alt or SVG title has no accessible name. Screen readers announce it as a bare "link".',
        fix: 'Add visible link text, an aria-label/aria-labelledby/title, give a wrapped <img> meaningful alt text, or add an <svg><title>.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    for (const m of text.matchAll(/<(div|span)\b[^>]*(onClick|onclick)[^>]*>/g)) {
      addFinding(findings, stats, {
        key: 'clickable-non-button',
        category: 'keyboard',
        severity: 'critical',
        wcag: 'WCAG 2.2: 2.1.1 Keyboard',
        level: 'A',
        title: 'Clickable non-button element',
        affected_users: 'Keyboard-only, switch-control, screen-reader, and voice-control users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'Clickable <div> or <span> elements are not keyboard-operable by default.',
        fix: 'Use <button> for actions. If custom semantics are unavoidable, add role, tabindex, and Enter/Space handling.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    for (const m of text.matchAll(/<input\b(?![^>]*(aria-label|aria-labelledby|id=|type=["']hidden["']))[^>]*>/gi)) {
      addFinding(findings, stats, {
        key: 'input-label-missing',
        category: 'forms',
        severity: 'warning',
        wcag: 'WCAG 2.2: 3.3.2 Labels or Instructions',
        title: 'Input may be missing an accessible label',
        affected_users: 'Screen-reader, voice-control, and cognitive disability users',
        location: `${rel}:${lineOf(text, m.index || 0)}`,
        description: 'The input has no obvious id or ARIA label in static markup.',
        fix: 'Pair it with a <label for="..."> or use aria-labelledby when a visible label already exists.',
        code_before: snippetAt(text, m.index || 0),
      });
    }

    // Authentication barriers (3.3.8): cognitive-function-test CAPTCHAs and
    // paste-blocked password fields that Lighthouse does not flag. INFO signals
    // (invisible reCAPTCHA / v3 / Turnstile) are not 3.3.8 barriers — skip them.
    // Object-recognition CAPTCHAs (reCAPTCHA v2 / hCaptcha) are REVIEW, not fail,
    // because 3.3.8 Minimum exempts them. See core/scripts/auth-detect.mjs.
    for (const sig of detectAuthBarriers(text)) {
      if (sig.band !== 'FLAG' && sig.band !== 'REVIEW') continue;
      addFinding(findings, stats, {
        key: sig.key,
        category: 'forms',
        severity: sig.band === 'FLAG' ? 'warning' : 'tip',
        check: sig.band === 'REVIEW' ? 'review' : 'fail',
        wcag: sig.wcag,
        level: sig.level || 'AA',
        title: sig.title,
        affected_users: sig.affected_users,
        location: `${rel}:${lineOf(text, sig.index || 0)}`,
        description: sig.description,
        fix: sig.fix,
        code_before: sig.code_before || snippetAt(text, sig.index || 0),
      });
    }

    if (/\.html?$/.test(file) && !/<meta\s+name=["']viewport["'][^>]*>/i.test(text)) {
      addFinding(findings, stats, {
        key: 'viewport-meta-missing',
        category: 'responsive',
        severity: 'warning',
        wcag: 'WCAG 2.2: 1.4.10 Reflow',
        title: 'Viewport meta tag is missing',
        affected_users: 'Mobile users and low-vision users who zoom',
        location: rel,
        description: 'Without a viewport meta tag, mobile layout and zoom behavior can become unusable.',
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
      });
    } else addCheck(stats, 'responsive', 'pass');

    // Viewport present but disables zoom (axe "meta-viewport", WCAG 1.4.4). The
    // presence check above only verifies the tag exists; this parses its content.
    if (/\.html?$/.test(file)) {
      for (const m of text.matchAll(/<meta\s+[^>]*name=["']viewport["'][^>]*>/gi)) {
        const cm = m[0].match(/content=["']([^"']*)["']/i);
        const content = cm ? cm[1].toLowerCase() : '';
        const noScale = /user-scalable\s*=\s*(?:no|0|false)/.test(content);
        const maxM = content.match(/maximum-scale\s*=\s*([0-9.]+)/);
        const lowMax = !!maxM && !Number.isNaN(parseFloat(maxM[1])) && parseFloat(maxM[1]) < 5;
        if (noScale || lowMax) {
          addFinding(findings, stats, {
            key: 'viewport-zoom-disabled',
            category: 'responsive',
            severity: 'warning',
            wcag: 'WCAG 2.2: 1.4.4 Resize Text',
            level: 'AA',
            title: 'Viewport meta disables zoom',
            affected_users: 'Low-vision users who pinch-zoom, and mobile users',
            location: `${rel}:${lineOf(text, m.index || 0)}`,
            description: `The viewport meta tag prevents zoom (${noScale ? 'user-scalable=no' : 'maximum-scale below 5'}), so users cannot enlarge text.`,
            fix: 'Remove user-scalable=no and any maximum-scale below 5; use content="width=device-width, initial-scale=1".',
            code_before: snippetAt(text, m.index || 0),
          });
        }
      }
    }

    if (/\.html?$/.test(file)) {
      if (!/<meta\s+name=["']description["'][^>]*content=["'][^"']+["'][^>]*>/i.test(text)) {
        addFinding(findings, stats, {
          key: 'meta-description-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'Meta description is missing',
          affected_users: 'Search and answer-engine users evaluating whether to open the result',
          location: rel,
          description: 'No meta description was found in the static HTML.',
          fix: 'Add a concise page-specific meta description.',
          legal_exposure: 'Not a legal issue; affects search / answer-engine clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');

      if (!/<link\s+rel=["']canonical["'][^>]*>/i.test(text)) {
        addFinding(findings, stats, {
          key: 'canonical-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'Canonical link is missing',
          affected_users: 'Search and answer-engine users when duplicate URLs or variants exist',
          location: rel,
          description: 'No canonical URL was found in the static HTML, so crawlers may have to infer the preferred URL.',
          fix: 'Add <link rel="canonical" href="https://example.com/preferred-url"> for indexable public pages.',
          legal_exposure: 'Not a legal issue; affects search / answer-engine clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');

      if (!/<script\s+type=["']application\/ld\+json["'][^>]*>/i.test(text)) {
        addFinding(findings, stats, {
          key: 'jsonld-missing',
          category: 'agent',
          severity: 'tip',
          wcag: 'AEO structural hygiene',
          level: 'Review',
          title: 'JSON-LD structured data is missing',
          affected_users: 'Search and answer-engine users trying to identify the page entity and content type',
          location: rel,
          description: 'No JSON-LD structured data was found in the static HTML.',
          fix: 'Add page-appropriate Schema.org JSON-LD, such as Organization, Article, FAQPage, Product, BreadcrumbList, or WebSite.',
          legal_exposure: 'Not a legal issue; affects answer-engine and search clarity.',
        });
      } else addCheck(stats, 'agent', 'pass');
    }
  }

  if (style || markup) {
    for (const m of text.matchAll(/outline\s*:\s*(none|0)\b/gi)) {
      if (!/focus-visible/.test(text)) {
        addFinding(findings, stats, {
          key: 'focus-outline-removed',
          category: 'keyboard',
          severity: 'critical',
          wcag: 'WCAG 2.2: 2.4.7 Focus Visible',
          level: 'AA',
          title: 'Focus outline removed without replacement',
          affected_users: 'Sighted keyboard users and low-vision keyboard users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'Removing outline without a :focus-visible replacement makes keyboard location invisible.',
          fix: 'Restore outline or add a strong :focus-visible style.',
          code_before: snippetAt(text, m.index || 0),
        });
        break;
      }
    }

    for (const m of text.matchAll(/minmax\(\s*\d+px/gi)) {
      if (!/minmax\(\s*min\(\s*\d+px\s*,\s*100%\s*\)/i.test(text)) {
        addFinding(findings, stats, {
          key: 'fixed-minmax-overflow',
          category: 'responsive',
          severity: 'warning',
          wcag: 'WCAG 2.2: 1.4.10 Reflow',
          title: 'Fixed minmax grid can overflow narrow screens',
          affected_users: 'Low-vision users, mobile users, and zoom users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'minmax(Npx, 1fr) keeps a fixed minimum that can overflow at 320px.',
          fix: 'Use minmax(min(Npx, 100%), 1fr).',
          code_before: snippetAt(text, m.index || 0),
        });
        break;
      }
    }

    if (/(animation|transition)\s*:/.test(text) && !/prefers-reduced-motion/.test(text)) {
      addFinding(findings, stats, {
        key: 'motion-reduced-motion-missing',
        category: 'motion',
        severity: 'warning',
        wcag: 'WCAG 2.2: 2.3.3 Animation from Interactions',
        title: 'Motion exists without reduced-motion handling',
        affected_users: 'Vestibular disorder, migraine, and attention-sensitive users',
        location: rel,
        description: 'Animation or transitions were detected, but no prefers-reduced-motion handling was found in this file.',
        fix: 'Add @media (prefers-reduced-motion: reduce) to disable or shorten non-essential motion.',
      });
    } else if (/(animation|transition)\s*:/.test(text)) addCheck(stats, 'motion', 'pass');

    if (/width\s*:\s*[4-9]\d{2,}px|min-width\s*:\s*[4-9]\d{2,}px/.test(text)) {
      addFinding(findings, stats, {
        key: 'large-fixed-width',
        category: 'responsive',
        severity: 'tip',
        wcag: 'WCAG 2.2: 1.4.10 Reflow',
        title: 'Large fixed width detected',
        affected_users: 'Mobile and zoom users',
        location: rel,
        description: 'Large fixed widths may overflow narrow viewports.',
        fix: 'Use max-width, min(), clamp(), or container-relative sizing.',
      });
    }
  }

  if (jsLike) {
    // Source-level auth barriers (3.3.8) the markup scan misses: a JS-set
    // password type with clipboard blocking, and JS-rendered / tag-manager-
    // injected CAPTCHA. Source detection is heuristic (minified/indirected code
    // defeats it), so these are REVIEW/INFO, never a hard FLAG. The Tier-2
    // rendered-DOM snapshot is authoritative for the injected-widget case.
    const markupPasteFlagged = findings.some(
      (f) => f.key === 'auth-password-paste-blocked' && f.location.startsWith(rel + ':')
    );
    for (const sig of detectAuthBarriersInSource(text)) {
      if (sig.band !== 'FLAG' && sig.band !== 'REVIEW') continue;
      if (sig.key === 'auth-password-clipboard-blocked-js' && markupPasteFlagged) continue;
      addFinding(findings, stats, {
        key: sig.key,
        category: 'forms',
        severity: sig.band === 'FLAG' ? 'warning' : 'tip',
        check: sig.band === 'REVIEW' ? 'review' : 'fail',
        wcag: sig.wcag,
        level: sig.level || 'AA',
        title: sig.title,
        affected_users: sig.affected_users,
        location: `${rel}:${lineOf(text, sig.index || 0)}`,
        description: sig.description,
        fix: sig.fix,
        code_before: sig.code_before || snippetAt(text, sig.index || 0),
      });
    }
    for (const m of text.matchAll(/addEventListener\s*\(\s*['"]click['"]/g)) {
      const ctx = snippetAt(text, m.index || 0);
      if (!/keydown|keyup|<button|role\s*=\s*["']button["']/.test(ctx)) {
        addFinding(findings, stats, {
          key: 'click-handler-keyboard-missing',
          category: 'keyboard',
          severity: 'critical',
          wcag: 'WCAG 2.2: 2.1.1 Keyboard',
          level: 'A',
          title: 'Click handler lacks nearby keyboard handling',
          affected_users: 'Keyboard-only, switch-control, and screen-reader users',
          location: `${rel}:${lineOf(text, m.index || 0)}`,
          description: 'A click listener was found without nearby keyboard support in the same snippet.',
          fix: 'Prefer a native button, or add Enter/Space keyboard support and focus management.',
          code_before: ctx,
        });
      }
    }
  }

  // Baseline review items that static scanning cannot verify.
  addCheck(stats, 'contrast', 'review');
  addCheck(stats, 'touch', 'review');
  addCheck(stats, 'cognitive', 'review');
  addCheck(stats, 'media', 'review');
}

function hasDirectoryInput(paths) {
  return paths.some(p => {
    try { return statSync(p).isDirectory(); }
    catch { return false; }
  });
}

function hasCollectedFile(files, root, name) {
  const lower = name.toLowerCase();
  return files.some(file => {
    const rel = relative(root, file).replace(/\\/g, '/').toLowerCase();
    return rel === lower || rel.endsWith('/' + lower);
  });
}

function addSiteAgentReadinessFindings(inputPaths, files, root, stats, findings) {
  if (!hasDirectoryInput(inputPaths)) return;

  if (!hasCollectedFile(files, root, 'robots.txt')) {
    addFinding(findings, stats, {
      key: 'robots-txt-missing',
      category: 'agent',
      severity: 'tip',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'robots.txt was not found in the scanned site files',
      affected_users: 'Search crawlers, answer-engine crawlers, and site operators controlling crawler access',
      location: 'site root',
      description: 'No robots.txt file was found in the scanned directory. Agents and crawlers may have less explicit guidance about what they can access.',
      fix: 'Add a site-root robots.txt. For public AI-facing sites, consider explicit sitemap and Content-Signal directives that match your policy.',
      legal_exposure: 'Not a legal issue; affects crawler and agent access clarity.',
    });
  } else addCheck(stats, 'agent', 'pass');

  if (!hasCollectedFile(files, root, 'sitemap.xml')) {
    addFinding(findings, stats, {
      key: 'sitemap-missing',
      category: 'agent',
      severity: 'tip',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'sitemap.xml was not found in the scanned site files',
      affected_users: 'Search and answer-engine crawlers discovering canonical public pages',
      location: 'site root',
      description: 'No sitemap.xml file was found in the scanned directory.',
      fix: 'Add a site-root sitemap.xml and reference it from robots.txt so crawlers can discover important public URLs.',
      legal_exposure: 'Not a legal issue; affects URL discovery for search and answer engines.',
    });
  } else addCheck(stats, 'agent', 'pass');

  if (!hasCollectedFile(files, root, 'llms.txt')) {
    addFinding(findings, stats, {
      key: 'llms-txt-missing',
      category: 'agent',
      severity: 'tip',
      wcag: 'Agent readiness structural hygiene',
      level: 'Review',
      title: 'llms.txt was not found in the scanned site files',
      affected_users: 'AI agents and answer engines looking for a concise site map or content guide',
      location: 'site root',
      description: 'No llms.txt file was found in the scanned directory. This proposed convention is optional, but can help agents find the most important content.',
      fix: 'Consider adding a site-root llms.txt that describes the site, key pages, docs, APIs, and crawl/use policy in plain text.',
      legal_exposure: 'Not a legal issue; affects optional AI-agent content discovery.',
    });
  } else addCheck(stats, 'agent', 'pass');
}

function scoreCategory(cat) {
  const total = cat.pass + cat.fail;
  if (total === 0) return cat.review > 0 ? 60 : 100;
  const base = Math.round((cat.pass / total) * 100);
  const reviewPenalty = Math.min(20, cat.review * 3);
  return Math.max(0, Math.min(100, base - reviewPenalty));
}

function priorityFor(severity) {
  if (severity === 'critical') return 'P0';
  if (severity === 'warning') return 'P1';
  return 'P2';
}

function criteriaFromFindings(findings) {
  const criteria = new Set();
  for (const f of findings) {
    for (const m of String(f.wcag || '').matchAll(/\b([1-4]\.\d\.\d{1,2})\b/g)) {
      criteria.add(m[1]);
    }
  }
  return [...criteria].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const files = [...new Set(opts.paths.flatMap(p => collect(p)))];
  const stats = makeStats();
  const findings = [];

  for (const file of files) scanFile(file, root, stats, findings);
  addSiteAgentReadinessFindings(opts.paths, files, root, stats, findings);

  const categories = CATEGORY_ORDER.map(id => {
    const cat = stats[id];
    return { ...cat, score: scoreCategory(cat) };
  });

  const overall = Math.round(categories.reduce((sum, cat) => sum + cat.score, 0) / categories.length);
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const tips = findings.filter(f => f.severity === 'tip').length;
  const legalCriteria = criteriaFromFindings(findings);

  const audit = {
    metadata: {
      date: new Date().toISOString().slice(0, 10),
      url: opts.url || undefined,
      scope: opts.scope,
      standard: 'WCAG 2.2 AA static baseline',
      jurisdictions: ['US ADA', 'EU EAA', 'Japan JIS', 'Taiwan', 'Canada ACA', 'Australia DDA'],
      platform: 'Web',
      tool_version: 'beacon codex static baseline',
      confidence_level: 'medium',
      requires_live_audit: true,
      audit_tier: 'Tier 1 (static file scan only)',
      audit_methods: [
        `Static scan of ${files.length} UI-like file(s)`,
        'Pattern checks for semantic HTML, keyboard traps, labels, reflow, motion, AEO structure, and site-level agent-readiness files when a directory is scanned',
        'Runtime behavior, contrast ratios, and screen-reader task completion were not fully verified',
      ],
    },
    summary: {
      overall_score: overall,
      total_findings: findings.length,
      critical,
      warnings,
      tips,
      unverifiable: categories.reduce((sum, cat) => sum + cat.review, 0),
      categories,
    },
    findings,
    legal_risk: {
      assessment_mode: 'wcag_criteria_context',
      narrative: 'Technical WCAG criteria mapping only. This is not a legal opinion and is not derived from warning counts.',
      mapped_criteria: legalCriteria,
      jurisdictions: [
        { name: 'US ADA', law: 'ADA Title III / Section 508 context', detail: 'Use the mapped WCAG criteria as technical evidence; legal exposure depends on business model, sector, and jurisdiction-specific facts.', criteria: legalCriteria },
        { name: 'EU EAA', law: 'European Accessibility Act', detail: 'Use the mapped WCAG criteria as technical evidence for consumer digital-service accessibility planning.', criteria: legalCriteria },
        { name: 'Japan JIS', law: 'JIS X 8341-3 context', detail: 'Use the mapped WCAG criteria as technical evidence; confirm procurement or sector requirements separately.', criteria: legalCriteria },
        { name: 'Taiwan', law: 'Taiwan accessibility context', detail: 'Use the mapped WCAG criteria as technical evidence only; confirm current local program, certification, and seal requirements before making a compliance claim.', criteria: legalCriteria },
        { name: 'Canada ACA', law: 'Accessible Canada Act context', detail: 'Use the mapped WCAG criteria as technical evidence; applicability depends on organization type and regulated context.', criteria: legalCriteria },
        { name: 'Australia DDA', law: 'Disability Discrimination Act context', detail: 'Use the mapped WCAG criteria as technical evidence; legal assessment requires local context and counsel.', criteria: legalCriteria },
      ],
    },
    remediation: findings.map(f => ({
      priority: priorityFor(f.severity),
      key: f.key,
      title: f.title,
      location: f.location,
      wcag: f.wcag,
      fix: f.fix || 'Review and fix.',
    })),
    testing_recommendations: [
      'Run keyboard-only walkthrough of the primary flow.',
      'Run a live browser audit with Playwright + axe-core when a page is available.',
      'Check 320px reflow and 200% zoom manually.',
      'Listen to the page with VoiceOver or NVDA for the core task.',
      'Treat this static score as a regression baseline, not a completion certificate.',
    ],
  };

  writeFileSync(opts.output, JSON.stringify(audit, null, 2));
  console.log(`Wrote ${opts.output}`);
  console.log(`Static baseline score: ${overall} (${findings.length} finding(s), ${critical} critical, ${warnings} warning, ${tips} tip)`);
}

main();

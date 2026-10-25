#!/usr/bin/env node
// Beacon Tier-2 native measurement harness: contrast + touch targets.
// Plain Playwright (browser MCP is off on this machine) — no axe-core dependency.
//
// This repo stays dependency-free (no package.json). Playwright is detected at runtime
// (see loadPlaywright() below for the exact discovery order and its no-Playwright-found
// error), never installed as a repo dependency. If no usable Playwright/browser is found,
// this script fails loudly with an actionable error, and the test suite's browser-backed
// tests skip loudly (node:test skip reason) rather than silently passing or failing red.
//

// Division of labour mirrors focus-flow.mjs: CAPTURE (page.evaluate DOM/computed-style
// walks — unavoidably browser-side) is kept separate from ANALYZE (pure functions over
// plain data — unit-testable with synthetic fixtures, no browser needed). The color math
// (parsing, multi-layer alpha compositing, luminance, ratio) lives entirely on the analyze
// side so it has ONE implementation and is fully covered by fast synthetic tests; capture
// only collects raw computed-style strings and defers all arithmetic to Node.
//
// Findings are emitted in the same shape as static-audit.mjs (key, category, severity,
// check, wcag, level, title, affected_users, location, description, fix) plus their own
// engine provenance (`source`), so a future merge step can consume them the same way
// static-audit.mjs's --merge-findings already consumes external findings. Scoring wiring
// (whether these enter the weighted-average denominator) is a separate, not-yet-decided
// step — this script only emits findings + evidence, never a score.
//
// Usage:
//   node tier2-audit.mjs --url <url-or-file-path> --output tier2-results.json [--date iso]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { legalExposureFor } from './jurisdictions.mjs';
import { LEVELS, viewportsForLevel } from './viewport-tiers.mjs';

const DETECTOR_VERSION = 'beacon-tier2-audit@3'; // @3: touch-target findings change under mobile emulation

// 1280x900 matches the capture recipe pinned for the static/benchmark tier (VALIDATION.md L0).
export const TIER2_VIEWPORTS = viewportsForLevel('feature');

// --- WCAG thresholds (VALIDATION.md L2 calibration decisions, not physical constants) ---
const CONTRAST_NORMAL_MIN = 4.5;   // WCAG 2.2: 1.4.3 normal text
const CONTRAST_LARGE_MIN = 3;      // WCAG 2.2: 1.4.3 large text
const LARGE_TEXT_PX = 24;          // 18pt
const LARGE_TEXT_BOLD_PX = 18.6667; // 14pt bold
const TOUCH_FLOOR_PX = 24;         // WCAG 2.2: 2.5.8 minimum, both dimensions
const TOUCH_BEST_PRACTICE_PX = 44; // advisory only, never a violation

// ---------------------------------------------------------------------------------------
// Pure color / geometry helpers (unit-testable, no DOM)
// ---------------------------------------------------------------------------------------

// Parses the canonical Chromium getComputedStyle serialization: "rgb(r, g, b)" or
// "rgba(r, g, b, a)". Returns null for anything else (never guesses).
export function parseColor(str) {
  const m = String(str || '').match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

function channelLin(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function relLuminance({ r, g, b }) {
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

export function contrastRatio(c1, c2) {
  const l1 = relLuminance(c1), l2 = relLuminance(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// Composites a stack of {r,g,b,a} layers (OUTERMOST ancestor LAST in the array — i.e. the
// element's own layer is layers[0]) down onto the default white canvas. Reused for both the
// background stack and for "foreground color over its own background" (an alpha<1 fg is just
// one more layer painted on top of the same bg stack).
export function compositeLayers(layers) {
  let result = { r: 255, g: 255, b: 255 }; // default canvas
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = layers[i];
    if (!c || c.a <= 0) continue;
    result = {
      r: Math.round(c.a * c.r + (1 - c.a) * result.r),
      g: Math.round(c.a * c.g + (1 - c.a) * result.g),
      b: Math.round(c.a * c.b + (1 - c.a) * result.b),
    };
  }
  return result;
}

export function isLargeText(fontSizePx, bold) {
  const EPS = 0.01;
  return fontSizePx >= LARGE_TEXT_PX - EPS || (bold && fontSizePx >= LARGE_TEXT_BOLD_PX - EPS);
}

function circleOverlapsRect(cx, cy, r, rect) {
  const nearestX = Math.min(Math.max(cx, rect.x), rect.x + rect.width);
  const nearestY = Math.min(Math.max(cy, rect.y), rect.y + rect.height);
  const dx = cx - nearestX, dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

function isUndersized(rect) {
  return rect.width < TOUCH_FLOOR_PX || rect.height < TOUCH_FLOOR_PX;
}

function centerOf(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

// ---------------------------------------------------------------------------------------
// Analyze (pure): captured samples -> findings, same shape as static-audit.mjs
// ---------------------------------------------------------------------------------------

// Jurisdiction-expansion spec (2026-08-29, item 3): derive from the finding's actual WCAG
// level instead of one identical hardcoded string — every tier2 finding here is AA anyway
// (1.4.3, 2.5.8), but this keeps the raw un-merged tier2.json output honest too, not just
// the merged artifact (mergeExternalFindings' addFinding() funnel re-derives it again on
// merge, since legal_exposure is never forwarded across that boundary).
function baseFinding(f) {
  const level = f.level || 'AA';
  return {
    level,
    legal_exposure: legalExposureFor(level).en,
    source: DETECTOR_VERSION,
    ...f,
  };
}

// HIGH-2 (2026-07-26 merge audit): four distinct signals can mark a sample unresolvable
// (see browserCollectContrastSamples' bgUnresolvedReason below) — name the actual one
// instead of always blaming "image or gradient". Falls back to the generic four-cause
// description when a sample carries no reason (e.g. a hand-built specimen/test fixture).
const UNRESOLVABLE_REASON_TEXT = {
  'image-or-gradient': {
    title: 'Text contrast could not be resolved (background is an image or gradient)',
    description: (sel) => `An ancestor of "${sel}" paints a background-image (photo or gradient), so the effective background color cannot be computed without rendering the image itself.`,
  },
  'pseudo-or-inset-shadow': {
    title: 'Text contrast could not be resolved (background painted by a pseudo-element or inset shadow)',
    description: (sel) => `The visible background behind "${sel}" is painted by a ::before/::after pseudo-element or an inset box-shadow, not a plain background-color an ancestor walk can see.`,
  },
  'non-ancestor-overlay': {
    title: 'Text contrast could not be resolved (a non-ancestor element paints behind it)',
    description: (sel) => `A non-ancestor element (sibling/cousin, stacked via position + z-index) overlaps "${sel}" and paints its real visible background, which no ancestor walk can reach.`,
  },
  'dark-canvas': {
    title: 'Text contrast could not be resolved (page relies on a dark default canvas)',
    description: (sel) => `No ancestor of "${sel}" declares an opaque background, and the page opts into color-scheme: dark, so the browser's default canvas is dark rather than the assumed white.`,
  },
};
const GENERIC_UNRESOLVABLE_TEXT = {
  title: 'Text contrast could not be resolved (effective background not determinable from computed styles)',
  description: (sel) => `The effective background behind "${sel}" cannot be computed from styles alone — an ancestor paints a background-image or gradient, a pseudo-element or inset box-shadow paints behind the text, a non-ancestor element overlaps it, or the page relies on a dark default canvas (color-scheme: dark).`,
};

// samples: [{ selector, fgStr, bgLayerStrs, bgUnresolved, bgUnresolvedReason, fontSizePx, bold }]
export function analyzeContrastSamples(samples, viewport) {
  const findings = [];
  for (const s of samples) {
    const location = `${s.selector} (viewport ${viewport})`;
    if (s.bgUnresolved) {
      const reasonText = UNRESOLVABLE_REASON_TEXT[s.bgUnresolvedReason] || GENERIC_UNRESOLVABLE_TEXT;
      findings.push(baseFinding({
        key: 'tier2-contrast-unresolvable',
        category: 'contrast',
        severity: 'tip',
        check: 'review',
        wcag: 'WCAG 2.2: 1.4.3 Contrast (Minimum)',
        title: reasonText.title,
        affected_users: 'Low-vision users — verify manually, the background could not be resolved statically',
        location,
        selector: s.selector,
        viewport,
        description: reasonText.description(s.selector),
        fix: 'Verify contrast manually against the real rendered page, or add a solid-color fallback/overlay behind the text that meets the contrast threshold.',
      }));
      continue;
    }
    const fg = parseColor(s.fgStr);
    const bgLayers = s.bgLayerStrs.map(parseColor);
    // unparseable computed color (shouldn't happen on a real browser) or fully-transparent
    // ink (color:transparent / rgba(...,0), a common icon-font/image-replacement pattern) —
    // no visible text painted, so there is nothing to measure a contrast finding against.
    if (!fg || fg.a === 0) continue;
    const effectiveFg = compositeLayers([fg, ...bgLayers]);
    const effectiveBg = compositeLayers(bgLayers);
    const ratio = contrastRatio(effectiveFg, effectiveBg);
    const large = isLargeText(s.fontSizePx, s.bold);
    const required = large ? CONTRAST_LARGE_MIN : CONTRAST_NORMAL_MIN;
    if (ratio >= required) continue;
    findings.push(baseFinding({
      key: 'tier2-contrast-fail',
      category: 'contrast',
      severity: 'warning',
      check: 'fail',
      wcag: 'WCAG 2.2: 1.4.3 Contrast (Minimum)',
      title: `Text contrast ${ratio.toFixed(2)}:1 is below the ${required}:1 minimum`,
      affected_users: 'Low-vision users and users in high ambient light',
      location,
      selector: s.selector,
      viewport,
      description: `Computed foreground rgb(${effectiveFg.r}, ${effectiveFg.g}, ${effectiveFg.b}) against background rgb(${effectiveBg.r}, ${effectiveBg.g}, ${effectiveBg.b}) yields ${ratio.toFixed(2)}:1; ${large ? 'large text' : 'normal text'} requires ${required}:1.`,
      fix: 'Increase the foreground/background contrast (darker text, lighter background, or vice versa) until it meets the required ratio.',
      computed: { fg: effectiveFg, bg: effectiveBg, ratio: Number(ratio.toFixed(3)), required, fontSizePx: s.fontSizePx, bold: s.bold, large },
    }));
  }
  return findings;
}

// hakuso CRITICAL (2026-08-29): the raw `contrast_samples` capture count (samples.length)
// includes samples this analyzer SKIPS as "nothing to measure" (no visible ink — line 187
// above) — not a pass, not a fail, not text at all. static-audit.mjs's --merge-findings
// derives an implicit "clean pass" count from the capture total minus itemized findings;
// using the raw total let invisible/transparent samples silently inflate that pass count,
// violating VALIDATION.md's rule that absence/undecided never reads as pass. This mirrors
// analyzeContrastSamples' own skip predicate exactly (kept next to it on purpose, so the
// two can't drift) and returns only the count that was actually DECIDED one way or another
// (unresolvable, fail, or a genuine pass) — the correct denominator for that derivation.
export function countDecidedContrastSamples(samples) {
  let decided = 0;
  for (const s of samples) {
    if (s.bgUnresolved) { decided += 1; continue; } // decided: unresolvable, never a pass
    const fg = parseColor(s.fgStr);
    if (!fg || fg.a === 0) continue; // nothing to measure -- excluded entirely
    decided += 1; // decided: resolved (fail, itemized, or implicit pass)
  }
  return decided;
}

// targets: [{ selector, rect: {x,y,width,height} }]
export function analyzeTouchTargets(targets, viewport) {
  const findings = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const { width, height } = t.rect;
    const location = `${t.selector} (viewport ${viewport})`;
    const meetsFloorDirectly = width >= TOUCH_FLOOR_PX && height >= TOUCH_FLOOR_PX;
    let exceptionMet = true;
    if (!meetsFloorDirectly) {
      const cx = t.rect.x + width / 2, cy = t.rect.y + height / 2;
      const r = TOUCH_FLOOR_PX / 2;
      // SC 2.5.8 spacing exception: an undersized target's circle must not intersect
      // ANOTHER target. For a full-size neighbor that means the neighbor's real bounding
      // rect; for an undersized neighbor, the SC uses THAT neighbor's own 24px circle too
      // (circle-vs-circle, not circle-vs-its-small-rect) — hakuso HIGH, 2026-07-25: the
      // old circle-vs-rect-only version under-detected the gap band (~12-24px apart)
      // where two small targets' rects don't touch but their circles do.
      exceptionMet = !targets.some((other, j) => {
        if (j === i) return false;
        if (isUndersized(other.rect)) {
          const oc = centerOf(other.rect);
          const dx = cx - oc.x, dy = cy - oc.y;
          return dx * dx + dy * dy < TOUCH_FLOOR_PX * TOUCH_FLOOR_PX; // both radius 12, sum 24
        }
        return circleOverlapsRect(cx, cy, r, other.rect);
      });
      if (!exceptionMet) {
        findings.push(baseFinding({
          key: 'tier2-touch-target-fail',
          category: 'touch',
          severity: 'warning',
          check: 'fail',
          wcag: 'WCAG 2.2: 2.5.8 Target Size (Minimum)',
          title: `Touch target ${width.toFixed(0)}×${height.toFixed(0)}px is below the 24×24px minimum`,
          affected_users: 'Touch-screen, low-vision, and motor-impairment users',
          location,
          selector: t.selector,
          viewport,
          description: `The target is ${width.toFixed(0)}×${height.toFixed(0)}px, below the 24×24px floor, and another target sits inside the 24px spacing exception's circle, so the exception does not apply.`,
          fix: 'Enlarge the target to at least 24×24 CSS px, or move it at least 24px (center-to-center clearance) from neighboring targets.',
          computed: { width, height, spacingExceptionMet: false },
        }));
        continue;
      }
    }
    // Passed the floor (directly, or via the spacing exception) — check the 44px
    // best-practice as advisory evidence only, never a violation.
    if (width < TOUCH_BEST_PRACTICE_PX || height < TOUCH_BEST_PRACTICE_PX) {
      findings.push(baseFinding({
        key: 'tier2-touch-target-advisory',
        category: 'touch',
        severity: 'tip',
        check: 'review',
        wcag: 'WCAG 2.2: 2.5.8 Target Size (Minimum)',
        title: `Touch target ${width.toFixed(0)}×${height.toFixed(0)}px meets the 24px floor but is below the 44px best practice`,
        affected_users: 'Touch-screen and motor-impairment users',
        location,
        selector: t.selector,
        viewport,
        description: `The target meets the WCAG 24×24px minimum (${meetsFloorDirectly ? 'directly' : 'via the spacing exception'}) but is smaller than the 44×44px best-practice size recommended for comfortable touch input.`,
        fix: 'Consider enlarging to 44×44 CSS px where layout allows; this is a best-practice recommendation, not a WCAG violation.',
        computed: { width, height, meetsFloorDirectly },
      }));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------------------
// Capture (browser-side): page -> raw samples. All arithmetic deferred to Node above.
// ---------------------------------------------------------------------------------------

// Serialized into the page — must be self-contained (no closures over outer scope).
/* istanbul ignore next -- exercised via the fixture integration tests, not directly unit-tested */
function browserCollectContrastSamples() {
  function isHidden(el) {
    // WCAG 1.4.3 exempts "incidental text ... that is part of an inactive user interface
    // component" -- disabled controls (and aria-disabled equivalents) have no contrast
    // requirement, so they must never be sampled (Finding C, 2026-07-26 tier2 calibration:
    // a Mailchimp disabled survey-modal button was misreported as a fail). Mirrors the
    // el.disabled check browserCollectTouchTargets already has.
    if (el.closest('[aria-hidden="true"], [hidden], [disabled], [aria-disabled="true"]')) return true;
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const path = [];
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      const parent = node.parentElement;
      const idx = Array.prototype.indexOf.call(parent.children, node) + 1;
      path.unshift(`${node.tagName.toLowerCase()}:nth-child(${idx})`);
      node = parent;
    }
    return 'body > ' + path.join(' > ');
  }
  // Minimal duplicate of the Node-side parseColor's format assumption (Chromium's
  // canonical rgb()/rgba() serialization) — needed here only to decide when the
  // ancestor walk can stop; the real math happens in Node from the raw strings.
  function alphaOf(str) {
    const m = String(str || '').match(/^rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+)\s*)?\)$/i);
    return m ? (m[1] === undefined ? 1 : Number(m[1])) : 0;
  }
  // Finding B (2026-07-26 tier2 calibration): a background painted by a pseudo-element, an
  // inset box-shadow (a common "paint the backdrop via a giant inset shadow" CSS trick), or a
  // differently-styled NON-ancestor element stacked behind (sibling/cousin via absolute
  // positioning + z-index) is invisible to a plain ancestor backgroundColor walk -- confirmed
  // on real, CSS-intact renders (Wix, Linear.app, Atlassian pill/button components), not a
  // corpus artifact. Guessing a color here would trade one wrong answer for another, so any of
  // these three signals marks the sample unresolvable instead -- the same honesty boundary
  // this detector already has for image/gradient backgrounds.
  function hasPseudoBg(node) {
    for (const pseudo of ['::before', '::after']) {
      const pcs = getComputedStyle(node, pseudo);
      if (pcs.content === 'none') continue; // no box generated, nothing painted
      if (pcs.backgroundImage && pcs.backgroundImage !== 'none') return true;
      if (alphaOf(pcs.backgroundColor) > 0) return true;
    }
    return false;
  }
  function hasInsetBoxShadow(node) {
    return /inset/.test(getComputedStyle(node).boxShadow);
  }
  // document.elementsFromPoint looks native-first-choice here, but it silently EXCLUDES
  // `pointer-events: none` elements from hit-testing -- and that is exactly how real
  // decorative background/indicator layers are commonly built (confirmed on a Wix
  // "bgLayers" sibling div and an Atlassian aria-hidden sliding-tab-indicator div, both
  // pointer-events:none, both real). A plain geometric rect-overlap scan has no such
  // blind spot.
  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }
  function hasNonAncestorOverlay(el, rect, allElements) {
    for (const candidate of allElements) {
      if (candidate === el || candidate.contains(el) || el.contains(candidate)) continue;
      const r = candidate.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || !rectsOverlap(rect, r)) continue;
      const cs = getComputedStyle(candidate);
      if (alphaOf(cs.backgroundColor) > 0) return true;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
      if (/inset/.test(cs.boxShadow)) return true;
    }
    return false;
  }
  function collectBgLayers(el) {
    const layers = [];
    let node = el;
    let suspiciousOverlay = false;
    let defaultsToCanvas = false;
    while (node) {
      const cs = getComputedStyle(node);
      if (hasPseudoBg(node) || hasInsetBoxShadow(node)) suspiciousOverlay = true;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { layers, unresolved: true, suspiciousOverlay, defaultsToCanvas: false };
      layers.push(cs.backgroundColor);
      if (alphaOf(cs.backgroundColor) >= 1) break;
      if (node === document.documentElement) { defaultsToCanvas = true; break; }
      node = node.parentElement;
    }
    return { layers, unresolved: false, suspiciousOverlay, defaultsToCanvas };
  }

  // Finding B extension (2026-07-26 tier2 calibration, linear.app): when no ancestor has an
  // opaque background at all, this detector's compositor falls back to a hardcoded white
  // canvas -- but the browser paints a DARK canvas by default whenever the page opts into
  // `color-scheme: dark` (confirmed: linear.app's html/body both report a fully transparent
  // backgroundColor, yet the page renders on a solid near-black canvas). Guessing white here
  // is exactly as wrong as guessing any other color -- computed once, page-wide, since
  // color-scheme is a root-level property.
  const pageDefaultsToDarkCanvas = /dark/.test(getComputedStyle(document.documentElement).colorScheme);

  const samples = [];
  const all = document.body.querySelectorAll('*');
  for (const el of all) {
    if (isHidden(el)) continue;
    let text = '';
    for (const child of el.childNodes) if (child.nodeType === 3) text += child.textContent;
    if (!text.trim()) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const cs = getComputedStyle(el);
    const { layers, unresolved, suspiciousOverlay, defaultsToCanvas } = collectBgLayers(el);
    // HIGH-2 (2026-07-26 merge audit): record WHICH signal fired, not just that one did, so
    // the finding can name the actual cause instead of always blaming "image or gradient".
    // Order matches the original short-circuit priority — once already unresolved/
    // suspicious, skip the pricier overlap scan.
    let bgUnresolvedReason = null;
    if (unresolved) bgUnresolvedReason = 'image-or-gradient';
    else if (suspiciousOverlay) bgUnresolvedReason = 'pseudo-or-inset-shadow';
    else if (defaultsToCanvas && pageDefaultsToDarkCanvas) bgUnresolvedReason = 'dark-canvas';
    else if (hasNonAncestorOverlay(el, rect, all)) bgUnresolvedReason = 'non-ancestor-overlay';
    samples.push({
      selector: getSelector(el),
      fgStr: cs.color,
      bgLayerStrs: layers,
      bgUnresolved: bgUnresolvedReason !== null,
      bgUnresolvedReason,
      fontSizePx: parseFloat(cs.fontSize),
      bold: cs.fontWeight === 'bold' || Number(cs.fontWeight) >= 700,
    });
  }
  return samples;
}

/* istanbul ignore next -- exercised via the fixture integration tests, not directly unit-tested */
function browserCollectTouchTargets() {
  function isHidden(el) {
    if (el.closest('[aria-hidden="true"], [hidden]')) return true;
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  }
  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const path = [];
    let node = el;
    while (node && node !== document.body && node.parentElement) {
      const parent = node.parentElement;
      const idx = Array.prototype.indexOf.call(parent.children, node) + 1;
      path.unshift(`${node.tagName.toLowerCase()}:nth-child(${idx})`);
      node = parent;
    }
    return 'body > ' + path.join(' > ');
  }
  const SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
    '[role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="switch"]';
  const targets = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    if (el.disabled) continue;
    if (isHidden(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    targets.push({ selector: getSelector(el), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
  }
  return targets;
}

export async function captureContrastSamples(page) {
  return page.evaluate(browserCollectContrastSamples);
}

export async function captureTouchTargets(page) {
  return page.evaluate(browserCollectTouchTargets);
}

// ---------------------------------------------------------------------------------------
// Playwright loader. Deliberate ruling (2026-07-25): this repo stays dependency-free (no
// package.json) — Playwright is detected at runtime, not installed as a dependency. Tier-2
// requires a locally available Playwright/browser; when none is found, callers degrade
// honestly (see the CLI's error below and the test suite's loud skip).
//
// Discovery order (first success wins):
//   1. PLAYWRIGHT_MODULE_PATH env var — an explicit override. If set, ONLY this path is
//      tried; a bad value throws immediately rather than silently falling through (an
//      explicit "use this" that's wrong should say so, not quietly use something else).
//   2. `require.resolve('playwright')` from the CALLER's cwd — covers a user running this
//      script from within their own project that already depends on playwright.
//   3. Known global npm install locations (this machine may have Playwright as a
//      transitive dependency of some other global package, e.g. `dev-browser`).
//   4. Throw a clear error naming the fix: `npm i -g playwright` (then
//      `npx playwright install chromium`) or set PLAYWRIGHT_MODULE_PATH.
// See VALIDATION.md L2 "Tier-2 (browser-measured) thresholds" for the same note.
// ---------------------------------------------------------------------------------------
async function tryImport(specifierOrUrl) {
  try { return await import(specifierOrUrl); } catch { return null; }
}

// require.resolve('playwright') from an arbitrary directory (the caller's cwd), without
// needing a real file there — createRequire only uses the directory portion.
function resolvePlaywrightFrom(dir) {
  try {
    const req = createRequire(pathToFileURL(join(dir, 'noop.cjs')).href);
    const entry = req.resolve('playwright');
    const esmSibling = join(dirname(entry), 'index.mjs');
    return pathToFileURL(existsSync(esmSibling) ? esmSibling : entry).href;
  } catch { return null; }
}

const INSTALL_HINT = 'Install it with `npm i -g playwright` (then `npx playwright install chromium`), or set PLAYWRIGHT_MODULE_PATH to a playwright index.mjs/index.js.';

export async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) {
    const mod = await tryImport(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
    if (mod) return mod;
    throw new Error(`tier2-audit: PLAYWRIGHT_MODULE_PATH=${process.env.PLAYWRIGHT_MODULE_PATH} did not resolve to a usable playwright module.`);
  }

  const cwdEntry = resolvePlaywrightFrom(process.cwd());
  if (cwdEntry) { const mod = await tryImport(cwdEntry); if (mod) return mod; }

  let globalRoot = null;
  try { globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim(); } catch { /* npm unavailable */ }
  const candidates = globalRoot ? [
    join(globalRoot, 'playwright/index.mjs'),
    join(globalRoot, 'dev-browser/node_modules/playwright/index.mjs'),
    join(globalRoot, '@playwright/cli/node_modules/playwright/index.mjs'),
  ] : [];
  for (const c of candidates) {
    if (existsSync(c)) { const mod = await tryImport(pathToFileURL(c).href); if (mod) return mod; }
  }

  throw new Error(`tier2-audit: no Playwright install found. ${INSTALL_HINT}`);
}

function toLoadableUrl(input) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return input; // already a URL (http/https/file/...)
  return pathToFileURL(resolve(input)).href;
}

// Finding D (2026-07-26 tier2 calibration): pages with deferred/animated DOM mutations
// (consent banners, bot-checks, lazy-hydrated widgets) produce different finding counts
// run-to-run when captured immediately at domcontentloaded -- measured on the wayfair.com
// PerimeterX snapshot: 0ms after domcontentloaded -> 1 finding, 300ms/1000ms/3000ms -> 5
// findings, stable from 300ms on. Full trade-off note: plans/2026-07-26-tier2-bugfix-notes.md.
const SETTLE_QUIET_MS = 500;

export async function runTier2Audit({ url, level = 'feature', viewports = viewportsForLevel(level), date, playwrightModule } = {}) {
  const pw = playwrightModule || await loadPlaywright();
  const loadUrl = toLoadableUrl(url);
  const browser = await pw.chromium.launch({ headless: true });
  const findings = [];
  const byViewport = [];
  try {
    for (const vp of viewports) {
      let context;
      try {
        context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ...vp.emulate });
        const page = await context.newPage();
        // A saved local snapshot (file://) is analyzed as static markup, not re-fetched live:
        // real wild captures (e.g. the rakuten.co.jp benchmark snapshot) ship blocking
        // <script src="https://..."> tags to hosts that are unreachable offline, which
        // otherwise hang the parser waiting on a dead network request. Abort anything that
        // isn't the snapshot file itself. Live http(s) targets are left alone (they need
        // their own network to render correctly).
        if (loadUrl.startsWith('file:///')) {
          await page.route('**/*', (route) => {
            const reqUrl = route.request().url();
            // file:/// (no host) is a genuine local path. file://<host>/... (two slashes,
            // a protocol-relative "//host/path" resolved against a file:// base) is NOT —
            // on Windows this is a UNC network-share lookup and hangs for a long time
            // resolving a nonexistent host (hit on the rakuten.co.jp benchmark snapshot,
            // which document.write()s a protocol-relative <img src="//..."> tracking pixel).
            if (reqUrl.startsWith('file:///')) route.continue();
            else route.abort();
          });
        }
        // domcontentloaded, not 'load': aborted subresources above still count as "failed to
        // load" for the 'load' event's purposes on some resource types — domcontentloaded only
        // waits for HTML parsing, matching the capture recipe already pinned in VALIDATION.md L0.
        await page.goto(loadUrl, { waitUntil: 'domcontentloaded' });
        // Settle (Finding D): best-effort wait for 'load' too (aborted subresources above mean
        // it may never fire on some sites, hence the short timeout + swallow), then a fixed
        // quiet window, before any capture -- so repeated runs on the same page are deterministic.
        await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(SETTLE_QUIET_MS);
        const contrastSamples = await captureContrastSamples(page);
        const touchTargets = await captureTouchTargets(page);
        const contrastFindings = analyzeContrastSamples(contrastSamples, vp.label);
        const touchFindings = analyzeTouchTargets(touchTargets, vp.label);
        findings.push(...contrastFindings, ...touchFindings);
        byViewport.push({
          viewport: vp.label,
          contrast_samples: contrastSamples.length,
          // Additive field (hakuso CRITICAL 2026-08-29): the decided-outcome subset of
          // contrast_samples, see countDecidedContrastSamples above. Older tier2.json
          // artifacts won't carry this field; the merge step falls back to the raw count
          // for those rather than crashing.
          contrast_samples_decided: countDecidedContrastSamples(contrastSamples),
          touch_targets: touchTargets.length,
          findings: contrastFindings.length + touchFindings.length,
        });
      } catch (err) {
        // Finding E (2026-07-26 tier2 calibration, zoom.us idx 87): a page's OWN client-side
        // navigation can destroy the execution context mid-capture ("Execution context was
        // destroyed, most likely because of a navigation"), which otherwise kills the whole
        // CLI process. One page's own script must not take down a whole batch/CI run --
        // record the failure for this viewport and move on to the next one.
        byViewport.push({ viewport: vp.label, error: String((err && err.message) || err) });
      } finally {
        if (context) await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return buildArtifact({ url, findings, byViewport, date });
}

function resolveDate(optDate) {
  if (optDate) return optDate;
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && /^\d+$/.test(epoch)) return new Date(Number(epoch) * 1000).toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function buildArtifact({ url, findings, byViewport, date }) {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;
  const tips = findings.filter(f => f.severity === 'tip').length;
  return {
    metadata: {
      date: resolveDate(date),
      url,
      tool_version: 'beacon tier-2 native measurement harness (Playwright, axe-free)',
      engine_fingerprint: DETECTOR_VERSION,
      audit_tier: 'Tier 2 (native browser measurement: contrast + touch targets)',
      // LOW-D (2026-07-27 final pass): a crashed viewport ({viewport, error}, no samples)
      // must not read as measured to a human summarizing this artifact (inspect.md Step 3).
      viewports: byViewport.filter(v => !v.error).map(v => v.viewport),
      ...(byViewport.some(v => v.error) ? { viewports_failed: byViewport.filter(v => v.error).map(v => v.viewport) } : {}),
      audit_methods: [
        'Computed foreground/background contrast per visible text element (ancestor-walk + alpha compositing; backgrounds that cannot be resolved from computed styles (image/gradient, pseudo-element or inset-shadow paint, non-ancestor overlap, dark default canvas) are reported unresolvable, never guessed)',
        'Interactive-element bounding-box size vs WCAG 2.5.8 24×24px floor, with the spacing exception; 44px best-practice recorded as advisory',
      ],
      note: 'Findings + evidence only: this artifact carries no score. These findings reach `audit-results.json` only through an explicit `--merge-findings` run, which CAN move the score once the category reaches `THIN_EVIDENCE_MIN`; whether the default inspect flow should merge automatically is the open decision (see plans/2026-07-25-v3.3-browser-measurements.md Workstream A step 4).',
    },
    summary: {
      total_findings: findings.length,
      critical,
      warnings,
      tips,
      by_viewport: byViewport,
    },
    findings,
  };
}

// --- CLI -------------------------------------------------------------------------------
function usage() {
  console.error('Usage: node tier2-audit.mjs --url <url-or-file-path> [--level quick|feature|full] [--output tier2-results.json] [--date iso]');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { url: null, level: 'feature', output: 'tier2-results.json', date: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') opts.url = argv[++i] || usage();
    else if (arg === '--level') opts.level = LEVELS.includes(argv[i + 1]) ? argv[++i] : usage();
    else if (arg === '--output') opts.output = argv[++i] || usage();
    else if (arg === '--date') opts.date = argv[++i] || usage();
    else usage();
  }
  if (!opts.url) usage();
  return opts;
}

if (process.argv[1] && process.argv[1].endsWith('tier2-audit.mjs')) {
  const opts = parseArgs(process.argv.slice(2));
  const audit = await runTier2Audit(opts);
  mkdirSync(dirname(opts.output), { recursive: true });
  writeFileSync(opts.output, JSON.stringify(audit, null, 2));
  console.log(`Wrote ${opts.output}`);
  console.log(`Tier-2 audit: ${audit.summary.total_findings} finding(s) across ${audit.metadata.viewports.join(', ')} (${audit.summary.critical} critical, ${audit.summary.warnings} warning, ${audit.summary.tips} tip)`);
}

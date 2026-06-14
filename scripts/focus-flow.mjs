// Keyboard focus-flow analysis: WCAG 2.1.2 (No Keyboard Trap), 2.4.3 (Focus
// Order), 2.4.7 (Focus Visible), 2.4.11 (Focus Not Obscured), and reachability
// (2.1.1). These are RUNTIME behaviors a static scan and axe-core cannot see —
// they require actually Tabbing through a rendered page.
//
// Division of labour: CAPTURING the trace is procedural (the Tier-2 Playwright
// recipe in inspect.md drives Tab, records each focus stop's name/geometry/
// focus-ring/obscured-by). This module is the PURE analyzer that turns a captured
// trace into findings — so it is deterministic and unit-testable, while the
// browser-driving half lives in the skill.
//
// Trace schema the recipe produces:
//   {
//     reachedEnd: boolean,        // did Tab reach the end sentinel within the cap?
//     interactiveTotal: number,   // count of interactive elements found in the DOM
//     stops: [{
//       tag: string, name: string,
//       focusVisible: boolean,    // was a focus indicator detected at this stop?
//       rect: { x, y, width, height } | null,
//       obscuredBy: string | null // selector of an element covering the focused one
//     }]
//   }

const W = {
  trap: 'WCAG 2.2: 2.1.2 No Keyboard Trap',
  order: 'WCAG 2.2: 2.4.3 Focus Order',
  visible: 'WCAG 2.2: 2.4.7 Focus Visible',
  obscured: 'WCAG 2.2: 2.4.11 Focus Not Obscured (Minimum)',
  reach: 'WCAG 2.2: 2.1.1 Keyboard',
};

const Y_BACKTRACK = 40; // px upward jump that counts as a visual-order inversion

export function analyzeFocusTrace(trace) {
  const stops = Array.isArray(trace && trace.stops) ? trace.stops : [];
  const findings = [];
  if (!stops.length) return { findings, stops: 0, note: 'empty trace — nothing to analyze' };

  // 2.1.2 — Tab never escaped to the end sentinel within the cap: likely a trap.
  if (trace.reachedEnd === false) {
    findings.push({
      key: 'kbd-trap', band: 'FLAG', wcag: W.trap, level: 'A',
      title: 'Possible keyboard trap (Tab did not reach the end of the page)',
      affected_users: 'Keyboard-only and switch-control users',
      description: `Tabbing recorded ${stops.length} stops without reaching the end sentinel, which usually means focus is trapped in a region (a widget or modal that does not release Tab).`,
      fix: 'Ensure every component lets Tab/Shift+Tab move out; for modals, trap focus only while open and restore it on close.',
    });
  }

  // 2.4.7 — stops with no detected focus indicator.
  const invisible = stops.filter((s) => s.focusVisible === false);
  if (invisible.length) {
    findings.push({
      key: 'focus-not-visible', band: 'FLAG', wcag: W.visible, level: 'AA',
      title: `${invisible.length} focus stop(s) had no visible focus indicator`,
      affected_users: 'Sighted keyboard users, who lose track of where they are',
      description: `At ${invisible.length} of ${stops.length} Tab stops no focus indicator was detected (e.g. outline removed without a :focus-visible replacement). Examples: ${invisible.slice(0, 3).map((s) => s.name || s.tag).join(', ')}.`,
      fix: 'Provide a visible focus style (do not remove outline without a :focus-visible replacement) with sufficient contrast.',
    });
  }

  // 2.4.11 — focused element covered by a sticky header / overlay.
  const obscured = stops.filter((s) => s.obscuredBy);
  if (obscured.length) {
    findings.push({
      key: 'focus-obscured', band: 'FLAG', wcag: W.obscured, level: 'AA',
      title: `${obscured.length} focus stop(s) were obscured by another element`,
      affected_users: 'Sighted keyboard users',
      description: `At ${obscured.length} stop(s) the focused element was covered (e.g. by a sticky header): ${obscured.slice(0, 3).map((s) => `${s.name || s.tag} under ${s.obscuredBy}`).join('; ')}.`,
      fix: 'Add scroll-padding / scroll-margin for sticky headers so the focused element is never hidden behind them.',
    });
  }

  // 2.4.3 — focus order vs visual order (heuristic): repeated upward jumps suggest
  // the DOM/tab order diverges from the visual layout.
  let inversions = 0;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].rect, b = stops[i].rect;
    if (a && b && b.y < a.y - Y_BACKTRACK) inversions++;
  }
  if (inversions >= 2) {
    findings.push({
      key: 'focus-order-suspect', band: 'REVIEW', wcag: W.order, level: 'A',
      title: 'Focus order may not follow the visual order',
      affected_users: 'Keyboard and screen-reader users',
      description: `The focus path jumps upward (against reading order) ${inversions} times, which can mean the DOM order diverges from the visual layout. This is a heuristic — verify the order is meaningful.`,
      fix: 'Make the DOM order match the visual order; avoid positive tabindex and CSS reordering that desynchronises them.',
    });
  }

  // 2.1.1 — interactive elements that Tab never reached.
  if (typeof trace.interactiveTotal === 'number' && trace.interactiveTotal > stops.length) {
    findings.push({
      key: 'focus-unreachable', band: 'REVIEW', wcag: W.reach, level: 'A',
      title: 'Some interactive elements may be unreachable by keyboard',
      affected_users: 'Keyboard-only and switch-control users',
      description: `Tab reached ${stops.length} stops but the page has ${trace.interactiveTotal} interactive elements; ${trace.interactiveTotal - stops.length} may be unreachable (e.g. click handlers on non-focusable elements).`,
      fix: 'Make every interactive control a native focusable element (<button>, <a href>) or add tabindex="0" plus keyboard handlers.',
    });
  }

  return { findings, stops: stops.length };
}

// --- CLI: node focus-flow.mjs <trace.json> --------------------------------
// Reads a captured trace and prints findings (used by the Tier-2 recipe).
if (process.argv[1] && process.argv[1].endsWith('focus-flow.mjs')) {
  const { readFileSync } = await import('node:fs');
  const path = process.argv[2];
  if (!path) { console.error('Usage: node focus-flow.mjs <trace.json>'); process.exit(2); }
  let trace;
  try { trace = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error('cannot read trace: ' + e.message); process.exit(1); }
  const r = analyzeFocusTrace(trace);
  console.log(`focus-flow: ${r.stops} stops, ${r.findings.length} finding(s)`);
  for (const f of r.findings) console.log(`  [${f.band}] ${f.key} (${f.wcag.replace('WCAG 2.2: ', '')}) — ${f.title}`);
  process.exit(r.findings.some((f) => f.band === 'FLAG') ? 2 : 0);
}

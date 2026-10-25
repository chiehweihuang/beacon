// Viewport matrix for the three check levels (plans/2026-10-17-viewport-tiers.md).
// quick: before an agent reports done; feature: before a commit; full: /beacon:inspect.
// Levels nest (quick ⊂ feature ⊂ full) and every list is sorted by width ascending.

// UA strings and DPR are copied from Playwright's deviceDescriptorsSource.json.
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.3 Mobile Safari/537.36'; // Galaxy S24
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1'; // iPhone 12
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1'; // iPad (gen 5)
const FOLD_UA = 'Mozilla/5.0 (Linux; Android 14; SM-F956B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.7827.3 Mobile Safari/537.36'; // Galaxy Z Fold 6 (Chrome DevTools EmulatedDevices.ts), unfolded

const vp = (width, height, name, emulate) => ({ label: `${width}x${height}`, name, width, height, ...(emulate ? { emulate } : {}) });
const mobile = (deviceScaleFactor, userAgent) => ({ isMobile: true, hasTouch: true, deviceScaleFactor, userAgent });

const byWidth = list => [...list].sort((a, b) => a.width - b.width);

const QUICK = [
  vp(360, 780, 'phone-android', mobile(3, ANDROID_UA)),
  // 1280x900 is the capture recipe pinned in VALIDATION.md L0.
  vp(1280, 900, 'laptop'),
];
// 320 is WCAG 1.4.10 (320 CSS px at 400% zoom), a reflow width and not a device: no emulation.
const FEATURE = byWidth([...QUICK, vp(320, 720, 'reflow-320'), vp(768, 1024, 'tablet', mobile(2, IPAD_UA))]);
const FULL = byWidth([
  ...FEATURE,
  vp(390, 844, 'phone-ios', mobile(3, IPHONE_UA)),
  vp(744, 860, 'fold-open', mobile(2.625, FOLD_UA)),
  vp(844, 390, 'phone-landscape', mobile(3, IPHONE_UA)),
  vp(1920, 1080, 'desktop'),
]);

export const LEVELS = ['quick', 'feature', 'full'];
export const VIEWPORT_TIERS = { quick: QUICK, feature: FEATURE, full: FULL };

function assertLevel(level) {
  if (!LEVELS.includes(level)) throw new Error(`unknown level "${level}" (expected ${LEVELS.join('|')})`);
}

export function viewportsForLevel(level) {
  assertLevel(level);
  return VIEWPORT_TIERS[level];
}

export function schemesForLevel(level) {
  assertLevel(level);
  return level === 'quick' ? ['light'] : ['light', 'dark'];
}

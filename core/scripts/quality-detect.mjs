// Content-QUALITY heuristics for things axe checks the PRESENCE of but not the
// quality of: alt text (1.1.1), link purpose (2.4.4), and role-echoing labels.
// Pure, no deps. Every signal is REVIEW (a deterministic red-flag, not a certain
// failure). The genuine "is this alt/label MEANINGFUL" judgment needs an LLM and
// a calibration harness with a published false-positive rate — that is the gated
// 3b follow-up and is deliberately NOT done here.

const WCAG_ALT = 'WCAG 2.2: 1.1.1 Non-text Content';
const WCAG_LINK = 'WCAG 2.2: 2.4.4 Link Purpose (In Context)';
const WCAG_NAME = 'WCAG 2.2: 4.1.2 Name, Role, Value';

// Generic placeholder alt: the whole value is just a noise word.
const GENERIC_ALT = /^(image|images|photo|photos|picture|pic|logo|icon|graphic|graphics|img|spacer|untitled|thumbnail|banner|placeholder)\.?$/i;
// alt that is a filename (ends in an image extension).
const ALT_FILENAME = /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)$/i;
// alt that redundantly says "image of ...": screen readers already announce "image".
const ALT_REDUNDANT = /^\s*(image|picture|photo|graphic|icon|a picture|an image)\s+(of|showing|de)\b/i;
// Generic link text that gives no purpose out of context (en + common zh-Hant).
const GENERIC_LINK = /^(click here|click|here|read more|learn more|more|link|this|this link|details|continue|continue reading|see more|read this|閱讀更多|了解更多|瞭解更多|查看更多|更多|詳細|詳情|這裡|這裏|點此|點這裡|按這裡|繼續閱讀)$/i;
// A label/alt that just repeats the role word, conveying nothing.
// NB: "menu" is intentionally absent — aria-label="Menu" on a nav toggle names the
// target the control opens, not the element's role, and is standard good practice.
const ROLE_ECHO = /^(button|btn|link|image|images|icon|graphic|input|field|checkbox|radio)$/i;

export function detectQualityFlags(text) {
  const signals = [];

  // --- img alt quality (skip alt="" — that is valid decorative markup) ------
  for (const m of text.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']*)["'][^>]*>/gi)) {
    const alt = m[1].trim();
    if (!alt) continue; // decorative
    const index = m.index || 0;
    const code_before = m[0].slice(0, 120);
    if (GENERIC_ALT.test(alt)) {
      signals.push({ key: 'quality-alt-generic', band: 'REVIEW', wcag: WCAG_ALT, level: 'A', index, code_before,
        title: 'Image alt text is a generic placeholder',
        affected_users: 'Screen-reader users, who hear the placeholder instead of the image meaning',
        description: `alt="${alt}" is a generic word that does not describe the image. Screen-reader users get little information about what the image conveys.`,
        fix: 'Describe what the image communicates in context, or use alt="" if it is purely decorative.' });
    } else if (ALT_FILENAME.test(alt)) {
      signals.push({ key: 'quality-alt-filename', band: 'REVIEW', wcag: WCAG_ALT, level: 'A', index, code_before,
        title: 'Image alt text looks like a filename',
        affected_users: 'Screen-reader users, who hear the filename read aloud',
        description: `alt="${alt}" appears to be a filename, not a description. Screen readers will read the filename aloud, which is usually not meaningful.`,
        fix: 'Replace the filename with a description of the image, or alt="" if decorative.' });
    } else if (ALT_REDUNDANT.test(alt)) {
      signals.push({ key: 'quality-alt-redundant', band: 'REVIEW', wcag: WCAG_ALT, level: 'A', index, code_before,
        title: 'Image alt text has a redundant "image of" prefix',
        affected_users: 'Screen-reader users, who hear "image, image of ..."',
        description: `alt="${alt}" starts with a redundant prefix; the screen reader already announces the element as an image.`,
        fix: 'Drop the "image of"/"picture of" prefix; describe the content directly.' });
    }
  }

  // --- link purpose: generic link text (only when no accessible-name override) ---
  for (const m of text.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = m[1];
    // accessible-name override — a real attribute only; a `data-` prefix must not count
    // (the `-` before "aria-label" used to satisfy \b and wrongly suppress the check).
    if (/(?<![\w-])(?:aria-label\b|aria-labelledby\b|title\s*=)/i.test(attrs)) continue;
    // link text that is a code / element name ("<link>", "<details>") is precise, not generic
    if (/<(?:code|kbd|samp)\b/i.test(m[2])) continue;
    const linkText = m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!linkText) continue; // empty link is a different check (link-name)
    if (GENERIC_LINK.test(linkText)) {
      const index = m.index || 0;
      signals.push({ key: 'quality-link-generic', band: 'REVIEW', wcag: WCAG_LINK, level: 'A', index, code_before: m[0].slice(0, 120),
        title: 'Link text may be unclear out of context',
        affected_users: 'Screen-reader users navigating by links list, and voice-control users',
        description: `Link text "${linkText}" may not state its purpose on its own. Screen-reader users often navigate by a list of links with no surrounding context, so verify the purpose is clear.`,
        fix: 'Use descriptive link text ("Read the 2026 accessibility report"), or add an aria-label that states the full purpose.' });
    }
  }

  // --- aria-label that just echoes the role -------------------------------
  for (const m of text.matchAll(/\baria-label\s*=\s*["']([^"']+)["']/gi)) {
    const label = m[1].trim();
    if (ROLE_ECHO.test(label)) {
      signals.push({ key: 'quality-label-role-echo', band: 'REVIEW', wcag: WCAG_NAME, level: 'A', index: m.index || 0, code_before: m[0].slice(0, 80),
        title: 'aria-label only repeats the element role',
        affected_users: 'Screen-reader users, who hear e.g. "button, button"',
        description: `aria-label="${label}" appears to only repeat the role. The screen reader already announces the role, so a label that repeats it adds nothing.`,
        fix: 'Name the action or destination ("Close dialog", "Search"), not the role.' });
    }
  }

  return signals;
}

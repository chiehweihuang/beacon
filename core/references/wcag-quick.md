# WCAG 2.2 Quick Reference by Development Scenario

Standard: WCAG 2.2 (W3C Recommendation, October 5, 2023)
Full reference: _yorozuya/research/wcag-2.2-success-criteria-reference.md

## Writing HTML Structure

| Criterion | Level | Rule |
|-----------|-------|------|
| 1.3.1 Info and Relationships | A | Use semantic HTML: `<header>`, `<nav>`, `<main>`, `<footer>`, `<h1>`-`<h6>`, `<ul>`, `<table>` |
| 1.3.2 Meaningful Sequence | A | DOM order = visual order = reading order |
| 2.4.1 Bypass Blocks | A | Provide skip links or landmark regions |
| 2.4.2 Page Titled | A | Every page has a descriptive `<title>` |
| 2.4.6 Headings and Labels | AA | Headings describe topic/purpose. No skipped levels. |
| 4.1.2 Name, Role, Value | A | All interactive elements have accessible name + correct role |

## Building Forms

| Criterion | Level | Rule |
|-----------|-------|------|
| 1.3.5 Identify Input Purpose | AA | Use `autocomplete` attribute on personal data fields |
| 3.3.1 Error Identification | A | Errors described in text, not just color |
| 3.3.2 Labels or Instructions | A | Every input has visible, associated `<label>` |
| 3.3.3 Error Suggestion | AA | Suggest corrections when known |
| 3.3.4 Error Prevention | AA | Legal/financial: reversible, verified, or confirmed |
| 3.3.7 Redundant Entry [NEW] | A | Don't ask for same info twice in a process |
| 3.3.8 Accessible Authentication [NEW] | AA | Don't require cognitive function tests (puzzles, memorization). Allow paste in passwords, support passkeys/authenticators |

## Choosing Colors

| Criterion | Level | Rule |
|-----------|-------|------|
| 1.4.1 Use of Color | A | Color is not the only visual means of conveying info |
| 1.4.3 Contrast (Minimum) | AA | Text: ≥4.5:1. Large text (≥18pt or ≥14pt bold): ≥3:1 |
| 1.4.6 Contrast (Enhanced) | AAA | Text: ≥7:1. Large text: ≥4.5:1 |
| 1.4.11 Non-text Contrast | AA | UI components and graphics: ≥3:1 against adjacent |

WCAG 3.0 direction: APCA will replace fixed ratios. LC ≥60 for body text, ≥45 for large headings. Not yet standard.

## Interactive Components (Buttons, Links, Tabs, Dialogs)

| Criterion | Level | Rule |
|-----------|-------|------|
| 2.1.1 Keyboard | A | All functionality operable via keyboard |
| 2.1.2 No Keyboard Trap | A | Focus can always be moved away |
| 2.4.3 Focus Order | A | Focus sequence is logical |
| 2.4.7 Focus Visible | AA | Keyboard focus indicator always visible |
| 2.4.11 Focus Not Obscured [NEW] | AA | Focused element not fully hidden by sticky headers, etc. |
| 2.5.8 Target Size [NEW] | AA | Interactive targets ≥24×24 CSS pixels |
| 2.5.7 Dragging Movements [NEW] | AA | Drag operations have single-pointer alternative |

## Images and Media

| Criterion | Level | Rule |
|-----------|-------|------|
| 1.1.1 Non-text Content | A | All images have alt text (decorative: `alt=""`) |
| 1.2.1 Audio/Video (Prerecorded) | A | Captions for video, transcript for audio |
| 1.2.2 Captions (Prerecorded) | A | Synchronized captions for all prerecorded video |
| 1.2.5 Audio Description | AA | Audio description for prerecorded video |
| 1.4.5 Images of Text | AA | Use real text, not images of text |

## Animation and Motion

| Criterion | Level | Rule |
|-----------|-------|------|
| 2.2.1 Timing Adjustable | A | Users can turn off, adjust, or extend time limits |
| 2.2.2 Pause, Stop, Hide | A | Auto-moving content can be paused/stopped |
| 2.3.1 Three Flashes | A | Nothing flashes >3 times/second. LIFE-SAFETY. |
| 2.3.3 Animation from Interactions | AAA | Respect `prefers-reduced-motion`. Non-essential motion can be disabled |

## Responsive and Mobile

| Criterion | Level | Rule |
|-----------|-------|------|
| 1.3.4 Orientation | AA | Content not restricted to single orientation |
| 1.4.4 Resize Text | AA | Text resizable up to 200% without loss |
| 1.4.10 Reflow | AA | Content reflows at 320px width (no horizontal scroll) |
| 1.4.12 Text Spacing | AA | Content works with increased letter/line/word spacing |
| 2.5.1 Pointer Gestures | A | Multi-point gestures have single-pointer alternative |

## Consistent Navigation

| Criterion | Level | Rule |
|-----------|-------|------|
| 3.2.1 On Focus | A | No unexpected changes on focus |
| 3.2.2 On Input | A | No unexpected changes on input |
| 3.2.3 Consistent Navigation | AA | Navigation order consistent across pages |
| 3.2.4 Consistent Identification | AA | Same function = same label across pages |
| 3.2.6 Consistent Help [NEW] | A | Help mechanisms in same relative position across pages |

## Removed in WCAG 2.2
- ~~4.1.1 Parsing~~ — Obsolete. Modern browsers and AT handle parsing robustly.

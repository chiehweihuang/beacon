---
name: a11y-design-guide
description: >-
  Proactive accessible design guidance and pattern library. Use BEFORE writing UI code —
  when the user is designing a page layout, choosing a component, picking colors, planning
  navigation, creating a form, building a modal, or making any UI/UX decision. Triggers on
  "design accessible", "a11y design", "accessible component", "inclusive design",
  "accessible pattern", "how should I design", "what's the accessible way to",
  "design guide", "accessible UI", "accessible UX", or when the user describes a UI they
  want to build and you recognize accessibility implications. Even if they don't mention
  accessibility — if they're designing UI, this skill helps them do it right from the start.
  Also use when the user asks for accessible color palettes, typography systems, or layout
  patterns. This is the "before you code" skill; a11y-advisor is the "while you code" skill;
  a11y-audit is the "after you code" skill.
---

# Accessible Design Guide

Guide the user toward accessible design decisions **before code is written**. This is not an auditor or a linter — it is a design advisor that helps teams build inclusively from the start, so there is less to fix later.

## When This Skill Activates

This skill is for the **design phase** — before or during UI planning. The three a11y skills form a pipeline:

| Phase | Skill | Role |
|-------|-------|------|
| Design | **a11y-design-guide** (this) | Proactive guidance, pattern selection |
| Development | a11y-advisor | Real-time checks on code edits |
| Review | a11y-audit | Structured audit with scoring |

If the user is already writing code, a11y-advisor handles it. If they want a full audit, a11y-audit handles it. This skill is for "I'm about to build X — how should I design it?"

## Core Principles

1. **Inclusive by default** — Every design decision either includes or excludes someone. Name who.
2. **Native over custom** — The browser has spent 30 years making `<button>`, `<dialog>`, `<details>` accessible. Use them.
3. **Flexibility over perfection** — Users have different needs, devices, and preferences. Design for adaptation, not a single ideal.
4. **Progressive enhancement** — Start with content and semantics. Add visual styling. Add interactions. Each layer works independently.

## How to Use This Skill

### Mode 1: Design Consultation

When the user describes what they want to build, respond with:

1. **Recommended approach** — The accessible pattern for this use case
2. **Who benefits** — Which disability categories and user situations
3. **What to avoid** — Common anti-patterns for this component
4. **Code scaffold** — Semantic HTML structure (no styling yet)
5. **Design checklist** — Checklist for the designer/developer

Format:

```
## Accessible [Component Name]

### Recommended Approach
[Description of the pattern and why it works]

### Who Benefits
- [Disability category]: [How they interact with this component]
- [Situation]: [How this helps beyond disability]

### Anti-Patterns to Avoid
- [Anti-pattern]: [Why it fails and who it excludes]

### Semantic Structure
[HTML scaffold with ARIA only where native elements aren't sufficient]

### Design Checklist
- [ ] [Concrete, verifiable check item]
```

### Mode 2: Pattern Library

When the user asks for a specific pattern, provide the full accessible implementation from the pattern catalog below. Always include:
- Complete HTML with semantic structure
- CSS with accessibility considerations (contrast, motion, focus)
- JS for keyboard interaction (if needed)
- ARIA attributes (only where native semantics fall short)
- Testing notes (what to verify with keyboard and screen reader)

### Mode 3: Design System Foundation

When the user is setting up a design system or starting a new project, offer to establish accessible foundations:

1. **Color palette** with contrast-safe combinations
2. **Typography scale** with readable sizes and line heights
3. **Spacing system** with touch-target-safe minimums
4. **Focus style** system
5. **Motion tokens** with `prefers-reduced-motion` built in
6. **Dark mode** strategy with proper CSS variable architecture

## Pattern Catalog

### Navigation

**Skip Link**
The first focusable element. Invisible until focused. Lets keyboard users bypass repetitive navigation.

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
<!-- ... nav ... -->
<main id="main-content" tabindex="-1">
```

**Responsive Nav (Hamburger)**
- `<nav aria-label="Main">` wraps everything
- Toggle button: `<button aria-expanded="false" aria-controls="nav-menu">`
- Menu is a `<ul>` inside `<nav>`, not a separate overlay
- Escape closes the menu and returns focus to the toggle button
- Current page: `aria-current="page"` on the link

**Breadcrumb**
```html
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li><a href="/products/shoes" aria-current="page">Shoes</a></li>
  </ol>
</nav>
```

### Forms

**Text Input**
```html
<div class="field">
  <label for="email">Email address</label>
  <input id="email" type="email" autocomplete="email"
         aria-describedby="email-hint" required>
  <p id="email-hint" class="hint">We will never share your email.</p>
</div>
```

**Error State**
```html
<div class="field field--error">
  <label for="email">Email address</label>
  <input id="email" type="email" aria-invalid="true"
         aria-describedby="email-error" required>
  <p id="email-error" class="error" role="alert">
    Please enter a valid email address (e.g., name@example.com).
  </p>
</div>
```

**Selection (Use Radio Group, Not `<select>`)**

`<select>` is hostile to elderly users, low-vision users, and motor-impaired users. For < 7 options, always use radio buttons or a segmented control.

```html
<fieldset>
  <legend>Shipping method</legend>
  <label><input type="radio" name="shipping" value="standard"> Standard (5-7 days)</label>
  <label><input type="radio" name="shipping" value="express"> Express (2-3 days)</label>
  <label><input type="radio" name="shipping" value="overnight"> Overnight</label>
</fieldset>
```

### Dialogs

**Modal Dialog**
```html
<dialog id="confirm-dialog" aria-labelledby="dialog-title">
  <h2 id="dialog-title">Confirm deletion</h2>
  <p>This action cannot be undone.</p>
  <div class="dialog-actions">
    <button type="button" data-action="cancel">Cancel</button>
    <button type="button" data-action="confirm" autofocus>Delete</button>
  </div>
</dialog>
```

Key behaviors:
- Use native `<dialog>` with `.showModal()` — handles focus trap, backdrop, Escape to close
- Return focus to the trigger element on close
- First interactive element or the most likely action gets `autofocus`
- Destructive action is NOT autofocused (safety first — autofocus the cancel/safe option)

### Cards & Content

**Clickable Card**
```html
<article class="card">
  <img src="..." alt="[Descriptive alt text]" loading="lazy">
  <h3><a href="/article/123">Article Title</a></h3>
  <p>Summary text...</p>
  <span class="meta" aria-label="Published March 15, 2026">Mar 15</span>
</article>
```

The link is inside the heading. The entire card can be made clickable via CSS (`card:has(a:hover)`) without wrapping everything in an `<a>` (which would make the entire card text announced as a single link).

### Buttons & Actions

**Icon Button**
```html
<button type="button" aria-label="Close">
  <svg aria-hidden="true" ...>[icon]</svg>
</button>
```

**Toggle Button**
```html
<button type="button" aria-pressed="false" onclick="toggleDarkMode(this)">
  <svg aria-hidden="true" ...>[moon icon]</svg>
  Dark mode
</button>
```

### Data Display

**Data Table**
```html
<table>
  <caption>Q1 2026 Sales by Region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Revenue</th>
      <th scope="col">Growth</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Asia Pacific</th>
      <td>$1.2M</td>
      <td>+15%</td>
    </tr>
  </tbody>
</table>
```

### Loading & Status

**Loading State**
```html
<div aria-live="polite" aria-busy="true">
  <p>Loading results...</p>
</div>
```

When loaded:
```html
<div aria-live="polite" aria-busy="false">
  <p>12 results found.</p>
  <!-- results -->
</div>
```

**Toast / Notification**
```html
<div role="status" aria-live="polite" class="toast">
  Settings saved successfully.
</div>
```

For errors, use `role="alert"` (implicitly `aria-live="assertive"`).

## Color & Contrast Guide

### Minimum Ratios (WCAG 2.2 AA)

| Element | Ratio | Example |
|---------|-------|---------|
| Body text | >= 4.5:1 | `#595959` on `#ffffff` = 7.0:1 |
| Large text (>= 18pt or >= 14pt bold) | >= 3:1 | `#767676` on `#ffffff` = 4.5:1 |
| UI components (borders, icons) | >= 3:1 | Focus rings, form borders |
| Placeholder text | >= 4.5:1 | NOT the default browser gray |

### Dark Mode Architecture

Use CSS custom properties that swap per theme. Never hardcode `color: white` or `color: #fff`.

```css
:root {
  --color-text: #1a1a2e;
  --color-bg: #ffffff;
  --color-surface: #f5f5f5;
  --color-accent: #0066cc;
}

[data-theme="dark"] {
  --color-text: #e8e8e8;
  --color-bg: #1a1a2e;
  --color-surface: #16213e;
  --color-accent: #4fc3f7;
}
```

Cross-test `prefers-contrast: more` with BOTH themes. Android Bold text triggers high contrast mode — `--color-text: #333` on a dark background becomes invisible.

### Safe Palette Generation

When the user asks for a color palette, verify every combination:
1. Primary on background: >= 4.5:1
2. Primary on surface: >= 4.5:1
3. Accent on background: >= 4.5:1
4. Text on accent (for buttons): >= 4.5:1
5. All of the above in dark mode
6. All of the above in high-contrast mode

## Typography Guide

### Readable Defaults

```css
body {
  font-size: clamp(1rem, 0.9rem + 0.5vw, 1.125rem); /* 16-18px */
  line-height: 1.6;
  letter-spacing: 0.01em;
  word-spacing: 0.05em;
}

h1 { font-size: clamp(1.75rem, 1.5rem + 1.25vw, 2.5rem); }
h2 { font-size: clamp(1.375rem, 1.2rem + 0.875vw, 1.875rem); }
h3 { font-size: clamp(1.125rem, 1rem + 0.625vw, 1.5rem); }
```

- Line length: 50-75 characters (use `max-width: 65ch`)
- Paragraph spacing: >= 1.5x font size (WCAG 1.4.12)
- Never justify text (`text-align: justify` creates uneven spacing, hard for dyslexic users)
- Allow user text resizing up to 200% without horizontal scroll (WCAG 1.4.4)

## Motion & Animation

```css
/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Never use `transition: all` with CSS custom properties (causes visual lag during theme switches)
- Use specific properties: `transition: opacity 0.2s, transform 0.2s`
- No content should flash > 3 times per second (LIFE-SAFETY: seizure trigger)

## Touch & Target Sizing

```css
/* Minimum interactive target size */
button, a, input, select, [role="button"] {
  min-height: 44px; /* iOS guideline */
  min-width: 44px;
}

/* WCAG 2.5.8 minimum: 24x24 CSS pixels */
/* But 44x44 is the recommended sweet spot */
```

For stacked buttons (e.g., fixed-position actions), maintain >= 24px gap between targets.

## Layout & Reflow

```css
/* Grid that doesn't overflow at narrow viewports */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: 1.5rem;
}
```

Key rule: use `minmax(min(Npx, 100%), 1fr)` instead of `minmax(Npx, 1fr)` — the latter overflows when the viewport is narrower than Npx, violating WCAG 1.4.10 (Reflow).

## Responsive Design (RWD) Best Practices

RWD and accessibility are deeply intertwined. A "responsive" site that becomes unusable on mobile for elderly users or breaks at 200% zoom is not truly responsive. Design for adaptation across devices, viewports, zoom levels, and user preferences.

### Viewport Setup

```html
<!-- CORRECT -->
<meta name="viewport" content="width=device-width, initial-scale=1">

<!-- WRONG — blocks user zoom (WCAG 1.4.4 violation) -->
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no, maximum-scale=1">
```

Never disable zoom. Elderly and low-vision users depend on pinch-to-zoom as a last resort. iOS Safari ignores `user-scalable=no` since iOS 10, but Android Chrome still respects it.

### Breakpoint Strategy

Design mobile-first. Start with single-column layout, add complexity at wider viewports.

```css
/* Mobile-first: base styles are for narrow screens */
.container { padding: 1rem; }

/* Tablet and up */
@media (min-width: 768px) {
  .container { padding: 2rem; max-width: 720px; margin: 0 auto; }
}

/* Desktop */
@media (min-width: 1024px) {
  .container { max-width: 960px; }
}
```

Important: the 320px width is the WCAG 1.4.10 (Reflow) test width — content must work here without horizontal scrolling. Test at this width explicitly.

### Responsive Navigation

```html
<nav aria-label="Main">
  <button aria-expanded="false" aria-controls="nav-menu"
          class="nav-toggle" type="button">
    <span class="visually-hidden">Menu</span>
    <svg aria-hidden="true"><!-- hamburger icon --></svg>
  </button>
  <ul id="nav-menu" class="nav-list" role="list">
    <li><a href="/" aria-current="page">Home</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
</nav>
```

```css
.nav-toggle { display: none; }

@media (max-width: 767px) {
  .nav-toggle { display: flex; min-height: 44px; min-width: 44px; }
  .nav-list { display: none; }
  .nav-list[data-open="true"] { display: block; }
}
```

Keyboard behavior:
- Escape closes menu and returns focus to toggle button
- Tab cycles through visible menu items
- Menu toggle announces state change (`aria-expanded`)

### Responsive Forms

```css
/* Stack labels above inputs on mobile for easier tapping */
.form-field { display: flex; flex-direction: column; gap: 0.25rem; }

/* Side-by-side on wider screens if space allows */
@media (min-width: 768px) {
  .form-field--inline { flex-direction: row; align-items: center; }
}

/* Proper input sizing for touch */
input, select, textarea {
  font-size: 1rem; /* prevents iOS zoom on focus (< 16px triggers zoom) */
  padding: 0.75rem;
  min-height: 44px;
}
```

Mobile input hints — use `inputmode` to show the right keyboard:

| Field | `type` | `inputmode` | Keyboard |
|-------|--------|-------------|----------|
| Phone | `tel` | `tel` | Phone dial pad |
| Email | `email` | `email` | @ and .com keys |
| Amount | `text` | `decimal` | Number pad with decimal |
| Card number | `text` | `numeric` | Number pad |
| ZIP/Postal | `text` | `numeric` | Number pad |
| Search | `search` | `search` | Search key |

### Responsive Tables

Tables on mobile need special handling. Two approaches:

**Option A: Horizontal scroll** (simpler, works for data-heavy tables)
```html
<div class="table-wrapper" role="region" aria-label="User data" tabindex="0">
  <table><!-- ... --></table>
</div>
```

```css
.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
```

The `tabindex="0"` and `role="region"` ensure keyboard users can scroll and screen readers announce the scrollable area.

**Option B: Card reflow** (better UX for simple tables)
```css
@media (max-width: 767px) {
  table, thead, tbody, tr, th, td { display: block; }
  thead { position: absolute; clip: rect(0,0,0,0); }
  td::before {
    content: attr(data-label);
    font-weight: 600;
    display: inline-block;
    width: 40%;
  }
}
```

### Responsive Images

```html
<picture>
  <source srcset="hero-desktop.webp" media="(min-width: 1024px)">
  <source srcset="hero-tablet.webp" media="(min-width: 768px)">
  <img src="hero-mobile.webp" alt="[Descriptive text]"
       loading="lazy" decoding="async"
       width="800" height="450">
</picture>
```

Always include `width` and `height` to prevent layout shift (CLS). Use `loading="lazy"` for below-fold images.

### Responsive Spacing & Sizing

```css
/* Fluid spacing scale */
:root {
  --space-xs: clamp(0.25rem, 0.2rem + 0.25vw, 0.5rem);
  --space-sm: clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem);
  --space-md: clamp(1rem, 0.8rem + 1vw, 1.5rem);
  --space-lg: clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem);
  --space-xl: clamp(2rem, 1.5rem + 2.5vw, 4rem);
}
```

### Safe Areas (Notched Devices)

```css
body {
  padding: env(safe-area-inset-top)
           env(safe-area-inset-right)
           env(safe-area-inset-bottom)
           env(safe-area-inset-left);
}

/* Fixed bottom buttons need safe area */
.fixed-bottom-bar {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}
```

### Zoom & Text Resize Testing

WCAG requires content to work at 200% zoom (1.4.4) and at 320px equivalent width (1.4.10). Test both:

1. **Browser zoom 200%** — no horizontal scroll, no content clipped, no overlapping elements
2. **Viewport 320px** — same requirements
3. **Text-only zoom** — override font sizes; no container overflow, no text truncation
4. **Text spacing override** (WCAG 1.4.12) — line-height 1.5x, paragraph spacing 2x, letter-spacing 0.12em, word-spacing 0.16em — no content loss

### Performance on Mobile

Performance is an accessibility issue — slow sites on weak connections disproportionately affect users in rural areas, developing countries, and elderly users with older devices.

- Target < 500KB initial load on mobile
- Use `loading="lazy"` for images below the fold
- Consider `prefers-reduced-data` for heavy media
- Defer non-critical JS with `defer` or `type="module"`
- Use `<link rel="preconnect">` for critical third-party origins

### RWD Design Checklist

When designing responsive layouts:
- [ ] Viewport meta tag present, zoom NOT disabled
- [ ] Content works at 320px width without horizontal scroll
- [ ] Content works at 200% browser zoom
- [ ] Text spacing overridable per WCAG 1.4.12
- [ ] Touch targets >= 44x44px on mobile
- [ ] Input font size >= 16px (prevents iOS auto-zoom)
- [ ] `inputmode` set for appropriate mobile keyboards
- [ ] Navigation collapses accessibly on mobile
- [ ] Tables scroll or reflow on narrow screens
- [ ] Images responsive with proper `srcset`/`sizes`
- [ ] Fixed/sticky elements don't obscure content at narrow widths
- [ ] Safe area insets respected on notched devices
- [ ] Orientation works in both portrait and landscape
- [ ] Performance budget < 500KB initial load

## Anonymized Feedback

This skill supports the same opt-in anonymous data collection as a11y-audit. When the user completes a design consultation, offer to log an anonymized record:

```json
{
  "date": "2026-04-04",
  "skill": "a11y-design-guide",
  "pattern_used": "modal-dialog",
  "consultation_type": "design",
  "platform": "web"
}
```

Appended to `~/.claude/a11y-audit-stats.jsonl`. No code, no paths, no project names.

## References

Shared with a11y-advisor and a11y-audit:
- `../a11y-advisor/references/disabilities.md` — Disability categories and global stats
- `../a11y-advisor/references/patterns.md` — Extended component patterns
- `../a11y-advisor/references/wcag-quick.md` — WCAG 2.2 by scenario
- `../a11y-advisor/references/legal-brief.md` — Legal quick reference

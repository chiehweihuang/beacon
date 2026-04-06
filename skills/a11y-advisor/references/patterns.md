# Accessible Component Patterns

## Principle: Native First, ARIA Last

Use native HTML elements. They have built-in accessibility. Only add ARIA when no native element exists.

"Bad ARIA is worse than no ARIA" — a `role="checkbox"` that doesn't respond to Space key is a lie to screen readers.

---

## Buttons

```html
<!-- WRONG -->
<div class="btn" onclick="submit()">Submit</div>
<span role="button" tabindex="0">Submit</span>

<!-- RIGHT -->
<button type="submit">Submit</button>
<button type="button" aria-label="Close dialog">×</button>
```

Why: Native `<button>` gives you focus, Enter/Space activation, and correct role for free.

## Links vs Buttons

- **Link** (`<a href>`): Navigates somewhere. Screen reader announces "link".
- **Button** (`<button>`): Performs an action. Screen reader announces "button".
- Never use `<a href="#" onclick>` for actions. Never use `<button>` for navigation.

## Forms

```html
<!-- WRONG -->
<input placeholder="Email"> <!-- placeholder disappears, no persistent label -->

<!-- RIGHT -->
<label for="email">Email address</label>
<input id="email" type="email" autocomplete="email" required
       aria-describedby="email-hint">
<span id="email-hint">We'll never share your email.</span>
```

Error handling:
```html
<input id="email" type="email" aria-invalid="true" aria-describedby="email-error">
<span id="email-error" role="alert">Please enter a valid email address.</span>
```

## Dialog / Modal

```html
<!-- WRONG: div-based modal with manual focus trap -->
<div class="modal" role="dialog" aria-modal="true">...</div>

<!-- RIGHT: native dialog -->
<dialog id="confirm-dialog">
  <h2>Confirm deletion</h2>
  <p>This action cannot be undone.</p>
  <button type="button" onclick="this.closest('dialog').close('cancel')">Cancel</button>
  <button type="button" onclick="this.closest('dialog').close('confirm')">Delete</button>
</dialog>
```

`showModal()` provides: focus trapping, Escape to close, backdrop, inert background — all free.

## Accordion / Disclosure

```html
<!-- WRONG: custom JS accordion -->
<div class="accordion">
  <div class="header" onclick="toggle()" aria-expanded="false">Section</div>
  <div class="panel" hidden>Content</div>
</div>

<!-- RIGHT: native details -->
<details>
  <summary>Section</summary>
  <p>Content</p>
</details>
```

## Tabs

No native element — ARIA required. Follow APG pattern:
```html
<div role="tablist" aria-label="Settings">
  <button role="tab" id="tab-1" aria-selected="true" aria-controls="panel-1">General</button>
  <button role="tab" id="tab-2" aria-selected="false" aria-controls="panel-2">Privacy</button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">...</div>
<div role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden>...</div>
```

Keyboard: Arrow keys move between tabs, Tab moves to panel content.

## Images

```html
<!-- Informative image -->
<img src="chart.png" alt="Sales increased 25% from Q1 to Q2 2025">

<!-- Decorative image -->
<img src="divider.png" alt="" role="presentation">

<!-- Complex image -->
<figure>
  <img src="flowchart.png" alt="User registration flow" aria-describedby="flow-desc">
  <figcaption id="flow-desc">Step 1: Enter email. Step 2: Verify. Step 3: Set password.</figcaption>
</figure>
```

## Navigation

```html
<nav aria-label="Main">
  <ul>
    <li><a href="/" aria-current="page">Home</a></li>
    <li><a href="/products">Products</a></li>
  </ul>
</nav>
```

Multiple `<nav>` on page: each needs unique `aria-label` ("Main", "Footer", "Breadcrumb").

## Live Regions

```html
<!-- Toast/notification -->
<div role="status" aria-live="polite">Item added to cart.</div>

<!-- Urgent alert -->
<div role="alert" aria-live="assertive">Session expires in 2 minutes.</div>
```

`polite` = announced after current speech. `assertive` = interrupts immediately.

## Focus Management

```css
/* Always provide visible focus indicator */
*:focus-visible {
  outline: 2px solid var(--focus-color);
  outline-offset: 2px;
}

/* Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## CSS Hooks Using ARIA

```css
/* Style based on state, not extra classes */
[aria-expanded="true"] > .icon { transform: rotate(180deg); }
[aria-current="page"] { font-weight: bold; border-bottom: 2px solid; }
[aria-invalid="true"] { border-color: var(--error); }
[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
```

## Red Flags — Auto-Trigger Strong Warning

| Pattern | Problem | Fix |
|---------|---------|-----|
| `<div onclick>` / `<span onclick>` | Not a button. Invisible to AT. | `<button>` |
| `<a href="#">` with onclick | Not a link. Confuses AT. | `<button>` if action, `<a href="/path">` if navigation |
| `placeholder` without `<label>` | Label disappears on input. | Add `<label>` |
| `<select>` / dropdown | Hostile to elderly, low vision, motor impaired users | Radio group, segmented control, toggle buttons |
| CAPTCHA (image/puzzle) | #1 barrier for over a decade. Blocks blind, cognitive, motor users. | Passkeys, email verification, honeypot, reCAPTCHA v3 |
| Accessibility overlay widget | Does not fix issues. FTC fined accessiBe $1M. 1000+ companies sued despite using overlays. | Fix source code. |
| `outline: none` without replacement | Removes keyboard focus visibility | Use `:focus-visible` with visible indicator |
| `user-select: none` on content | Prevents copying, breaks AT interaction | Only on UI controls, never on content |
| Auto-playing video/audio | Startles, disorients. Cannot be stopped by keyboard users if controls inaccessible. | Default muted, visible pause control |
| Infinite scroll without alternatives | Keyboard users can never reach footer/nav. Screen readers get lost. | Provide pagination alternative or "Load more" button |
| Taiwan `:::` navigation markers (導盲磚) | Never complied with WCAG/ISO 40500. Harms cognitive/learning disability users. Removed from TW 2017 standard. | Remove. Use landmarks and skip links instead. |

---

## Tables

Data tables require explicit header associations for screen readers to announce "Column: Value" as users navigate cells.

```html
<!-- Simple data table -->
<table>
  <caption>Q1 2025 Sales by Region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Revenue</th>
      <th scope="col">Growth</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">APAC</th>
      <td>$2.4M</td>
      <td>+12%</td>
    </tr>
  </tbody>
</table>
```

Key rules:
- Always use `<caption>` — screen readers announce it before table content, giving context
- Use `scope="col"` on column headers, `scope="row"` on row headers
- For complex tables with multi-level headers, use `headers` attribute pointing to `<th id>`
- Never use `<table>` for layout. If you must, add `role="presentation"` to suppress table semantics
- Never use `role="presentation"` on data tables (destroys header-cell relationships)

### Responsive Tables

Common responsive pattern (CSS `display: block` on table cells) **destroys table semantics**. Screen readers lose header-cell associations.

Better approaches:
1. **Horizontal scroll** with `overflow-x: auto` on a `<div>` wrapper — preserves full table structure
2. **Stacked cards** — transform to `<dl>` (definition list) at small breakpoints, repeating headers as `<dt>`
3. **Column hiding** — hide low-priority columns at small breakpoints, provide "show all" toggle

```html
<!-- Scrollable table wrapper -->
<div role="region" aria-label="Sales data" tabindex="0" style="overflow-x: auto;">
  <table>...</table>
</div>
```

The `tabindex="0"` + `role="region"` makes the scroll container keyboard-focusable and announced to screen readers.

---

## Common ARIA Misuses

"Bad ARIA is worse than no ARIA." These are the most frequent ARIA mistakes. Each one actively harms assistive technology users.

### 1. `role="button"` without keyboard handling

```html
<!-- BROKEN: screen reader says "button" but Enter/Space does nothing -->
<div role="button" tabindex="0" onclick="doThing()">Click me</div>

<!-- FIX: just use <button>, or add keydown handler -->
<div role="button" tabindex="0"
     onclick="doThing()"
     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();doThing()}">
  Click me
</div>

<!-- BEST: use native element -->
<button type="button" onclick="doThing()">Click me</button>
```

### 2. `aria-hidden="true"` on focusable elements

```html
<!-- BROKEN: element is hidden from screen reader but still receives keyboard focus -->
<!-- Screen reader user tabs into a void — they hear nothing but can't escape -->
<button aria-hidden="true">Secret button</button>

<!-- FIX: if truly hidden, also prevent focus -->
<button aria-hidden="true" tabindex="-1">Secret button</button>

<!-- BETTER: use CSS display:none or hidden attribute instead -->
<button hidden>Secret button</button>
```

### 3. Redundant ARIA on native elements

```html
<!-- REDUNDANT: native elements already expose these roles -->
<button role="button">Submit</button>         <!-- <button> IS a button -->
<a href="/home" role="link">Home</a>          <!-- <a href> IS a link -->
<nav role="navigation">...</nav>              <!-- <nav> IS navigation -->
<input type="checkbox" role="checkbox">       <!-- already a checkbox -->

<!-- CORRECT: just use the native element, no ARIA needed -->
<button>Submit</button>
<a href="/home">Home</a>
<nav>...</nav>
<input type="checkbox">
```

### 4. `aria-label` overriding visible text

```html
<!-- CONFUSING: sighted users see "Submit" but screen reader says "Send form data" -->
<button aria-label="Send form data">Submit</button>

<!-- CORRECT: aria-label should match or extend visible text -->
<button>Submit</button>
<!-- Or if extra context needed: -->
<button aria-label="Submit order form">Submit</button>
```

WCAG 2.5.3 (Label in Name): accessible name must **contain** the visible text. Voice control users say what they see.

### 5. `role="presentation"` / `role="none"` on data tables

```html
<!-- DESTROYS table semantics — screen reader can't navigate by row/column -->
<table role="presentation">
  <tr><th>Name</th><th>Price</th></tr>
  <tr><td>Widget</td><td>$5</td></tr>
</table>

<!-- Only use role="presentation" on layout tables (which shouldn't exist anyway) -->
```

### 6. Missing required children/parent roles

```html
<!-- BROKEN: tabpanel without tablist parent -->
<div role="tabpanel">Content</div>

<!-- BROKEN: option without listbox/combobox parent -->
<div role="option">Choice A</div>

<!-- CORRECT: maintain required role hierarchy -->
<div role="tablist">
  <button role="tab" aria-selected="true">Tab 1</button>
</div>
<div role="tabpanel">Content</div>
```

---

## SPA Focus Management

Single-page applications break the browser's native page-load behavior. When a sighted user clicks a link in an SPA, the new "page" renders visually, but screen reader focus stays where it was. The user hears nothing — they don't know the page changed.

### The Problem

In a traditional multi-page site, the browser:
1. Loads new page
2. Resets focus to top of document
3. Screen reader announces new page title

In an SPA, none of this happens. The DOM mutates in place.

### Solution Pattern

After every route change:

```js
// 1. Update document.title
document.title = `${newPageTitle} | Site Name`;

// 2. Move focus to a predictable target
const target = document.querySelector('h1')     // preferred: new page heading
             || document.querySelector('main')   // fallback: main landmark
             || document.querySelector('[role="main"]');

if (target) {
  target.setAttribute('tabindex', '-1');  // make non-interactive element focusable
  target.focus({ preventScroll: false }); // move focus
}

// 3. Announce the navigation (belt-and-suspenders with aria-live)
const announcer = document.getElementById('route-announcer');
if (announcer) announcer.textContent = `Navigated to ${newPageTitle}`;
```

```html
<!-- Route announcer — visually hidden, always in DOM -->
<div id="route-announcer"
     role="status"
     aria-live="polite"
     aria-atomic="true"
     class="sr-only"></div>
```

### Framework-Specific

- **React Router**: no built-in focus management. Use a `useEffect` on `location` changes.
- **Next.js**: App Router auto-focuses `<main>` on navigation since v13.4+. Verify with screen reader.
- **Vue Router**: use `router.afterEach()` hook.
- **SvelteKit**: use `afterNavigate()` lifecycle function.

### What NOT to Do

- Don't focus the `<body>` — screen reader reads entire page from scratch
- Don't use `aria-live="assertive"` for route changes — too aggressive, interrupts user
- Don't skip this entirely — "the screen went blank" is the #1 SPA complaint from screen reader users

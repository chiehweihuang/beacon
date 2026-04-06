---
tags: [a11y, openspec, testing]
status: spec
source: agent
---

# Red Flag Detection

## Purpose

Verify that the advisor immediately triggers strong warnings for known high-risk patterns, regardless of audience mode.

## Requirements

### Requirement: Overlay Widget Detection

Accessibility overlay widgets MUST trigger immediate strong warning.

#### Scenario: accessiBe script tag
- **GIVEN** code contains `<script src="https://acsbapp.com/apps/app/dist/js/app.js">`
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** mentions FTC $1M fine against accessiBe
- **AND** states overlays do not fix underlying accessibility issues
- **AND** states 1,000+ companies have been sued despite using overlays
- **AND** recommends removing the overlay and fixing source code

#### Scenario: UserWay widget
- **GIVEN** code contains UserWay accessibility widget integration
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL with same warnings as above

---

### Requirement: CAPTCHA Detection

Image or puzzle-based CAPTCHA MUST trigger strong warning.

#### Scenario: reCAPTCHA v2 (checkbox with image challenge)
- **GIVEN** code integrates reCAPTCHA v2 with image challenge
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** mentions CAPTCHA has been #1 accessibility barrier for over a decade
- **AND** mentions it blocks blind users (can't see images), cognitive users (can't solve puzzles), motor users (difficult to click small targets)
- **AND** suggests alternatives: reCAPTCHA v3 (invisible), hCaptcha accessible mode, passkeys, email verification, honeypot technique

#### Scenario: Custom image CAPTCHA
- **GIVEN** code implements a custom "type the letters you see" CAPTCHA
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** cites WCAG 2.2: 3.3.8 Accessible Authentication (AA)

---

### Requirement: Div-as-Button Detection

Non-semantic interactive elements MUST be caught.

#### Scenario: div with onclick
- **GIVEN** code contains `<div class="btn-primary" onclick="handleClick()">`
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** explains this element is invisible to screen readers and unreachable by keyboard

#### Scenario: span as link
- **GIVEN** code contains `<span class="link" onclick="navigate('/about')">`
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** suggests `<a href="/about">` or `<button>` depending on intent

---

### Requirement: Select/Dropdown Detection

Per project rules, `<select>` and dropdown menus MUST trigger a warning.

#### Scenario: Native select element
- **GIVEN** code contains `<select name="country"><option>...</option></select>`
- **WHEN** the advisor reviews this code
- **THEN** output is ⚠ WARNING (or 🔴 if project CLAUDE.md bans selects)
- **AND** explains dropdowns are hostile to elderly, low vision, and motor impaired users
- **AND** suggests radio group, segmented control, or toggle buttons as alternatives

---

### Requirement: Focus Visibility Removal

Removing focus outlines without replacement MUST trigger warning.

#### Scenario: outline none in CSS
- **GIVEN** CSS contains `*:focus { outline: none; }`
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** explains keyboard users (motor, visual) lose all navigation feedback
- **AND** suggests `:focus-visible` with visible outline replacement

#### Scenario: outline 0 on buttons
- **GIVEN** CSS contains `button { outline: 0; }`
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** same guidance as above

---

### Requirement: Auto-playing Media

Auto-playing audio or video MUST trigger warning.

#### Scenario: Autoplay video
- **GIVEN** code contains `<video autoplay>`
- **WHEN** the advisor reviews this code
- **THEN** output is ⚠ WARNING
- **AND** mentions impact on vestibular disorder, anxiety, and screen reader users
- **AND** suggests `autoplay muted` with visible pause control
- **AND** cites WCAG 2.2: 1.4.2 Audio Control (A)

---

### Requirement: Flashing Content

Content flashing >3 times per second MUST trigger LIFE-SAFETY warning.

#### Scenario: CSS animation with rapid flashing
- **GIVEN** CSS contains an animation that rapidly alternates colors (>3Hz)
- **WHEN** the advisor reviews this code
- **THEN** output is 🔴 CRITICAL
- **AND** explicitly states "LIFE-SAFETY: can trigger seizures"
- **AND** cites WCAG 2.2: 2.3.1 Three Flashes or Below Threshold (A)
- **AND** mentions neurological disability (epilepsy, photosensitive seizure disorder)

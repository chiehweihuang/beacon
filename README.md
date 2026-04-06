# Beacon

Accessibility + AEO inspection plugin for Claude Code.

Like [Lighthouse](https://developer.chrome.com/docs/lighthouse) for accessibility, but with legal risk assessment, Answer Engine Optimization, and human-centered explanations.

## Skills

| Command | What it does |
|---------|-------------|
| `beacon:inspect` | Full inspection: 0-100 scoring across 10 categories, interactive HTML report, before/after comparison, legal risk per jurisdiction |
| `beacon:guide` | Proactive design guidance: accessible patterns and components to use BEFORE writing UI code |
| `beacon:advisor` | Contextual a11y tips when editing UI files (also auto-triggers via hook) |

## Hook

**beacon:advisor** auto-triggers as a PostToolUse hook whenever you edit HTML, CSS, JSX, TSX, Vue, or Svelte files. It provides a brief a11y checklist reminder so you catch issues as you write, not after.

You can also invoke `beacon:advisor` manually for deeper guidance on WCAG criteria, disability categories, legal context, or accessible design patterns.

## Inspection Categories

| Category | What it checks |
|----------|---------------|
| Contrast | Text/UI contrast ratios, color-only information, dark mode |
| Keyboard | Tab order, focus indicators, keyboard traps, skip links |
| Screen Reader | Landmarks, headings, alt text, ARIA, language |
| Forms | Labels, error messages, autocomplete, required fields |
| Media | Captions, transcripts, auto-play, flash |
| Motion | prefers-reduced-motion, time limits, auto-moving content |
| Touch | Target size, drag alternatives, orientation |
| Cognitive | Consistent navigation, help mechanisms, dark patterns |
| Responsive | Reflow at 320px, zoom, viewport, fluid typography |
| Agent/AEO | Schema.org, meta tags, heading outline, AI-crawlability |

## Legal Risk Coverage

US ADA, EU EAA, Japan JIS, Taiwan, Canada ACA, Australia DDA.

## Installation

```
/plugin install beacon@beacon
```

Requires `beacon` in your `extraKnownMarketplaces`:

```json
"beacon": {
  "source": {
    "source": "github",
    "repo": "chiehweihuang/beacon"
  }
}
```

## License

MIT

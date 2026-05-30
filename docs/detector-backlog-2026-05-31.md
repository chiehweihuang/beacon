# Beacon Tier-1 detector backlog (from the 2026-05-31 50-site survey)

Source: improve-pipeline survey `pipeline/runs/2026-05-31-survey/` produced 21 axe_only
clusters. Each was triaged by an independent agent verified against the actual
`core/scripts/static-audit.mjs` source (not priors). Method: a 25-agent workflow,
2026-05-31. Two clusters (`aria-allowed-attr`, `frame-title`) failed to return structured
output and are classified here from the same criteria.

## Build: genuine Tier-1 gaps (static-detectable, not currently caught)

| Rule | WCAG | Sites | Effort | Priority | Notes |
|---|---|---|---|---|---|
| `list` | 1.3.1 | 4 | small | medium | `<ul>/<ol>` first child not `<li>`; role-guarded. Verified: fires ikea/rakuten/vercel; first-child-only misses guardian/notion. SHIPPED. |
| `meta-viewport` (zoom-disable) | 1.4.4 | 2 | small | medium | viewport `user-scalable=no` / `maximum-scale<5`. Verified: fires on exactly excalidraw + vercel. SHIPPED. |

> Both were built and verified against the real survey snapshots. `frame-title` was a third
> candidate but was **pulled** after verification (see below) — a reminder that synthetic tests
> are not enough; detectors must be checked against the actual pages axe flagged.

### `list` (1.3.1) sketch
First-child heuristic (a full nesting check needs a parser, defer that to Tier-2):
match `<ul|ol ...>` then, skipping whitespace/comments, flag if the first child is a tag
that is not `li`/`script`/`template`, or bare text. **Largest FP risk: framework components
and `{items.map(...)}` in JSX/Vue/Svelte** — mitigate by excluding PascalCase tag names and
only running the bare-text branch for `.html` files. First-child-only by design (accepts false
negatives for a stray child later in the list).

### `meta-viewport` zoom-disable (1.4.4) sketch
Add a sibling to the existing presence check: match the viewport meta, pull its `content`,
flag `user-scalable=(no|0|false)` or `maximum-scale` parsed `< 5`. Low FP (tokens are
unambiguous zoom-killers per axe). Guard `isNaN`; `< 5` strict (5+ is valid). Finding-only,
no extra pass tick (the presence block already records the responsive pass).

### `frame-title` (4.1.2) — pulled after verification
A naive `<iframe>`-without-`title` regex fired on hidden GTM/tracking iframes on 7 of 7 verified
sites, while axe flagged only 1/50. axe ignores iframes that are not in the accessibility tree
(display:none, 0-size, JS-hydrated), which a static regex cannot determine. Reclassified
Tier-2 (needs computed visibility); not shipped.

## Fix mapping, not a new detector

| Rule | WCAG (axe) | Reality |
|---|---|---|
| `label` | 4.1.2 | Beacon already detects unlabeled `<input>` but emits **3.3.2**. Cross-map/dual-tag 4.1.2, or accept the divergence. Minor: Beacon checks `<input>` only, not `<select>/<textarea>`. |

## Already covered (duplicates)

- `link-name` 2.4.4 and 4.1.2 are one axe rule dual-tagged to two criteria. Beacon now emits
  4.1.2 (PR #9). Both clusters are satisfied. Nothing to do.

## Tier-2-only (needs rendering / computed style — correctly out of Tier-1 scope)

`color-contrast` (1.4.3), `link-in-text-block` (1.4.1), `scrollable-region-focusable`
(2.1.1 + 2.1.3), `nested-interactive` (4.1.2), `aria-hidden-focus` (4.1.2). These belong to the
axe Tier-2 (Playwright) path. The contrast verification gate (PR #9) reinforces that contrast
must be exercised there.

## Out-of-scope-rare (single-site / near-dead element / needs a heavy role map)

`aria-required-attr`, `aria-prohibited-attr`, `aria-required-parent`, `aria-allowed-attr`
(all need a role->aria matrix; the last one's cluster failed in the workflow, classified here),
`definition-list`, `dlitem`, `listitem` (1.3.1 list-family, near-dead `<dl>` / orphan items),
`meta-refresh` (2.2.1, pedagogical on w3-wai), `blink` (2.2.2, obsolete element). Technically
static-detectable in places, but single-site and low value-per-effort.

## Net actionable (after snapshot verification)

Two detectors shipped: `list` (1.3.1, role-guarded, first-child heuristic) and `meta-viewport`
zoom-disable (1.4.4). `frame-title` was pulled (Tier-2 visibility problem). `label` left at
3.3.2 (a more precise criterion than axe's 4.1.2; not remapped). Everything else is already
covered, genuinely Tier-2, or not worth a Tier-1 detector. The survey headline (contrast 18/50)
stays Tier-2 by nature.

# Outlier diagnosis — engine @3, 10 largest rank disagreements

One agent per site, adversarial toward Beacon (default hypothesis: Beacon is wrong),
every verdict verified against the raw snapshot markup. These diagnoses drove the @4
detector fixes; Lighthouse record = the 2026-06 `raw/*-rec.json` values.

| # | Site | LH | BC@3 | Primary cause | What was actually wrong |
|---|---|---|---|---|---|
| 70 | discord.com | 100 | 49 | mixed | Beacon's 6 `link-name-missing` criticals are TRUE (empty overlay anchors, verified in markup); a fresh live Lighthouse run scores 96 and flags the same 6 nodes — the recorded LH 100 was a degraded capture (LCP 15.6s). On top: 2 attribute-order FPs (viewport, meta-description). |
| 9 | m3.material.io | 100 | 27 | detector-fp | All top findings false: 14 `image-alt-missing` criticals on `aria-hidden="true"` decorative images; viewport/description/canonical all present but attribute-reordered. 4 of 5 scored categories driven by wrong findings. |
| 67 | trello.com | 87 | 94 | coverage-artifact | Beacon's findings are true, but LH's real failures (button-name via `<span hidden>`, target-size, link contrast) live in categories Beacon null-excludes or has no rule for. |
| 31 | about.gitlab.com | 100 | 59 | mixed | 9× `list-non-li-child` criticals = ONE reused Vue nav template (true positives, inside collapsed dropdowns LH never opens) — severity stacking floored a 224-pass/9-fail category to 0. Real LH blind spot + Beacon aggregation artifact. |
| 24 | web.dev | 90 | 100 | coverage-artifact | Beacon findings all tip-severity; LH's color-contrast maps to Beacon's not-machine-checkable category, and its frame-title failure was a Beacon rule gap (statically detectable untitled iframe — detector added in @4). |
| 84 | mailchimp.com | 100 | 68 | mixed | Attribute-order viewport FP zeroed responsive; `image-alt-missing` critical on a display:none tracking pixel; motion verdict unverifiable (real CSS in unfetched external files). |
| 29 | apple.com | 92 | 100 | coverage-artifact | Zero findings; LH's color-contrast axis is null-excluded, its aria-required-children rule has no Beacon counterpart (markup checked: those widgets are actually correct); forms/responsive perfect scores rest on 1 check each. |
| 25 | developer.chrome.com | 93 | 100 | mixed | 20 real icon-only links with aria-hidden content and no accessible name — statically detectable but Beacon's name computation counts aria-hidden text as a name (open gap). Contrast axis structurally excluded (defensible). |
| 44 | booking.com | 96 | 46 | detector-fp | 9 of 12 findings false: 4 `role="presentation"` images + 2 display:none pixels flagged for alt; viewport/description/canonical present but React-Helmet `data-rh=` attribute order broke the matchers. Only heading-skip is true (matches LH). |
| 49 | indeed.com | 97 | 58 | capture-quality | Both tools hit a Cloudflare WAF block page (title "Blocked - Indeed.com"). Beacon added 2 FP criticals on display:none preload images. Pair invalid. |

Cross-cutting counts: attribute-order FP class hit 4/10 sites; a11y-tree-exempt image FP
class hit 4/10; severity stacking amplified 2/10; 3/10 exposed missing rules
(frame-title, aria-hidden name computation, ARIA required-children).

QC note: of 15 randomly sampled non-outlier snapshots, 14 were real content; 1
(bestbuy.com) captured a country-selector splash — treat that pair with suspicion.

# Ground-truth study — 2026-07-06 (20 sites, 10 structural criterion classes)

Precision/recall for Beacon and Lighthouse against an **AI-triangulated,
evidence-anchored violation inventory**. This is deliberately NOT labelled
"human-audited ground truth": every entry is anchored to exact markup and survived an
adversarial second pass, but the judge is still an automated pipeline. A prioritised
human spot-check list is below; the inventory is data to be challenged, not an oracle.

## Method

- 20 sites from the 87-site benchmark, stratified by Lighthouse a11y 69–100 (8 low / 5
  mid / 7 high), 8 of them carrying prior per-site diagnoses.
- Scope: 10 structural classes — image-alt, link-name, button-name, frame-title,
  input-label, heading-order, list-structure, html-lang, document-title,
  meta-viewport-zoom. Contrast and target-size excluded (no measurement independent of
  axe available).
- Per site: candidates from Beacon findings ∪ Lighthouse raw failure nodes ∪ an
  independent markup sweep; every candidate judged against WCAG semantics (aria-hidden /
  role=presentation / display:none exemptions, alt="" decorative = correct,
  placeholder ≠ label, hidden text ≠ accessible name); then a second agent adversarially
  re-judged every entry and every tool mapping. 41 agents total.
- Provenance note: Beacon (independent regex engine), Lighthouse (axe), and the agent
  sweep are three genuinely different judges for structural classes; the correlated
  blind spot is anything requiring rendered state or interaction (see critic.md).

## Results (engine `beacon-static-audit@4`, pattern-level; 66 verified violation patterns, 350 instances)

| Tool | Precision | Recall (patterns) | Recall (instances) | FP patterns |
|---|---|---|---|---|
| Beacon @4 | 0.600 | 0.591 | 0.743 | 26 |
| Lighthouse | 0.811 | 0.462 | 0.225 | 7 |

Read with the counting-unit caveat (critic.md): pattern-level treats a template stamped
40× as one; instance-level weights by count. Lighthouse's instance recall collapses
because its recorded runs missed high-count repeated patterns; Beacon's precision is
dragged by FP classes that were subsequently fixed (below). Recall is **relative to the
triangulated candidate pool for these 10 classes only** — never absolute WCAG recall.

## Engine @5 verification (fixes driven by this study)

The 26 Beacon FP patterns clustered into: hidden-subtree scoring (tracking iframes,
preload images, collapsed carousels), attribute-bearing `<title>`, script-body template
literals, descendant-labelled buttons. After fixing (commit for engine @5):

- 14/15 unambiguous FP classes gone (remaining: an aria-heading bridging case on
  ibm.com, out of this round's scope).
- 39/39 true positives retained. One initial "loss" turned out to be an inventory
  error the fix itself exposed: ibm.com's video-modal iframe sits inside an
  `aria-hidden="true"` overlay — not a violation at rest by this study's own rules.
  Corrected in `inventories.json` with an inline CORRECTION note (site 90 notes).
- 18 previously-missed violation patterns now caught at key level (mostly the
  all-`alt=""` link-name class) — candidates, not re-adjudicated.
- 87-site Spearman vs Lighthouse: 0.474 → 0.488.

@5 precision was NOT fully re-adjudicated at the time; the full re-mapping below
supersedes the bounded estimate (≥ 0.75) recorded here previously.

## Engine @6 full re-mapping (2026-07-07) — official post-fix P/R

Every inventory violation re-judged against the @6 audits and every unclaimed @6
finding adjudicated. Method: mechanical matcher (anchor tokens + cited-line proximity;
kept-sets reproduced the shipped audits exactly) auto-matched 42/66 violations; the 7
sites with residue findings each got an adjudication agent plus an independent
adversarial re-judge (all 7 verified, zero overrides); one matcher error was caught and
corrected by session arbitration (site 90 notes: the aria-heading FP had been
auto-claimed for a violation it does not detect). Aggregation: `aggregate-gt.mjs
--engine 6` → `pr-analysis-v6.json` (`beacon_v6` / `beacon_fp_v6` fields; the @4 fields
and numbers stay frozen and reproducible via the default run).

| Tool | Precision | Recall (patterns) | Recall (instances) | FP patterns |
|---|---|---|---|---|
| Beacon @4 | 0.600 | 0.591 | 0.743 | 26 |
| Beacon @6 | 0.979 | 0.712 | 0.826 | 1 |
| Beacon @8 | **1.000** | **0.727** | **0.829** | **0** |
| Lighthouse (unchanged runs) | 0.811 | 0.462 | 0.225 | 7 |

**Engine @8 update (2026-07-22)**: the aria-heading fix (`role="heading" aria-level`
in the outline; `role="presentation|none"` headings excluded) resolves the last FP —
the engine now reports ibm.com's true 1→4 skip (line 1533) instead of the spurious
h1→h5 (line 1663); site 90 vi=3 flips to flagged. 47/47 previously flagged TPs
retained (`beacon_v8` sparse overrides + `aggregate-gt.mjs --engine 8`; @4 and @6
numbers still reproduce byte-for-byte). Known ceiling recorded: the detector reports
only the FIRST level-skip per document, so a second skip on the same page (site 90
vi=4, line 3916) stays missed — next-round design item.

- All 65 residue findings were instances of already-inventoried patterns — zero new
  violations entered the pool (recall denominators unchanged, so the numbers are
  directly comparable to @4), and zero new FP classes appeared.
- The single remaining FP pattern is the known aria-heading gap (ibm.com
  `heading-level-skipped@1663`: an AT-visible `role="heading" aria-level="4"` element
  bridges the sequence the engine reports as h1→h5).
- Instance-level weights still use the @4-era `count` values (conservative; the
  counting-unit caveat in critic.md applies unchanged).

## Human spot-check priorities (from critic.md, plus one from the @5 re-check)

1. **rakuten.co.jp link-name delta** — RESOLVED 2026-07-07: walker correct, not
   over-masking. Engine @5 kept 44 of 106 link-name findings; the inventory's own FP
   audit had only identified 8 hidden ones. Adjudication (mechanical ancestor-chain
   verification by a session AI, replicating `computeHiddenRanges` + the @6 naming
   rules on the stored snapshot; kept-set reproduced the shipped 44 exactly): every
   eliminated candidate (83 under @6 naming rules, a superset of the 62 under @4) sits
   inside an inline-hidden subtree — 74 under `visibility:hidden`, 9 under
   `display:none`, all with the hiding style literal on an ancestor div. Distribution:
   72 are prev/next buttons in `rnkTabItemdiv_rnkDailyGenreLink_*` genre-tab carousel
   panels (one clone per genre, only the active tab visible — the "cloned lazy
   carousels" hypothesis), 11 in `display:none` browsing-history/template blocks, two
   of which contain the literal un-instantiated placeholder `#GENRELINKEVENT#`. Five
   spread samples eyeballed ancestor-by-ancestor; all genuine descendants of their
   hiding roots. The visible active-tab siblings of the same buttons remain in the
   kept 44, so the underlying defect class stays represented. Not an independent
   human pass; raise here if one is still wanted.
2. Criterion-mapping audit on entries touching 1.3.1 / 4.1.2 boundaries.
3. One human pass on 3–4 sites for the correlated blind spots (reading order,
   color-alone, post-submit errors, name-correctness) — these can NEVER enter this
   inventory and cap its meaning.
4. The two highest-count sites (rakuten, kyoto.travel): verify the instance→pattern
   collapse.
5. Single-source entries (backed by only one of the three judges).

## Files

| File | Content |
|---|---|
| `sites.json` | the 20 selected sites with band / LH / Beacon context |
| `inventories.json` | per-site verified violations with per-tool flagged/missed mapping + FP lists (site 90 carries a correction note) |
| `pr-analysis.json` | the P/R aggregation (pattern + instance level, per criterion) |
| `critic.md` | method critic: shared blind spots, defensible claims, spot-check design |
| `aggregate-gt.mjs` | P/R computation harness |

Inputs referenced by the inventories (snapshots, per-site audit JSONs, raw Lighthouse
files) live locally under `beacon-benchmark-100/`; engine fingerprints pin versions.

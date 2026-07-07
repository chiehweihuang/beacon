# CJK-page false-positive study — 2026-07-07 (engine `beacon-static-audit@6`)

Answers the L4 fairness open question in VALIDATION.md: *the jp-tw band scores lowest —
real difference or detector bias?* Method: the L1 wild-sample protocol applied to the
whole jp-tw band. Every @6 finding in the 10 ground-truth criterion classes on sites
92/93/95 was adjudicated tp/fp by an agent judge and adversarially re-judged by an
independent second agent (all verified, zero overrides; `verdicts.json`); sites 96/97
inherit their adjudication from the @6 ground-truth re-mapping
(`../2026-07-06-ground-truth/`, same rules); site 94 has zero in-scope findings.

## Results (instance level, 10 structural classes)

| Site | Band | In-scope findings | FP | FP rate |
|---|---|---|---|---|
| 92 peatix.com | jp-tw | 1 | 1 | — (n=1) |
| 93 jnto.go.jp | jp-tw | 55 | 44 | 0.80 |
| 94 | jp-tw | 0 | 0 | — |
| 95 rurubu | jp-tw | 2 | 0 | 0 |
| 96 kyoto.travel | jp-tw | 20 | 0 | 0 |
| 97 rakuten.co.jp | jp-tw | 132 | 0 | 0 |
| **jp-tw total** | | **210** | **45** | **0.214** |
| **Latin control** (18 GT sites) | all others | **59** | **1** | **0.017** |

(93's agent judged 53 of 55 findings; the 2 unjudged are instances of the same
single-line wrapping-label group as the other 42 and are counted with their class.)

## FP classes found

1. **Wrapping-label blindness** (43 instances, site 93): checkboxes inside
   `<label>…<span>text</span></label>` are labelled per the adjudication rules, but the
   `input-label-missing` detector only credits `aria-label(ledby)`/`id`; a wrapping
   `<label>` is invisible to it. **Not CJK-specific**: a follow-up scan of all 88
   benchmark snapshots found 46 of the engine's 57 `input-label-missing` findings
   (81%) sit inside `<label>` ranges — including 3 on site 72 (spotify.com, Latin).
   This is a broken detector that happened to detonate on a jp-tw site, not language
   bias. Fixed in engine @7 (same session): jnto.go.jp +20 points, spotify.com +8,
   every other benchmark site byte-stable.
2. **Minified single-line misattribution** (1 instance, site 92): on a SPA bundle
   whose whole document is a handful of lines, the flagged `button-name-missing`
   cannot be tied to any actually-unnamed button (all 47 buttons on the cited line
   carry names).
3. **`role="presentation"` heading** (1 instance, site 93): an `<h4
   role="presentation">` inside the OneTrust cookie banner is flagged as a heading
   skip; role=presentation strips it from the AT heading sequence.
4. Latin control's single FP is the known aria-heading bridging gap (ibm.com, see the
   ground-truth README).

## Conclusion for the fairness question

The measured jp-tw FP-rate gap (0.214 vs 0.017 instance-level) is real but is driven
by one detector class (wrapping-label, 43/45 of the FP mass) that is not
language-related and also fires on Latin sites. After the @7 fix, the residual jp-tw
FP classes (single-line misattribution, role=presentation headings) total 2 instances
across 210 findings (~0.01) — no evidence of CJK-text-semantics bias in the current
detectors. The jp-tw band's low scores are dominated by genuine violations (rakuten's
image-alt/link-name mass, jnto's nameless carousel links), with site 93's score
materially depressed by the FP class until @7. Re-measure the band after any
detector change per the L1 protocol.

## Files

| File | Content |
|---|---|
| `verdicts.json` | per-finding tp/fp verdicts + adversarial reviews for 92/93/95 |

Snapshots and audit JSONs live locally under `beacon-benchmark-100/run-2026-07-05/`;
engine fingerprints pin versions.

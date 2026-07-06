**Shared blind spots (all three sources miss the same things → false negatives that never enter the denominator):**
- Beacon, Lighthouse, and a markup sweep are all DOM/static readers. Anything requiring rendered state, interaction, or human judgement is invisible to all three: name-value mismatches where the accessible name is wrong-but-present, reading-order/meaning-of-sequence (1.3.2), programmatic relationships that look fine in markup but break in the a11y tree, error-identification/labels that only appear post-submit, focus-order and focus-appearance, and info-conveyed-by-color-alone. Triangulation cannot fix a *correlated* blind spot; it only kills uncorrelated FPs. So recall is systematically inflated: unknown-unknowns are silently excluded.
- Same-provenance bias: Beacon and Lighthouse both wrap axe-core rulesets, so "two of three sources agree" is often one engine counted twice, not independent confirmation.

**Judgement rules that could be wrong:**
- Criterion mapping (which SC an issue belongs to) is where the adversarial pass is weakest — a real defect mapped to the wrong SC class corrupts both P and R for two classes at once. 1.3.1 vs 4.1.2 vs 1.3.5 boundaries are the usual bleed.
- "Evidence-anchored" ≠ correct: a node can be a genuine anchor for a non-violation (decorative img with empty alt flagged as missing name). Anchoring proves existence, not defect.

**Count/dedup pitfalls:**
- Instance vs occurrence vs component: one broken pattern in a template repeated 40× can count as 1 or 40; P/R swings wildly by the counting unit, and the two tools may count differently — biasing the comparison, not just the absolute score.
- Cross-source dedup by selector/xpath fails on dynamic IDs and shadow DOM → double-counting → inflated precision denominator.

**What stays defensible:** Precision on the *flagged* set (both tools' FP rate against anchored entries) is the strongest claim — it only needs the entries that exist to be judged correctly, which triangulation genuinely helps. **Recall is defensible only relative to the union of machine-detectable issues**, never as absolute WCAG recall; state it as "recall vs triangulated candidate pool," and only for the 8 included classes, scoped to structural/static SCs. Do not report recall for anything requiring rendered/interaction state.

**Spot-check to maximise errors-caught-per-minute (30–40 entries, not random):**
1. **Mapping audit first** — re-judge SC assignment on every entry touching 1.3.1/4.1.2/1.3.5 overlaps; highest error density, cheapest to check from the anchor.
2. **False-negative hunt on 3–4 sites**: one human pass looking *only* for the correlated blind spots above (reading order, color-alone, post-submit errors, name-correctness). If these show up, the recall claim needs its caveat hardened.
3. **Dedup/counting unit**: pick the 2 sites with the highest instance counts and hand-verify the instance→component collapse for both tools.
4. **Single-source entries**: every entry backed by only one of the three sources — that's where FPs concentrate.

Skip re-checking multi-source-agreeing, single-instance, unambiguous-class entries; near-zero yield.
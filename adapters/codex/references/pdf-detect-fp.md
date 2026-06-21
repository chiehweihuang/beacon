# pdf-detect — published false-positive table (PDF accessibility)

Validation of `scripts/pdf-detect.mjs` (WCAG 1.3.1 / 2.4.2 / 3.1.1 / 4.1.2 + PDF/UA) against a
real-world PDF corpus.

## Method

- **Corpus**: 35 real public PDFs `curl`-ed across tagging states — scanned/untagged documents,
  PDF/UA accessible documents, modern compressed (FlateDecode `/ObjStm`) tagged exports,
  encrypted gov forms, and non-English documents (ja/zh/de/fr/es).
- **Verification**: each FLAG/REVIEW finding cross-checked against an INDEPENDENT parser
  (`pypdf` + `cryptography` for AES), which resolves indirect objects and compressed object
  streams that the detector's raw-byte scan may not see. This is a different implementation, so
  it catches detector blind spots a same-engine check would miss.

## Result — 31 flags, 20 TP, 11 FP. FP rate among flags = 35%.

| Signal | Band | TP | FP | Precision |
|---|---|---|---|---|
| `pdf-untagged` | FLAG | 9 | 0 | 100% |
| `pdf-title-not-shown` | REVIEW | 7 | 6 | 54% |
| `pdf-lang-missing` | REVIEW | 2 | 4 | 33% |
| `pdf-marked-false` | REVIEW | 2 | 1 | 67% |

**11 fully-accessible PDFs (tagged + lang + shown title) correctly PASSED with no flag.**

> Correction: an earlier draft put `pdf-marked-false` at 1 TP / 2 FP (total 19/12). The
> independent cross-check had a boolean-coercion bug — `bool(BooleanObject(false))` is truthy in
> Python — that mislabelled the ALRC annual report (`/MarkInfo /Marked false`, a genuine TP) as a
> FP. Re-resolved with `str()`: ALRC and INE are both real `pdf-marked-false` TPs.

## What is solid (ship as Tier-1)

- **`pdf-untagged` is 9/9 = 100% precise** — the core, highest-harm check. Critically, the five
  modern compressed PDF/UA documents that store `/StructTreeRoot` inside a FlateDecode object
  stream were NOT falsely called "untagged": the detector's inflate-on-absence guard works for
  the tagging check. This is the detector's headline claim and it holds.

## The systematic blind spot: secondary REVIEW checks (12 FP)

Every false positive is in `pdf-lang-missing`, `pdf-title-not-shown`, or `pdf-marked-false`, and
they share ONE root cause. The detector inflates FlateDecode object streams ONLY for the
`/StructTreeRoot` check. So when `/Lang`, the document title, `/ViewerPreferences
/DisplayDocTitle`, or `/MarkInfo /Marked true` live in a compressed object stream (the norm for
modern tagged exports) or behind encryption, the raw-byte scan cannot read them and the detector
falsely reports them missing.

Confirmed examples (independent parser resolves the value the detector missed):
- IRS f1040s, fw9, VA-20-0995: `/Lang` resolves to `en-US`, title present, `DisplayDocTitle`
  true — all flagged `pdf-lang-missing` + `pdf-title-not-shown`. The literal `/Lang` token is in
  the raw bytes but its value is in a compressed `/ObjStm`.
- NY DMV mv82, USCIS n-400 (encrypted): after AES decrypt, fully accessible (tagged, marked,
  lang, title, shown) — yet flagged `pdf-marked-false` / `pdf-lang-missing` / title-not-shown.

## Fixes applied (2026-06-22) — and one that did NOT work

1. **Encryption suppression (shipped).** The secondary checks (`lang` / `title` / `marked`) are
   now skipped when the document is encrypted: their markers may be locked inside encrypted
   streams the detector cannot read, so "missing" is unverifiable, not a fail. The status note
   records the limitation. This removed the 4 encrypted FPs (NY DMV, USCIS n-400). Post-fix:
   **20 TP, 7 FP (26%)**.

2. **Broad inflation (tried, then REVERTED — it traded FP for false NEGATIVES).** Inflating
   every FlateDecode stream for the secondary lookups (the obvious fix) does remove the
   compressed-object-stream FPs, but it also surfaces stray catalog-key occurrences from
   NON-catalog objects — an outline entry's `/Title (...)`, a nested `/Lang` — which made
   `hasTitle` / `hasLang` true on documents that genuinely lack a document title or language.
   Verified false negatives it introduced: EU-HR and MHLW (no document title, per pypdf) and
   INE (empty `/Lang`) silently PASSED. For an accessibility detector a false negative (missing
   a real problem) is worse than a false positive, so this was reverted.

### Still open: the 7 compressed-object-stream FPs need catalog-aware resolution

The IRS/VA forms (`/Lang` value and `/Title` inside a FlateDecode `/ObjStm`, `/DisplayDocTitle`
as an indirect reference into one) are not fixable by a byte-scan tweak without also creating
false negatives. The correct fix is to resolve the **catalog** (`/Root`) and the **Info dict**
specifically via the xref + object-stream tables, then read THOSE objects' `/Lang`, `/Title`,
`/MarkInfo`, and `/DisplayDocTitle` — a real parser pass, scoped as a separate change.

## Verdict

Ship **`pdf-untagged` as a validated Tier-1 detector (0% FP)** and the encryption-suppression
fix. Hold the secondary REVIEW checks (`lang-missing` / `title-not-shown` / `marked-false`) out
of any published precision claim until catalog-aware resolution lands; today they false-fire on
modern compressed government PDFs (~7/35 here) while correctly catching the genuinely broken ones.

Raw: `beacon-detector-sim/p5-results.json`, `beacon-detector-sim/pdf-crosscheck-result.json`,
`corpus-pdf/`.

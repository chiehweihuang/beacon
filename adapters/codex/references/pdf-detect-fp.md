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

## Result — 31 flags, 19 TP, 12 FP. FP rate among flags = 39%.

| Signal | Band | TP | FP | Precision |
|---|---|---|---|---|
| `pdf-untagged` | FLAG | 9 | 0 | 100% |
| `pdf-title-not-shown` | REVIEW | 7 | 6 | 54% |
| `pdf-lang-missing` | REVIEW | 2 | 4 | 33% |
| `pdf-marked-false` | REVIEW | 1 | 2 | 33% |

**11 fully-accessible PDFs (tagged + lang + shown title) correctly PASSED with no flag.**

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

### Fix before publishing these checks

1. Run the SAME inflate-all-FlateDecode pass that the tagging check uses for the `/Lang`,
   title, `DisplayDocTitle`, and `/MarkInfo` lookups (resolve indirect references and object
   streams), not just for `/StructTreeRoot`.
2. For encrypted PDFs the detector cannot decrypt, return `INSUFFICIENT` for the secondary
   checks rather than emitting false REVIEW flags.

## Verdict

Ship **`pdf-untagged` as a validated Tier-1 detector (0% FP here)**. Hold the secondary
REVIEW checks (`lang-missing` / `title-not-shown` / `marked-false`) out of any published claim
until the compressed-object-stream / encryption blind spot is fixed; at present they false-fire
on exactly the modern, well-produced government PDFs they should pass.

Raw: `beacon-detector-sim/p5-results.json`, `beacon-detector-sim/pdf-crosscheck-result.json`,
`corpus-pdf/`.

# Q9 — Performance of `generate-report.mjs` on large audits

Research artefact for ROADMAP Open Question 9:

> "Performance of `generate-report.mjs` on large audits (100+ findings, 10k+ DOM nodes): is the synchronous template-literal build the right approach, or does the file need streaming output for very large reports?"

Status: analysis only. No product code changed. `audit-results.json` schema untouched.

---

## TL;DR verdict

**Keep the synchronous template-literal build.** Streaming is not warranted at any
realistic Beacon scale. The current approach is correct for this file, and the
question's framing slightly overstates the risk.

- **100 findings** produces an HTML file of roughly **0.5–1.0 MB**. This is a
  trivially small string for V8 to build and for `writeFileSync` to flush.
- The "10k+ DOM nodes" figure is a property of the *audited* site, not of the
  report. It does not flow into report size except very indirectly (see
  [§4](#4-the-10k-dom-nodes-figure-is-mostly-a-red-herring)).
- The synchronous build only starts to be questionable at roughly **5,000–10,000
  findings**, i.e. a 25–80 MB output file — a scale Beacon's single-page audit
  model cannot currently reach. Even there, the correct fix is *bounding the
  finding count*, not streaming.
- The real (small) inefficiency in the file is **double rendering of findings**
  and **redundant `Array.filter` scans**, not string building. These are
  O(findings) and O(findings × categories) respectively and are addressed in
  [§6](#6-the-genuine-if-minor-inefficiencies). They do not justify streaming
  either.

---

## 1. How the file builds its output

`generate-report.mjs` is a single-module Node ESM script, no external
dependencies (`scripts/generate-report.mjs:12-13`). The output is assembled as
**one template literal** bound to `const html` at `scripts/generate-report.mjs:611`,
and written in a single call:

```js
writeFileSync(outputPath, html, 'utf8');   // scripts/generate-report.mjs:1307
```

The template literal interleaves three kinds of content:

1. **Fixed chrome** — `<!DOCTYPE>`, `<head>`, a large `<style>` block, the
   `<body>` skeleton, and a `<script>` block. The `<style>` alone runs from
   `scripts/generate-report.mjs:617` to `:1085` — about 470 lines of CSS that is
   **constant regardless of audit size**.

2. **Builder-function output** interpolated via `${...}`. The builders are
   `buildCategoryRows` (`:262`), `buildFindingsHTML` (`:285`), `buildLegalRiskHTML`
   (`:314`), `buildContextBanner` (`:339`), `buildAeoDisclaimer` (`:378`),
   `buildLimitationsHTML` (`:412`), `buildScoreRing` (`:1310`).

3. **Inline `.map().join('')` loops** directly inside the body literal — score
   rings at `:1135-1138`, per-category detail blocks at `:1182-1188`, remediation
   items at `:1216-1230`, testing recommendations at `:1233`.

Every builder follows the same pattern: `array.map(item => \`...\`).join('')`.
For example `buildFindingsHTML`:

```js
return findings.map(f => { ... return `<div class="finding ...">...</div>`; }).join('');
//  scripts/generate-report.mjs:287-307
```

So the **total output is a tree of nested template literals, fully materialised
in memory before the single `writeFileSync`**. There is no incremental flush.

### What scales with audit size

| Output component | Grows with | Builder |
|---|---|---|
| CSS / JS / banners / methodology panel | nothing (constant ~470 lines CSS + fixed prose) | `:617-1085`, `buildContextBanner`, `buildLimitationsHTML` |
| Category summary rows | category count (fixed at 10, see ARCHITECTURE §3) | `buildCategoryRows` `:262` |
| Score rings | category count + 1 | `:1135-1138`, `buildScoreRing` `:1310` |
| **Finding cards** | **finding count** | `buildFindingsHTML` `:285` |
| Legal jurisdiction cards | jurisdiction count (typically ≤6) | `buildLegalRiskHTML` `:314` |
| Remediation items | remediation count (≈ finding count) | `:1216-1230` |

Only **finding cards** and **remediation items** scale with the variable the
question cares about. Categories are fixed at ten (ARCHITECTURE.md §3 lists the
ten weighted categories), jurisdictions are bounded by Beacon's six supported
legal regimes.

---

## 2. Per-finding cost — what one finding card actually does

`buildFindingsHTML` (`scripts/generate-report.mjs:285-308`) does the following
per finding:

- One ternary for `severityClass`, one for `icon` (`:288-289`).
- **Seven `escapeHtml` calls** on user-supplied fields: `title`, `wcag`, `level`,
  `affected_users`, `location`, `description`, `fix`, plus `legal_exposure`,
  `code_before`, `code_after` when present (`:294-304`). Call it ~7–10
  `escapeHtml` invocations per finding.
- Several `t(...)` I18N lookups (`:299-304`). `t()` (`:224`) does two object
  reads and builds a bilingual `<span>` pair via `bi()` (`:219`).

`escapeHtml` (`scripts/generate-report.mjs:310-312`) is four chained
`String.prototype.replace` calls with global regexes:

```js
return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
```

Each `.replace` is a full linear scan of the string and allocates a new string.
So one `escapeHtml` call is **4 passes over the field**. For a finding whose
`code_before`/`code_after` snippets are, say, 500 chars each, that is ~4 × 1000
chars = 4k char-scans for the code fields alone — utterly negligible per finding.

**Cost of one finding card: dominated by ~10 small regex scans and a few dozen
string allocations.** On a modern V8 this is single-digit microseconds. 100
findings ≈ sub-millisecond of `escapeHtml` work. Even 10,000 findings is on the
order of tens of milliseconds — still imperceptible.

The `t()` I18N calls are *constant per finding* (the label keys don't depend on
content) and could in principle be hoisted, but they cost a couple of object
property reads each — irrelevant.

---

## 3. Output size estimate — the number that actually matters

The real question for "do we need streaming" is **how big does the final string
get**, because that string is held fully in memory and then written in one go.

### Size of one finding card

A rendered finding `<div>` (`:290-306`) with a typical populated payload:
header (title + tags), affected-users line, location line, description
paragraph, a `fix` block, and a `<details>` before/after code comparison.

Estimating the rendered HTML:

- Structural tags, class names, the bilingual `<span>` pairs from every `t()`
  call: each `t()` emits `<span class="lang-zh" lang="zh-Hant">…</span><span
  class="lang-en" lang="en">…</span>` — roughly 70 chars of wrapper per label.
  A finding card uses ~6 labels → ~400 chars of bilingual wrapper overhead.
- Title, description, fix prose: typically 100–400 chars of actual content.
- Code before/after: 0–1,000 chars when present.

A realistic **populated** finding card renders to roughly **1.5–4 KB** of HTML.
Take **~2.5 KB** as a working average (many findings are tips with no code
block, pulling the average down; a few have large code diffs, pulling it up).

### Total file size vs finding count

Fixed overhead (CSS ~470 lines + JS + banners + bilingual methodology panel) is
approximately **40–60 KB** — this is constant. ARCHITECTURE.md §3 ("~1260 lines")
and the doubling note in §3 I18N ("HTML ~30% larger") are consistent with a
small fixed core.

Findings render **twice** — once per-category in the Overview tab
(`:1182-1188`, `buildFindingsHTML` per category) and once by-severity in the
Findings tab (`:1193-1200`). So the per-finding contribution to file size is
**~2 × 2.5 KB = ~5 KB per finding**.

| Findings | Findings HTML (×2 render) | + fixed ~50 KB | Total file |
|---|---|---|---|
| 30 (typical audit) | ~150 KB | | **~200 KB** |
| 100 (question's lower bound) | ~500 KB | | **~550 KB** |
| 500 | ~2.5 MB | | **~2.5 MB** |
| 1,000 | ~5 MB | | **~5 MB** |
| 5,000 | ~25 MB | | **~25 MB** |
| 10,000 | ~50 MB | | **~50 MB** |

**At 100 findings the report is about half a megabyte.** That is smaller than
many JPEGs. V8 builds it without noticing; `writeFileSync` flushes it in one
syscall-bounded burst measured in low single-digit milliseconds on any SSD.

A browser opening a 0.5 MB HTML file is also a non-event — Lighthouse's own
reports are routinely this size or larger.

---

## 4. The "10k+ DOM nodes" figure is mostly a red herring

The question pairs "100+ findings" with "10k+ DOM nodes". These are different
things and only one of them touches `generate-report.mjs`:

- **DOM nodes of the *audited* site** never enter the report generator. The
  generator consumes `audit-results.json`, not the page. The only place node
  counts surface is the optional `axe_node_count` field on a finding
  (ARCHITECTURE.md §4 schema, `findings[].axe_node_count`), which is a single
  number rendered as text. A site with 10k DOM nodes does not produce a 10k-node
  report; it produces however many *findings* the auditor recorded.

- **DOM nodes of the *report*** scale with finding count, not audited-site size.
  Each finding card is a fixed handful of elements. 100 findings rendered twice
  is roughly 100 × 2 × ~15 elements ≈ **3,000 report DOM nodes** — comfortable
  for any browser. Even 1,000 findings → ~30,000 nodes, which browsers render
  fine (it is the same order as a long GitHub diff page).

So "10k+ DOM nodes" is a property of the thing being audited and is essentially
**decoupled from report-generator performance**. The generator's only scaling
axis is `audit.findings.length` (and the parallel `audit.remediation.length`).

---

## 5. V8 string-concatenation behaviour — why synchronous is fine

A common worry behind "should this stream" is that building a big string by
concatenation is O(n²). For this file that worry does not apply:

- The builders use `array.map(...).join('')`
  (`scripts/generate-report.mjs:282, 307, 329, 420, 1138, 1230, 1233`).
  `Array.prototype.join` does a **single pass** over the array with the final
  size known up front — it is O(total length), not O(n²). This is the
  recommended way to concatenate many strings in JS and is exactly what the file
  does.
  (MDN, `Array.prototype.join`:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/join)

- The outer template literal at `:611` interpolates a fixed, small number of
  `${...}` slots. Template-literal evaluation concatenates its parts once; it is
  not a loop.

- V8 additionally represents concatenation results as **cons-strings** (rope-like
  lazy concatenation): joining two strings is O(1) until the string is
  *flattened* (when its characters are actually read, e.g. by `writeFileSync`).
  Flattening is then a single O(total length) copy. There is no quadratic blow-up.
  (V8 string internals — cons strings / ConsString:
  https://v8.dev/blog/react-cliff and
  https://gist.github.com/mraleph/3397008 describe V8's string representations;
  the cons-string optimisation for `+`/`join` is long-standing V8 behaviour.)

- Peak memory is roughly **2× the final string size** for a moment (the cons
  tree plus the flattened buffer, plus the UTF-8 encode buffer inside
  `writeFileSync`). At 100 findings that peak is ~1 MB. Node's default heap is
  hundreds of MB to ~2 GB+; this is not close to a limit. Even a 50 MB report
  (10k findings) peaks around ~100–150 MB transient — large but still within a
  default Node heap.

**Conclusion of §5:** the synchronous template-literal build has no algorithmic
pathology. It is linear in output size, and output size is small.

---

## 6. The genuine (if minor) inefficiencies

These exist but **none of them is a streaming problem** — they are CPU
micro-costs, fixed by local refactors if ever measured to matter:

1. **Findings are rendered twice.** Overview tab renders every finding grouped
   by category (`:1182-1188`); Findings tab renders every finding grouped by
   severity (`:1193-1200`). The HTML for each finding is built twice and shipped
   twice. This doubles both build time *and* file size contribution from
   findings. It is an intentional UX choice (two ways to browse the same data),
   not a bug — but it is the single biggest lever on report size. If file size
   ever became a concern, rendering once and re-grouping with CSS/JS would halve
   the findings payload.

2. **Repeated `Array.filter` scans.** The Overview loop calls
   `audit.findings?.filter(f => f.category === cat.id)` once per category
   (`:1186`) — that is O(findings × categories) = O(findings × 10). The Findings
   tab calls `.filter` three more times by severity (`:1194, :1197, :1200`).
   Total ≈ 13 full passes over the findings array. At 100 findings that is 1,300
   comparisons — microseconds. At 10k findings, 130k comparisons — still ~1 ms.
   A single `for` loop bucketing findings into a `Map` would make it O(findings),
   but the payoff is immeasurable at realistic scale.

3. **`escapeHtml` does 4 passes per call.** Replacing the four chained
   `.replace` calls with one combined `replace(/[&<>"]/g, ch => map[ch])` would
   cut escaping to a single pass. Worth doing on style grounds; performance
   payoff is negligible (see §2).

4. **`t()` recomputed per finding.** Label strings are content-independent but
   re-derived inside every `.map` callback. Hoisting the ~6 finding labels to
   `const`s computed once would save object lookups. Again: micro-optimisation.

Fixing #1 and #2 would make the generator both faster and produce smaller files.
Neither requires streaming, and neither is urgent at Beacon's current scale.

---

## 7. When *would* streaming actually be warranted?

Streaming HTML output (e.g. `fs.createWriteStream` + incremental `.write()`, or
a generator that yields chunks) makes sense when **either**:

- the output is too large to hold in memory comfortably, **or**
- time-to-first-byte matters because a client is waiting on a network socket.

Neither applies here:

- The report is **written to a local file and then opened in a browser**
  (ARCHITECTURE.md §7: `… --> a11y-report-<slug>-<date>.html`). There is no
  network client streaming the bytes; nobody sees a partial file. The browser
  opens the file only *after* `writeFileSync` returns. Streaming to a file would
  add complexity (managing `drain` events / backpressure, ordering builder
  output, error handling on a half-written file) for **zero** user-visible
  latency benefit, because the consumer is `file://` not an HTTP response.

- The memory ceiling is generous. Streaming becomes *necessary* (not merely
  tidy) only when the full string risks exhausting the heap. V8's maximum string
  length is ~536 MB (2^29 - 16 chars) on 64-bit
  (https://stackoverflow.com/questions/13367391/is-there-a-limit-on-length-of-the-key-string-in-js-object
  and V8's `String::kMaxLength`); practical memory pressure bites well before
  that. A report would need on the order of **20,000–50,000 findings** to
  approach 100–250 MB. Beacon audits **a single page** (ARCHITECTURE.md §7:
  "currently each audit is a single page"; ROADMAP long-term item: "Multi-page
  audit aggregation"). A single page producing 20k+ distinct accessibility
  findings is not a real scenario — axe-core on a pathological page yields
  hundreds of node-level violations, not tens of thousands of distinct findings,
  and Beacon's findings are *curated* by the auditor skill, not raw node dumps.

**Practical break-even:** synchronous build is the right choice up to roughly
**5,000 findings (~25 MB file)**. Between ~5,000 and ~20,000 the synchronous
build still *works* but starts to feel heavy (hundreds of ms, >100 MB transient
memory) and you would *consider* streaming. Above ~20,000 findings you would
*want* streaming — but at that point the real defect is an unbounded report, and
the correct fix is **pagination / truncation / "top N findings + count"**, not
streaming a 100 MB HTML file no human will scroll.

---

## 8. Verdict and recommendation

**Keep the synchronous template-literal build.** It is the right approach for
this file:

- It is **linear** in output size (`.map().join('')` + cons-strings, §5) — no
  quadratic trap.
- At the scale the question names (100 findings, 10k DOM nodes), the output is
  **~0.5 MB** and generation is **single-digit milliseconds**. The concern is
  overblown for that scale.
- The consumer is a **local file opened in a browser**, so streaming buys **no
  latency benefit** — its only legitimate motivation (memory) does not bite
  until ~25–100 MB outputs that Beacon's single-page audit model cannot produce.

If a future "multi-page audit aggregation" feature (ROADMAP long-term) lands and
a single report aggregates dozens of pages, **revisit this** — aggregated
reports could plausibly reach thousands of findings. Even then, the first
intervention should be **bounding what is rendered** (per-page collapsing,
"top N", lazy-load tabs), and only if an aggregate report genuinely needs to be
tens of MB should `fs.createWriteStream` replace the single `writeFileSync`.

### Concrete, proportionate follow-ups (optional, not blocking)

| Change | Benefit | Priority |
|---|---|---|
| Bucket findings once into a `Map` by category + severity, replacing ~13 `.filter` scans (`:1186, 1194, 1197, 1200`) | O(findings) instead of O(findings×13) | Low — nice tidy-up |
| Render each finding card once, reuse for both Overview and Findings tab via CSS/JS grouping | Halves findings payload + build time (addresses §6.1) | Low–Medium — only if report size is ever flagged |
| Single-pass `escapeHtml` (`/[&<>"]/g` + lookup) | One pass instead of four (`:310-312`) | Low — style/clarity |
| Add a soft cap: if `findings.length` exceeds a threshold (e.g. 1,000), render top-N per severity + a "+N more" note | Bounds worst-case file size structurally | Revisit with multi-page aggregation |

None of these is streaming. Streaming is **not** recommended.

---

## Sources

- `scripts/generate-report.mjs` — line references inline throughout
  (`:12-13` imports, `:285-312` findings/escape, `:611` template literal,
  `:1135-1233` body loops, `:1307` `writeFileSync`).
- `ARCHITECTURE.md` §3 (report generator structure, ten categories, "HTML ~30%
  larger" from bilingual rendering), §4 (`findings[].axe_node_count` schema),
  §7 ("currently each audit is a single page").
- `ROADMAP.md` Open Question 9 (question wording), long-term "Multi-page audit
  aggregation".
- MDN, `Array.prototype.join` — single-pass join semantics:
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/join
- V8 string representation / cons-strings (lazy concatenation, flatten on read):
  https://v8.dev/blog/react-cliff ;
  https://gist.github.com/mraleph/3397008
- V8 maximum string length (`String::kMaxLength`, ~2^29 chars on 64-bit):
  https://stackoverflow.com/questions/13367391/is-there-a-limit-on-length-of-the-key-string-in-js-object
- Node.js `fs.writeFileSync` / `fs.createWriteStream` (streaming-vs-buffered
  file write semantics):
  https://nodejs.org/api/fs.html#fswritefilesyncfile-data-options ;
  https://nodejs.org/api/fs.html#fscreatewritestreampath-options

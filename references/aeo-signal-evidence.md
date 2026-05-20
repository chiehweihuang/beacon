# AEO Signal Evidence Strength

Research artefact — Beacon self-research loop, Session B.
Branch: `research/aeo-evidence`. Date: 2026-05-20.

## Locked research question

Beacon's AEO heuristic signals (defined in `commands/inspect.md` step 2a "AEO-specific
checks" and category 3i "Answer Engine Optimization") — is there external evidence that
they actually help an AI answer engine cite a page? Each signal is tagged individually
as **strong**, **weak**, or **speculative**, with GEO/AEO literature citations.

## Method and tagging rubric

Each signal is graded against the external evidence found:

| Tag | Criteria |
|-----|----------|
| **strong** | Causal or near-causal evidence: a controlled study, an official answer-engine statement, or a measured large-scale observation directly tying the signal to citation/inclusion. |
| **weak** | Evidence is correlational, indirect (helps indexing/parsing but not directly citation), vendor-marketing-sourced, or contested by an authoritative voice. |
| **speculative** | No primary evidence found tying the signal to AI citation; rests on inference from how crawlers/LLMs are assumed to work. |

A core caveat applies to the whole document: the foundational peer-reviewed study in this
space, **GEO: Generative Engine Optimization (Aggarwal et al., KDD 2024)**, tested
*content-body* modifications (quotations, statistics, citations of sources). It explicitly
**did NOT test any HTML-level signal** — not schema.org, not meta description, not
canonical, not Open Graph. So for almost every signal Beacon checks, the strongest
available evidence is *not* the strongest available evidence in the field; it is one tier
weaker. This is the central finding of this artefact.

Source for that caveat: GEO paper full text, arXiv 2311.09735v3 — methods section lists
9 tested methods, all content-body; "The research focused exclusively on website content
modifications, not technical SEO signals."

---

## Per-signal verdict table

| # | Signal (Beacon checks it) | Verdict | One-line basis |
|---|---------------------------|---------|----------------|
| 1 | Content in HTML, not JS-only (AI-crawlability) | **strong** | 500M-fetch analysis: GPTBot/ClaudeBot/PerplexityBot do not execute JS — CSR content is invisible to them. |
| 2 | JSON-LD / Schema.org structured data | **weak** | Official "we read it" statements + a Semrush correlation; but Google says it is not a ranking factor and FAQ markup was de-weighted. |
| 3 | Heading outline coherence (extractable TOC) | **weak** | Strong consensus that headings delimit extractable passages; consensus is vendor/practitioner, not a controlled AEO study. |
| 4 | `<meta name="description">` | **weak** | AI crawlers reportedly read `og:description`; Google itself is replacing meta descriptions with AI-generated summaries. |
| 5 | Canonical URL (`<link rel="canonical">`) | **weak** | Affects *which URL* gets attributed/cited, not *whether* the page is cited. Practitioner-sourced. |
| 6 | Open Graph / Twitter Card metadata | **weak** | Practitioner reports that crawlers read `og:*` incl. `article:modified_time`; no primary study. |
| 7 | `<meta name="robots" content="noindex">` absence | **strong** | A noindex/disallow directive is a hard exclusion gate — a page told not to be indexed cannot be cited. |
| 8 | Sitemap.xml referenced | **speculative** | No evidence found that sitemap presence changes AI citation rate; it is a discovery aid at best. |
| 9 | FAQ schema + `<details>/<summary>` | **weak (and partly stale)** | FAQ rich results were retired by Google (Sept 2023 HowTo, May 2026 FAQ); FAQPage schema still *valid* but de-weighted as an AI surface signal. |
| 10 | Tables with `<caption>` and `<th>` | **speculative** | Plausible that AI extracts well-structured tables, but no AEO-specific study located. |
| 11 | Descriptive internal anchor text | **speculative** | Reasonable inference (anchor text gives link context) but no primary AEO evidence located. |

Distribution: 2 strong, 5 weak, 3 speculative, 1 weak-and-stale. The whole document is
not all speculation — two signals have genuinely strong evidence — but the bulk of
Beacon's AEO checks rest on indirect or inferred grounds.

---

## Per-signal detail

### 1. Content in HTML, not JS-only — STRONG

This is the best-evidenced signal Beacon checks, and it is the one closest to a
direct measurement of AI behaviour.

- An analysis of over 500 million GPTBot fetches found **zero evidence of JavaScript
  execution**. GPTBot, ClaudeBot and PerplexityBot fetch raw HTML, do not wait for
  rendering, and do not make a second attempt. Content rendered only client-side
  (React/Vue hydration without SSR) is invisible to them.
- This contrasts with Googlebot, the only major crawler with full JS rendering.
- Implication for Beacon: the inspect.md check "Content is in the HTML (not hidden
  behind JS-only rendering) — critical for AI crawlers that don't execute JS" is
  accurate and well-supported. The `+30` weight it carries in the AI-crawlability
  sub-score is the most defensible weight in the formula.

Sources:
- https://www.asklantern.com/blogs/ai-crawlers-do-not-render-javascript
- https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa
- https://prerender.io/blog/understanding-web-crawlers-traditional-ai/

### 2. JSON-LD / Schema.org structured data — WEAK

This is the signal with the widest gap between marketing claims and verifiable evidence.

For:
- In March 2025 Google and Microsoft stated they use schema markup during AI response
  generation; Microsoft's Principal Product Manager said "schema markup helps
  Microsoft's LLMs understand your content."
- A 2025 Semrush analysis is widely cited claiming pages with valid structured data are
  "2.3x more likely to appear in Google AI Overviews," and FAQ/HowTo/QAPage markup
  appears 20-30% more often in AI summaries.

Against:
- John Mueller (Google) is on record: "Structured data won't make your site rank
  better… this is not a ranking factor." He frames the benefit as *parsing help*, not a
  boost — the page is not "better" because it has correct markup.
- This is a textbook causation/correlation problem. Pages that invest in valid schema
  also tend to invest in content quality, authority and SSR. The Semrush "2.3x" figure
  is correlational and from a vendor; it does not isolate schema as the cause.
- The GEO paper did not test schema at all.

Verdict rationale: tagged **weak**, not speculative, because the official "we read it"
statements are real and authoritative — but tagged weak rather than strong because no
located source isolates schema as a *causal* lever for citation, and Google explicitly
denies it is a ranking factor. Beacon's `+20` schema weight is defensible as
"helps the engine parse you" but should not be sold as "this gets you cited."

Sources:
- https://www.searchenginejournal.com/google-structured-data-ranking/335781/
- https://www.brightedge.com/blog/structured-data-ai-search-era
- https://ailabsaudit.com/blog/en/schema-markup-ai-visibility-guide
- https://developers.google.com/search/blog/2023/08/howto-faq-changes

### 3. Heading outline coherence — WEAK

Strong *consensus*, weak *evidence base*.

- The widely-repeated practitioner claim: a clear H2/H3 acts as a label for the passage
  beneath it, letting an answer engine extract that block as a standalone answer. Google's
  own "passage ranking" surfaces specific sections of long pages, and a coherent
  H1→H2→H3 outline is described as the model's navigation map.
- However, every located source for this is a practitioner/vendor blog. No controlled
  AEO study isolates "fix the heading hierarchy → measurable citation lift" the way the
  GEO paper isolates "add a quotation → 40% impression lift."
- It is *plausible and consistent* with how retrieval-augmented systems chunk documents
  (chunking commonly respects heading boundaries), which is why this is weak rather than
  speculative.

Verdict rationale: tagged **weak**. The mechanism is credible and near-universally
asserted, but the evidence is consensus-of-practitioners, not measurement.

Sources:
- https://blog.hubspot.com/marketing/aeo-page-structure
- https://www.pontara.ai/blog/h1-h2-h3-heading-ai-search/
- https://insidea.com/blog/seo/aieo/semantic-html-for-ai-search-engines/

### 4. `<meta name="description">` — WEAK

- Practitioner reporting says GPTBot/ClaudeBot/PerplexityBot read `og:description` and
  `article:modified_time` when deciding whether to surface a page.
- Counter-signal: Google in 2025 began replacing traditional meta descriptions with
  AI-generated summaries built from page structure and headings — i.e. the engine
  increasingly *ignores* the author's meta description and re-derives its own.
- No primary study ties presence of `<meta name="description">` to a citation-rate
  change.

Verdict rationale: tagged **weak**. There is *some* signal (crawlers reportedly read
description fields), but it is practitioner-sourced and partly contradicted by Google
moving away from author-supplied descriptions. Beacon's `+15` weight is the weakest-
supported large weight in the AI-crawlability formula.

Sources:
- https://linknabber.com/guides/meta-tags
- https://streetfightmag.com/2025/10/10/streets-ahead-chatgpt-ai-generated-meta-descriptions-and-ai-mode/

### 5. Canonical URL — WEAK

- The evidence here is about *attribution*, not *inclusion*. When ChatGPT, Perplexity or
  AI Overviews synthesize an answer, they attribute it to a specific URL. Inconsistent
  canonical signals can cause the engine to cite a syndicated copy, a parameterized
  variant, or an older version instead of the page the author wants credited.
- So canonical does not change *whether* content is cited — it changes *which URL gets
  the credit*. For a tool measuring "does this page get cited," that is a second-order
  effect.

Verdict rationale: tagged **weak**. Real and practitioner-documented, but it protects
attribution rather than driving citation. Beacon's `+10` canonical weight is fine but
the report copy should frame it as "attribution hygiene," not "citation lever."

Source:
- https://www.getpassionfruit.com/blog/canonical-tags-and-ai-search-how-deduplication-signals-affect-llm-citations

### 6. Open Graph / Twitter Card metadata — WEAK

- Practitioner reports claim AI crawlers read `og:title`, `og:description`,
  `article:published_time` and `article:modified_time`, and that stale
  `article:modified_time` correlates with AI citation drops.
- No primary study; the freshness-via-OG claim in particular is asserted without a
  controlled test.

Verdict rationale: tagged **weak**, bordering speculative. Kept at weak because multiple
independent practitioner sources converge on "crawlers read `og:*`," but there is no
measurement.

Sources:
- https://linknabber.com/guides/meta-tags
- https://env.dev/guides/opengraph

### 7. Absence of `<meta name="robots" content="noindex">` — STRONG

- This is strong by *logic of exclusion*, which is as good as a measured study here:
  a `noindex` directive (or robots.txt disallow for the AI crawler's user-agent) is a
  hard gate. A page the crawler is told not to index cannot subsequently be cited.
- AI crawlers honour robots directives; the signal is binary and the causal chain
  ("blocked → not crawled → not citable") has no missing link.

Verdict rationale: tagged **strong**. This is the one HTML-level signal whose effect on
citation is effectively guaranteed, because it is a gate rather than a ranking nudge.

Sources:
- https://prerender.io/blog/understanding-web-crawlers-traditional-ai/
- https://www.performanceliebe.de/en/blog/understanding-ai-crawlers/

### 8. Sitemap.xml referenced — SPECULATIVE

- A sitemap is a crawl-discovery aid. No located source shows that having a sitemap
  changes whether or how often an answer engine cites a page.
- For a page that is already linked and reachable, a sitemap adds nothing to citation
  probability; for an orphan page it may aid discovery, but that is discovery, not
  citation.

Verdict rationale: tagged **speculative**. Beacon's `+10` sitemap weight in the
AI-crawlability sub-score is the least-defensible line in the formula.

### 9. FAQ schema + `<details>/<summary>` — WEAK, PARTLY STALE

- Google deprecated HowTo rich results (Sept 2023) and stopped showing FAQ rich results
  (May 2026). FAQPage as a schema.org type remains *valid* and harmless to keep.
- Crucially, after the FAQ deprecation, practitioner analysis (Glenn Gabe, G-Squared
  Interactive) observed Google's actions suggest **FAQ markup is not weighted as an AI
  surface signal**. Google has not connected FAQ structured data to AI Overview
  inclusion.
- The `<details>/<summary>` half of Beacon's check is an *accessibility* win regardless;
  that part is sound. But the AEO half — "FAQ schema helps you get cited" — is the
  staleest claim in inspect.md's category 3i.

Verdict rationale: tagged **weak and partly stale**. Recommend Beacon soften the FAQ
schema line in inspect.md 3i: keep `<details>/<summary>` as an a11y recommendation, but
stop implying FAQ schema is an AI-citation lever.

Sources:
- https://developers.google.com/search/blog/2023/08/howto-faq-changes
- https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957
- https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/

### 10. Tables with `<caption>` and `<th>` — SPECULATIVE

- The inspect.md rationale ("AI agents extract tabular data for direct answers") is
  plausible: well-formed tables are easier to parse into rows/columns. But no AEO study
  or official answer-engine statement was located that ties `<caption>`/`<th>` presence
  to citation outcomes.

Verdict rationale: tagged **speculative**. The a11y value of `<caption>`/`<th>` is real
and independently justified; the AEO claim is inference.

### 11. Descriptive internal anchor text — SPECULATIVE

- Classic SEO holds that anchor text gives a link target topical context. Extending that
  to "AI agents follow link context" is a reasonable inference, but no located AEO
  source measures it.

Verdict rationale: tagged **speculative**.

---

## What the strongest evidence actually says you should do

The one peer-reviewed result (GEO, KDD 2024) found the biggest citation/visibility wins
come from *content-body* changes Beacon does not currently check:

| GEO method | Measured visibility lift |
|------------|--------------------------|
| Quotation Addition | up to ~40% |
| Statistics Addition | ~30-40% |
| Cite Sources | ~30% |
| Fluency Optimization | ~15-30% |
| Easy-to-Understand | ~15-30% |
| Authoritative tone | ~8% |
| Keyword Stuffing | little/no effect; sometimes worse than baseline |
| Unique Words | negligible |

Beacon's AEO category is entirely structural/metadata. The strongest evidence in the
field points at content substance. This is a coverage gap, not a contradiction — see
the companion draft `drafts/aeo-category-recalibration.md`.

Source: https://arxiv.org/html/2311.09735v3 (GEO: Generative Engine Optimization,
Aggarwal et al., KDD 2024, arXiv 2311.09735).

## Sources checked (consolidated)

- GEO: Generative Engine Optimization — arXiv 2311.09735 / KDD 2024 — https://arxiv.org/abs/2311.09735
- AI crawlers do not render JavaScript — https://www.asklantern.com/blogs/ai-crawlers-do-not-render-javascript
- JavaScript rendering and AI crawlers — https://www.getpassionfruit.com/blog/javascript-rendering-and-ai-crawlers-can-llms-read-your-spa
- Understanding traditional vs AI bots — https://prerender.io/blog/understanding-web-crawlers-traditional-ai/
- John Mueller on structured data and rankings — https://www.searchenginejournal.com/google-structured-data-ranking/335781/
- Structured data in the AI search era — https://www.brightedge.com/blog/structured-data-ai-search-era
- Schema markup for AI visibility — https://ailabsaudit.com/blog/en/schema-markup-ai-visibility-guide
- Google HowTo/FAQ rich result changes — https://developers.google.com/search/blog/2023/08/howto-faq-changes
- Google drops FAQ rich results — https://searchengineland.com/google-to-no-longer-support-faq-rich-results-476957
- Meta tags that AI reads — https://linknabber.com/guides/meta-tags
- Canonical tags and AI citations — https://www.getpassionfruit.com/blog/canonical-tags-and-ai-search-how-deduplication-signals-affect-llm-citations
- AEO page structure / headings — https://blog.hubspot.com/marketing/aeo-page-structure
- Semantic HTML for AI search — https://insidea.com/blog/seo/aieo/semantic-html-for-ai-search-engines/

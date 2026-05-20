# AEO Signal Behaviour Across Answer Engines

Research artefact — Beacon self-research loop, Session B.
Branch: `research/aeo-evidence`. Date: 2026-05-20.

## Purpose

The companion artefact `references/aeo-signal-evidence.md` tags each of Beacon's AEO
signals strong/weak/speculative. That tagging treats "the AI answer engine" as one
actor. It is not. ChatGPT, Claude, Perplexity and Google AI Overviews source content
through materially different pipelines, so a signal that matters for one can be inert
for another. This artefact maps that variance, and checks one adjacent standard
(`llms.txt`) that Beacon does **not** currently check — to confirm Beacon was right
not to add it.

## How the four engines source content

| Engine | Sourcing pipeline | Citation volume | Notable bias |
|--------|-------------------|-----------------|--------------|
| ChatGPT | Training corpus first; web search only on demand or when recency is detected | ~7.9 sources/response | Wikipedia ~48% of its top-cited sources; favours consensus/high-authority |
| Claude | Structured-content preference; cites depth | n/a (per-source) | ~30% more likely to cite bullet-pointed / structured pages |
| Perplexity | Real-time web search on **every** query; reads candidate pages live | ~21.9 sources/response | Reddit ~46.7% of top citations; recency-heavy (82% of cites <30 days old) |
| Google AI Overviews | Draws ~97% of cited sources from existing top-20 organic results | n/a | ~54% overlap with classic organic ranking |

ChatGPT and Google AI Overviews share only ~13.7% of their citation sources — the
engines genuinely disagree about what to cite.

Source: https://discoveredlabs.com/blog/chatgpt-claude-perplexity-and-google-ai-overviews-how-each-platform-cites-sources-differently
and https://www.tryprofound.com/blog/ai-platform-citation-patterns

## What this means for each Beacon signal

### Signal 1 — Content in HTML (no JS-only): matters MORE for Perplexity/ChatGPT, LESS for Google

Perplexity reads candidate pages live with its own crawler, and GPTBot/ClaudeBot/
PerplexityBot do not execute JS. Google AI Overviews, by contrast, draw from organic
results that Googlebot (which *does* render JS) produced. So a CSR-only page can still
reach Google AI Overviews via its rendered organic index, but is structurally invisible
to Perplexity and ChatGPT browsing. Beacon's "content in HTML" check is therefore
**not uniformly critical** — it is critical for the non-Google engines specifically.
The inspect.md copy could note this nuance instead of a flat "critical for AI crawlers."

### Signal 2 — Structured data: strongest for Google AI Overviews, weakest for Perplexity

One vendor analysis claims structured data shows a 73% improvement in AI Overview
selection rates, and that Google's citation algorithms scan schema to verify E-E-A-T
signals. Even taking that figure with caution (it is vendor-sourced and correlational),
the *direction* is consistent: Google's AI surface is the schema-friendliest, because
it inherits the classic Search infrastructure that already consumes schema. Perplexity,
reading raw pages live and leaning on Reddit, gets little from JSON-LD. So Beacon's
schema check is most defensible when the user's target is Google AI Overviews.

### Signal — Structured/bulleted formatting: matters specifically for Claude

Claude is reported ~30% more likely to cite bullet-pointed, structured pages. This is
adjacent to Beacon's "heading outline coherence" check (signal 3) and supports keeping
that check, but reframes its value: it is a *Claude-and-extraction* signal, not a
universal one.

### Recency signals (article:modified_time, visible year): matter for Perplexity

Perplexity cited content <30 days old at an 82% rate, and visible "2026" year signals in
titles/headings reportedly lift citation ~30%. Beacon does **not** check recency at all
(no `article:modified_time` freshness check, no stale-content flag). For a tool whose
AEO category aims at "does this get cited," the absence of any recency signal is a
larger coverage gap than any single weak signal currently in the list. Flagged for the
recalibration draft.

## Adjacent standard check: should Beacon check `llms.txt`?

`llms.txt` is a proposed file (a curated markdown index of a site's content for LLMs).
It would be a natural candidate for Beacon's AEO category. The evidence says **do not
add it**:

- As of Q1 2026 no major AI company (OpenAI, Google, Anthropic, Meta, Mistral) has
  committed to reading or acting on `llms.txt` in production.
- Gary Illyes (Google) confirmed July 2025 that Google does not support it and is not
  planning to.
- Across 515M+ LLM-bot traffic events (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot,
  Google-Extended), the share of requests touching `/llms.txt` is statistically
  negligible.
- A 300,000-domain study (SE Ranking, Nov 2025) found implementing `llms.txt` does not
  improve AI citations measurably.

Conclusion: Beacon is correct to omit `llms.txt`. If a future contributor proposes
adding it, this artefact is the citation for rejecting it (revisit trigger: a major
answer engine publicly commits to consuming `llms.txt`).

Sources:
- https://ppc.land/llms-txt-adoption-stalls-as-major-ai-platforms-ignore-proposed-standard/
- https://ahrefs.com/blog/what-is-llms-txt/
- https://codersera.com/blog/llms-txt-complete-guide-2026/

## Takeaway for Beacon

The AEO category currently presents its signals as engine-agnostic. They are not. A more
honest framing — and a cheap improvement — would be a one-line note per signal stating
*which* engine it most affects, or at minimum a category-level disclaimer that "AEO
signal value varies by target answer engine; structured data favours Google AI
Overviews, content-in-HTML favours Perplexity/ChatGPT, recency favours Perplexity."
This matches Beacon's existing epistemic-honesty design principle (ARCHITECTURE §6f).

## Sources checked (consolidated)

- How each platform cites sources differently — https://discoveredlabs.com/blog/chatgpt-claude-perplexity-and-google-ai-overviews-how-each-platform-cites-sources-differently
- AI platform citation patterns — https://www.tryprofound.com/blog/ai-platform-citation-patterns
- ChatGPT vs Perplexity vs Google AI Overview citation preference — https://siteup.ai/blog/chatgpt-perplexity-google-ai-overview-citation-preference
- llms.txt adoption stalls — https://ppc.land/llms-txt-adoption-stalls-as-major-ai-platforms-ignore-proposed-standard/
- What is llms.txt — https://ahrefs.com/blog/what-is-llms-txt/
- llms.txt honest guide May 2026 — https://codersera.com/blog/llms-txt-complete-guide-2026/

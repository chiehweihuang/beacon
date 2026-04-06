# Accessibility Legal Quick Reference

Full reference: _yorozuya/research/international-accessibility-laws-reference.md

## By Jurisdiction

| Jurisdiction | Law | Standard | Covers | Penalty | Key Date |
|-------------|-----|----------|--------|---------|----------|
| US (federal) | Section 508 | WCAG 2.0 AA | Government ICT | Administrative complaint | Active |
| US (state/local gov) | ADA Title II | WCAG 2.1 AA | State/local gov websites | DOJ enforcement | **Apr 2026** (pop ≥50K) |
| US (private) | ADA Title III | WCAG 2.1 AA (de facto) | "Public accommodations" | Lawsuits (8,667 in 2025) | Active |
| EU | EAA + EN 301 549 | WCAG 2.1 AA+ | Public + private | Up to €1,000,000 | **Jun 2025** (in force) |
| Japan | 障害者差別解消法 | JIS X 8341-3 (≈WCAG 2.0 AA) | Public + **private (mandatory since 2024)** | ¥200,000 max | **Apr 2024** |
| Taiwan | 身心障礙者權益保障法 | WCAG 2.1-based | Government only | Administrative | Active |
| Canada | ACA + AODA | EN 301 549 v3.2.1 (federal), WCAG 2.0 AA (Ontario) | Public + large private | Up to CAD $250,000 | **Jun 2026** (large orgs report) |
| Australia | DDA | WCAG 2.2 AA (2025 guidance) | Public + private | Complaint → tribunal | Active |
| Kenya | KS 2952-1:2022 | First African national ICT a11y standard | Government ICT | TBD | Active |

## Risk by Numbers

- **8,667** ADA Title III lawsuits in US in 2025 (+37% vs 2024)
- **40%** increase in pro se (self-filed) lawsuits — AI tools help write complaints
- **69%** of US accessibility lawsuits target e-commerce
- **$6M+** NFB v. Target settlement (2008)
- **$1M** FTC fine against accessiBe for deceptive marketing (2025)
- Top 7 WCAG violations in lawsuits: missing alt text, empty links, missing form labels, low contrast, empty buttons, missing document language, missing skip links

## When to Flag Legal Risk

Flag in advisor output when:
1. A Level A criterion is violated → noncompliant under ALL jurisdictions
2. A Level AA criterion is violated → noncompliant under most jurisdictions
3. Project targets users in EU → EAA is in force NOW
4. Project targets US government → Section 508 applies
5. Project targets Japan → private sector "reasonable accommodation" is mandatory
6. CAPTCHA or overlay widget detected → known litigation triggers

## One-Line Summaries for Each Audience

- **lead**: "This violation exposes us to litigation in [X] jurisdictions. Average ADA lawsuit settlement: $50K-$100K."
- **dev**: "WCAG 2.2: [criterion] (Level [X]). Required by [laws]."
- **designer**: "This design choice excludes [disability category] users and violates [law]."

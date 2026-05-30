# Digital Document Accessibility

Beyond web pages, digital documents (PDF, EPUB, DOCX, XLSX, PPTX, ODT) are a major accessibility gap. Government agencies and enterprises distribute inaccessible documents daily despite standards existing for every format.

Reference: Jedi Lin's research (2023) analyzed 33 digital document formats and identified EPUB as optimal for accessibility.

---

## PDF Accessibility

### Standards

| Standard | Scope |
|----------|-------|
| **PDF/UA-1** (ISO 14289-1) | Tagged PDF structure for assistive technology |
| **PDF/UA-2** (ISO 14289-2) | Updated for PDF 2.0 features |
| **ISO/TS 32005** | Accessibility tag mapping |
| **Matterhorn Protocol** | 136 checkpoints for PDF/UA conformance testing |
| **Well-Tagged PDF (WTPDF)** | PDF Association best practices |

### Common Issues

- Missing tag structure (most common — document is "flat image" to screen readers)
- Incorrect reading order (visual layout vs logical order)
- Missing alt text on images/charts
- Table headers not marked with `<TH>` tags
- Missing document language
- Scanned documents without OCR layer

### Tools

- Adobe Acrobat Pro: built-in accessibility checker + tag editor
- PAC (PDF Accessibility Checker): free, tests against PDF/UA + WCAG
- axe PDF: Deque's PDF testing tool
- CommonLook: enterprise PDF remediation

### When to Flag

Flag when reviewing any workflow that generates or distributes PDF:
- Government forms and reports
- Financial statements, invoices
- Marketing materials, white papers
- Legal documents

---

## EPUB Accessibility

EPUB is the most accessibility-capable document format. Based on web standards (HTML/CSS), it inherits all WCAG capabilities.

### Standards

| Standard | Scope |
|----------|-------|
| **EPUB 3.3** (W3C) | Core specification |
| **EPUB Accessibility 1.1** (W3C) | Accessibility requirements for EPUB |
| **ISO/IEC 23736** | International standard for EPUB |
| **EPUB Fixed Layout Accessibility** (W3C) | For fixed-layout EPUBs |

### Why EPUB is Preferred (per Jedi Lin's 2023 research)

1. Supports all content types: text, images, audio, video, MathML, SVG
2. Built on HTML/CSS — inherits all web accessibility features
3. Mature open-source toolchain (Sigil, Calibre, Pandoc)
4. Reflowable content adapts to screen size and user preferences
5. Built-in support for text-to-speech, alternative text, page navigation
6. Established testing methodology (Ace by DAISY, epubcheck)

### Tools

- **Ace by DAISY**: automated EPUB accessibility checker
- **epubcheck**: W3C validation tool
- **Sigil**: open-source EPUB editor with accessibility features
- **Calibre**: conversion tool supporting accessible EPUB output

---

## Office Documents (DOCX, XLSX, PPTX)

### Standards

| Format | Standard |
|--------|----------|
| DOCX/XLSX/PPTX | ISO/IEC 29500-1 (OOXML) — includes accessibility best practices |
| ODT/ODS/ODP | ISO/IEC 26300-1 (ODF) — includes accessibility guidelines |

### Built-in Checkers

- **Microsoft Office**: Accessibility Checker (Review > Check Accessibility) — catches heading structure, alt text, table headers, reading order
- **LibreOffice**: ODF format supports accessibility features; validator available

### Common Issues

- Missing alt text on images (most common)
- No heading structure (content is styled visually but not semantically)
- Tables without header rows
- Poor color contrast in charts/graphs
- Slide reading order doesn't match visual layout (PowerPoint)
- Merged cells in spreadsheets break screen reader navigation

### When to Flag

Flag when users are:
- Creating templates for document generation
- Building automated report pipelines
- Distributing documents to the public
- Converting between formats (conversion often strips accessibility tags)

---

## Key Principle: Format Conversion Destroys Accessibility

Converting between formats (e.g., DOCX to PDF, HTML to PDF) frequently strips semantic structure. Each conversion step must be verified:

1. Source document must be accessible FIRST
2. Conversion tool must preserve tags/structure
3. Output must be independently verified

The most common failure: creating an accessible Word document, then "printing to PDF" — which produces a flat, untagged PDF with zero accessibility.

---

## Checklist for Document Workflows

- [ ] Source documents use semantic structure (headings, lists, tables with headers)
- [ ] All images have alt text
- [ ] Document language is set
- [ ] Reading order is logical
- [ ] Tables have header rows/columns
- [ ] Color is not the only means of conveying information
- [ ] Built-in accessibility checker passes before distribution
- [ ] If converting format: output independently verified
- [ ] If PDF: tagged and passes PAC/Matterhorn checks
- [ ] If distributing publicly: consider EPUB as more accessible alternative to PDF

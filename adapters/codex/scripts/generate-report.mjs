#!/usr/bin/env node
/**
 * a11y-audit HTML Report Generator
 *
 * Usage:
 *   node generate-report.mjs <audit-json-path> [--previous <old-audit-json>] [--output <path>]
 *
 * Input: audit-results.json (structured audit data)
 * Output: Interactive HTML report (Lighthouse-style)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node generate-report.mjs <audit-json> [--previous <old-json>] [--output <path>]');
  process.exit(1);
}

const auditPath = resolve(args[0]);
let previousPath = null;
let outputPath = null;

for (let i = 1; i < args.length; i++) {
  if (args[i] === '--previous' && args[i + 1]) previousPath = resolve(args[++i]);
  if (args[i] === '--output' && args[i + 1]) outputPath = resolve(args[++i]);
}

const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const previous = previousPath ? JSON.parse(readFileSync(previousPath, 'utf8')) : null;

/**
 * Build a filesystem-safe slug from audit.metadata.url, falling back to scope.
 * Examples:
 *   "https://tokyotaiwanradar.com/zh"   -> "tokyotaiwanradar.com-zh"
 *   "https://www.example.com/blog/post" -> "example.com-blog"
 *   undefined + scope "Homepage zh"     -> "homepage-zh"
 */
function buildSlug(audit) {
  const url = audit?.metadata?.url;
  if (url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      const firstSeg = (u.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || '').trim();
      const raw = firstSeg ? `${host}-${firstSeg}` : host;
      // Filesystem-safe: keep letters/digits/dot/hyphen; collapse others to hyphen
      return raw
        .replace(/[^A-Za-z0-9.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || null;
    } catch (e) {
      // Not a valid URL — fall through to scope-based slug
    }
  }
  const scope = audit?.metadata?.scope || '';
  const fromScope = scope
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return fromScope || null;
}

if (!outputPath) {
  const slug = buildSlug(audit);
  const date = audit.metadata?.date || 'latest';
  const parts = ['a11y-report', slug, date].filter(Boolean);
  outputPath = resolve(dirname(auditPath), `${parts.join('-')}.html`);
}

/**
 * I18N: centralized translation table.
 * Both languages render inline in the HTML; CSS hides the inactive one
 * via body[data-active-lang]. Category names are matched by cat.id
 * (falls back to cat.name when ID is unknown).
 */
const I18N = {
  zh: {
    // Tabs
    tab_overview: '總覽',
    tab_findings: '發現項',
    tab_legal: '法域脈絡',
    tab_methodology: '方法論與限制',
    tab_remediation: '修復計畫',
    // Section headings (suggestion-toned)
    h2_category_summary: '分類摘要',
    h2_critical: '建議優先處理',
    h2_warnings: '建議留意項目',
    h2_tips: '參考建議與最佳實踐',
    h2_remediation_priority: '修復優先序',
    h2_testing_recommendations: '測試建議',
    h2_legal_risk: '法域脈絡與 WCAG 對照',
    h2_manual_checks: '人工檢查項',
    h2_passed_checks: '通過項',
    h2_not_applicable_checks: '不適用項',
    h2_incomplete_checks: '未能判定項',
    // Table headers
    th_category: '分類',
    th_pass: '通過',
    th_fail: '待修',
    th_review: '待審',
    th_coverage: '覆蓋率',
    // Meta line
    meta_date: '日期',
    meta_scope: '範圍',
    meta_standard: '標準',
    meta_auditor: '審查者',
    // Verdict (suggestion-toned, not judgmental)
    verdict_pass: '達到基準',
    verdict_needs_work: '建議考慮改進',
    verdict_fail: '建議優先檢視',
    verdict_issues_found: '個發現項目',
    verdict_critical: '影響較大',
    verdict_warnings: '建議留意',
    verdict_tips: '參考建議',
    // Score ring
    ring_overall: '總分',
    ring_was: '上次',
    // Comparison banner
    cmp_current: '目前分數',
    cmp_previous: '上次分數',
    cmp_delta: '差距',
    cmp_issues: '問題數（目前 / 上次）',
    // Findings labels
    finding_affected: '可能受影響的使用者',
    finding_location: '位置',
    finding_fix: '建議調整',
    finding_legal: '法律參考',
    finding_before_after: '調整前 / 調整後',
    finding_before: '調整前',
    finding_after: '調整後',
    finding_affected_elements: '受影響元素',
    finding_selector: 'Selector',
    finding_snippet: 'Snippet',
    finding_reason: '原因',
    finding_learn_more: 'Learn more',
    finding_empty: '此分類目前無發現項目。',
    // Jurisdiction context
    legal_deadline: '截止日',
    legal_overall: '整體風險',
    // Remediation (suggestion-toned)
    rem_p0: 'P0 — 建議優先處理（Level A）',
    rem_p1: 'P1 — 建議在合理時程內處理（Level AA）',
    rem_p2: 'P2 — 可考慮處理（最佳實踐）',
    rem_empty: '目前無測試建議。',
    // Score table
    score_was_prefix: '上次',
    // Category names (matched by cat.id)
    cat_contrast: '色彩與對比',
    cat_keyboard: '鍵盤導覽',
    cat_screenreader: '螢幕閱讀器',
    cat_forms: '表單',
    cat_responsive: '響應式與回流',
    cat_touch: '觸控與目標尺寸',
    cat_cognitive: '認知',
    cat_motion: '動態與動畫',
    cat_media: '媒體',
    cat_agent: '代理可操作性與 AEO',
    cat_contrast_desc: '文字與 UI 對比、只靠顏色傳達資訊、深色模式與狀態對比。',
    cat_keyboard_desc: 'Tab order、focus indicator、keyboard trap、skip link，以及指標互動的鍵盤替代。',
    cat_screenreader_desc: 'Landmark、heading、alt text、name、role、ARIA、頁面語言與語意結構。',
    cat_forms_desc: 'Label、說明、錯誤訊息、autocomplete、required field 與 validation 行為。',
    cat_responsive_desc: '320px reflow、zoom、viewport、fixed width、fluid typography 與 layout overflow。',
    cat_touch_desc: '目標尺寸、間距、drag 替代、pointer gesture 與 orientation 假設。',
    cat_cognitive_desc: '一致導覽、help mechanism、易懂標籤、可預期流程與 dark pattern。',
    cat_motion_desc: 'prefers-reduced-motion、time limit、自動移動內容與互動動畫。',
    cat_media_desc: 'Caption、transcript、autoplay、audio control、flash 與替代內容。',
    cat_agent_desc: 'Schema.org、metadata、canonical、heading outline、可爬取內容、robots.txt、sitemap.xml、optional llms.txt 與 answer-engine clarity。',
  },
  en: {
    tab_overview: 'Overview',
    tab_findings: 'Findings',
    tab_legal: 'Jurisdiction Context',
    tab_methodology: 'Methodology & Limits',
    tab_remediation: 'Remediation',
    h2_category_summary: 'Category Summary',
    h2_critical: 'Priority Items',
    h2_warnings: 'Items to Note',
    h2_tips: 'Suggestions & Best Practices',
    h2_remediation_priority: 'Remediation Priority',
    h2_testing_recommendations: 'Testing Recommendations',
    h2_legal_risk: 'Jurisdiction Context & WCAG Mapping',
    h2_manual_checks: 'Manual Checks',
    h2_passed_checks: 'Passed Checks',
    h2_not_applicable_checks: 'Not Applicable Checks',
    h2_incomplete_checks: 'Incomplete Checks',
    th_category: 'Category',
    th_pass: 'Pass',
    th_fail: 'Adjust',
    th_review: 'Review',
    th_coverage: 'Coverage',
    meta_date: 'Date',
    meta_scope: 'Scope',
    meta_standard: 'Standard',
    meta_auditor: 'Auditor',
    verdict_pass: 'Meets baseline',
    verdict_needs_work: 'Consider improving',
    verdict_fail: 'Priority review recommended',
    verdict_issues_found: 'observations',
    verdict_critical: 'higher priority',
    verdict_warnings: 'to note',
    verdict_tips: 'suggestions',
    ring_overall: 'Overall',
    ring_was: 'was',
    cmp_current: 'Current Score',
    cmp_previous: 'Previous Score',
    cmp_delta: 'Delta',
    cmp_issues: 'Issues (now / was)',
    finding_affected: 'Users potentially affected',
    finding_location: 'Location',
    finding_fix: 'Suggested adjustment',
    finding_legal: 'Legal note',
    finding_before_after: 'Before / After',
    finding_before: 'Before',
    finding_after: 'After',
    finding_affected_elements: 'Affected DOM elements',
    finding_selector: 'Selector',
    finding_snippet: 'Snippet',
    finding_reason: 'Reason',
    finding_learn_more: 'Learn more',
    finding_empty: 'No observations in this category at the moment.',
    legal_deadline: 'Deadline',
    legal_overall: 'Overall Risk',
    rem_p0: 'P0 — Recommended priority (Level A)',
    rem_p1: 'P1 — Recommended in due course (Level AA)',
    rem_p2: 'P2 — Optional enhancement (Best Practices)',
    rem_empty: 'No testing recommendations at the moment.',
    score_was_prefix: 'was',
    cat_contrast: 'Color & Contrast',
    cat_keyboard: 'Keyboard Navigation',
    cat_screenreader: 'Screen Reader',
    cat_forms: 'Forms',
    cat_responsive: 'Responsive & Reflow',
    cat_touch: 'Touch & Targets',
    cat_cognitive: 'Cognitive',
    cat_motion: 'Motion & Animation',
    cat_media: 'Media',
    cat_agent: 'Agent Operability & AEO',
    cat_contrast_desc: 'Text and UI contrast ratios, color-only information, dark mode, and contrast-sensitive states.',
    cat_keyboard_desc: 'Tab order, focus indicators, keyboard traps, skip links, and keyboard alternatives for pointer interactions.',
    cat_screenreader_desc: 'Landmarks, heading structure, alt text, names, roles, ARIA, page language, and semantic structure.',
    cat_forms_desc: 'Labels, instructions, error messages, autocomplete, required fields, and validation behavior.',
    cat_responsive_desc: '320px reflow, zoom, viewport settings, fixed widths, fluid typography, and layout overflow.',
    cat_touch_desc: 'Target size, spacing, drag alternatives, pointer gestures, and orientation assumptions.',
    cat_cognitive_desc: 'Consistent navigation, help mechanisms, readable labels, predictable flows, and dark patterns.',
    cat_motion_desc: 'prefers-reduced-motion, time limits, auto-moving content, and animation from interaction.',
    cat_media_desc: 'Captions, transcripts, autoplay, audio control, flashing content, and media alternatives.',
    cat_agent_desc: 'Schema.org, metadata, canonical links, heading outline, crawlable content, robots.txt, sitemap.xml, optional llms.txt, and answer-engine clarity.',
  },
};

const FINDING_I18N = {
  'html-lang-missing': {
    zh: { title: '頁面語言缺失', description: 'HTML 頁面沒有宣告 lang attribute，assistive technology 可能使用錯誤的發音規則。', fix: '加入正確的語言 attribute，例如 <html lang="zh-Hant">。' },
    en: { title: 'Page language is missing', description: 'The HTML page does not declare a lang attribute, so assistive technology may choose the wrong pronunciation rules.', fix: 'Add a language attribute such as <html lang="zh-Hant"> or the correct document language.' },
  },
  'document-title-missing': {
    zh: { title: '文件標題缺失', description: '缺少或空白的 title 會讓頁面在瀏覽器與 assistive technology 中難以辨識。', fix: '加入簡短且唯一的 <title>。' },
    en: { title: 'Document title is missing', description: 'A missing or empty title makes the page difficult to identify in browser and assistive technology contexts.', fix: 'Add a concise, unique <title>.' },
  },
  'main-landmark-missing': {
    zh: { title: '靜態 markup 中看不到 main landmark', description: '靜態檔案中沒有找到 <main> 或 role="main"。', fix: '用 <main id="main-content"> 包住主要內容。' },
    en: { title: 'Main landmark is not statically visible', description: 'No <main> or role="main" was found in this static file.', fix: 'Wrap primary page content in <main id="main-content">.' },
  },
  'headings-missing': {
    zh: { title: '沒有 heading 結構', description: '靜態 markup 沒有 heading structure。', fix: '加入有意義的 h1 與描述頁面結構的巢狀 heading。' },
    en: { title: 'No headings found', description: 'The static markup has no heading structure.', fix: 'Add a meaningful h1 and nested headings that describe the page structure.' },
  },
  'heading-level-skipped': {
    zh: { title: 'Heading level 跳級', description: 'Heading hierarchy 有跳級，會影響用 heading 導覽的使用者。', fix: '使用連續的 heading hierarchy，或只調整視覺樣式而不改 semantic level。' },
    en: { title: 'Heading level is skipped', description: 'Heading hierarchy skips a level.', fix: 'Use a continuous heading hierarchy or adjust the visual style without changing semantic level.' },
  },
  'image-alt-missing': {
    zh: { title: '圖片缺少 alt text', description: '沒有 alt text 的圖片可能在 assistive technology 中沉默或被不清楚地朗讀。', fix: '為有意義的圖片加入 alt text；純裝飾圖片使用 alt=""。' },
    en: { title: 'Image is missing alt text', description: 'An image without alt text is silent or announced poorly by assistive technology.', fix: 'Add meaningful alt text, or alt="" for purely decorative images.' },
  },
  'list-non-li-child': {
    zh: { title: 'List 含有非 list-item 直接子元素', description: '<ul>/<ol> 的直接子元素不是 <li>、<script> 或 <template>，screen reader 可能無法正確朗讀 list 或 item count。', fix: '讓 <li> 成為唯一結構子元素；或在不可避免的非標準結構中使用 role="list"/role="listitem"。' },
    en: { title: 'List contains a non-list-item child', description: 'A <ul>/<ol> has a direct child that is not <li>, <script>, or <template>. Screen readers may not announce the list or its item count correctly.', fix: 'Make <li> the only structural child; move wrapper elements inside an <li>, or use role="list"/role="listitem" if a non-standard structure is unavoidable.' },
  },
  'button-name-missing': {
    zh: { title: 'Button 可能沒有 accessible name', description: '沒有可見文字或 accessible label 的 button 會讓使用者難以理解或用名稱操作。', fix: '加入可見文字、aria-label 或 aria-labelledby。' },
    en: { title: 'Button may not have an accessible name', description: 'A button with no visible text or accessible label is hard to understand or activate by name.', fix: 'Add visible text, aria-label, or aria-labelledby.' },
  },
  'link-name-missing': {
    zh: { title: 'Link 可能沒有 accessible name', description: 'Link 沒有可見文字、ARIA label、title、圖片 alt 或 SVG title 時，screen reader 可能只朗讀為一般 link。', fix: '加入可見 link text、aria-label/aria-labelledby/title、包裹圖片的 alt text，或 <svg><title>。' },
    en: { title: 'Link may not have an accessible name', description: 'A link with no visible text, no aria-label/aria-labelledby/title, and no image alt or SVG title has no accessible name.', fix: 'Add visible link text, an aria-label/aria-labelledby/title, give a wrapped <img> meaningful alt text, or add an <svg><title>.' },
  },
  'clickable-non-button': {
    zh: { title: '可點擊元素不是 button', description: '可點擊的 <div> 或 <span> 預設無法用鍵盤操作。', fix: '動作使用 <button>；若必須自訂語意，加入 role、tabindex 與 Enter/Space handling。' },
    en: { title: 'Clickable non-button element', description: 'Clickable <div> or <span> elements are not keyboard-operable by default.', fix: 'Use <button> for actions. If custom semantics are unavoidable, add role, tabindex, and Enter/Space handling.' },
  },
  'input-label-missing': {
    zh: { title: 'Input 可能缺少 accessible label', description: 'Input 在靜態 markup 中沒有明顯 id 或 ARIA label。', fix: '搭配 <label for="...">，或在已有可見 label 時使用 aria-labelledby。' },
    en: { title: 'Input may be missing an accessible label', description: 'The input has no obvious id or ARIA label in static markup.', fix: 'Pair it with a <label for="..."> or use aria-labelledby when a visible label already exists.' },
  },
  'viewport-meta-missing': {
    zh: { title: 'Viewport meta tag 缺失', description: '缺少 viewport meta tag 會讓 mobile layout 與 zoom 行為變得不可用。', fix: '加入 <meta name="viewport" content="width=device-width, initial-scale=1">。' },
    en: { title: 'Viewport meta tag is missing', description: 'Without a viewport meta tag, mobile layout and zoom behavior can become unusable.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.' },
  },
  'viewport-zoom-disabled': {
    zh: { title: 'Viewport meta 禁用 zoom', description: 'Viewport meta 阻止使用者放大文字。', fix: '移除 user-scalable=no 與低於 5 的 maximum-scale。' },
    en: { title: 'Viewport meta disables zoom', description: 'The viewport meta tag prevents zoom, so users cannot enlarge text.', fix: 'Remove user-scalable=no and any maximum-scale below 5; use content="width=device-width, initial-scale=1".' },
  },
  'meta-description-missing': {
    zh: { title: 'Meta description 缺失', description: '靜態 HTML 中沒有找到 meta description。', fix: '加入簡短且頁面專屬的 meta description。' },
    en: { title: 'Meta description is missing', description: 'No meta description was found in the static HTML.', fix: 'Add a concise page-specific meta description.' },
  },
  'canonical-missing': {
    zh: { title: 'Canonical link 缺失', description: '靜態 HTML 中沒有找到 canonical URL，crawler 可能需要自行推斷偏好的 URL。', fix: '為可索引公開頁加入 <link rel="canonical" href="https://example.com/preferred-url">。' },
    en: { title: 'Canonical link is missing', description: 'No canonical URL was found in the static HTML, so crawlers may have to infer the preferred URL.', fix: 'Add <link rel="canonical" href="https://example.com/preferred-url"> for indexable public pages.' },
  },
  'jsonld-missing': {
    zh: { title: 'JSON-LD structured data 缺失', description: '靜態 HTML 中沒有找到 JSON-LD structured data。', fix: '加入適合頁面的 Schema.org JSON-LD，例如 Organization、Article、FAQPage、Product、BreadcrumbList 或 WebSite。' },
    en: { title: 'JSON-LD structured data is missing', description: 'No JSON-LD structured data was found in the static HTML.', fix: 'Add page-appropriate Schema.org JSON-LD, such as Organization, Article, FAQPage, Product, BreadcrumbList, or WebSite.' },
  },
  'robots-txt-missing': {
    zh: { title: '掃描站點檔案中沒有 robots.txt', description: '掃描的目錄中沒有找到 robots.txt。Agent 與 crawler 對可存取範圍會缺少明確指引。', fix: '在 site root 加入 robots.txt。公開 AI-facing site 可考慮加入 sitemap 與符合政策的 Content-Signal directives。' },
    en: { title: 'robots.txt was not found in the scanned site files', description: 'No robots.txt file was found in the scanned directory. Agents and crawlers may have less explicit guidance about what they can access.', fix: 'Add a site-root robots.txt. For public AI-facing sites, consider explicit sitemap and Content-Signal directives that match your policy.' },
  },
  'sitemap-missing': {
    zh: { title: '掃描站點檔案中沒有 sitemap.xml', description: '掃描的目錄中沒有找到 sitemap.xml。', fix: '在 site root 加入 sitemap.xml，並從 robots.txt 參照它，讓 crawler 更容易找到重要公開 URL。' },
    en: { title: 'sitemap.xml was not found in the scanned site files', description: 'No sitemap.xml file was found in the scanned directory.', fix: 'Add a site-root sitemap.xml and reference it from robots.txt so crawlers can discover important public URLs.' },
  },
  'llms-txt-missing': {
    zh: { title: '掃描站點檔案中沒有 llms.txt', description: '掃描的目錄中沒有找到 llms.txt。這是 optional proposed convention，但可協助 agent 找到重要內容。', fix: '可考慮加入 site-root llms.txt，用純文字描述網站、重要頁面、docs、API 與 crawl/use policy。' },
    en: { title: 'llms.txt was not found in the scanned site files', description: 'No llms.txt file was found in the scanned directory. This proposed convention is optional, but can help agents find the most important content.', fix: 'Consider adding a site-root llms.txt that describes the site, key pages, docs, APIs, and crawl/use policy in plain text.' },
  },
  'focus-outline-removed': {
    zh: { title: 'Focus outline 被移除且沒有替代', description: '移除 outline 又沒有 :focus-visible 替代，會讓鍵盤位置不可見。', fix: '恢復 outline，或加入強烈且清楚的 :focus-visible style。' },
    en: { title: 'Focus outline removed without replacement', description: 'Removing outline without a :focus-visible replacement makes keyboard location invisible.', fix: 'Restore outline or add a strong :focus-visible style.' },
  },
  'fixed-minmax-overflow': {
    zh: { title: '固定 minmax grid 可能在窄螢幕 overflow', description: 'minmax(Npx, 1fr) 會保留固定最小寬度，可能在 320px overflow。', fix: '使用 minmax(min(Npx, 100%), 1fr)。' },
    en: { title: 'Fixed minmax grid can overflow narrow screens', description: 'minmax(Npx, 1fr) keeps a fixed minimum that can overflow at 320px.', fix: 'Use minmax(min(Npx, 100%), 1fr).' },
  },
  'motion-reduced-motion-missing': {
    zh: { title: '有 motion 但缺少 reduced-motion handling', description: '偵測到 animation 或 transition，但沒有 prefers-reduced-motion handling。', fix: '加入 @media (prefers-reduced-motion: reduce)，停用或縮短非必要 motion。' },
    en: { title: 'Motion exists without reduced-motion handling', description: 'Animation or transitions were detected, but no prefers-reduced-motion handling was found in this file.', fix: 'Add @media (prefers-reduced-motion: reduce) to disable or shorten non-essential motion.' },
  },
  'large-fixed-width': {
    zh: { title: '偵測到大型固定寬度', description: '大型固定寬度可能在窄 viewport overflow。', fix: '使用 max-width、min()、clamp() 或 container-relative sizing。' },
    en: { title: 'Large fixed width detected', description: 'Large fixed widths may overflow narrow viewports.', fix: 'Use max-width, min(), clamp(), or container-relative sizing.' },
  },
  'click-handler-keyboard-missing': {
    zh: { title: 'Click handler 附近缺少鍵盤處理', description: '偵測到 click listener，但同一段附近沒有鍵盤支援。', fix: '優先使用 native button，或加入 Enter/Space keyboard support 與 focus management。' },
    en: { title: 'Click handler lacks nearby keyboard handling', description: 'A click listener was found without nearby keyboard support in the same snippet.', fix: 'Prefer a native button, or add Enter/Space keyboard support and focus management.' },
  },
};

const DEFAULT_JURISDICTIONS = [
  { name: 'US ADA', law: 'ADA Title III / Section 508 context', detail: 'Use the mapped WCAG criteria as technical evidence; legal exposure depends on business model, sector, and jurisdiction-specific facts.' },
  { name: 'EU EAA', law: 'European Accessibility Act', detail: 'Use the mapped WCAG criteria as technical evidence for consumer digital-service accessibility planning.' },
  { name: 'Japan JIS', law: 'JIS X 8341-3 context', detail: 'Use the mapped WCAG criteria as technical evidence; confirm procurement or sector requirements separately.' },
  { name: 'Taiwan', law: 'Taiwan accessibility context', detail: 'Use the mapped WCAG criteria as technical evidence only; confirm current local program, certification, and seal requirements before making a compliance claim.' },
  { name: 'Canada ACA', law: 'Accessible Canada Act context', detail: 'Use the mapped WCAG criteria as technical evidence; applicability depends on organization type and regulated context.' },
  { name: 'Australia DDA', law: 'Disability Discrimination Act context', detail: 'Use the mapped WCAG criteria as technical evidence; legal assessment requires local context and counsel.' },
];

const WCAG_CRITERIA = {
  '1.1.1': { title: 'Non-text Content', url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html' },
  '1.3.1': { title: 'Info and Relationships', url: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html' },
  '1.3.2': { title: 'Meaningful Sequence', url: 'https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html' },
  '1.4.1': { title: 'Use of Color', url: 'https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html' },
  '1.4.3': { title: 'Contrast (Minimum)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html' },
  '1.4.4': { title: 'Resize Text', url: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html' },
  '1.4.10': { title: 'Reflow', url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html' },
  '1.4.11': { title: 'Non-text Contrast', url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html' },
  '2.1.1': { title: 'Keyboard', url: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html' },
  '2.1.2': { title: 'No Keyboard Trap', url: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html' },
  '2.2.2': { title: 'Pause, Stop, Hide', url: 'https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html' },
  '2.4.1': { title: 'Bypass Blocks', url: 'https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html' },
  '2.4.2': { title: 'Page Titled', url: 'https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html' },
  '2.4.4': { title: 'Link Purpose (In Context)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html' },
  '2.4.6': { title: 'Headings and Labels', url: 'https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html' },
  '2.4.7': { title: 'Focus Visible', url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html' },
  '2.5.3': { title: 'Label in Name', url: 'https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html' },
  '2.5.8': { title: 'Target Size (Minimum)', url: 'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html' },
  '3.1.1': { title: 'Language of Page', url: 'https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html' },
  '3.3.1': { title: 'Error Identification', url: 'https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html' },
  '3.3.2': { title: 'Labels or Instructions', url: 'https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html' },
  '4.1.2': { title: 'Name, Role, Value', url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html' },
};

const AXE_RULE_CATEGORY = {
  'aria-allowed-attr': 'screenreader',
  'aria-allowed-role': 'screenreader',
  'aria-command-name': 'keyboard',
  'aria-dialog-name': 'screenreader',
  'aria-hidden-body': 'screenreader',
  'aria-hidden-focus': 'keyboard',
  'aria-input-field-name': 'forms',
  'aria-required-attr': 'screenreader',
  'aria-required-children': 'screenreader',
  'aria-required-parent': 'screenreader',
  'aria-roles': 'screenreader',
  'aria-toggle-field-name': 'forms',
  'aria-valid-attr': 'screenreader',
  'aria-valid-attr-value': 'screenreader',
  'button-name': 'keyboard',
  bypass: 'keyboard',
  'color-contrast': 'contrast',
  'document-title': 'screenreader',
  'duplicate-id': 'screenreader',
  'empty-heading': 'screenreader',
  'form-field-multiple-labels': 'forms',
  'frame-title': 'screenreader',
  'heading-order': 'screenreader',
  'html-has-lang': 'screenreader',
  'html-lang-valid': 'screenreader',
  'image-alt': 'screenreader',
  label: 'forms',
  'label-content-name-mismatch': 'forms',
  'landmark-one-main': 'screenreader',
  'landmark-unique': 'screenreader',
  'link-in-text-block': 'cognitive',
  'link-name': 'screenreader',
  list: 'screenreader',
  listitem: 'screenreader',
  'meta-viewport': 'responsive',
  'meta-viewport-large': 'responsive',
  'nested-interactive': 'keyboard',
  'page-has-heading-one': 'screenreader',
  region: 'screenreader',
  'scrollable-region-focusable': 'keyboard',
  'target-size': 'touch',
  'video-caption': 'media',
};

const DEFAULT_MANUAL_CHECKS = [
  {
    id: 'disabled-user-testing',
    category: 'User research',
    zhTitle: '與障礙使用者一同測試',
    enTitle: 'Test with disabled users',
    zhWhy: '自動化工具無法證明真實任務能否完成。',
    enWhy: 'Automation cannot prove real task completion.',
    zhHow: '至少安排螢幕閱讀器、鍵盤-only、低視力或認知障礙使用者完成核心流程。',
    enHow: 'Have screen-reader, keyboard-only, low-vision, or cognitive-disability users complete the core flow.',
  },
  {
    id: 'screen-reader-task',
    category: 'Assistive technology',
    zhTitle: '螢幕閱讀器核心任務 walkthrough',
    enTitle: 'Screen-reader core-task walkthrough',
    zhWhy: '有 name/role 不代表朗讀順序、狀態更新與任務路徑真的清楚。',
    enWhy: 'Name/role checks do not prove reading order, state updates, or task flow clarity.',
    zhHow: '用 VoiceOver、NVDA 或 TalkBack 只靠聽覺完成主要任務並記錄卡點。',
    enHow: 'Use VoiceOver, NVDA, or TalkBack to complete the primary task by listening only; record blockers.',
  },
  {
    id: 'keyboard-path',
    category: 'Keyboard',
    zhTitle: '鍵盤-only 路徑與 focus 管理',
    enTitle: 'Keyboard-only path and focus management',
    zhWhy: 'Tab 順序、modal 關閉後 focus 返回、SPA route focus 都需要執行時確認。',
    enWhy: 'Tab order, modal return focus, and SPA route focus require runtime confirmation.',
    zhHow: '用 Tab、Shift+Tab、Enter、Space、方向鍵走完核心流程。',
    enHow: 'Complete the core flow with Tab, Shift+Tab, Enter, Space, and arrow keys.',
  },
  {
    id: 'zoom-reflow',
    category: 'Responsive',
    zhTitle: '320px + 200% zoom reflow',
    enTitle: '320px + 200% zoom reflow',
    zhWhy: '靜態審查無法可靠證明窄螢幕與放大同時成立。',
    enWhy: 'Static review cannot reliably prove narrow viewport plus zoom behavior.',
    zhHow: '在 320px viewport 與 200% zoom 檢查是否無雙向捲動、遮擋或內容遺失。',
    enHow: 'At 320px viewport and 200% zoom, check for no two-axis scrolling, clipping, or lost content.',
  },
  {
    id: 'cognitive-clarity',
    category: 'Cognitive',
    zhTitle: '認知負荷與文案清楚度',
    enTitle: 'Cognitive load and copy clarity',
    zhWhy: '規則可以通過，但選項過多、錯誤訊息抽象或流程不可預期仍會阻擋使用者。',
    enWhy: 'Rules can pass while dense choices, abstract errors, or unpredictable flow still block users.',
    zhHow: '請目標使用者解釋下一步要做什麼，並檢查 error/help text 是否能引導行動。',
    enHow: 'Ask target users to explain the next step and verify that error/help text guides action.',
  },
];

/** Wrap two strings in bilingual spans; CSS hides the inactive language. */
function bi(zh, en) {
  return `<span class="lang-zh" lang="zh-Hant">${zh}</span><span class="lang-en" lang="en">${en}</span>`;
}

/** Look up an I18N key in both languages and return as bilingual spans. */
function t(key) {
  return bi(I18N.zh[key] || key, I18N.en[key] || key);
}

/** Render a category's name bilingually: I18N table by id, fall back to cat.name. */
function catName(cat) {
  const id = cat?.id || '';
  const zh = I18N.zh[`cat_${id}`] || cat?.name || id;
  const en = I18N.en[`cat_${id}`] || cat?.name || id;
  return bi(zh, en);
}

function catDesc(cat) {
  const id = cat?.id || '';
  const zh = I18N.zh[`cat_${id}_desc`];
  const en = I18N.en[`cat_${id}_desc`];
  return zh && en ? bi(zh, en) : '';
}

function findingText(f, field) {
  const keyed = f?.key ? FINDING_I18N[f.key] : null;
  if (!keyed) return escapeHtml(f?.[field] || '');
  const zh = keyed.zh?.[field] || f?.[field] || '';
  const en = keyed.en?.[field] || f?.[field] || '';
  return bi(escapeHtml(zh), escapeHtml(en));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getAxeResults(audit) {
  const candidates = [
    audit?.axe,
    audit?.axe_results,
    audit?.axeResults,
    audit?.tier2_axe,
    audit?.tier2?.axe,
    audit?.live_audit?.axe,
    audit?.metadata?.axe_results,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate !== 'object') continue;
    const violations = Array.isArray(candidate.violations)
      ? candidate.violations
      : Array.isArray(candidate.details)
        ? candidate.details
        : [];
    const passes = asArray(candidate.passes || candidate.pass);
    const inapplicable = asArray(candidate.inapplicable || candidate.not_applicable || candidate.notApplicable);
    const incomplete = asArray(candidate.incomplete || candidate.review);
    const counts = {
      violations: Array.isArray(candidate.violations) ? candidate.violations.length : Number(candidate.violations || violations.length || 0),
      passes: Array.isArray(candidate.passes) ? candidate.passes.length : Number(candidate.passes || passes.length || 0),
      inapplicable: Array.isArray(candidate.inapplicable) ? candidate.inapplicable.length : Number(candidate.inapplicable || candidate.not_applicable || candidate.notApplicable || inapplicable.length || 0),
      incomplete: Array.isArray(candidate.incomplete) ? candidate.incomplete.length : Number(candidate.incomplete || incomplete.length || 0),
    };
    if (violations.length || passes.length || inapplicable.length || incomplete.length || Object.values(counts).some(Boolean)) {
      return { violations, passes, inapplicable, incomplete, counts, raw: candidate };
    }
  }
  return null;
}

function criterionIdsFromTags(tags = []) {
  const ids = new Set();
  for (const tag of tags) {
    const m = String(tag).match(/^wcag(\d)(\d)(\d+)$/i);
    if (m) ids.add(`${m[1]}.${m[2]}.${m[3]}`);
  }
  return [...ids];
}

function criterionIdsFromText(text = '') {
  const ids = new Set();
  for (const m of String(text).matchAll(/\b([1-4]\.\d\.\d{1,2})\b/g)) ids.add(m[1]);
  return [...ids];
}

function criteriaFromFinding(f) {
  return [
    ...criterionIdsFromText(f?.wcag || ''),
    ...criterionIdsFromTags(f?.tags || []),
  ];
}

function criteriaLabel(ids) {
  return ids.map(id => {
    const known = WCAG_CRITERIA[id];
    return known ? `${id} ${known.title}` : id;
  }).join('; ');
}

function wcagFromAxeRule(rule) {
  const ids = criterionIdsFromTags(rule.tags || []);
  if (!ids.length) return rule.tags?.includes('best-practice') ? 'Best Practice' : 'axe-core rule';
  return `WCAG 2.2: ${criteriaLabel(ids)}`;
}

function levelFromAxeRule(rule) {
  const tags = rule.tags || [];
  if (tags.includes('wcag2aaa') || tags.includes('wcag21aaa') || tags.includes('wcag22aaa')) return 'AAA';
  if (tags.includes('wcag2aa') || tags.includes('wcag21aa') || tags.includes('wcag22aa')) return 'AA';
  if (tags.includes('wcag2a') || tags.includes('wcag21a') || tags.includes('wcag22a')) return 'A';
  return rule.tags?.includes('best-practice') ? 'Best Practice' : 'Review';
}

function severityFromAxeRule(rule) {
  if (rule.id === 'color-contrast') return 'warning';
  if (rule.impact === 'critical' || rule.impact === 'serious') return 'critical';
  if (rule.impact === 'moderate') return 'warning';
  return 'tip';
}

function categoryFromAxeRule(rule) {
  if (AXE_RULE_CATEGORY[rule.id]) return AXE_RULE_CATEGORY[rule.id];
  const tags = rule.tags || [];
  if (tags.includes('cat.color')) return 'contrast';
  if (tags.includes('cat.forms')) return 'forms';
  if (tags.includes('cat.keyboard')) return 'keyboard';
  if (tags.includes('cat.time-and-media')) return 'media';
  if (tags.includes('cat.text-alternatives') || tags.includes('cat.name-role-value') || tags.includes('cat.aria') || tags.includes('cat.parsing') || tags.includes('cat.semantics')) return 'screenreader';
  if (/viewport|reflow|zoom/i.test(rule.id || '')) return 'responsive';
  if (/target|touch|pointer/i.test(rule.id || '')) return 'touch';
  return 'screenreader';
}

function normalizeAxeTarget(target) {
  if (Array.isArray(target)) return target.join(', ');
  if (target && typeof target === 'object') return JSON.stringify(target);
  return target || '';
}

function normalizeAxeNode(node) {
  const nested = node?.node || {};
  const selector = normalizeAxeTarget(node?.target || node?.selector || nested.selector || nested.path);
  const html = node?.html || node?.snippet || nested.snippet || '';
  const reason = node?.failureSummary || node?.explanation || nested.explanation || '';
  return {
    selector,
    html,
    reason,
  };
}

function axeViolationToFinding(rule, index) {
  const nodes = asArray(rule.nodes);
  const criteria = criterionIdsFromTags(rule.tags || []);
  return {
    id: `axe-${rule.id || index}`,
    key: rule.id || undefined,
    source: 'axe',
    axe_rule_id: rule.id || undefined,
    category: categoryFromAxeRule(rule),
    severity: severityFromAxeRule(rule),
    wcag: wcagFromAxeRule(rule),
    level: levelFromAxeRule(rule),
    title: rule.help || rule.description || rule.id || 'axe-core finding',
    affected_users: 'Users of assistive technology, keyboard navigation, low-vision settings, or other access adaptations depending on the failed rule.',
    location: nodes.length ? `${nodes.length} affected DOM element(s)` : 'Runtime DOM',
    description: rule.description || rule.help || `axe-core rule ${rule.id || index} failed.`,
    fix: rule.help ? `Resolve the axe-core rule "${rule.help}" for every listed DOM element.` : 'Review and remediate every listed DOM element.',
    legal_exposure: criteria.length
      ? `Technical mapping: ${criteriaLabel(criteria)}. This is not a legal conclusion.`
      : 'Technical accessibility finding. Legal exposure depends on site context and jurisdiction.',
    helpUrl: rule.helpUrl,
    tags: rule.tags || [],
    axe_node_count: nodes.length,
    instances: nodes.map(normalizeAxeNode),
    code_before: nodes[0]?.html || nodes[0]?.snippet || '',
  };
}

function buildReportFindings(audit) {
  const baseFindings = asArray(audit.findings);
  const axe = getAxeResults(audit);
  if (!axe?.violations?.length) return baseFindings;
  const axeFindings = axe.violations.map(axeViolationToFinding);
  const axeIds = new Set(axeFindings.map(f => f.axe_rule_id).filter(Boolean));
  const supplemental = baseFindings.filter(f => {
    const id = f.axe_rule_id || f.axe_rule || f.key || f.id;
    return !id || !axeIds.has(id);
  });
  return [...axeFindings, ...supplemental];
}

function learnMoreLinks(f) {
  const links = [];
  if (f?.helpUrl) links.push({ href: f.helpUrl, label: f.axe_rule_id ? `axe: ${f.axe_rule_id}` : 'axe rule' });
  for (const id of criteriaFromFinding(f)) {
    const known = WCAG_CRITERIA[id];
    if (known?.url) links.push({ href: known.url, label: `WCAG ${id}` });
  }
  const seen = new Set();
  return links.filter(link => {
    if (seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
}

function collectCriteria(findings) {
  const ids = new Set();
  for (const f of findings || []) {
    for (const id of criteriaFromFinding(f)) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function buildJurisdictions(legal) {
  const byName = new Map(DEFAULT_JURISDICTIONS.map(j => [j.name, j]));
  for (const j of asArray(legal?.jurisdictions)) {
    if (!j?.name) continue;
    byName.set(j.name, { ...(byName.get(j.name) || {}), ...j });
  }
  return [...byName.values()];
}

const reportFindings = buildReportFindings(audit);
const axeResults = getAxeResults(audit);
const reportCounts = {
  total: reportFindings.length,
  critical: reportFindings.filter(f => f.severity === 'critical').length,
  warnings: reportFindings.filter(f => f.severity === 'warning').length,
  tips: reportFindings.filter(f => f.severity === 'tip').length,
};


function scoreColor(score) {
  if (score >= 90) return 'var(--pass)';
  if (score >= 50) return 'var(--warn)';
  return 'var(--fail)';
}

function scoreLabel(score) {
  // Returns a bilingual span; choose key based on score band
  if (score >= 90) return t('verdict_pass');
  if (score >= 50) return t('verdict_needs_work');
  return t('verdict_fail');
}

function riskColor(level) {
  const map = { critical: '#8b1a1a', high: '#8b1a1a', medium: '#6b4000', low: '#155a1e' };
  return map[level] || '#888';
}

function deltaArrow(current, prev) {
  if (prev === null || prev === undefined) return '';
  const diff = current - prev;
  if (diff > 0) return `<span class="delta positive">+${diff}</span>`;
  if (diff < 0) return `<span class="delta negative">${diff}</span>`;
  return '<span class="delta neutral">--</span>';
}

function buildCategoryRows(categories, prevCategories) {
  return categories.map(cat => {
    const prev = prevCategories?.find(p => p.id === cat.id);
    const prevPass = prev ? prev.pass : null;
    const prevFail = prev ? prev.fail : null;
    const prevScore = prev ? prev.score : null;
    return `
      <tr class="category-row" data-category="${cat.id}" tabindex="0" role="button" aria-expanded="false" aria-controls="detail-${cat.id}">
        <td class="cat-name"><div class="category-cell"><strong>${catName(cat)}</strong>${catDesc(cat) ? `<span class="category-desc">${catDesc(cat)}</span>` : ''}</div></td>
        <td class="num pass">${cat.pass} ${deltaArrow(cat.pass, prevPass)}</td>
        <td class="num fail">${cat.fail} ${deltaArrow(cat.fail, prevFail)}</td>
        <td class="num review">${cat.review || 0}</td>
        <td>
          <div class="score-bar">
            <div class="score-fill" style="width:${cat.score}%;background:${scoreColor(cat.score)}"></div>
            <span class="score-text">${cat.score}%</span>
          </div>
          ${prevScore !== null ? `<div class="prev-score">${t('score_was_prefix')} ${prevScore}%</div>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function buildFindingsHTML(findings) {
  if (!findings || findings.length === 0) return `<p class="empty">${t('finding_empty')}</p>`;
  return findings.map(f => {
    const severityClass = f.severity === 'critical' ? 'critical' : f.severity === 'warning' ? 'warning' : 'tip';
    const icon = f.severity === 'critical' ? '&#x1F534;' : f.severity === 'warning' ? '&#9888;' : '&#x1F4A1;';
    const evidenceOpen = f.instances?.length ? ' open' : '';
    return `
      <div class="finding ${severityClass}">
        <div class="finding-header">
          <span class="severity-icon">${icon}</span>
          <strong>${findingText(f, 'title')}</strong>
          <span class="wcag-tag">${escapeHtml(f.wcag || '')}</span>
          <span class="level-tag">${escapeHtml(f.level || '')}</span>
        </div>
        <div class="finding-body">
          <p><strong>${t('finding_affected')}:</strong> ${escapeHtml(f.affected_users || 'N/A')}</p>
          <p><strong>${t('finding_location')}:</strong> <code>${escapeHtml(f.location || 'N/A')}</code></p>
          <p>${findingText(f, 'description')}</p>
          ${f.fix ? `<div class="fix"><strong>${t('finding_fix')}:</strong> ${findingText(f, 'fix')}</div>` : ''}
          ${f.legal_exposure ? `<div class="legal"><strong>${t('finding_legal')}:</strong> ${escapeHtml(f.legal_exposure)}</div>` : ''}
          ${buildLearnMoreHTML(f)}
          ${f.instances?.length || f.code_before ? `<details${evidenceOpen}><summary>${t('finding_before_after')}</summary>${buildAffectedElementsHTML(f)}${f.code_before ? `<div class="code-compare"><div class="code-before"><div class="code-label">${t('finding_before')}</div><pre><code>${escapeHtml(f.code_before)}</code></pre></div><div class="code-after"><div class="code-label">${t('finding_after')}</div><pre><code>${escapeHtml(f.code_after || '')}</code></pre></div></div>` : ''}</details>` : ''}
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAffectedElementsHTML(f) {
  if (!f.instances?.length) return '';
  return `
    <div class="affected-elements">
      <h4>${t('finding_affected_elements')} <span class="count">(${f.instances.length})</span></h4>
      <ol>
        ${f.instances.map((item, idx) => `
          <li>
            <div><strong>${t('finding_selector')} #${idx + 1}:</strong> <code>${escapeHtml(item.selector || 'N/A')}</code></div>
            ${item.html ? `<div class="dom-snippet"><strong>${t('finding_snippet')}:</strong><pre><code>${escapeHtml(item.html)}</code></pre></div>` : ''}
            ${item.reason ? `<div class="node-reason"><strong>${t('finding_reason')}:</strong><pre>${escapeHtml(item.reason)}</pre></div>` : ''}
          </li>
        `).join('')}
      </ol>
    </div>`;
}

function buildLearnMoreHTML(f) {
  const links = learnMoreLinks(f);
  if (!links.length) return '';
  return `
    <p class="learn-more"><strong>${t('finding_learn_more')}:</strong>
      ${links.map(link => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join(' ')}
    </p>`;
}

function buildLegalRiskHTML(legal, findings) {
  const criteria = collectCriteria(findings);
  const criteriaText = criteria.length ? criteriaLabel(criteria) : 'No WCAG criteria were mapped by this audit.';
  const jurisdictions = buildJurisdictions(legal);
  return `
    <div class="legal-risk-panel">
      <h3>${t('h2_legal_risk')}</h3>
      <div class="legal-context-note">
        <div class="lang-zh" lang="zh-Hant">
          本頁提供的是<strong>法域脈絡與 WCAG 技術準則對照</strong>，不是法律意見，也不是依 warning 數量計算的法律風險分數。
          本次 findings 對應的準則：<strong>${escapeHtml(criteriaText)}</strong>。
        </div>
        <div class="lang-en" lang="en">
          This page provides <strong>jurisdiction context and WCAG technical mapping</strong>, not legal advice and not a warning-count-derived legal conclusion.
          Criteria mapped by this audit: <strong>${escapeHtml(criteriaText)}</strong>.
        </div>
      </div>
      <div class="risk-grid">
        ${jurisdictions.map(j => `
          <div class="risk-card">
            <div class="risk-header">
              <strong>${escapeHtml(j.name || '')}</strong>
              <span class="context-badge">Context</span>
            </div>
            <p>${escapeHtml(j.law || '')} &mdash; ${escapeHtml(j.detail || '')}</p>
            ${j.deadline ? `<p class="deadline">${t('legal_deadline')}: ${escapeHtml(j.deadline)}</p>` : ''}
            <p class="criteria-map"><strong>WCAG:</strong> ${escapeHtml(criteriaText)}</p>
          </div>`).join('')}
      </div>
    </div>`;
}

function buildContextBanner() {
  return `
    <div class="audit-context-banner" role="note" aria-label="Audit limitations notice">
      <div class="lang-zh" lang="zh-Hant">
        <div class="banner-title">&#9888; 閱讀分數前的脈絡說明</div>
        <p>
          這是一份<strong>AI 輔助的自動化基線審查</strong>。依目前的業界資料（包含 axe-core 團隊自己的說明），自動化工具大約能涵蓋
          <strong>30&ndash;40% 的 WCAG 項目</strong>。其餘 60&ndash;70%&mdash;例如認知負荷、真實螢幕閱讀器任務達成率、
          動態互動品質、瀏覽器深色模式覆寫下的效能體驗、以及標籤文字是否<em>真的易懂</em>&mdash;
          較適合透過<strong>與障礙使用者一同測試</strong>來確認，不能交給 AI 單獨判定。
        </p>
        <p class="banner-cta">
          較高的分數，本身還不足以充分代表網站完全可達。可一併參閱 <strong>Methodology &amp; Limits</strong> 分頁，
          了解本審查擅長與不擅長的範疇、以及建議的工作流程。Beacon 產生的 audit artifacts 會留在本機，除非你明確分享；detector 的進步來自維護者離線迭代與 plugin 更新。
        </p>
      </div>
      <div class="lang-en" lang="en">
        <div class="banner-title">&#9888; Context Before Reading the Score</div>
        <p>
          This is an <strong>AI-assisted automated baseline audit</strong>. Based on current industry data
          (including statements from the axe-core team itself), automated tools cover roughly
          <strong>30&ndash;40% of WCAG criteria</strong>. The remaining 60&ndash;70% &mdash; cognitive load,
          real screen-reader task completion, dynamic interaction quality, performance experience
          under user-agent dark-mode overrides, whether labels are actually <em>understandable</em>
          &mdash; are better confirmed through <strong>testing alongside disabled users</strong>, not by AI alone.
        </p>
        <p class="banner-cta">
          A high score, on its own, does not yet fully demonstrate accessibility. You can pair this
          report with the <strong>Methodology &amp; Limits</strong> tab to see what this audit
          is well-suited and less-suited for, plus the recommended workflow. Beacon keeps audit
          artifacts local unless you explicitly share them; detector improvements come from
          maintainer-run offline iteration and plugin updates.
        </p>
      </div>
    </div>`;
}

// AEO sub-score honesty note. Echoes buildContextBanner()'s epistemic stance but
// scoped to the Agent/AEO category detail — it appears exactly where the reader
// sees the AEO sub-score, not at report top. AEO findings are actionable
// structural recommendations; the score remains an eligibility proxy, never
// proof of actual citation outcomes.
function buildAeoDisclaimer() {
  return `
    <div class="aeo-disclaimer" role="note" aria-label="AEO sub-score interpretation note">
      <div class="lang-zh" lang="zh-Hant">
        <div class="aeo-disclaimer-title">&#9888; 關於 AEO 子分數的解讀</div>
        <p>
          AEO 子分數衡量的是<strong>agent 可以協助改善的可引用性前置條件</strong>，例如 JSON-LD、
          meta tags、canonical、Open Graph、heading outline 與內容可爬取性。這些是實際可處理的建議，
          但<strong>不是實際引用結果</strong>；結構齊全只代表「比較具備被引用的條件」，不代表 AI 引擎已經引用你的內容。
        </p>
        <p class="aeo-disclaimer-cta">
          因此本段的 finding 可以當成結構修復清單。實務流程是：先修 Beacon 找到的結構問題；若是公開站，
          再用外部 agent-readiness scanner（例如 Cloudflare 的 isitagentready.com 或 URL Scanner Agent Readiness）
          交叉檢查 robots.txt、sitemap、Markdown negotiation、Content Signals、MCP/API/OAuth discovery 等 agent-facing
          標準；最後才用 <strong>server log 的 AI 爬蟲記錄</strong>、<strong>手動在 answer engine 查詢</strong>、
          以及 <strong>analytics 的 referral 來源</strong>確認引用效果是否真的發生。外部 scanner 可以補強或取代部分結構檢查，
          但不能取代實際效果量測。
        </p>
      </div>
      <div class="lang-en" lang="en">
        <div class="aeo-disclaimer-title">&#9888; Reading the AEO Sub-score</div>
        <p>
          The AEO sub-score measures <strong>actionable citation-readiness prerequisites</strong>
          an agent can help improve, such as JSON-LD, meta tags, canonical links, Open Graph,
          heading outline, and crawlable content. These are real structural recommendations, but
          <strong>not actual citation outcomes</strong>. Complete structure means "more eligible to
          be cited", not that any AI engine has cited your content.
        </p>
        <p class="aeo-disclaimer-cta">
          Treat the findings in this section as a structural fix list. A practical workflow is:
          fix the structural issues Beacon found; for public sites, cross-check with an external
          agent-readiness scanner such as Cloudflare's isitagentready.com or URL Scanner Agent
          Readiness for robots.txt, sitemap, Markdown negotiation, Content Signals, MCP/API/OAuth
          discovery, and similar agent-facing standards; then confirm whether impact happened by
          checking <strong>AI-crawler hits in server logs</strong>, <strong>manual queries on answer
          engines</strong>, and <strong>referral sources in analytics</strong>. External scanners can
          supplement or replace parts of the structural check, but they cannot replace outcome
          measurement.
        </p>
      </div>
    </div>`;
}

function manualCheckText(check, field) {
  const zh = check[`zh${field}`] || check[field.toLowerCase()] || '';
  const en = check[`en${field}`] || check[field.toLowerCase()] || '';
  return bi(escapeHtml(zh), escapeHtml(en));
}

function buildManualChecksHTML(audit) {
  const checks = asArray(audit.manual_checks).length ? audit.manual_checks : DEFAULT_MANUAL_CHECKS;
  return `
    <section class="manual-checks" aria-labelledby="manual-checks-title">
      <h3 id="manual-checks-title">${t('h2_manual_checks')}</h3>
      <p class="section-intro">
        ${bi(
          '這些項目需要人類判斷、實機操作或與障礙使用者一起測試；不應由自動化分數取代。',
          'These items require human judgement, real-device operation, or testing alongside disabled users; they should not be replaced by an automated score.'
        )}
      </p>
      <div class="manual-check-grid">
        ${checks.map(check => `
          <article class="manual-check-card">
            <div class="manual-check-meta">${escapeHtml(check.category || 'Manual')}</div>
            <h4>${manualCheckText(check, 'Title')}</h4>
            <p><strong>${bi('為什麼要檢查：', 'Why check:')}</strong> ${manualCheckText(check, 'Why')}</p>
            <p><strong>${bi('怎麼檢查：', 'How to check:')}</strong> ${manualCheckText(check, 'How')}</p>
          </article>
        `).join('')}
      </div>
    </section>`;
}

function ruleTitle(rule) {
  return escapeHtml(rule.help || rule.description || rule.id || 'axe-core rule');
}

function buildAxeRuleList(rules, count, titleKey, emptyText) {
  const actualCount = Number.isFinite(count) ? count : rules.length;
  if (!rules.length) {
    return `<details class="axe-outcome-list"><summary>${t(titleKey)} (${actualCount || 0})</summary><p class="empty">${emptyText}</p></details>`;
  }
  return `
    <details class="axe-outcome-list">
      <summary>${t(titleKey)} (${actualCount})</summary>
      <ul>
        ${rules.map(rule => `
          <li>
            <strong>${ruleTitle(rule)}</strong>
            <span class="rule-id">${escapeHtml(rule.id || '')}</span>
            ${rule.helpUrl ? `<a href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noopener noreferrer">${t('finding_learn_more')}</a>` : ''}
            ${criteriaFromFinding(rule).length ? `<span class="rule-criteria">${escapeHtml(criteriaLabel(criteriaFromFinding(rule)))}</span>` : ''}
          </li>
        `).join('')}
      </ul>
    </details>`;
}

function buildAxeEvidenceHTML(audit) {
  const axe = getAxeResults(audit);
  if (!axe) {
    if (!audit.metadata?.requires_live_audit) return '';
    return `
      <section class="axe-evidence">
        <h3>${bi('Live audit evidence', 'Live Audit Evidence')}</h3>
        <p class="empty">
          ${bi(
            '本次 JSON 沒有完整 axe 結果。這是 Tier-1 fallback，contrast、visibility 與 runtime DOM 狀態需要 live browser audit。',
            'This JSON does not include full axe results. This is a Tier-1 fallback; contrast, visibility, and runtime DOM state require a live browser audit.'
          )}
        </p>
      </section>`;
  }
  return `
    <section class="axe-evidence">
      <h3>${bi('Live audit evidence', 'Live Audit Evidence')}</h3>
      <p class="section-intro">
        ${bi(
          '以下清單直接來自 axe 結果；違規項的 DOM nodes 會在 findings 中逐一列出。',
          'The lists below come directly from axe results; violating DOM nodes are listed inside each finding.'
        )}
      </p>
      ${buildAxeRuleList(axe.passes, axe.counts.passes, 'h2_passed_checks', bi('此 JSON 未提供通過項清單。', 'This JSON did not include a passed-check list.'))}
      ${buildAxeRuleList(axe.inapplicable, axe.counts.inapplicable, 'h2_not_applicable_checks', bi('此 JSON 未提供不適用項清單。', 'This JSON did not include a not-applicable list.'))}
      ${buildAxeRuleList(axe.incomplete, axe.counts.incomplete, 'h2_incomplete_checks', bi('此 JSON 未提供 incomplete 清單。', 'This JSON did not include an incomplete-check list.'))}
    </section>`;
}

function buildLimitationsHTML(audit) {
  const tier = audit.metadata?.audit_tier || 'Tier 1 (static HTML only)';
  const confidence = audit.metadata?.confidence_level || 'medium';
  const methods = audit.metadata?.audit_methods || [];
  const methodsHTML = methods.length ? `
    <details open class="methods-details">
      <summary><strong>${bi('本次審查實際採用的方法', 'Methods applied in this audit')}</strong></summary>
      <ul class="methods-list">${methods.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    </details>` : '';
  const liveAuditNote = audit.metadata?.requires_live_audit ? `
    <div class="live-audit-note" role="note">
      ${bi(
        '此結果標記為 requires_live_audit: true。靜態層不能計算 contrast，也不能可靠判定 CSS visibility、focus flow 或執行時互動；請用 Tier-2 browser + axe 補齊。',
        'This result is marked requires_live_audit: true. The static tier cannot compute contrast or reliably determine CSS visibility, focus flow, or runtime interaction; complete it with Tier-2 browser + axe evidence.'
      )}
    </div>` : '';

  return `
    <div class="methodology-panel">

      <div class="lang-zh" lang="zh-Hant">
        <h2>方法論與限制</h2>
        <p class="meta-note">審查層級：<strong>${escapeHtml(tier)}</strong> &middot;
          信心水準：<strong>${escapeHtml(confidence)}</strong></p>
      </div>
      <div class="lang-en" lang="en">
        <h2>Methodology &amp; Limits</h2>
        <p class="meta-note">Audit tier: <strong>${escapeHtml(tier)}</strong> &middot;
          Confidence level: <strong>${escapeHtml(confidence)}</strong></p>
      </div>

      ${methodsHTML}
      ${liveAuditNote}
      ${buildManualChecksHTML(audit)}

      <div class="lang-zh" lang="zh-Hant">
        <h3>本審查擅長偵測的範疇</h3>
        <p class="section-intro">機器可判定、有靜態或執行時可識別特徵的項目：</p>
        <ul class="capability-list">
          <li>圖片缺 alt 文字、表單欄位未配對 label、按鈕無可讀名稱</li>
          <li>色彩對比比例（4.5:1 / 3:1 / 7:1 數值門檻）</li>
          <li>缺 landmarks（header / nav / main / footer）、缺 <code>lang</code> 屬性、缺頁面 title</li>
          <li>正值 tabindex、<code>outline: none</code> 無 <code>:focus-visible</code> 替代</li>
          <li>Heading 層級斷層（h1 跳 h3）</li>
          <li>Schema.org / AEO 訊號（JSON-LD、meta tags、canonical、Open Graph）</li>
          <li>320px 窄視窗下的回流（reflow）行為</li>
          <li>互動式 <code>&lt;div&gt;</code> / <code>&lt;span&gt;</code> 缺鍵盤處理器</li>
          <li>可由靜態 HTML 判定的 WCAG 2.2 A &amp; AA 條款</li>
        </ul>

        <h3>本審查涵蓋之外的範疇</h3>
        <p class="section-intro">較適合透過人類判斷、真實使用者測試、或執行時任務觀察來確認的項目：</p>
        <ul class="limitation-list">
          <li><strong>認知負荷</strong>&mdash;單頁選項過多、文案抽象、版面密集</li>
          <li><strong>alt 文字或 label 是否真的有用</strong>&mdash;存在不等於清楚。<code>alt="image"</code> 通過 axe，但對螢幕閱讀器使用者毫無幫助</li>
          <li><strong>真實螢幕閱讀器任務達成路徑</strong>&mdash;例如 VoiceOver 使用者能在 2 分鐘內找到下週活動嗎？</li>
          <li><strong>動態互動品質</strong>&mdash;<code>aria-live</code> 在篩選器變更時真的有觸發嗎？modal 關閉時 focus 是否正確返回？</li>
          <li><strong>瀏覽器深色模式覆寫下的效能痛點</strong>&mdash;Edge / Chrome 在手機上的 <em>force-dark</em>，對未原生支援 <code>prefers-color-scheme</code> 的站點會造成卡頓。靜態審查看不到這層</li>
          <li><strong>SPA 導覽下的 focus 管理</strong>&mdash;route 變更時 focus 有移到合理位置嗎？</li>
          <li><strong>錯誤訊息是否建設性</strong>&mdash;「無效輸入」通過 3.3.1；「電話號碼應以 0 開頭」才是使用者需要的</li>
          <li><strong>200% 縮放 + 320px 寬同時成立</strong>&mdash;手機 + 放大鏡使用者組合</li>
          <li><strong>認知障礙使用者所需的閱讀年齡 / 語言簡明度</strong></li>
          <li><strong>較舊輔助科技使用者的實際體驗</strong>&mdash;JAWS 2018、Windows 7 上的 NVDA、Android Lollipop 上的 TalkBack</li>
          <li><strong>設計是否真正包容障礙者</strong>&mdash;而非僅是「未偵測到障礙」</li>
        </ul>

        <h3>推薦的無障礙工作流程</h3>
        <p class="section-intro">依真實使用者衝擊排序，而非依測量便利性：</p>
        <ol class="workflow-list">
          <li><strong>找障礙使用者實際操作測試。</strong>最高衝擊。一場螢幕閱讀器使用者的測試，比十次自動審查揭露的問題還多。</li>
          <li><strong>團隊裡僱用障礙者。</strong>預防勝於補救。設計階段內建的可達性，比事後審查補上的更便宜也更好。</li>
          <li><strong>開發者自己做鍵盤-only 完整流程測試。</strong>5 分鐘，高產出。拔掉滑鼠，用 Tab / Shift+Tab / Enter / Space / 方向鍵走完主要使用者旅程。</li>
          <li><strong>用螢幕閱讀器跑核心流程。</strong>NVDA（Windows，免費）、VoiceOver（macOS / iOS，內建）、TalkBack（Android）。只用聽的走完主流程。</li>
          <li><strong>自動化基線審查（本份報告）。</strong>抓出機器可偵測的子集。較適合作為 CI 的回歸防線；建議避免單獨作為完工證書。</li>
          <li><strong>公開可達性聲明。</strong>EU EAA 強制，其他司法管轄推薦。聲明標準、已知限制、回饋管道。</li>
        </ol>

        <h3>容易被忽略的脈絡</h3>
        <table class="traps-table">
          <thead>
            <tr><th>常見的想法&hellip;</th><th>值得補充的觀察&hellip;</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>「我們拿到 90 分以上，網站可達。」</td>
              <td>分數只反映機器可偵測的項目。真實使用者仍可能被本審查看不到的問題擋住。</td>
            </tr>
            <tr>
              <td>「對比通過 4.5:1，文字清楚易讀。」</td>
              <td>字體選擇、行高、字重、閱讀距離，都會獨立影響可讀性。</td>
            </tr>
            <tr>
              <td>「表單有 <code>&lt;label&gt;</code>，可以用了。」</td>
              <td>標籤文字本身也建議保持清楚不歧義。<code>&lt;label&gt;欄位&lt;/label&gt;</code> 雖通過 3.3.2，但實際上對使用者幫助有限。</td>
            </tr>
            <tr>
              <td>「axe 沒抓到任何違規，就完工了。」</td>
              <td>大約 60&ndash;70% 的 WCAG 條款不是機器可判定的。axe 作者明確這麼說。</td>
            </tr>
            <tr>
              <td>「skip link 加了，鍵盤可達就完成。」</td>
              <td>Skip link 只是一個條款。modal、SPA 路由變化、動態內容更新時的 focus 管理，常常獨立壞掉，且靜態審查看不到。</td>
            </tr>
            <tr>
              <td>「dark mode 寫一半沒關係。」</td>
              <td>它在使用者啟用手機瀏覽器強制深色時會造成真實效能痛&mdash;瀏覽器退回慢速像素級反轉，而非快速 CSS 切換。</td>
            </tr>
          </tbody>
        </table>

        <h3>建議的使用方式</h3>
        <ul class="usage-list">
          <li><strong>作為 CI 回歸防線：</strong>把 <code>axe-core</code> 或本審查接進 CI；對引入新的高影響項目的 PR 建議先複核再合併。</li>
          <li><strong>作為教育工具：</strong>帶新成員走過 findings 建立 a11y 直覺。before/after 程式碼區塊就是為此設計。</li>
          <li><strong>作為時序追蹤指標：</strong>用 <code>--previous</code> 旗標比對審查。變化方向比絕對分數更具參考價值。</li>
          <li><strong>建議避免：當作完工證書</strong>&mdash;「Beacon 95 分」不直接等同於「這個產品完全可達」。公開可達性聲明中建議一併說明方法論與其涵蓋範圍。</li>
          <li><strong>建議搭配：與障礙使用者一同測試</strong>&mdash;真實 a11y 工作中最昂貴也最容易被低估的環節。本報告作為基線，這項工作補上其他面向。</li>
        </ul>
      </div>

      <div class="lang-en" lang="en">
        <h3>What This Audit Is Well-Suited For</h3>
        <p class="section-intro">Machine-decidable items with static or runtime signatures:</p>
        <ul class="capability-list">
          <li>Missing alt text on images, unlabeled form inputs, missing button names</li>
          <li>Color contrast ratios (numerical thresholds at 3:1 / 4.5:1 / 7:1)</li>
          <li>Missing landmarks (header / nav / main / footer), <code>lang</code> attribute, page title</li>
          <li>Positive tabindex values, <code>outline: none</code> without <code>:focus-visible</code> replacement</li>
          <li>Heading hierarchy gaps (skipping h1 &rarr; h3)</li>
          <li>Schema.org / AEO signals (JSON-LD, meta tags, canonical, Open Graph)</li>
          <li>Reflow behavior at narrow viewports (320px)</li>
          <li>Interactive <code>&lt;div&gt;</code> / <code>&lt;span&gt;</code> without keyboard handlers</li>
          <li>Static-detectable WCAG 2.2 A &amp; AA criteria</li>
        </ul>

        <h3>Areas Beyond This Audit's Scope</h3>
        <p class="section-intro">Items better confirmed through human judgement, real users, or runtime task observation:</p>
        <ul class="limitation-list">
          <li><strong>Cognitive load</strong> &mdash; too many choices on one screen, abstract copy, dense layouts</li>
          <li><strong>Whether alt text or labels are actually useful</strong> &mdash; presence &ne; clarity. <code>alt="image"</code> passes axe but tells a screen-reader user nothing.</li>
          <li><strong>Real screen-reader task completion</strong> &mdash; e.g. can a VoiceOver user find next week's event in under 2 minutes?</li>
          <li><strong>Dynamic interaction quality</strong> &mdash; does <code>aria-live</code> actually fire on filter changes? Does focus return correctly when a modal closes?</li>
          <li><strong>Performance pain under browser dark-mode overrides</strong> &mdash; Edge / Chrome <em>force-dark</em> on mobile can stall pages that don't natively respond to <code>prefers-color-scheme</code>. Static audits miss this.</li>
          <li><strong>Focus management in SPA navigation</strong> &mdash; when a route changes, does focus move to a sensible place?</li>
          <li><strong>Whether error messages are constructively phrased</strong> &mdash; "Invalid input" passes 3.3.1; "Phone number should start with 0" is what a user needs.</li>
          <li><strong>200% zoom + 320px width simultaneously</strong> &mdash; mobile + magnifier user combination</li>
          <li><strong>Reading age / language clarity</strong> for cognitive accessibility</li>
          <li><strong>Real-world performance for users on older assistive tech</strong> &mdash; JAWS 2018, NVDA on Windows 7, Android TalkBack on Lollipop</li>
          <li><strong>Whether the design genuinely includes disabled people</strong> &mdash; vs. merely the absence of detectable barriers</li>
        </ul>

        <h3>Recommended Accessibility Workflow</h3>
        <p class="section-intro">Ordered by real-user impact, not by ease of measurement:</p>
        <ol class="workflow-list">
          <li><strong>Real-user testing with disabled people.</strong> Single highest-impact intervention. One session with a screen-reader user reveals more than ten automated audit runs.</li>
          <li><strong>Hire disabled people on your team.</strong> Preventive, not reactive. Designed-in accessibility is cheaper and better than audited-in.</li>
          <li><strong>Self keyboard-only walkthrough of core flows.</strong> 5 minutes, very high yield. Unplug the mouse and complete your primary user journey using only Tab / Shift+Tab / Enter / Space / Arrow keys.</li>
          <li><strong>Screen-reader walkthrough of core flows.</strong> NVDA (Windows, free), VoiceOver (macOS / iOS, built-in), TalkBack (Android). Run through your primary user journey listening only.</li>
          <li><strong>Automated baseline audit (this report).</strong> Catches the obvious, machine-detectable subset. Well-suited as CI regression-prevention; best not relied on as a standalone completion certificate.</li>
          <li><strong>Public accessibility statement.</strong> Required in EU under EAA, recommended elsewhere. States your standard, known limitations, and feedback contact.</li>
        </ol>

        <h3>Context That's Easy to Overlook</h3>
        <table class="traps-table">
          <thead>
            <tr><th>Common assumption&hellip;</th><th>Worth keeping in mind&hellip;</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>"We scored 90+, we're accessible."</td>
              <td>Score reflects only machine-detectable items. Real users may still be blocked by issues this audit cannot see.</td>
            </tr>
            <tr>
              <td>"Contrast passes 4.5:1, text is readable."</td>
              <td>Font choice, line-height, glyph weight, and reading-distance affect readability independent of contrast ratio.</td>
            </tr>
            <tr>
              <td>"Form has a <code>&lt;label&gt;</code>, it's usable."</td>
              <td>Label TEXT must also be unambiguous and contextually clear. <code>&lt;label&gt;Field&lt;/label&gt;</code> passes 3.3.2 and helps no one.</td>
            </tr>
            <tr>
              <td>"axe found 0 violations, we're done."</td>
              <td>Roughly 60&ndash;70% of WCAG criteria are not machine-decidable. axe's authors say so explicitly.</td>
            </tr>
            <tr>
              <td>"Skip link added, keyboard accessibility complete."</td>
              <td>Skip link is one criterion. Focus management in modals, SPA route changes, and dynamic content updates is often a separate concern, and may go unnoticed by static audits.</td>
            </tr>
            <tr>
              <td>"Half-implemented dark mode is harmless."</td>
              <td>It can cause real performance pain on mobile when users enable browser force-dark, because the browser falls back to slow pixel-level inversion instead of fast CSS swap.</td>
            </tr>
          </tbody>
        </table>

        <h3>Suggested Uses</h3>
        <ul class="usage-list">
          <li><strong>As baseline regression-prevention:</strong> wire <code>axe-core</code> or this audit into CI. PRs introducing new higher-priority items can be flagged for closer review before merge.</li>
          <li><strong>As an education tool:</strong> walk new team members through findings to build a11y intuition. The before/after code blocks are designed for this.</li>
          <li><strong>As a tracking metric over time:</strong> use the <code>--previous</code> flag to compare audits. Direction-of-change matters more than absolute score.</li>
          <li><strong>Best avoided as a completion certificate:</strong> "Beacon score 95" does not directly equate to "this product is fully accessible". Public accessibility statements work better when they also describe the methodology and its scope.</li>
          <li><strong>Best paired with testing alongside disabled users:</strong> the most expensive line item in real a11y work, and the most under-invested. This report serves as a baseline; that work covers the rest.</li>
        </ul>
      </div>
    </div>`;
}

// Performance Signals tab — rendered ONLY when audit.lighthouse is present.
// Lighthouse covers the categories axe-core does not (performance / best-practices
// / seo). This is a SUPPLEMENTARY signal, never folded into the a11y score. The
// headline is the cross-cutting section: one root cause (e.g. an oversized DOM)
// mapped to every Beacon dimension it harms.
const AFFECTS_LABEL = {
  performance: ['效能', 'Performance'],
  a11y: ['無障礙', 'Accessibility'],
  aeo: ['AEO', 'AEO'],
};

function affectsBadges(affects = []) {
  return affects
    .map((a) => {
      const [zh, en] = AFFECTS_LABEL[a] || [a, a];
      return `<span style="display:inline-block;font-size:.72rem;padding:.1rem .45rem;margin:0 .25rem .25rem 0;border:1px solid var(--border);border-radius:999px;color:var(--text);background:var(--bg);">${bi(zh, en)}</span>`;
    })
    .join('');
}

function perfChip(label, score) {
  if (score == null) return '';
  return `<div style="flex:1;min-width:120px;text-align:center;padding:.9rem .6rem;border:1px solid var(--border);border-radius:10px;background:var(--surface);">
    <div style="font-size:2rem;font-weight:700;line-height:1;color:${scoreColor(score)};">${score}</div>
    <div style="font-size:.82rem;margin-top:.35rem;color:var(--text);">${escapeHtml(label)}</div>
  </div>`;
}

function buildPerformanceHTML(audit) {
  const lh = audit.lighthouse;
  if (!lh) return '';

  const meta = [
    lh.form_factor ? `${bi('裝置', 'Device')}: ${escapeHtml(lh.form_factor)}` : '',
    lh.version ? `Lighthouse ${escapeHtml(lh.version)}` : '',
    lh.final_url ? escapeHtml(lh.final_url) : '',
  ].filter(Boolean).join(' &middot; ');

  const banner = `<div role="note" style="border:1px solid var(--warn);border-radius:8px;padding:.8rem 1rem;margin:.5rem 0 1.2rem;background:var(--bg);">
    <div style="font-size:.9rem;color:var(--text);">&#9888; ${bi(lh.note_zh || '', lh.note_en || '')}</div>
    ${meta ? `<div style="font-size:.78rem;margin-top:.4rem;color:var(--text);opacity:.75;">${meta}</div>` : ''}
  </div>`;

  const chips = (lh.categories || []).length
    ? `<div style="display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:1.4rem;">
        ${lh.categories.map((c) => perfChip(c.title, c.score)).join('')}
      </div>`
    : '';

  const crossCutting = (lh.cross_cutting || []).length
    ? `<h3>${bi('跨維度根因', 'Cross-cutting root causes')}</h3>
       <p class="category-desc">${bi(
         '同一個根因同時影響多個維度。這是單一工具看不到、Beacon 整合後才浮現的洞察。',
         'One root cause harms several dimensions at once — the insight no single tool surfaces, only the integrated view does.',
       )}</p>
       ${lh.cross_cutting.map((c) => `
         <div style="border-left:3px solid var(--accent);padding:.6rem .9rem;margin:.6rem 0;background:var(--surface);border-radius:0 8px 8px 0;">
           <div style="font-weight:600;color:var(--text);margin-bottom:.3rem;">${bi(c.title_zh || '', c.title_en || '')}</div>
           <div style="margin-bottom:.5rem;">${affectsBadges(c.affects)}</div>
           <div style="font-size:.88rem;color:var(--text);">${bi(c.detail_zh || '', c.detail_en || '')}</div>
         </div>`).join('')}`
    : '';

  const vitals = (lh.metrics || []).length
    ? `<h3>${bi('核心網頁指標 (Core Web Vitals)', 'Core Web Vitals')}</h3>
       <table class="summary-table">
         <thead><tr><th>${bi('指標', 'Metric')}</th><th class="num">${bi('數值', 'Value')}</th><th class="num">${bi('分數', 'Score')}</th></tr></thead>
         <tbody>
           ${lh.metrics.map((m) => `<tr>
             <td>${escapeHtml(m.label)}</td>
             <td class="num">${escapeHtml(m.value || '--')}</td>
             <td class="num" style="color:${m.score == null ? 'var(--text)' : scoreColor(m.score)};font-weight:600;">${m.score == null ? '--' : m.score}</td>
           </tr>`).join('')}
         </tbody>
       </table>`
    : '';

  let mainthread = '';
  if ((lh.mainthread || []).length) {
    const max = Math.max(...lh.mainthread.map((m) => m.ms), 1);
    mainthread = `<h3>${bi('主執行緒工作拆解', 'Main-thread work breakdown')}</h3>
      <div style="margin:.5rem 0 1.2rem;">
        ${lh.mainthread.map((m) => `
          <div style="display:flex;align-items:center;gap:.6rem;margin:.3rem 0;">
            <div style="flex:0 0 11rem;font-size:.84rem;color:var(--text);">${escapeHtml(m.group)}</div>
            <div style="flex:1;background:var(--bg);border-radius:4px;overflow:hidden;">
              <div style="width:${Math.round((m.ms / max) * 100)}%;min-width:2px;height:1.1rem;background:var(--accent);"></div>
            </div>
            <div style="flex:0 0 5rem;text-align:right;font-size:.84rem;font-variant-numeric:tabular-nums;color:var(--text);">${m.ms.toLocaleString('en-US')} ms</div>
          </div>`).join('')}
      </div>`;
  }

  const opportunities = (lh.opportunities || []).length
    ? `<h3>${bi('優化機會', 'Opportunities')}</h3>
       <ul>${lh.opportunities.map((o) => `<li>${escapeHtml(o.title)}${o.value ? ` &mdash; ${escapeHtml(o.value)}` : ''}${o.savings_ms ? ` <span style="opacity:.7;">(~${o.savings_ms.toLocaleString('en-US')} ms)</span>` : ''}</li>`).join('')}</ul>`
    : '';

  const issueList = (title, items) =>
    items && items.length
      ? `<h3>${title}</h3><ul>${items.map((i) => `<li>${escapeHtml(i.title)}${i.value ? ` &mdash; ${escapeHtml(i.value)}` : ''}</li>`).join('')}</ul>`
      : '';

  return `${banner}${chips}${crossCutting}${vitals}${mainthread}${opportunities}
    ${issueList(bi('最佳實務問題', 'Best Practices issues'), lh.best_practices_issues)}
    ${issueList(bi('SEO 問題', 'SEO issues'), lh.seo_issues)}`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit Report — ${audit.metadata?.scope || 'Project'}</title>
<style>
  /* Beacon Eval Design System v0.1 token mapping. Light is the default; auto mode can follow OS preference. */
  :root {
    --bg: #fafaf8;
    --surface: #ffffff;
    --surface-2: #f0f0ec;
    --text: #1a1a1a;
    --text-muted: #4a4a44;
    --text-soft: #6b6b60;
    --border: #c8c8c0;
    --border-soft: #d8d8d2;
    --accent: #1a5cb0;
    --accent-hover: #0e3d7a;
    --accent-bg: #dff0ff;
    --accent-text: #ffffff;
    --pass: #155a1e;
    --pass-bg: #d6f0db;
    --warn: #6b4000;
    --warn-bg: #fdf0d0;
    --fail: #8b1a1a;
    --fail-bg: #fde8e8;
    --tip: #1a5cb0;
    --tip-bg: #dff0ff;
    --info: #5a4000;
    --info-bg: #fff8e0;
    --info-border: #c89000;
    --font: 'Inter', 'Noto Sans TC', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: 'JetBrains Mono', 'Cascadia Code', Consolas, monospace;
    --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    color-scheme: light;
  }

  /* Respect OS preference in auto mode. */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #111116;
      --surface: #1e1e28;
      --surface-2: #1c1c24;
      --text: #ededf0;
      --text-muted: #b8b8c0;
      --text-soft: #88889a;
      --border: #38383f;
      --border-soft: #2a2a32;
      --accent: #6aadff;
      --accent-hover: #9eceff;
      --accent-bg: #1a2e45;
      --accent-text: #0a0a10;
      --pass: #7ee89a;
      --pass-bg: #0e2e16;
      --warn: #ffd97d;
      --warn-bg: #2a1f00;
      --fail: #ff8a8a;
      --fail-bg: #2e0e0e;
      --tip: #6aadff;
      --tip-bg: #1a2e45;
      --info: #ffd97d;
      --info-bg: #2a200a;
      --info-border: #ffd97d;
      --shadow: 0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3);
      color-scheme: dark;
    }
  }

  /* User-explicit override via toolbar button (wins over media query) */
  :root[data-theme="light"] {
    --bg: #fafaf8;
    --surface: #ffffff;
    --surface-2: #f0f0ec;
    --text: #1a1a1a;
    --text-muted: #4a4a44;
    --text-soft: #6b6b60;
    --border: #c8c8c0;
    --border-soft: #d8d8d2;
    --accent: #1a5cb0;
    --accent-hover: #0e3d7a;
    --accent-bg: #dff0ff;
    --accent-text: #ffffff;
    --pass: #155a1e;
    --pass-bg: #d6f0db;
    --warn: #6b4000;
    --warn-bg: #fdf0d0;
    --fail: #8b1a1a;
    --fail-bg: #fde8e8;
    --tip: #1a5cb0;
    --tip-bg: #dff0ff;
    --info: #5a4000;
    --info-bg: #fff8e0;
    --info-border: #c89000;
    --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    --bg: #111116;
    --surface: #1e1e28;
    --surface-2: #1c1c24;
    --text: #ededf0;
    --text-muted: #b8b8c0;
    --text-soft: #88889a;
    --border: #38383f;
    --border-soft: #2a2a32;
    --accent: #6aadff;
    --accent-hover: #9eceff;
    --accent-bg: #1a2e45;
    --accent-text: #0a0a10;
    --pass: #7ee89a;
    --pass-bg: #0e2e16;
    --warn: #ffd97d;
    --warn-bg: #2a1f00;
    --fail: #ff8a8a;
    --fail-bg: #2e0e0e;
    --tip: #6aadff;
    --tip-bg: #1a2e45;
    --info: #ffd97d;
    --info-bg: #2a200a;
    --info-border: #ffd97d;
    --shadow: 0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3);
    color-scheme: dark;
  }

  /* Language switching: hide inactive language. Default ZH; switched by toolbar. */
  body[data-active-lang="zh"] .lang-en,
  body:not([data-active-lang]) .lang-en { display: none; }
  body[data-active-lang="en"] .lang-zh { display: none; }

  /* Report toolbar (lang + theme switch) */
  .report-toolbar {
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    padding: 0.5rem 0;
    margin: -2rem -2rem 1rem;
    padding: 0.6rem 2rem;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(8px);
  }
  .toolbar-group {
    display: inline-flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2px;
    box-shadow: var(--shadow);
  }
  .toolbar-group button {
    background: transparent;
    border: 0;
    color: var(--text-muted);
    padding: 6px 12px;
    border-radius: 6px;
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
    line-height: 1.2;
    transition: background 0.15s, color 0.15s;
  }
  .toolbar-group button:hover { color: var(--text); }
  .toolbar-group button[aria-pressed="true"] {
    background: var(--accent);
    color: var(--accent-text);
  }
  .toolbar-group button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--font);
    font-size: clamp(1rem, 0.95rem + 0.3vw, 1.125rem);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  h1 { font-size: clamp(1.6rem, 1.3rem + 1.5vw, 2.2rem); margin-bottom: 0.5rem; }
  h2 { font-size: clamp(1.25rem, 1.1rem + 0.8vw, 1.5rem); margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: clamp(1.05rem, 1rem + 0.3vw, 1.2rem); margin: 1.5rem 0 0.5rem; }
  .meta { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem; }
  .meta span { margin-right: 1.5rem; }

  /* Score Ring */
  .score-ring-container {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
    margin: 1.5rem 0;
  }
  .score-ring {
    text-align: center;
    min-width: 120px;
  }
  .score-ring svg { width: 100px; height: 100px; }
  .score-ring .ring-bg { fill: none; stroke: var(--border); stroke-width: 8; }
  .score-ring .ring-fg { fill: none; stroke-width: 8; stroke-linecap: round;
    transform: rotate(-90deg); transform-origin: 50% 50%;
    transition: stroke-dashoffset 1s ease; }
  .score-ring .ring-text { font-size: 22px; font-weight: 700; fill: var(--text); }
  .score-ring .ring-label { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.3rem; }
  .score-ring .ring-prev { font-size: 0.75rem; color: var(--text-muted); }

  /* Summary Table */
  .summary-table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  .summary-table th { text-align: left; padding: 0.6rem; border-bottom: 2px solid var(--border);
    color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .summary-table td { padding: 0.6rem; border-bottom: 1px solid var(--border); }
  .summary-table .num { text-align: center; font-variant-numeric: tabular-nums; }
  .category-cell { display: grid; gap: 0.25rem; }
  .category-desc { color: var(--text-muted); font-size: 0.8rem; line-height: 1.45; max-width: 48rem; }
  .summary-table .pass { color: var(--pass); }
  .summary-table .fail { color: var(--fail); }
  .category-row { cursor: pointer; }
  .category-row:hover { background: var(--surface-2); }

  .score-bar { height: 20px; background: var(--surface-2); border-radius: 10px; position: relative; overflow: hidden; min-width: 100px; }
  .score-fill { height: 100%; border-radius: 10px; transition: width 0.8s ease; }
  .score-text { position: absolute; right: 6px; top: 2px; line-height: 16px; font-size: 0.75rem; font-weight: 600; color: var(--text); background: var(--surface); padding: 0 4px; border-radius: 6px; }
  .prev-score { font-size: 0.7rem; color: var(--text-muted); margin-top: 2px; }

  .delta { font-size: 0.75rem; margin-left: 4px; }
  .delta.positive { color: var(--pass); }
  .delta.negative { color: var(--fail); }
  .delta.neutral { color: var(--text-muted); }

  /* Findings */
  .finding { background: var(--surface); border-radius: 8px; margin: 0.8rem 0; padding: 1rem;
    border-left: 4px solid var(--border); }
  .finding.critical { border-left-color: var(--fail); }
  .finding.warning { border-left-color: var(--warn); }
  .finding.tip { border-left-color: var(--tip); }
  .finding-header { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  .severity-icon { font-size: 1.1rem; }
  .wcag-tag, .level-tag { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px;
    background: var(--surface-2); color: var(--accent); }
  .finding-body { margin-top: 0.8rem; font-size: 0.9rem; }
  .finding-body p { margin: 0.3rem 0; }
  .fix { background: var(--pass-bg); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }
  .legal { background: var(--fail-bg); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }
  .learn-more { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .learn-more a,
  .axe-outcome-list a {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .affected-elements {
    margin: 0.8rem 0;
    padding: 0.8rem;
    background: var(--surface-2);
    border-radius: 6px;
  }
  .affected-elements h4 {
    margin: 0 0 0.6rem;
    color: var(--text);
    font-size: 0.95rem;
  }
  .affected-elements .count { color: var(--text-muted); font-weight: 500; }
  .affected-elements ol { margin-left: 1.2rem; }
  .affected-elements li { margin: 0.8rem 0; }
  .dom-snippet pre,
  .node-reason pre {
    margin-top: 0.3rem;
    padding: 0.55rem;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    overflow-x: auto;
    white-space: pre-wrap;
    font-family: var(--font-mono);
    font-size: 0.78rem;
  }

  .code-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
  .code-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform: uppercase; }
  .code-before pre, .code-after pre { background: var(--bg); padding: 0.5rem; border-radius: 4px;
    overflow-x: auto; font-size: 0.8rem; font-family: var(--font-mono); }
  .code-before pre { border: 1px solid var(--fail); }
  .code-after pre { border: 1px solid var(--pass); }

  /* Jurisdiction context */
  .risk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .risk-card { background: var(--surface); padding: 1rem; border-radius: 8px; border-left: 4px solid var(--accent); }
  .risk-header { display: flex; justify-content: space-between; align-items: center; }
  .risk-badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .context-badge { color: var(--accent); background: var(--accent-bg); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
  .deadline { color: var(--warn); font-weight: 600; }
  .risk-score { font-variant-numeric: tabular-nums; }
  .overall-risk { text-align: center; padding: 0.8rem; border-radius: 8px; color: white;
    font-size: 1.1rem; font-weight: 700; }
  .risk-summary { margin-top: 1rem; }
  .legal-context-note {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-left: 6px solid var(--info-border);
    border-radius: 8px;
    padding: 0.9rem 1rem;
    margin: 0.8rem 0 1rem;
  }
  .criteria-map {
    color: var(--text-muted);
    font-size: 0.86rem;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border);
    margin: 2rem 0 1rem;
    flex-wrap: wrap;
  }
  .tab {
    appearance: none;
    background: transparent;
    border: 0;
    font: inherit;
    text-align: left;
    padding: 0.65rem 1.2rem;
    cursor: pointer;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    border-radius: 6px 6px 0 0;
    position: relative;
    user-select: none;
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }
  /* Animated underline that grows from center on hover */
  .tab::after {
    content: '';
    position: absolute;
    left: 50%;
    right: 50%;
    bottom: -2px;
    height: 2px;
    background: var(--accent);
    opacity: 0;
    transition: left 0.22s ease, right 0.22s ease, opacity 0.18s ease;
    pointer-events: none;
    border-radius: 2px;
  }
  .tab:hover {
    color: var(--text);
    background-color: var(--surface-2);
    transform: translateY(-1px);
    box-shadow: inset 0 0 0 1.5px var(--accent);
  }
  .tab:hover::after {
    left: 12%;
    right: 12%;
    opacity: 0.55;
  }
  .tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    background-color: transparent;
    transform: none;
    box-shadow: none;
    font-weight: 600;
  }
  .tab.active::after {
    left: 0;
    right: 0;
    opacity: 1;
  }
  /* Respect users with motion sensitivity (our own report's a11y dog-food) */
  @media (prefers-reduced-motion: reduce) {
    .tab, .tab::after { transition: color 0.01s; }
    .tab:hover { transform: none; }
  }
  .tab-content { display: none; }
  .tab-content.active { display: block; }

  /* Remediation */
  .priority-section { margin: 1rem 0; }
  .priority-tag { display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 0.75rem; font-weight: 600; color: white; }
  .priority-tag.p0 { background: var(--fail); }
  .priority-tag.p1 { background: var(--warn); }
  .priority-tag.p2 { background: var(--tip); }
  .remediation-item { display: flex; gap: 0.5rem; align-items: baseline; padding: 0.3rem 0; }
  .effort-tag { font-size: 0.75rem; color: var(--text-muted); }

  .empty { color: var(--text-muted); font-style: italic; }

  /* Category detail sections */
  .category-detail { display: none; margin: 1rem 0 2rem; padding: 1rem;
    background: var(--surface); border-radius: 8px; }
  .category-detail.open { display: block; }

  @media (max-width: 720px) {
    body { padding: 1rem; }
    .report-toolbar {
      margin: -1rem -1rem 1rem;
      padding: 0.5rem 1rem;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
    .comparison-banner,
    .score-ring-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.8rem;
    }
    .summary-table {
      display: block;
      overflow-x: auto;
      white-space: nowrap;
    }
    .code-compare {
      grid-template-columns: 1fr;
    }
    .axe-outcome-list li {
      display: block;
    }
    .rule-id,
    .rule-criteria {
      display: block;
      margin-top: 0.15rem;
    }
  }

  /* Print */
  @media print {
    body { background: white; color: #333; }
    .score-ring .ring-text { fill: #333; }
    .finding { break-inside: avoid; }
  }

  /* Comparison banner */
  .comparison-banner {
    background: var(--surface-2);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: 1rem;
    margin: 1rem 0;
    display: flex;
    justify-content: space-around;
    text-align: center;
  }
  .comparison-stat { }
  .comparison-stat .value { font-size: 1.5rem; font-weight: 700; }
  .comparison-stat .label { font-size: 0.8rem; color: var(--text-muted); }

  /* Audit context banner (epistemic warning, always visible) */
  .audit-context-banner {
    background: var(--info-bg);
    border: 1px solid var(--info-border);
    border-left: 6px solid var(--info-border);
    border-radius: 8px;
    padding: 1.1rem 1.3rem;
    margin: 1.5rem 0;
    font-size: 0.92rem;
    line-height: 1.7;
  }
  .audit-context-banner .banner-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--info);
    margin-bottom: 0.5rem;
    letter-spacing: 0.01em;
  }
  .audit-context-banner p { margin-bottom: 0.5rem; }
  .audit-context-banner p:last-child { margin-bottom: 0; }
  .audit-context-banner .banner-cta {
    color: var(--text-muted);
    font-size: 0.88rem;
    border-top: 1px dashed var(--info-border);
    padding-top: 0.5rem;
    margin-top: 0.5rem;
  }
  .audit-context-banner strong { color: var(--text); }
  .audit-context-banner em { font-style: italic; color: var(--info); }

  /* AEO sub-score disclaimer — scoped to the Agent/AEO category detail */
  .aeo-disclaimer {
    background: var(--accent-bg);
    border: 1px solid var(--accent);
    border-left: 6px solid var(--accent);
    border-radius: 8px;
    padding: 0.9rem 1.1rem;
    margin: 0 0 1rem;
    font-size: 0.88rem;
    line-height: 1.65;
  }
  .aeo-disclaimer-title {
    font-size: 0.98rem;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 0.4rem;
  }
  .aeo-disclaimer p { margin-bottom: 0.45rem; }
  .aeo-disclaimer p:last-child { margin-bottom: 0; }
  .aeo-disclaimer-cta {
    color: var(--text-muted);
    font-size: 0.84rem;
    border-top: 1px dashed rgba(79,195,247,0.3);
    padding-top: 0.45rem;
    margin-top: 0.45rem;
  }
  .aeo-disclaimer strong { color: var(--text); }

  /* Methodology & Limits tab */
  .methodology-panel { font-size: 0.92rem; line-height: 1.7; }
  .methodology-panel h2 { margin-top: 0; }
  .methodology-panel h3 {
    margin-top: 1.8rem;
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3rem;
  }
  .methodology-panel .meta-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    background: var(--surface);
    padding: 0.5rem 0.8rem;
    border-radius: 6px;
    margin: 0.5rem 0 1rem;
  }
  .methodology-panel .section-intro {
    color: var(--text-muted);
    font-size: 0.88rem;
    margin: 0.3rem 0 0.6rem;
  }
  .methodology-panel ul, .methodology-panel ol {
    margin: 0.4rem 0 0.8rem 1.4rem;
  }
  .methodology-panel li { margin: 0.35rem 0; }
  .methodology-panel code {
    background: var(--surface-2);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.85em;
  }
  .capability-list li::marker { color: var(--pass); }
  .limitation-list li::marker { color: var(--warn); }
  .workflow-list li::marker { color: var(--accent); font-weight: 700; }
  .usage-list li::marker { color: var(--text-muted); }

  .methods-details {
    background: var(--surface);
    border-radius: 6px;
    padding: 0.6rem 0.9rem;
    margin: 0.5rem 0 1rem;
    border-left: 3px solid var(--accent);
  }
  .methods-details summary {
    cursor: pointer;
    color: var(--text-muted);
    font-size: 0.9rem;
  }
  .methods-list {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .live-audit-note {
    background: var(--warn-bg);
    border: 1px solid var(--warn);
    border-left: 6px solid var(--warn);
    border-radius: 8px;
    padding: 0.8rem 1rem;
    margin: 0.8rem 0 1rem;
    color: var(--text);
  }
  .manual-checks,
  .axe-evidence {
    margin: 1.2rem 0;
  }
  .manual-check-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 0.8rem;
    margin-top: 0.8rem;
  }
  .manual-check-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.9rem;
  }
  .manual-check-card h4 {
    margin: 0.2rem 0 0.45rem;
    font-size: 0.98rem;
  }
  .manual-check-card p {
    margin: 0.35rem 0;
    font-size: 0.86rem;
  }
  .manual-check-meta {
    color: var(--text-soft);
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .axe-outcome-list {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.65rem 0.85rem;
    margin: 0.6rem 0;
  }
  .axe-outcome-list summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--text);
  }
  .axe-outcome-list ul {
    margin-top: 0.6rem;
  }
  .axe-outcome-list li {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) auto auto;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.45rem 0;
    border-top: 1px solid var(--border-soft);
  }
  .rule-id,
  .rule-criteria {
    color: var(--text-muted);
    font-size: 0.78rem;
  }

  .traps-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.8rem 0;
    font-size: 0.9rem;
  }
  .traps-table th {
    text-align: left;
    padding: 0.6rem 0.8rem;
    background: var(--surface-2);
    color: var(--accent);
    font-weight: 600;
    border-bottom: 1px solid var(--border);
  }
  .traps-table td {
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }
  .traps-table tr:hover td { background: rgba(255,255,255,0.02); }
  .traps-table td:first-child {
    color: var(--text-muted);
    font-style: italic;
    width: 38%;
  }
</style>
</head>
<body>

<div class="report-toolbar" role="toolbar" aria-label="Report preferences">
  <div class="toolbar-group" role="group" aria-label="Language / 語言">
    <button type="button" data-lang-btn="zh" aria-pressed="true">中文</button>
    <button type="button" data-lang-btn="en" aria-pressed="false">EN</button>
  </div>
  <div class="toolbar-group" role="group" aria-label="Theme / 主題">
    <button type="button" data-theme-btn="light" aria-pressed="false" title="Light mode">&#9728;</button>
    <button type="button" data-theme-btn="dark" aria-pressed="false" title="Dark mode">&#9790;</button>
    <button type="button" data-theme-btn="auto" aria-pressed="true" title="Follow system / 跟隨系統">A</button>
  </div>
</div>

<main id="main-content">
<h1>Accessibility Audit Report</h1>
<div class="meta">
  <span>${t('meta_date')}: ${audit.metadata?.date || 'N/A'}</span>
  <span>${t('meta_scope')}: ${escapeHtml(audit.metadata?.scope || 'N/A')}</span>
  <span>${t('meta_standard')}: ${escapeHtml(audit.metadata?.standard || 'WCAG 2.2 AA')}</span>
  <span>${t('meta_auditor')}: Claude Code (a11y-audit)</span>
</div>

${previous ? `
<div class="comparison-banner">
  <div class="comparison-stat">
    <div class="value" style="color:${scoreColor(audit.summary.overall_score)}">${audit.summary.overall_score}</div>
    <div class="label">${t('cmp_current')}</div>
  </div>
  <div class="comparison-stat">
    <div class="value" style="color:${scoreColor(previous.summary.overall_score)}">${previous.summary.overall_score}</div>
    <div class="label">${t('cmp_previous')}</div>
  </div>
  <div class="comparison-stat">
    <div class="value" style="color:${audit.summary.overall_score > previous.summary.overall_score ? 'var(--pass)' : 'var(--fail)'}">
      ${audit.summary.overall_score > previous.summary.overall_score ? '+' : ''}${audit.summary.overall_score - previous.summary.overall_score}
    </div>
    <div class="label">${t('cmp_delta')}</div>
  </div>
  <div class="comparison-stat">
    <div class="value">${audit.summary.total_findings} / ${previous.summary.total_findings}</div>
    <div class="label">${t('cmp_issues')}</div>
  </div>
</div>
` : ''}

<!-- Audit context banner: always shown before scores, sets epistemic frame -->
${buildContextBanner()}

<!-- Score Rings -->
<div class="score-ring-container">
  ${buildScoreRing(t('ring_overall'), audit.summary.overall_score, previous?.summary?.overall_score)}
  ${audit.summary.categories.map(cat => {
    const prev = previous?.summary?.categories?.find(p => p.id === cat.id);
    return buildScoreRing(catName(cat), cat.score, prev?.score);
  }).join('')}
</div>

<!-- Verdict -->
<div style="text-align:center;margin:1.5rem 0">
  <span style="font-size:1.3rem;font-weight:700;color:${scoreColor(audit.summary.overall_score)}">
    ${scoreLabel(audit.summary.overall_score)}
  </span>
  <span style="color:var(--text-muted);margin-left:0.5rem">
    ${reportCounts.total} ${t('verdict_issues_found')}
    (${reportCounts.critical} ${t('verdict_critical')}, ${reportCounts.warnings} ${t('verdict_warnings')}, ${reportCounts.tips} ${t('verdict_tips')})
  </span>
</div>

<!-- Tabs -->
<div class="tabs" role="tablist" aria-label="Report sections">
  <button type="button" role="tab" class="tab active" data-tab-btn="overview" aria-selected="true" aria-controls="tab-overview">${t('tab_overview')}</button>
  <button type="button" role="tab" class="tab" data-tab-btn="findings" aria-selected="false" aria-controls="tab-findings">${t('tab_findings')}</button>
  <button type="button" role="tab" class="tab" data-tab-btn="legal" aria-selected="false" aria-controls="tab-legal">${t('tab_legal')}</button>
  <button type="button" role="tab" class="tab" data-tab-btn="methodology" aria-selected="false" aria-controls="tab-methodology">${t('tab_methodology')}</button>
  <button type="button" role="tab" class="tab" data-tab-btn="remediation" aria-selected="false" aria-controls="tab-remediation">${t('tab_remediation')}</button>
  ${audit.lighthouse ? `<button type="button" role="tab" class="tab" data-tab-btn="performance" aria-selected="false" aria-controls="tab-performance">${bi('效能訊號', 'Performance')}</button>` : ''}
</div>

<!-- Overview Tab -->
<div id="tab-overview" class="tab-content active" role="tabpanel">
  <h2>${t('h2_category_summary')}</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>${t('th_category')}</th>
        <th class="num">${t('th_pass')}</th>
        <th class="num">${t('th_fail')}</th>
        <th class="num">${t('th_review')}</th>
        <th>${t('th_coverage')}</th>
      </tr>
    </thead>
    <tbody>
      ${buildCategoryRows(audit.summary.categories, previous?.summary?.categories)}
    </tbody>
  </table>

  ${audit.summary.categories.map(cat => `
    <div class="category-detail" id="detail-${cat.id}">
      <h3>${catName(cat)}</h3>
      ${catDesc(cat) ? `<p class="category-desc">${catDesc(cat)}</p>` : ''}
      ${cat.id === 'agent' ? buildAeoDisclaimer() : ''}
      ${buildFindingsHTML(reportFindings.filter(f => f.category === cat.id))}
    </div>
  `).join('')}
</div>

<!-- Findings Tab -->
<div id="tab-findings" class="tab-content" role="tabpanel">
  <h2>${t('h2_critical')}</h2>
  ${buildFindingsHTML(reportFindings.filter(f => f.severity === 'critical'))}

  <h2>${t('h2_warnings')}</h2>
  ${buildFindingsHTML(reportFindings.filter(f => f.severity === 'warning'))}

  <h2>${t('h2_tips')}</h2>
  ${buildFindingsHTML(reportFindings.filter(f => f.severity === 'tip'))}

  ${buildAxeEvidenceHTML(audit)}
</div>

<!-- Legal Tab -->
<div id="tab-legal" class="tab-content" role="tabpanel">
  ${buildLegalRiskHTML(audit.legal_risk, reportFindings)}
</div>

<!-- Methodology & Limits Tab -->
<div id="tab-methodology" class="tab-content" role="tabpanel">
  ${buildLimitationsHTML(audit)}
</div>

<!-- Remediation Tab -->
<div id="tab-remediation" class="tab-content" role="tabpanel">
  <h2>${t('h2_remediation_priority')}</h2>
  ${['p0', 'p1', 'p2'].map(priority => {
    const items = audit.remediation?.filter(r => r.priority === priority) || [];
    if (items.length === 0) return '';
    const labelKey = priority === 'p0' ? 'rem_p0' : priority === 'p1' ? 'rem_p1' : 'rem_p2';
    return `
      <div class="priority-section">
        <h3><span class="priority-tag ${priority}">${priority.toUpperCase()}</span> ${t(labelKey)}</h3>
        ${items.map(r => `
          <div class="remediation-item">
            <span>&#8226; ${findingText(r, 'title')} &mdash; ${escapeHtml(r.wcag || '')}</span>
            <span class="effort-tag">${escapeHtml(r.effort || '')}</span>
          </div>
        `).join('')}
      </div>`;
  }).join('')}

  <h2>${t('h2_testing_recommendations')}</h2>
${audit.testing_recommendations ? `<ul>${audit.testing_recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}</ul>` : `<p class="empty">${t('rem_empty')}</p>`}
</div>

${audit.lighthouse ? `<!-- Performance Signals Tab -->
<div id="tab-performance" class="tab-content" role="tabpanel">
  <h2>${bi('效能訊號 (Lighthouse)', 'Performance Signals (Lighthouse)')}</h2>
  ${buildPerformanceHTML(audit)}
</div>` : ''}
</main>

<script>
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', t.dataset.tabBtn === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(\`.tab[data-tab-btn="\${name}"]\`).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
document.querySelectorAll('[data-tab-btn]').forEach(tab => {
  // Native <button> tabs provide keyboard activation for this click handler.
  tab.addEventListener('click', () => switchTab(tab.dataset.tabBtn));
});
document.querySelectorAll('.category-row').forEach(row => {
  const toggleCategory = () => {
    const id = row.dataset.category;
    const detail = document.getElementById('detail-' + id);
    if (!detail) return;
    const open = detail.classList.toggle('open');
    row.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  row.addEventListener('click', toggleCategory);
  row.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCategory();
    }
  });
});

/* Language + theme toggles
   Demonstrates the "correct" dark-mode pattern this report's methodology recommends:
   - prefers-color-scheme media query for fast CSS-variable swap (no JS needed for OS sync)
   - Button override that wins via data-theme attribute
   - localStorage persistence so the choice survives reloads
   - Default for language is zh; user can switch to en */
(function () {
  const STORE_LANG = 'beacon-report-lang';
  const STORE_THEME = 'beacon-report-theme';
  const root = document.documentElement;
  const body = document.body;

  function setLang(lang) {
    body.dataset.activeLang = lang;
    document.querySelectorAll('[data-lang-btn]').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.langBtn === lang ? 'true' : 'false');
    });
    try { localStorage.setItem(STORE_LANG, lang); } catch (e) {}
  }

  function setTheme(theme) {
    // theme: 'light' | 'dark' | 'auto'
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
    document.querySelectorAll('[data-theme-btn]').forEach(b => {
      b.setAttribute('aria-pressed', b.dataset.themeBtn === theme ? 'true' : 'false');
    });
    try { localStorage.setItem(STORE_THEME, theme); } catch (e) {}
  }

  // Restore from localStorage (defaults: zh + auto)
  let savedLang = 'zh';
  let savedTheme = 'auto';
  try {
    savedLang = localStorage.getItem(STORE_LANG) || 'zh';
    savedTheme = localStorage.getItem(STORE_THEME) || 'auto';
  } catch (e) {}
  setLang(savedLang);
  setTheme(savedTheme);

  // Wire up buttons
  document.querySelectorAll('[data-lang-btn]').forEach(b => {
    // Native <button> controls provide keyboard activation for this click handler.
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
    // Native <button> controls provide keyboard activation for this click handler.
    b.addEventListener('click', () => setTheme(b.dataset.themeBtn));
  });
})();
</script>

</body>
</html>`;

writeFileSync(outputPath, html, 'utf8');
console.log(`Report written to: ${outputPath}`);

function buildScoreRing(label, score, prevScore) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - score / 100);
  const color = scoreColor(score);
  const prevText = prevScore !== null && prevScore !== undefined
    ? `<div class="ring-prev">${t('ring_was')} ${prevScore}</div>`
    : '';
  return `
    <div class="score-ring">
      <svg viewBox="0 0 100 100">
        <circle class="ring-bg" cx="50" cy="50" r="40"/>
        <circle class="ring-fg" cx="50" cy="50" r="40"
          stroke="${color}"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"/>
        <text class="ring-text" x="50" y="55" text-anchor="middle">${score}</text>
      </svg>
      <div class="ring-label">${label}</div>
      ${prevText}
    </div>`;
}

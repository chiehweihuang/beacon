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

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, basename, join } from 'path';
import { fileURLToPath } from 'node:url';
import { REPORT_STYLES } from './report-styles.mjs';
import { renderFinding, renderCategory } from './report-components.mjs';
import { REPORT_INTERACTIONS } from './report-interactions.mjs';
import { JURISDICTIONS, legalExposureFor } from './jurisdictions.mjs';

// Product version, read at RUNTIME from wherever this script actually lives -- never
// injected at build time (the known release trap: a version-stamped generated file lags
// one version behind the next bump, since build.mjs only re-copies files that changed).
// Walks up from this file's own directory looking for a plugin manifest; one loop covers
// every deployment shape (repo checkout at core/scripts or the propagated scripts/ /
// adapters/codex/scripts/ copies, or a plugin-cache install) instead of three hardcoded
// relative paths, since `.claude-plugin/` or `.codex-plugin/` always sits a small, fixed
// number of directories above wherever this script happens to be mounted.
function readProductVersion() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    for (const manifest of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      const p = join(dir, manifest);
      if (existsSync(p)) {
        try {
          const v = JSON.parse(readFileSync(p, 'utf8')).version;
          if (v) return v;
        } catch { /* malformed manifest -- keep walking, never guess */ }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return null; // render nothing rather than a wrong number
}

const productVersion = readProductVersion();

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

// Human-readable host for <title> — same hostname/www-strip technique as
// buildSlug above, but keeps case and drops the path (title bar wants
// "rakuten.co.jp", not a filename slug or the protocol/path noise).
function titleHost(audit) {
  const raw = audit?.metadata?.scope || audit?.metadata?.url || '';
  try { return new URL(raw).hostname.replace(/^www\./, ''); } catch { return raw || 'Project'; }
}

if (!outputPath) {
  const slug = buildSlug(audit);
  const date = audit.metadata?.date || 'latest';
  const parts = ['a11y-report', slug, date].filter(Boolean);
  outputPath = resolve(dirname(auditPath), `${parts.join('-')}.html`);
}

const DEFAULT_CATEGORY_WEIGHTS = {
  screenreader: 18, keyboard: 13, contrast: 13, forms: 13,
  responsive: 12, touch: 8, cognitive: 8, motion: 5, media: 5, agent: 5,
};

function reportCoverage(audit) {
  const summary = audit.summary || {};
  const categories = Array.isArray(summary.categories) ? summary.categories : [];
  const weights = summary.category_weights && typeof summary.category_weights === 'object'
    ? summary.category_weights
    : DEFAULT_CATEGORY_WEIGHTS;
  const weightOf = (cat) => Number(weights[cat.id]) || 0;
  const totalWeight = Number.isFinite(summary.scope_weight)
    ? summary.scope_weight
    : Object.values(weights).reduce((sum, weight) => sum + (Number(weight) || 0), 0);
  const scoredWeight = Number.isFinite(summary.scored_weight)
    ? summary.scored_weight
    : categories.filter(cat => cat.state === 'scored').reduce((sum, cat) => sum + weightOf(cat), 0);
  const applicableWeight = Number.isFinite(summary.applicable_weight)
    ? summary.applicable_weight
    : categories.filter(cat => cat.state !== 'not-applicable').reduce((sum, cat) => sum + weightOf(cat), 0);
  const notApplicableWeight = Math.max(0, totalWeight - applicableWeight);
  const coveragePercent = Number.isFinite(summary.coverage_percent)
    ? summary.coverage_percent
    : Math.round((scoredWeight / totalWeight) * 100);
  return {
    categoryCount: Object.keys(weights).length,
    totalWeight,
    applicablePercent: Number.isFinite(summary.applicable_weight_percent)
      ? summary.applicable_weight_percent
      : Math.round((applicableWeight / totalWeight) * 100),
    evidencePercent: coveragePercent,
    unverifiedPercent: Math.round((Math.max(0, applicableWeight - scoredWeight) / totalWeight) * 100),
    notApplicablePercent: Math.round((notApplicableWeight / totalWeight) * 100),
  };
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
    th_score: '結果',
    state_not_machine_checkable: '已完成靜態掃描 · 需人工驗證',
    state_not_applicable: '已完成靜態掃描 · 本頁不適用',
    category_summary_note: '所有分類都已執行靜態掃描。只要取得可計分機器證據（哪怕只有一筆）就顯示分數，證據量不足 3 筆會標示「證據薄弱」；其餘分類顯示掃描狀態。',
    category_expand_all: '全部展開',
    category_collapse_all: '全部收合',
    category_show_details: '展開詳情',
    category_hide_details: '收合詳情',
    category_detail_scored: '已取得可計分的機器證據。',
    category_detail_manual: '靜態掃描已完成；這類檢查需要瀏覽器、輔助科技或人工操作，因此不製造分數。實際數值（如對比度、觸控目標尺寸等）需透過瀏覽器層或人工檢測（tier 2）取得。',
    category_detail_na: '靜態掃描已完成；本次範圍沒有偵測到此分類可檢查的內容。',
    score_qual_thin: '證據薄弱',
    coverage_line: '已取得機器證據',
    coverage_note: '依固定機器檢查範圍計算',
    scope_line: '固定機器檢查範圍',
    applicable_line: '本頁適用範圍',
    unverified_line: '適用但尚未驗證',
    not_applicable_line: '本頁不適用',
    score_na: '—',
    // Meta line
    meta_date: '日期',
    meta_scope: '範圍',
    meta_url: '受測網頁',
    meta_standard: '標準',
    meta_auditor: '審查者',
    // Verdict (suggestion-toned, not judgmental)
    verdict_pass: '達到基準',
    verdict_pass_thin: '已檢查範圍未發現確認問題，不能判定整體達標',
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
    finding_standard: '標準',
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
    th_score: 'Result',
    state_not_machine_checkable: 'Static scan complete · human verification needed',
    state_not_applicable: 'Static scan complete · not applicable here',
    category_summary_note: 'Every category was statically scanned. A score appears as soon as any machine-scoreable evidence exists, even a single check; under 3 checks is marked "thin evidence". Otherwise the completed scan state is shown.',
    category_expand_all: 'Expand all',
    category_collapse_all: 'Collapse all',
    category_show_details: 'Show details',
    category_hide_details: 'Hide details',
    category_detail_scored: 'Machine-scoreable evidence was collected.',
    category_detail_manual: 'The static scan completed. This category needs browser, assistive-technology, or human interaction evidence, so no score is invented. Real measurements (contrast ratio, touch-target size, etc.) require browser-level or human testing (tier 2).',
    category_detail_na: 'The static scan completed. No applicable content for this category was detected in the audited scope.',
    score_qual_thin: 'thin evidence',
    coverage_line: 'Machine evidence obtained',
    coverage_note: 'calculated against the fixed machine-check scope',
    scope_line: 'Fixed machine-check scope',
    applicable_line: 'Applicable to this page',
    unverified_line: 'Applicable but not verified',
    not_applicable_line: 'Not applicable here',
    score_na: 'n/a',
    meta_date: 'Date',
    meta_scope: 'Scope',
    meta_url: 'Audited page',
    meta_standard: 'Standard',
    meta_auditor: 'Auditor',
    verdict_pass: 'Meets baseline',
    verdict_pass_thin: 'No confirmed issues in the checked scope; overall status not determined',
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
    finding_standard: 'Standard',
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

// Each key's `standard` field states what the cited criterion actually
// REQUIRES (not just what this detector flags) — the decision rule where one
// exists, so a reader learns the norm, not only the patch. Grounded in
// core/references/wcag-quick.md's rule column + the well-established SC text
// for each criterion (2.2 Recommendation); the 6 non-WCAG keys (AEO/agent
// structural hygiene) say plainly that they are NOT a WCAG requirement.
const FINDING_I18N = {
  'html-lang-missing': {
    zh: { title: '頁面語言缺失', description: 'HTML 頁面沒有宣告 lang attribute，assistive technology 可能使用錯誤的發音規則。', fix: '加入正確的語言 attribute，例如 <html lang="zh-Hant">。', standard: 'WCAG 3.1.1 要求每個頁面都要宣告其預設語言；缺少 lang 屬性時，螢幕閱讀器可能套用錯誤的發音與斷句規則朗讀內容。' },
    en: { title: 'Page language is missing', description: 'The HTML page does not declare a lang attribute, so assistive technology may choose the wrong pronunciation rules.', fix: 'Add a language attribute such as <html lang="zh-Hant"> or the correct document language.', standard: 'WCAG 3.1.1 requires every page to declare its default language; without a lang attribute, screen readers may apply the wrong pronunciation and phrasing rules to the content.' },
  },
  'html-lang-mismatch': {
    zh: { title: '宣告的頁面語言與內容不符', description: '偵測到內容語言不符。宣告錯誤比完全沒宣告更糟，assistive technology 會有信心地套用錯誤的發音與翻譯規則。', fix: '把 <html lang> 設為實際內容語言。', standard: 'WCAG 3.1.1 要求宣告的語言必須符合實際內容語言；宣告錯誤比完全沒宣告更糟，因為輔助科技會「有信心地」套用錯誤的發音與翻譯規則。' },
    en: { title: 'Declared page language does not match the content', description: 'Content-language mismatch. A wrong language declaration is worse than a missing one — assistive technology applies confidently wrong pronunciation and translation rules.', fix: 'Set <html lang> to the actual content language.', standard: 'WCAG 3.1.1 requires the declared language to match the actual content language; a wrong declaration is worse than none, because assistive tech confidently applies the wrong pronunciation and translation rules.' },
  },
  'html-lang-mismatch-review': {
    zh: { title: '頁面語言可能與內容不符', description: '可能的內容語言不符，這可能是合理的未標記雙語內容，請先確認主要語言再修改。', fix: '確認 <html lang> 符合主要內容語言；其他語言段落另用自己的 lang 屬性標記（3.1.2）。', standard: 'WCAG 3.1.1 要求宣告的語言必須符合實際內容語言；本項為偵測到「可能」不符的情況（例如合理的雙語內容），需人工確認主要語言後再決定是否修改 lang 屬性。' },
    en: { title: 'Page language may not match the content', description: 'Possible content-language mismatch — this can be legitimate untagged bilingual content, so verify the primary language before changing it.', fix: 'Confirm <html lang> matches the primary content language, and mark other-language passages with their own lang attribute (3.1.2 Language of Parts).', standard: 'WCAG 3.1.1 requires the declared language to match the actual content language; this is a POSSIBLE mismatch (e.g. legitimate bilingual content can trigger it) — confirm the primary language before changing the lang attribute.' },
  },
  'html-lang-invalid': {
    zh: { title: '宣告的頁面語言不是有效的語言標籤', description: 'lang 的值不是格式正確的 BCP-47 語言標籤，assistive technology 與翻譯工具無法可靠解讀。', fix: '使用有效的 BCP-47 語言標籤，例如 <html lang="en"> 或 <html lang="zh-Hant">。', standard: 'WCAG 3.1.1 要求宣告的語言必須是有效的語言標籤（BCP-47）；一個看似有值但格式不正確的 lang（例如整個單字拼出的語言名稱），輔助科技無法辨識，效果等同完全沒有宣告語言。' },
    en: { title: 'Declared page language is not a valid language tag', description: 'The lang value is not a well-formed BCP-47 language tag, so assistive technology and translation tools cannot reliably interpret it.', fix: 'Use a valid BCP-47 language tag, such as <html lang="en"> or <html lang="zh-Hant">.', standard: 'WCAG 3.1.1 requires the declared language to be a valid language tag (BCP-47); a lang value that looks populated but is malformed (e.g. a language spelled out as a whole word) is unrecognizable to assistive technology — functionally no different from declaring no language at all.' },
  },
  'document-title-missing': {
    zh: { title: '文件標題缺失', description: '缺少或空白的 title 會讓頁面在瀏覽器與 assistive technology 中難以辨識。', fix: '加入簡短且唯一的 <title>。', standard: 'WCAG 2.4.2 要求每個頁面都要有描述性的 <title>；缺少或空白的標題，會讓使用者在瀏覽器分頁、書籤與螢幕閱讀器中都無法辨識頁面。' },
    en: { title: 'Document title is missing', description: 'A missing or empty title makes the page difficult to identify in browser and assistive technology contexts.', fix: 'Add a concise, unique <title>.', standard: 'WCAG 2.4.2 requires every page to have a descriptive <title>; a missing or empty title makes the page unidentifiable in browser tabs, bookmarks, and screen readers alike.' },
  },
  'main-landmark-missing': {
    zh: { title: '靜態 markup 中看不到 main landmark', description: '靜態檔案中沒有找到 <main> 或 role="main"。', fix: '用 <main id="main-content"> 包住主要內容。', standard: 'WCAG 1.3.1 要求版面的結構與關係要能以程式化方式辨識；<main> landmark 讓螢幕閱讀器與鍵盤使用者能一步跳到主要內容，而不必逐一略過重複的頁首與導覽。' },
    en: { title: 'Main landmark is not statically visible', description: 'No <main> or role="main" was found in this static file.', fix: 'Wrap primary page content in <main id="main-content">.', standard: 'WCAG 1.3.1 requires that structure and relationships be programmatically determinable; a <main> landmark lets screen-reader and keyboard users jump straight to primary content instead of tabbing past repeated headers and navigation each time.' },
  },
  'headings-missing': {
    zh: { title: '沒有 heading 結構', description: '靜態 markup 沒有 heading structure。', fix: '加入有意義的 h1 與描述頁面結構的巢狀 heading。', standard: 'WCAG 2.4.6 要求已存在的標題要能清楚描述主題或用途，並依邏輯層級排列；完全沒有標題結構，會讓依賴標題導覽（screen reader 的 heading 清單）的使用者失去頁面地圖。' },
    en: { title: 'No headings found', description: 'The static markup has no heading structure.', fix: 'Add a meaningful h1 and nested headings that describe the page structure.', standard: 'WCAG 2.4.6 requires headings, where present, to clearly describe topic or purpose and follow a logical order; a page with no heading structure at all removes the page map that heading-navigation (a core screen-reader technique) depends on.' },
  },
  'heading-level-skipped': {
    zh: { title: 'Heading level 跳級', description: 'Heading hierarchy 有跳級，會影響用 heading 導覽的使用者。', fix: '使用連續的 heading hierarchy，或只調整視覺樣式而不改 semantic level。', standard: 'WCAG 1.3.1 要求版面結構要能以程式化方式辨識；標題層級代表巢狀大綱，跳過層級（如 h1 直接到 h3）會讓依賴大綱導覽的使用者誤判內容的從屬關係。' },
    en: { title: 'Heading level is skipped', description: 'Heading hierarchy skips a level.', fix: 'Use a continuous heading hierarchy or adjust the visual style without changing semantic level.', standard: 'WCAG 1.3.1 requires document structure to be programmatically determinable; heading levels represent a nested outline, and skipping a level (e.g. h1 straight to h3) misrepresents that hierarchy for anyone navigating by outline.' },
  },
  'image-alt-missing': {
    zh: { title: '圖片缺少 alt text', description: '沒有 alt text 的圖片可能在 assistive technology 中沉默或被不清楚地朗讀。', fix: '為有意義的圖片加入 alt text；純裝飾圖片使用 alt=""。', standard: 'WCAG 1.1.1 要求所有非文字內容都要有文字替代：功能性圖片（如圖示按鈕）替代文字描述其功能，資訊性圖片描述其內容，純裝飾圖片則必須明確標記（alt=""、aria-hidden 或 role="presentation"）讓輔助科技略過。本檢查不判斷圖片是否為裝飾，未標記本身即是違規，修正時依上述準則二選一。' },
    en: { title: 'Image is missing alt text', description: 'An image without alt text is silent or announced poorly by assistive technology.', fix: 'Add meaningful alt text, or alt="" for purely decorative images.', standard: 'WCAG 1.1.1 requires every non-text content item to have a text alternative: functional images (e.g. icon buttons) take their function as the alt text, informative images describe their content, and purely decorative images must be explicitly marked (alt="", aria-hidden, or role="presentation") so assistive tech skips them. This check does not judge whether an image is decorative — being unmarked is itself the violation; fix by choosing one of the above.' },
  },
  'list-non-li-child': {
    zh: { title: 'List 含有非 list-item 直接子元素', description: '<ul>/<ol> 的直接子元素不是 <li>、<script> 或 <template>，screen reader 可能無法正確朗讀 list 或 item count。', fix: '讓 <li> 成為唯一結構子元素；或在不可避免的非標準結構中使用 role="list"/role="listitem"。', standard: 'WCAG 1.3.1 要求清單的結構關係要能以程式化方式辨識；<ul>/<ol> 的直接子元素若不是 <li>，screen reader 可能無法正確朗讀清單或項目數量。' },
    en: { title: 'List contains a non-list-item child', description: 'A <ul>/<ol> has a direct child that is not <li>, <script>, or <template>. Screen readers may not announce the list or its item count correctly.', fix: 'Make <li> the only structural child; move wrapper elements inside an <li>, or use role="list"/role="listitem" if a non-standard structure is unavoidable.', standard: "WCAG 1.3.1 requires a list's structural relationships to be programmatically determinable; if a <ul>/<ol>'s direct child isn't <li>, a screen reader may not announce the list or its item count correctly." },
  },
  'button-name-missing': {
    zh: { title: 'Button 可能沒有 accessible name', description: '沒有可見文字或 accessible label 的 button 會讓使用者難以理解或用名稱操作。', fix: '加入可見文字、aria-label 或 aria-labelledby。', standard: 'WCAG 4.1.2 要求每個可互動元件都要有可程式化辨識的名稱；按鈕若只靠圖示或空白內容，使用者將無法得知其功能。' },
    en: { title: 'Button may not have an accessible name', description: 'A button with no visible text or accessible label is hard to understand or activate by name.', fix: 'Add visible text, aria-label, or aria-labelledby.', standard: 'WCAG 4.1.2 requires every interactive component to expose a programmatically determinable name; a button relying only on an icon or empty content leaves users unable to tell what it does.' },
  },
  'link-name-missing': {
    zh: { title: 'Link 可能沒有 accessible name', description: 'Link 沒有可見文字、ARIA label、title、圖片 alt 或 SVG title 時，screen reader 可能只朗讀為一般 link。', fix: '加入可見 link text、aria-label/aria-labelledby/title、包裹圖片的 alt text，或 <svg><title>。', standard: 'WCAG 4.1.2 要求每個可互動元件都要有可程式化辨識的名稱、角色與狀態；連結必須有可辨識的名稱才能被輔助科技正確朗讀與操作，名稱可以是可見文字、aria-label/aria-labelledby、title，或包裹圖片的 alt 文字。' },
    en: { title: 'Link may not have an accessible name', description: 'A link with no visible text, no aria-label/aria-labelledby/title, and no image alt or SVG title has no accessible name.', fix: 'Add visible link text, an aria-label/aria-labelledby/title, give a wrapped <img> meaningful alt text, or add an <svg><title>.', standard: "WCAG 4.1.2 requires every interactive component to expose a programmatically determinable name, role, and state; a link needs a discoverable name so assistive tech can announce and operate it — the name can come from visible text, aria-label/aria-labelledby, title, or a wrapped image's alt text." },
  },
  'clickable-non-button': {
    zh: { title: '可點擊元素不是 button', description: '可點擊的 <div> 或 <span> 預設無法用鍵盤操作。', fix: '動作使用 <button>；若必須自訂語意，加入 role、tabindex 與 Enter/Space handling。', standard: 'WCAG 2.1.1 要求所有功能都能單靠鍵盤操作；可點擊的 <div>/<span> 預設無法被 Tab 聚焦或用 Enter/Space 觸發，鍵盤使用者將完全無法使用該功能。' },
    en: { title: 'Clickable non-button element', description: 'Clickable <div> or <span> elements are not keyboard-operable by default.', fix: 'Use <button> for actions. If custom semantics are unavoidable, add role, tabindex, and Enter/Space handling.', standard: "WCAG 2.1.1 requires all functionality to be operable by keyboard alone; a clickable <div>/<span> is not Tab-focusable or Enter/Space-activatable by default, so keyboard users can't use it at all." },
  },
  'input-label-missing': {
    zh: { title: 'Input 可能缺少 accessible label', description: 'Input 在靜態 markup 中沒有明顯 id 或 ARIA label。', fix: '搭配 <label for="...">，或在已有可見 label 時使用 aria-labelledby。', standard: 'WCAG 3.3.2 要求每個輸入欄位都要有可見且已關聯的標籤或說明；沒有 <label> 或對應 ARIA 標籤的欄位，使用者（尤其是螢幕閱讀器與語音控制使用者）無法得知該填什麼。' },
    en: { title: 'Input may be missing an accessible label', description: 'The input has no obvious id or ARIA label in static markup.', fix: 'Pair it with a <label for="..."> or use aria-labelledby when a visible label already exists.', standard: 'WCAG 3.3.2 requires every input to have a visible, associated label or instruction; a field with no <label> or matching ARIA label leaves users — especially screen-reader and voice-control users — unable to tell what to enter.' },
  },
  'input-label-weak': {
    zh: { title: 'Input 僅由 title 或 placeholder 命名，非持久可見標籤', description: '該 input 有 accessible name（來自 title 或 placeholder），並非完全無名，但兩者都不是持久可見的標籤。', fix: '加入可見的 <label for="...">（或用 label 包裹該欄位），讓標籤在使用者開始輸入後依然存在。', standard: 'title／placeholder 可滿足 WCAG 4.1.2 的 accessible name 計算（axe 對僅有 title 或 placeholder 的做法同樣視為有名稱），但不符合 3.3.2「指示性標籤」的用意：placeholder 內容會在輸入後消失，title 也不是持久可見的標籤，因此列為待複審而非直接判定失敗。' },
    en: { title: 'Input is named only by title or placeholder, not a persistent visible label', description: 'The input has an accessible name (from title or placeholder), so it is not nameless, but neither is a visible label that persists once the field has content.', fix: 'Add a visible <label for="..."> (or wrap the input in one) so the label persists once the user starts typing.', standard: 'title/placeholder satisfy WCAG 4.1.2\'s accessible-name computation (axe treats title-only or placeholder-only the same way), but not 3.3.2\'s instructive-label intent: placeholder text disappears once typing starts, and title is not a persistent visible label — flagged for review rather than a hard fail.' },
  },
  'viewport-meta-missing': {
    zh: { title: 'Viewport meta tag 缺失', description: '缺少 viewport meta tag 會讓 mobile layout 與 zoom 行為變得不可用。', fix: '加入 <meta name="viewport" content="width=device-width, initial-scale=1">。', standard: 'WCAG 1.4.10 要求內容在 320px 寬度下能正確回流、不需雙向捲動；缺少 viewport meta 標籤時，行動裝置通常會強制縮放整頁而非重排版面。' },
    en: { title: 'Viewport meta tag is missing', description: 'Without a viewport meta tag, mobile layout and zoom behavior can become unusable.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.', standard: 'WCAG 1.4.10 requires content to reflow correctly at 320px width without two-axis scrolling; without a viewport meta tag, mobile browsers typically zoom the whole page out instead of reflowing it.' },
  },
  'viewport-zoom-disabled': {
    zh: { title: 'Viewport meta 禁用 zoom', description: 'Viewport meta 阻止使用者放大文字。', fix: '移除 user-scalable=no 與低於 5 的 maximum-scale。', standard: 'WCAG 1.4.4 要求文字在不損失內容或功能的情況下可放大至 200%；viewport meta 若設定 user-scalable=no 或過低的 maximum-scale，會直接剝奪使用者縮放頁面的能力。' },
    en: { title: 'Viewport meta disables zoom', description: 'The viewport meta tag prevents zoom, so users cannot enlarge text.', fix: 'Remove user-scalable=no and any maximum-scale below 5; use content="width=device-width, initial-scale=1".', standard: "WCAG 1.4.4 requires text to be resizable up to 200% without loss of content or function; a viewport meta with user-scalable=no or a very low maximum-scale directly removes the user's ability to zoom." },
  },
  'meta-description-missing': {
    zh: { title: 'Meta description 缺失', description: '靜態 HTML 中沒有找到 meta description。', fix: '加入簡短且頁面專屬的 meta description。', standard: '這不是 WCAG 準則，而是 AEO 結構慣例：meta description 提供簡短摘要，供搜尋結果與 AI 引擎摘要頁面時使用；缺少時，摘要文字通常由引擎自行從內文擷取，品質難以掌控。' },
    en: { title: 'Meta description is missing', description: 'No meta description was found in the static HTML.', fix: 'Add a concise page-specific meta description.', standard: "This is not a WCAG criterion — it's an AEO structural convention: a meta description supplies the short summary search results and AI engines use when representing the page; without it, the summary is auto-extracted from body text with unpredictable quality." },
  },
  'canonical-missing': {
    zh: { title: 'Canonical link 缺失', description: '靜態 HTML 中沒有找到 canonical URL，crawler 可能需要自行推斷偏好的 URL。', fix: '為可索引公開頁加入 <link rel="canonical" href="https://example.com/preferred-url">。', standard: '這不是 WCAG 準則，而是 AEO 結構慣例：canonical link 讓搜尋引擎與 AI agent 判斷你偏好的網址版本，避免重複內容分散排名或引用機會。' },
    en: { title: 'Canonical link is missing', description: 'No canonical URL was found in the static HTML, so crawlers may have to infer the preferred URL.', fix: 'Add <link rel="canonical" href="https://example.com/preferred-url"> for indexable public pages.', standard: "This is not a WCAG criterion — it's an AEO (answer-engine optimization) structural convention: a canonical link tells search engines and AI agents which URL you prefer, so duplicate content doesn't split ranking or citation credit." },
  },
  // hakuso medium-d (2026-08-29): six equally-weighted schema options with no default read
  // as direct-fix-ready but forced a content/product decision an agent shouldn't make
  // arbitrarily. Lead with one concrete pick for the common case, alternatives second.
  'jsonld-missing': {
    zh: { title: 'JSON-LD structured data 缺失', description: '靜態 HTML 中沒有找到 JSON-LD structured data。', fix: '加入 Schema.org JSON-LD。一般頁面預設用 WebSite（公司／品牌頁用 Organization）；只有在頁面明確屬於特定類型時，才改用 Article、FAQPage、Product 或 BreadcrumbList。', standard: '這不是 WCAG 準則，而是 AEO 結構慣例：JSON-LD structured data 讓搜尋引擎與 AI agent 更準確理解頁面內容的類型與關係（例如文章、商品、組織），提高被正確引用的機會。' },
    en: { title: 'JSON-LD structured data is missing', description: 'No JSON-LD structured data was found in the static HTML.', fix: 'Add Schema.org JSON-LD. Default to WebSite for a general page (or Organization for a company/brand page); use a more specific type instead — Article, FAQPage, Product, or BreadcrumbList — only when the page is clearly that kind of content.', standard: "This is not a WCAG criterion — it's an AEO structural convention: JSON-LD structured data helps search engines and AI agents understand what a page is (article, product, organization) and how its parts relate, improving the odds of being cited correctly." },
  },
  'robots-txt-missing': {
    zh: { title: '掃描站點檔案中沒有 robots.txt', description: '掃描的目錄中沒有找到 robots.txt。Agent 與 crawler 對可存取範圍會缺少明確指引。', fix: '在 site root 加入 robots.txt。公開 AI-facing site 可考慮加入 sitemap 與符合政策的 Content-Signal directives。', standard: '這不是 WCAG 準則，而是 agent readiness 結構慣例：robots.txt 明確告知爬蟲與 AI agent 可存取的範圍；缺少時，crawler 對可存取內容缺乏明確依據。' },
    en: { title: 'robots.txt was not found in the scanned site files', description: 'No robots.txt file was found in the scanned directory. Agents and crawlers may have less explicit guidance about what they can access.', fix: 'Add a site-root robots.txt. For public AI-facing sites, consider explicit sitemap and Content-Signal directives that match your policy.', standard: "This is not a WCAG criterion — it's an agent-readiness structural convention: robots.txt explicitly states what crawlers and AI agents may access; without it, they have no explicit basis for what's fair game." },
  },
  'sitemap-missing': {
    zh: { title: '掃描站點檔案中沒有 sitemap.xml', description: '掃描的目錄中沒有找到 sitemap.xml。', fix: '在 site root 加入 sitemap.xml，並從 robots.txt 參照它，讓 crawler 更容易找到重要公開 URL。', standard: '這不是 WCAG 準則，而是 agent readiness 結構慣例：sitemap.xml 列出重要公開網址，協助爬蟲與 AI agent 發現內容，尤其是內部連結較少的頁面。' },
    en: { title: 'sitemap.xml was not found in the scanned site files', description: 'No sitemap.xml file was found in the scanned directory.', fix: 'Add a site-root sitemap.xml and reference it from robots.txt so crawlers can discover important public URLs.', standard: "This is not a WCAG criterion — it's an agent-readiness structural convention: sitemap.xml lists important public URLs, helping crawlers and AI agents discover content, especially pages with few internal links." },
  },
  'llms-txt-missing': {
    zh: { title: '掃描站點檔案中沒有 llms.txt', description: '掃描的目錄中沒有找到 llms.txt。這是 optional proposed convention，但可協助 agent 找到重要內容。', fix: '可考慮加入 site-root llms.txt，用純文字描述網站、重要頁面、docs、API 與 crawl/use policy。', standard: '這不是 WCAG 準則，也不是正式標準，而是一個尚在推廣中的慣例：llms.txt 用純文字列出網站的重要頁面與說明，協助 agent 找到重要內容，屬於可選加分項。' },
    en: { title: 'llms.txt was not found in the scanned site files', description: 'No llms.txt file was found in the scanned directory. This proposed convention is optional, but can help agents find the most important content.', fix: 'Consider adding a site-root llms.txt that describes the site, key pages, docs, APIs, and crawl/use policy in plain text.', standard: "This is not a WCAG criterion, nor a formal standard yet — it's a proposed, optional convention: llms.txt lists a site's key pages and docs in plain text to help agents find important content." },
  },
  'focus-outline-removed': {
    zh: { title: 'Focus outline 被移除且沒有替代', description: '移除 outline 又沒有 :focus-visible 替代，會讓鍵盤位置不可見。', fix: '恢復 outline，或加入強烈且清楚的 :focus-visible style。', standard: 'WCAG 2.4.7 要求鍵盤焦點所在位置必須隨時可見；移除 outline 卻沒有替代樣式，鍵盤使用者會完全看不到目前焦點在哪裡。' },
    en: { title: 'Focus outline removed without replacement', description: 'Removing outline without a :focus-visible replacement makes keyboard location invisible.', fix: 'Restore outline or add a strong :focus-visible style.', standard: 'WCAG 2.4.7 requires the keyboard focus indicator to always be visible; removing outline without a replacement leaves keyboard users with no way to see where focus currently is.' },
  },
  'fixed-minmax-overflow': {
    zh: { title: '固定 minmax grid 可能在窄螢幕 overflow', description: 'minmax(Npx, 1fr) 會保留固定最小寬度，可能在 320px overflow。', fix: '使用 minmax(min(Npx, 100%), 1fr)。', standard: 'WCAG 1.4.10 要求內容在 320px 寬度下能正確回流；CSS Grid 用 minmax(Npx, 1fr) 保留固定最小寬度，在比該寬度更窄的視窗會強制產生水平捲動。' },
    en: { title: 'Fixed minmax grid can overflow narrow screens', description: 'minmax(Npx, 1fr) keeps a fixed minimum that can overflow at 320px.', fix: 'Use minmax(min(Npx, 100%), 1fr).', standard: 'WCAG 1.4.10 requires content to reflow correctly at 320px width; a CSS Grid minmax(Npx, 1fr) keeps a fixed minimum width, forcing horizontal scroll on any viewport narrower than that.' },
  },
  'motion-reduced-motion-missing': {
    zh: { title: '有 motion 但缺少 reduced-motion handling', description: '偵測到 animation 或 transition，但沒有 prefers-reduced-motion handling。', fix: '加入 @media (prefers-reduced-motion: reduce)，停用或縮短非必要 motion。', standard: 'WCAG 2.3.3（AAA，本檢查作為最佳實務建議，非 A/AA 基準要求）要求非必要的互動動畫要能被使用者關閉；沒有 prefers-reduced-motion 處理，前庭功能障礙或偏頭痛使用者無法停用可能引發不適的動態效果。' },
    en: { title: 'Motion exists without reduced-motion handling', description: 'Animation or transitions were detected, but no prefers-reduced-motion handling was found in this file.', fix: 'Add @media (prefers-reduced-motion: reduce) to disable or shorten non-essential motion.', standard: 'WCAG 2.3.3 (AAA — flagged here as best practice, not an A/AA baseline requirement) requires that non-essential interaction-triggered animation can be turned off; without prefers-reduced-motion handling, users with vestibular disorders or migraines have no way to disable motion that can cause real discomfort.' },
  },
  'large-fixed-width': {
    zh: { title: '偵測到大型固定寬度', description: '大型固定寬度可能在窄 viewport overflow。', fix: '使用 max-width、min()、clamp() 或 container-relative sizing。', standard: 'WCAG 1.4.10 要求內容在 320px 寬度下能正確回流；任何未受限的大型固定寬度元素，都可能在窄視窗造成水平捲動。' },
    en: { title: 'Large fixed width detected', description: 'Large fixed widths may overflow narrow viewports.', fix: 'Use max-width, min(), clamp(), or container-relative sizing.', standard: 'WCAG 1.4.10 requires content to reflow correctly at 320px width; any unconstrained large fixed-width element can force horizontal scroll on a narrow viewport.' },
  },
  // hakuso CRITICAL 2026-08-29: this entry shadows the engine's own `description` field
  // (findingText() prefers this table over the raw finding), so the mandatory verification
  // caveat added at the detector (static-audit.mjs) rendered in NEITHER language until it
  // was copied into both zh/en descriptions here too. Keep both in sync going forward.
  'click-handler-keyboard-missing': {
    zh: { title: 'Click handler 附近缺少鍵盤處理', description: '偵測到 click listener，但同一段附近沒有鍵盤支援。此為程式碼鄰近特徵的推測，無法看到元件語意：請先確認目標不是原生互動元素（例如 click 監聽器其實綁在 <button> 上），也不是被動的 analytics 監聽器，再視為已確認缺陷。', fix: '優先使用 native button，或加入 Enter/Space keyboard support 與 focus management。', standard: 'WCAG 2.1.1 要求所有功能都能單靠鍵盤操作；只綁定 click 事件、沒有對應鍵盤處理的元件，等同對鍵盤使用者不存在。' },
    en: { title: 'Click handler lacks nearby keyboard handling', description: 'A click listener was found without nearby keyboard support in the same snippet. This heuristic cannot see element semantics: verify the target is not a native interactive element (e.g. a <button> the listener is bound to) or a passive/analytics listener before treating this as a confirmed defect.', fix: 'Prefer a native button, or add Enter/Space keyboard support and focus management.', standard: "WCAG 2.1.1 requires all functionality to be operable by keyboard alone; a component wired only to a click handler, with no matching keyboard handling, is effectively invisible to keyboard users." },
  },
  'frame-title-missing': {
    zh: { title: '框架缺少 title', description: '<iframe> 沒有 title，螢幕閱讀器使用者在進入前無法得知框架內容。', fix: '加入 title="..." 描述框架內容。', standard: 'WCAG 4.1.2 要求每個可互動元件（含框架）都要有可程式化辨識的名稱；<iframe> 沒有 title，螢幕閱讀器使用者在進入前無法得知框架內容。' },
    en: { title: 'Frame is missing a title', description: 'An <iframe> without a title gives screen-reader users no way to know what the frame contains before entering it.', fix: 'Add title="..." describing the frame content.', standard: 'WCAG 4.1.2 requires every interactive component, including frames, to expose a programmatically determinable name; an <iframe> without a title gives screen-reader users no way to know what it contains before entering it.' },
  },
  'static-contrast-sub-threshold': {
    zh: { title: '靜態可解析的對比配對低於門檻', description: '從 inline style 或同檔案 <style> 區塊解析出的字色／底色配對，計算後低於 4.5:1。', fix: '提高前景與背景的對比，或在真實瀏覽器中確認（此配對只從靜態原始碼解析，尚未在瀏覽器中驗證）。', standard: 'WCAG 1.4.3 要求一般文字的對比至少達 4.5:1；本項目是從原始碼中「確定無疑」的字面顏色配對計算出來的參考值，僅供佐證用，不計入分數，仍需搭配瀏覽器或 tier-2 工具做最終確認。' },
    en: { title: 'Statically-resolvable contrast pair is below the threshold', description: 'A foreground/background color pair resolved from inline styles or a same-file <style> block computes below 4.5:1.', fix: 'Increase the foreground/background contrast, or confirm in a real browser (this pair was resolved from static source only, not yet browser-verified).', standard: 'WCAG 1.4.3 requires normal text to reach at least a 4.5:1 contrast ratio; this is a reference value computed from a literal, unambiguous color pair found in the source — evidence only, never scored, and still needs a real-browser or tier-2 confirmation.' },
  },
  'non-text-contrast-sub-threshold': {
    zh: { title: '靜態可解析的圖示對比低於門檻', description: '從 inline style 或同檔案 <style> 區塊解析出的圖示字色／底色配對（內容全為 Private-Use-Area 碼位，屬非文字圖示字符），計算後低於 3:1。', fix: '提高圖示與背景的對比，或在真實瀏覽器中確認（此配對只從靜態原始碼解析，尚未在瀏覽器中驗證）。', standard: 'WCAG 1.4.11 要求圖形物件的對比至少達 3:1；由 Private-Use-Area 碼位組成的節點（如圖示字型字符）不是人類語言文字，適用 1.4.11 而非 1.4.3 的 4.5:1。本項目僅供佐證用，不計入分數，仍需搭配瀏覽器或 tier-2 工具做最終確認。' },
    en: { title: 'Statically-resolvable icon contrast pair is below the threshold', description: 'A foreground/background color pair for an icon node (content is entirely Private-Use-Area codepoints, i.e. a non-text glyph) resolved from inline styles or a same-file <style> block computes below 3:1.', fix: 'Increase the icon/background contrast, or confirm in a real browser (this pair was resolved from static source only, not yet browser-verified).', standard: 'WCAG 1.4.11 requires graphical objects to reach at least a 3:1 contrast ratio; a node whose content is entirely Private-Use-Area codepoints (e.g. an icon-font glyph) is not human-language text, so 1.4.11 applies instead of 1.4.3\'s 4.5:1. Evidence only, never scored, and still needs a real-browser or tier-2 confirmation.' },
  },
  'static-contrast-evidence': {
    zh: { title: '靜態可解析對比配對彙總', description: '本次掃描中，所有能從靜態原始碼確定解析出的字色／底色配對總數，及其中低於 4.5:1 的數量。', fix: '檢視個別的低於門檻發現項，並用瀏覽器或 tier-2 工具做完整的對比稽核。', standard: 'WCAG 1.4.3 的對比要求需要瀏覽器算出的最終樣式才能完整驗證；本項目是靜態掃描能確定解析的配對彙總（inline／同檔案 style 區塊，不含外部 CSS 或 cascade 推測），作為佐證證據，從不計入分數。' },
    en: { title: 'Static-contrast-resolvable pairs, summarized', description: 'The total count of foreground/background pairs this scan could resolve with certainty from static source, and how many of those are below 4.5:1.', fix: 'Review the individual sub-threshold findings, and run a real-browser or tier-2 contrast audit for full coverage.', standard: 'WCAG 1.4.3 contrast ultimately needs browser-computed styles to verify fully; this is a summary of pairs the static scan could resolve with certainty (inline / same-file style blocks only, no external CSS or cascade guessing) — evidence only, never scored.' },
  },
  'contrast-not-verified': {
    zh: { title: '文字對比尚未取得瀏覽器測試結果', description: '目前還不知道文字與背景是否容易辨識。這份報告沒有網頁實際顯示顏色的量測結果，不能據此判定對比不合格。', fix: '請 agent 開啟受測頁面，執行對比檢查，再更新報告。先取得結果，不需要現在就修改顏色；工具無法判定的部分再交由人工確認。', standard: 'WCAG 1.4.3 的對比比例需要瀏覽器計算後的樣式才能完整驗證；純靜態掃描無法看到真實渲染後的顏色，因此明確標記為未驗證，而非默默略過或誤報通過。' },
    en: { title: 'Browser contrast results are not available', description: 'We do not yet know whether text is easy to distinguish from its background. This report has no measurements of the rendered colors; that does not establish a contrast failure.', fix: 'Ask the agent to open the audited page, check contrast and update the report. Get the results before changing colors. Have a person review anything the tool cannot determine.', standard: 'WCAG 1.4.3 contrast ratios require browser-computed styles to verify fully; a static-only scan cannot see real rendered color, so this is flagged explicitly as unverified rather than silently skipped or reported as a false pass.' },
  },
  'tier2-contrast-fail': {
    zh: { title: '瀏覽器量測對比低於門檻', description: '在真實瀏覽器渲染後，量測到的文字前景／背景對比低於 WCAG 門檻。', fix: '提高前景與背景的對比，直到一般文字達到 4.5:1、大型文字達到 3:1。', standard: 'WCAG 1.4.3 要求一般文字對比至少 4.5:1，大型文字（18pt 以上，或 14pt 以上粗體）至少 3:1；本項目由瀏覽器實際渲染後的計算樣式量測得出，比靜態解析更確定。這類發現預設只以證據呈現；只有在明確以 --merge-findings 併入時才會進入分數，併入後一旦該類別的機測數達到門檻就會計分。' },
    en: { title: 'Browser-measured contrast is below the threshold', description: 'After rendering in a real browser, the measured text foreground/background contrast is below the WCAG threshold.', fix: 'Increase the foreground/background contrast until it reaches 4.5:1 for normal text or 3:1 for large text.', standard: 'WCAG 1.4.3 requires normal text to reach at least 4.5:1 contrast, and large text (18pt+, or 14pt+ bold) at least 3:1; this is measured from real browser-rendered computed styles, stronger evidence than static parsing. Presented as evidence by default; it affects the score only when it is explicitly merged with --merge-findings, at which point the category can become scored once it has enough machine checks.' },
  },
  'tier2-contrast-unresolvable': {
    zh: { title: '文字對比無法解析（無法從計算樣式判定有效底色）', description: '該文字的有效底色無法單純從計算樣式推算：祖先元素繪製圖片或漸層、由 pseudo-element 或 inset box-shadow 繪製背景、有非祖先元素疊在其後，或頁面採用深色預設畫布（color-scheme: dark）。', fix: '以人工方式對照實際渲染結果確認對比，或在文字後方加上純色 fallback／覆蓋層以確保達到門檻。', standard: 'WCAG 1.4.3 的對比門檻仍然適用，但本工具誠實回報「無法解析」而非亂猜一個底色；這類項目需要人工確認，從不計入分數。' },
    en: { title: 'Text contrast could not be resolved (effective background not determinable from computed styles)', description: 'The effective background behind this text cannot be computed from styles alone — an ancestor paints a background-image or gradient, a pseudo-element or inset box-shadow paints behind the text, a non-ancestor element overlaps it, or the page relies on a dark default canvas (color-scheme: dark).', fix: 'Verify contrast manually against the actual rendered page, or add a solid-color fallback/overlay behind the text to ensure it meets the threshold.', standard: 'The WCAG 1.4.3 threshold still applies, but this tool honestly reports "unresolvable" instead of guessing a background color; these need manual confirmation and are never scored.' },
  },
  'tier2-touch-target-fail': {
    zh: { title: '瀏覽器量測觸控目標低於最小尺寸', description: '量測到的可互動元件尺寸低於 24×24px 下限，且鄰近元件落在間距例外的範圍內，因此不適用例外。', fix: '將目標放大至至少 24×24 CSS px，或讓中心與鄰近目標間距至少 24px。', standard: 'WCAG 2.5.8 要求可互動目標至少 24×24 CSS px；尺寸不足時，仍可透過與其他目標保持至少 24px 的中心點間距（以中心為圓心的間距圓）滿足例外，但當鄰近目標落在該間距圓內時，例外不成立。' },
    en: { title: 'Browser-measured touch target is below the minimum size', description: 'The measured interactive element is below the 24×24px floor, and a neighboring element falls inside the spacing exception\'s radius, so the exception does not apply.', fix: 'Enlarge the target to at least 24×24 CSS px, or move it at least 24px center-to-center from neighboring targets.', standard: 'WCAG 2.5.8 requires interactive targets to be at least 24×24 CSS px; an undersized target can still satisfy the exception by keeping at least 24px of center-to-center spacing (a spacing circle around its center) from other targets, but the exception does not apply when a neighboring target falls inside that circle.' },
  },
  'tier2-touch-target-advisory': {
    zh: { title: '觸控目標達到下限，但低於建議尺寸', description: '目標達到 WCAG 24×24px 下限，但小於 44×44px 的建議舒適尺寸。', fix: '版面允許時，考慮放大至 44×44 CSS px；這是最佳實務建議，不是 WCAG 違規。', standard: 'WCAG 2.5.8 的法定下限是 24×24 CSS px；44×44px 是業界建議的舒適觸控尺寸（非 WCAG 硬性規定），本項目僅作為佐證證據，從不計入分數。' },
    en: { title: 'Touch target meets the floor but is below the recommended size', description: 'The target meets the WCAG 24×24px minimum but is smaller than the 44×44px best-practice comfortable size.', fix: 'Consider enlarging to 44×44 CSS px where layout allows; this is a best-practice recommendation, not a WCAG violation.', standard: 'The WCAG 2.5.8 legal floor is 24×24 CSS px; 44×44px is an industry best-practice comfort size, not a WCAG requirement — this is evidence only and never scored.' },
  },
};

// static-audit.mjs's audit.legal_risk.jurisdictions still emits the original six short
// labels (unchanged, out of this expansion's scope) — map them to the expanded dataset's
// ids so the exec-summary's compact chip row stays audit-scoped while the full legal
// section (below) renders the complete jurisdictions.mjs reference.
const LEGACY_NAME_TO_ID = { 'US ADA': 'us', 'EU EAA': 'eu', 'Japan JIS': 'jp', 'Taiwan': 'tw', 'Canada ACA': 'ca', 'Australia DDA': 'au' };

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

/** Raw (unescaped-language, plain-string) title/description/fix text for one
 * language — used when composing a natural-language sentence around a finding
 * (e.g. "N critical findings: {title}, {title}"), where findingText()'s
 * bundled bilingual span pair can't be spliced mid-sentence. */
function findingLangText(f, field, lang) {
  const keyed = f?.key ? FINDING_I18N[f.key] : null;
  return keyed?.[lang]?.[field] || f?.[field] || '';
}

function localizedText(value) {
  if (value && typeof value === 'object') {
    return bi(escapeHtml(value.zh || value.en || ''), escapeHtml(value.en || value.zh || ''));
  }
  return escapeHtml(value || '');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

// Tier-2 provenance: tier2-audit.mjs stamps every finding with
// source:'beacon-tier2-audit@<n>' (DETECTOR_VERSION) — never overridden per-finding — so a
// prefix check is a stable way to tell "browser-measured" findings from static/axe ones,
// independent of the exact engine version string.
function isTier2Finding(f) {
  return typeof f?.source === 'string' && f.source.startsWith('beacon-tier2-audit');
}

// Measured-evidence counts for the category cards (item 1: provenance label + counts).
// Deliberately read from audit.tier2.summary.by_viewport (the denominator: samples/targets
// actually looked at, pass or fail) rather than from findings alone — findings only carry
// fails/reviews, so counting findings would silently hide "we measured N, all passed".
// audit.tier2 carries ONLY metadata+summary (no findings — those live in audit.findings
// already, spliced in alongside the static ones); see merge note in this file's report to
// the team lead. Never touches audit.summary/score — evidence display only.
function computeTier2EvidenceByCategory(audit) {
  const byViewport = asArray(audit?.tier2?.summary?.by_viewport);
  if (!byViewport.length) return {};
  // MEDIUM-1 (2026-07-26 merge audit): a viewport whose capture threw is recorded as
  // {viewport, error} with no numeric fields (core/scripts/tier2-audit.mjs) — it measured
  // nothing, so it must not appear in the "measured at" viewport label list.
  const erroredCount = byViewport.filter(v => v.error).length;
  const viewports = byViewport.filter(v => !v.error).map(v => v.viewport).filter(Boolean);
  const contrastMeasured = byViewport.reduce((s, v) => s + (v.contrast_samples || 0), 0);
  const touchMeasured = byViewport.reduce((s, v) => s + (v.touch_targets || 0), 0);
  const out = {};
  if (contrastMeasured > 0) out.contrast = { measured: contrastMeasured, viewports, erroredCount };
  if (touchMeasured > 0) out.touch = { measured: touchMeasured, viewports, erroredCount };
  return out;
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
  const level = levelFromAxeRule(rule);
  return {
    id: `axe-${rule.id || index}`,
    key: rule.id || undefined,
    source: 'axe',
    axe_rule_id: rule.id || undefined,
    category: categoryFromAxeRule(rule),
    severity: severityFromAxeRule(rule),
    wcag: wcagFromAxeRule(rule),
    level,
    title: rule.help || rule.description || rule.id || 'axe-core finding',
    affected_users: 'Users of assistive technology, keyboard navigation, low-vision settings, or other access adaptations depending on the failed rule.',
    location: nodes.length ? `${nodes.length} affected DOM element(s)` : 'Runtime DOM',
    description: rule.description || rule.help || `axe-core rule ${rule.id || index} failed.`,
    fix: rule.help ? `Resolve the axe-core rule "${rule.help}" for every listed DOM element.` : 'Review and remediate every listed DOM element.',
    // hakuso BLOCK (2026-08-29, item 5): route through the same jurisdiction-aware
    // derivation every other finding uses, instead of a second ad-hoc legal_exposure
    // string with its own vocabulary.
    legal_exposure: legalExposureFor(level).en,
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

const A11Y_DESIGN_EXPERIENCES = [
  { match: /touch-target|target-size/, label: '目標尺寸體驗 · Target-size experience' },
  { match: /input-label|label-title|label-content-name-mismatch/, label: '表單 label 體驗 · Form-label experience' },
  { match: /focus|keyboard|clickable-non-button/, label: '鍵盤與焦點體驗 · Keyboard and focus experience' },
  { match: /motion|marquee|blink/, label: '動態效果體驗 · Motion experience' },
  { match: /contrast|color-contrast|color-only/, label: '色彩與對比體驗 · Color and contrast experience' },
  { match: /caption|video|audio/, label: '字幕與聽覺體驗 · Captions and hearing experience' },
  { match: /image-alt|button-name|link-name|aria-|landmark|heading/, label: '螢幕閱讀器體驗 · Screen-reader experience' },
];

function a11yDesignExperience(f) {
  const id = [f?.key, f?.axe_rule_id, f?.axe_rule, f?.id].filter(Boolean).join(' ');
  const experience = A11Y_DESIGN_EXPERIENCES.find(({ match }) => match.test(id));
  return experience ? { href: 'https://chiehweihuang.github.io/a11y-design/#empathy', label: experience.label } : null;
}

function learnMoreLinks(f) {
  const links = [];
  if (f?.helpUrl) links.push({ href: f.helpUrl, label: f.axe_rule_id ? `axe: ${f.axe_rule_id}` : 'axe rule' });
  for (const id of criteriaFromFinding(f)) {
    const known = WCAG_CRITERIA[id];
    if (known?.url) links.push({ href: known.url, label: `WCAG ${id}` });
  }
  const experience = a11yDesignExperience(f);
  if (experience) links.push(experience);
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
  const ids = new Set(asArray(legal?.jurisdictions).map(j => LEGACY_NAME_TO_ID[j?.name]).filter(Boolean));
  return JURISDICTIONS.filter(j => ids.has(j.id));
}

const reportFindings = buildReportFindings(audit);
const axeResults = getAxeResults(audit);
const tier2Evidence = computeTier2EvidenceByCategory(audit);

// Score bands come from the audit artifact (summary.score_bands — static-audit.mjs is
// the single source); the fallback mirrors it for pre-@3 artifacts. A null score means
// "no machine evidence" and must never paint as a colour band.
const SCORE_BANDS = audit.summary?.score_bands?.length ? audit.summary.score_bands : [
  { min: 90, id: 'pass' },
  { min: 50, id: 'needs-work' },
  { min: 0, id: 'fail' },
];
const BAND_COLORS = { pass: 'var(--pass)', 'needs-work': 'var(--mid)', fail: 'var(--fail)' }; // --mid: dedicated clean amber for the rings (not the muddy text --warn)
const BAND_LABEL_KEYS = { pass: 'verdict_pass', 'needs-work': 'verdict_needs_work', fail: 'verdict_fail' };

// Unscored-category states (score null) each carry a badge + a detail line; 'scored'
// (thin or not, engine @17) is handled separately above. Missing entries fall back to
// the not-machine-checkable text — this also covers a stale cached artifact that still
// carries the retired 'insufficient-evidence' state (pre-@17).
const STATE_BADGE_KEYS = { 'not-applicable': 'state_not_applicable' };
const STATE_DETAIL_KEYS = { 'not-applicable': 'category_detail_na' };

// Coverage threshold below which the 90-100 "pass" band's conclusion wording is
// downgraded (user ruling 2026-08-08, #3): a 100 built on a sliver of measured weight
// must not read as an unqualified "meets baseline".
const LOW_COVERAGE_CONCLUSION_MAX = 50;

function bandOf(score) {
  return SCORE_BANDS.find(b => score >= b.min) || SCORE_BANDS[SCORE_BANDS.length - 1];
}

function scoreColor(score) {
  if (score === null || score === undefined) return 'var(--text-muted)';
  return BAND_COLORS[bandOf(score).id] || 'var(--fail)';
}

function scoreLabel(score, coverage) {
  if (score === null || score === undefined) return t('score_na');
  const band = bandOf(score).id;
  if (band === 'pass' && (coverage ?? 100) < LOW_COVERAGE_CONCLUSION_MAX) return t('verdict_pass_thin');
  return t(BAND_LABEL_KEYS[band] || 'verdict_fail');
}

// Short class-name-friendly band tone ('pass' | 'warn' | 'crit'), only ever called
// on a real (non-null) score — callers gate on state === 'scored' first, same
// discipline scoreColor()/scoreLabel() already rely on (bandOf(null) would
// misfire via JS's `null >= 0 === true` coercion).
function bandTone(score) {
  const id = bandOf(score).id;
  return id === 'fail' ? 'crit' : id === 'needs-work' ? 'warn' : 'pass';
}

function deltaArrow(current, prev) {
  if (prev === null || prev === undefined) return '';
  const diff = current - prev;
  if (diff > 0) return `<span class="delta positive">+${diff}</span>`;
  if (diff < 0) return `<span class="delta negative">${diff}</span>`;
  return '<span class="delta neutral">--</span>';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const RENDER_SNIPPET_MAX_CHARS = 500;

// Defense-in-depth: static-audit.mjs's snippetAt already clamps evidence at
// capture time, but a stale oversized audit JSON (old run, hand-edited
// fixture) must never be able to blow up the rendered report.
function capSnippet(str) {
  const s = String(str ?? '');
  const escaped = escapeHtml(s.slice(0, RENDER_SNIPPET_MAX_CHARS));
  if (s.length <= RENDER_SNIPPET_MAX_CHARS) return escaped;
  return `${escaped}${bi('…已截斷，完整內容見 snapshot 檔', '…truncated, see the snapshot file for the full content')}`;
}

// ============================================================================
// Finding groups — "one group is one thing to do". A static detector emits one
// finding object per instance (88 separate image-alt-missing findings); an axe
// rule emits one object with N .instances. Both collapse to the same shape here
// so the report never repeats a fix action 88 times.
// ============================================================================

const SEVERITY_ORDER = { critical: 0, warning: 1, tip: 2 };

function slugify(key) {
  return String(key || 'finding').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'finding';
}

function buildFindingGroups(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = f.key || f.axe_rule_id || f.id || f.title || 'finding';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        category: f.category,
        severity: f.severity,
        wcag: f.wcag,
        level: f.level,
        affected_users: f.affected_users,
        fix: f.fix,
        sample: f,
        locations: [],
        codeVariants: [],
        count: 0,
      });
    }
    const g = groups.get(key);
    if (f.instances?.length) {
      g.count += f.instances.length;
      for (const inst of f.instances) if (inst?.selector) g.locations.push(inst.selector);
    } else {
      g.count += 1;
      if (f.location) g.locations.push(f.location);
    }
    if (!g.sample.code_before && f.code_before) g.sample = f;
    // hakuso medium-d (2026-08-29): a group can merge instances whose underlying code
    // SHAPE differs (e.g. one bound to a native <button>, one a document-level analytics
    // listener) even though they share a fix action/key. One representative snippet hid
    // that a reader applying the fix text to every location would misapply it to some.
    // Keep every DISTINCT shape, not just the first.
    if (f.code_before && !g.codeVariants.some(v => v.code === f.code_before)) {
      g.codeVariants.push({ code: f.code_before, location: f.location });
    }
  }
  // Severity first (critical > warning > tip), then instance count — the same
  // ordering "fix these next" uses to rank actions, so both views agree.
  return [...groups.values()].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) || b.count - a.count
  );
}

function groupByCategory(groups) {
  const map = new Map();
  for (const g of groups) {
    if (!map.has(g.category)) map.set(g.category, []);
    map.get(g.category).push(g);
  }
  return map;
}

// Evidence-density meter width: log2 scale so a several-hundred-check category
// reads as full and a single-check category reads as a sliver, with no hardcoded
// max. Calibrated against the rakuten specimen (992 checks -> 100%, 6 -> 28%,
// 3 -> 20%, 1 -> 10%); revisit with more benchmark data if it stops reading
// correctly on other sites.
function evidenceWidth(count) {
  if (count <= 0) return 0;
  return Math.min(100, Math.round(10 * Math.log2(count + 1)));
}

// ponytail: "high" evidence threshold is a calibration constant, same spirit as
// static-audit.mjs's THIN_EVIDENCE_MIN — revisit with more benchmark data.
const EVIDENCE_HIGH_MIN = 30;

function evidenceTier(cat) {
  if (cat.state === 'not-machine-checkable' || cat.state === 'not-applicable') return 'nmc';
  if (cat.thin) return 'low';
  return (cat.pass + cat.fail) >= EVIDENCE_HIGH_MIN ? 'high' : 'mod';
}

function evidenceTierLabelHTML(cat) {
  const labels = {
    high: ['高證據量', 'high'],
    mod: ['中等證據', 'moderate'],
    low: ['證據薄弱', 'thin evidence'],
    nmc: ['未自動檢測', 'not machine-checkable'],
  };
  const [zh, en] = labels[evidenceTier(cat)];
  return bi(zh, en);
}

function dominantCauseHTML(g) {
  return `${bi('主因：', 'Dominant cause: ')}<b>${findingText(g.sample, 'title')}</b>`;
}

function tensionLineHTML(cat, passRatePct, criticalCount) {
  const zh = `<b>${passRatePct}% 通過率，機測分數 ${cat.score}</b>。分數另計失敗項目的嚴重度權重，不等於通過率；其中 ${criticalCount} 個為嚴重問題。`;
  const en = `<b>${passRatePct}% pass rate; machine score ${cat.score}</b>. The score also weights failures by severity; ${criticalCount} are critical. It is not a pass rate.`;
  return bi(zh, en);
}

function noIssuesHTML(cat) {
  const zh = `本次靜態掃描未發現${I18N.zh[`cat_${cat.id}`] || cat.name}問題。`;
  const en = `No ${I18N.en[`cat_${cat.id}`] || cat.name} issues found in this static scan.`;
  return bi(zh, en);
}

// Item 1 (tier-2 report visibility): a small provenance chip + the measured
// denominator (samples/targets actually looked at) for categories tier-2 touched.
// Deliberately independent of cat.state/cat.score — never changes what those say.
function tier2ProvenanceHTML(tier2Info) {
  if (!tier2Info) return '';
  const vp = tier2Info.viewports.join(' / ');
  const errNote = tier2Info.erroredCount > 0
    ? bi(`（${tier2Info.erroredCount} 個 viewport 擷取失敗）`, ` (${tier2Info.erroredCount} viewport${tier2Info.erroredCount > 1 ? 's' : ''} failed to capture)`)
    : '';
  return `<p class="cat-cause tier2-provenance"><span class="chip review">${bi('瀏覽器層量測（tier 2）', 'Browser-measured (tier 2)')}</span> ${bi(`已量測 ${tier2Info.measured} 項（${vp}）`, `${tier2Info.measured} measured (${vp})`)}${errNote}</p>`;
}

// One evidence-density card per category. Scored categories (thin or not, engine @17)
// get a number; every unscored state (not-machine-checkable / not-applicable) gets a
// text badge — a state, never a painted zero.
function buildCategoryCardHTML(cat, prevCat, groupsByCat, tier2Evidence) {
  const groups = groupsByCat.get(cat.id) || [];
  const scored = cat.state === 'scored';
  const auditable = cat.pass + cat.fail;
  const cardClass = scored ? 'catcard' : 'catcard nmc';
  const linkHref = groups.length ? `#fg-${slugify(groups[0].key)}` : '#layer-findings';
  const isLink = scored || groups.length > 0;

  // A+ presentation contract (user ruling 2026-08-08): a thin-evidence category still
  // scores, but the "證據薄弱"/thin-evidence qualifier sits on the SAME line as the
  // score, same dark/bold weight — never a colour-only or footnote-only signal.
  const scoreBadgeHTML = `<div class="score-badge"><b class="s-${bandTone(cat.score)}">${cat.score}</b><small>/ 100</small>${prevCat?.score != null ? deltaArrow(cat.score, prevCat.score) : ''}</div>`;
  const topRight = scored
    ? (cat.thin ? `<div class="score-bound"><span class="score-qual">${t('score_qual_thin')}</span>${scoreBadgeHTML}</div>` : scoreBadgeHTML)
    : `<div class="state-badge"><span class="chip review">${t(STATE_BADGE_KEYS[cat.state] || 'state_not_machine_checkable')}</span></div>`;

  const showMeter = scored;
  const reviewSuffix = cat.review ? bi(`，另 ${cat.review} 待複審`, `, ${cat.review} pending review`) : '';
  const evi = showMeter
    ? `<div class="evi">
        <div class="evi-track"><span class="evi-fill" style="width:${evidenceWidth(auditable)}%"></span></div>
        <div class="evi-label"><span class="tier ${evidenceTier(cat)}">${evidenceTierLabelHTML(cat)}</span><span>${bi(`${auditable} 次檢查（${cat.pass} 通過 · ${cat.fail} 失敗）`, `${auditable} check${auditable === 1 ? '' : 's'} (${cat.pass} pass · ${cat.fail} fail)`)}${reviewSuffix}</span></div>
      </div>`
    : `<div class="evi"><div class="evi-label"><span class="tier nmc">${evidenceTierLabelHTML(cat)}</span></div></div>`;

  const passRate = auditable ? cat.pass / auditable : 0;
  const isTension = scored && passRate >= 0.5 && bandOf(cat.score).id === SCORE_BANDS[SCORE_BANDS.length - 1].id;
  let causeHtml;
  let causeClass = 'cat-cause';
  if (isTension) {
    causeClass = 'tension';
    const criticalCount = groups.filter(g => g.severity === 'critical').reduce((s, g) => s + g.count, 0);
    causeHtml = tensionLineHTML(cat, Math.round(passRate * 100), criticalCount);
  } else if (groups.length) {
    causeHtml = dominantCauseHTML(groups[0]);
  } else if (scored) {
    causeHtml = noIssuesHTML(cat);
  } else {
    causeHtml = t(STATE_DETAIL_KEYS[cat.state] || 'category_detail_manual');
  }

  const inner = `<div class="cat-top"><div class="cat-name">${catName(cat)}</div>${topRight}</div>${evi}${tier2ProvenanceHTML(tier2Evidence?.[cat.id])}<p class="${causeClass}">${causeHtml}</p>`;
  const catAttr = ` data-category="${escapeHtml(cat.id)}"`;
  return isLink ? `<a class="${cardClass}"${catAttr} href="${linkHref}">${inner}</a>` : `<div class="${cardClass}"${catAttr}>${inner}</div>`;
}

function buildCategoryGridHTML(categories, previousCategories, groupsByCat, tier2Evidence) {
  const cards = categories.map(cat => {
    const prevCat = previousCategories?.find(p => p.id === cat.id) || null;
    return buildCategoryCardHTML(cat, prevCat, groupsByCat, tier2Evidence);
  }).join('');
  // AEO disclaimer sits right under the grid — it's the same epistemic caveat
  // for the 'agent' category regardless of whether that category has findings.
  return `<div class="catgrid">${cards}</div>${buildAeoDisclaimer()}`;
}

function catNameCompact(cat) {
  const zh = I18N.zh[`cat_${cat.id}`] || cat.name || cat.id;
  const en = I18N.en[`cat_${cat.id}`] || cat.name || cat.id;
  return zh === en ? escapeHtml(zh) : `${escapeHtml(zh)} · ${escapeHtml(en)}`;
}

// Severity chip: 'review'-check findings (uncertain, needs human confirmation)
// get a review chip regardless of severity. C8 (2026-08-29): 'critical'/'tip' used to
// render English-only while the neighboring 'review' chip carried a zh pairing — the
// exact label a zh-reading reader looks at first to judge severity was the one label
// that broke the page's own bilingual convention. All three now pair the same way.
const SEVERITY_CHIP_LABEL = { critical: '嚴重 · critical', warning: '警示 · warning', tip: '建議 · tip' };
function severityChipHTML(g) {
  if (isMissingBrowserEvidence(g)) return `<span class="chip review">${bi('缺少量測證據', 'Measurement evidence missing')}</span>`;
  const cls = g.sample.check === 'review' ? 'review' : ({ critical: 'crit', warning: 'warn', tip: 'review' }[g.severity] || 'review');
  const text = g.sample.check === 'review' ? '待複審 · review' : (SEVERITY_CHIP_LABEL[g.severity] || escapeHtml(g.severity || 'tip'));
  return `<span class="chip ${cls}">${text}</span>`;
}

// C7 (2026-08-29 judgment-precision spec): a fixed-grammar verdict per finding card, in
// one of the four canonical verbs, instead of leaving the reader to infer pass/fail from
// a severity chip + a pass/fail count that lives in a different section (§02 Evidence).
// '看不到' is reserved for detectors that name their own inability to resolve a value
// (key ends '-unresolvable') — everything else that needs a human sits under '需人工'.
function verdictOf(g) {
  if (isMissingBrowserEvidence(g)) return ['待瀏覽器檢查', 'Browser check needed'];
  const check = g.sample.check;
  if (findingKind(g.sample) === 'advice') return ['改善建議', 'Improvement suggestion'];
  if (check === 'fail') return ['不通過', 'Fail'];
  if (check === 'pass') return ['通過', 'Pass'];
  return /-unresolvable$/.test(g.key || '') ? ['看不到', "Can't tell"] : ['需人工', 'Needs human check'];
}

// Published wild-sample precision (VALIDATION.md "Measured wild precision" table,
// benchmark/2026-08-03-wild-precision/README.md — engine @14, 15 instances per detector
// drawn across distinct survey sites, adversarially re-judged). Detectors absent here
// have never been measured on unselected real pages; that gap is disclosed, never
// silently omitted (C7). `ci` is the published 95% CI — VALIDATION.md itself says to read
// the interval, not the point estimate (n=15 ranks detectors, it doesn't publish a precise
// per-detector number), so showing the point alone overstates precision.
const WILD_PRECISION = {
  'image-alt-missing': { precision: 1.000, n: 14, ci: '0.78–1.00', date: '2026-08-03', engine: '@14' },
  'link-name-missing': { precision: 0.933, n: 15, ci: '0.70–0.99', date: '2026-08-03', engine: '@14' },
  'heading-level-skipped': { precision: 0.867, n: 15, ci: '0.62–0.96', date: '2026-08-03', engine: '@14' },
  'clickable-non-button': { precision: 0.615, n: 13, ci: '0.36–0.82', date: '2026-08-03', engine: '@14' },
  'button-name-missing': { precision: 0.600, n: 15, ci: '0.36–0.80', date: '2026-08-03', engine: '@14' },
  'input-label-missing': { precision: 0.417, n: 12, ci: '0.19–0.68', date: '2026-08-03', engine: '@14' },
};

// hakuso #5 (2026-08-29): a wild-precision number is only honest next to WHICH engine
// produced it — read from the artifact's own fingerprint (never hardcoded) so this stays
// correct across every future engine bump with no edit here. `audit` is the module-level
// artifact (same convention several other render helpers in this file already use).
function currentEngineTag() {
  const m = String(audit.metadata?.engine_fingerprint || audit.metadata?.tool_version || '').match(/beacon-static-audit@(\d+)/);
  return m ? `@${m[1]}` : null;
}

function precisionHTML(key) {
  const rec = WILD_PRECISION[key];
  if (!rec) return bi('此類判定尚未量測誤報率', 'wild-sample precision for this detector has not been measured yet');
  const current = currentEngineTag(audit);
  const engineNoteZh = current && current !== rec.engine
    ? `；量測於 ${rec.engine} 引擎，現行 ${current} 已含後續誤報修復，此數字尚未重新量測`
    : `；量測於 ${rec.engine} 引擎`;
  const engineNoteEn = current && current !== rec.engine
    ? `; measured on engine ${rec.engine}, the current ${current} includes later false-positive fixes not yet re-measured`
    : `; measured on engine ${rec.engine}`;
  return bi(
    `偵測精確率 precision ${rec.precision.toFixed(3)}（95% CI ${rec.ci}，n=${rec.n}）${engineNoteZh}`,
    `measured wild precision ${rec.precision.toFixed(3)} (95% CI ${rec.ci}, n=${rec.n})${engineNoteEn}`
  );
}

// hakuso medium-b (2026-08-29, lens-2 closure): an agent triaging report TEXT alone (not
// the JSON `action` field) had no way to read a finding's authorization tier off the page
// itself. Render it in plain words next to the verdict.
const ACTION_LABEL = {
  'direct-fix': ['直接修', 'direct-fix'],
  'design-judgment': ['設計判斷', 'design-judgment'],
  'human-verify': ['需人工驗證', 'human-verify'],
};

function verdictLineHTML(g) {
  if (isMissingBrowserEvidence(g)) return `<p class="who-line verdict-line"><strong>${bi('待瀏覽器檢查', 'Browser check needed')}</strong></p>`;
  const [zh, en] = verdictOf(g);
  const actionLabel = findingKind(g.sample) === 'advice' ? ['依目標選擇是否改善', 'optional, based on product goals'] : ACTION_LABEL[g.sample.action];
  const actionHTML = actionLabel ? bi(`　行動：${actionLabel[0]}`, `　action: ${actionLabel[1]}`) : '';
  const countLabel = g.count === 1
    ? bi('　共 1 項', '　1 instance')
    : bi(`　共 ${g.count} 項`, `　${g.count} instances`);
  return `<p class="who-line verdict-line"><strong>${bi(zh, en)}</strong>${countLabel}${actionHTML}</p>`;
}

// The blind-spot/limitation sentence: reuses the finding's own description text (the
// slot no card currently rendered — description existed in data but nowhere in HTML)
// rather than hand-authoring bespoke copy per detector. tier2-audit.mjs and most
// FINDING_I18N entries already write exactly this kind of caveat.
function blindSpotHTML(g) {
  const hasContent = Boolean(g.sample.description) || Boolean(FINDING_I18N[g.key]?.zh?.description);
  if (!hasContent) return '';
  return `<p class="standard-line blindspot-line">${findingText(g.sample, 'description')}</p>`;
}

function buildLocationListHTML(locations) {
  const MAX_LOC = 12;
  const locs = (locations || []).filter(Boolean);
  if (!locs.length) return '';
  const shown = locs.slice(0, MAX_LOC).map(l => `<span>${escapeHtml(l)}</span>`).join('');
  const more = locs.length > MAX_LOC
    ? `<span>${bi(`及另外 ${locs.length - MAX_LOC} 處`, `and ${locs.length - MAX_LOC} more`)}</span>`
    : '';
  return `<div class="loclist" role="region" aria-label="file locations / 檔案位置清單" tabindex="0">${shown}${more}</div>`;
}

// Item 2 (tier-2 report visibility): the actual measured value behind a tier-2
// finding — contrast's computed ratio + color pair, touch's measured size (and,
// when the spacing exception is what failed it, that it was a neighbor within
// the 24px spacing circle that defeated it). Static/axe findings never carry
// `computed` in this shape, so this only ever renders for tier-2 groups.
function tier2MeasuredHTML(g) {
  if (!isTier2Finding(g.sample)) return '';
  const c = g.sample.computed;
  if (!c) return '';
  let zh, en;
  if (g.category === 'contrast' && c.ratio !== undefined) {
    zh = `對比 ${c.ratio}:1（前景 rgb(${c.fg.r}, ${c.fg.g}, ${c.fg.b}) 對背景 rgb(${c.bg.r}, ${c.bg.g}, ${c.bg.b})，門檻 ${c.required}:1）`;
    en = `${c.ratio}:1 — foreground rgb(${c.fg.r}, ${c.fg.g}, ${c.fg.b}) vs background rgb(${c.bg.r}, ${c.bg.g}, ${c.bg.b}), required ${c.required}:1`;
  } else if (g.category === 'touch' && c.byViewport) {
    // A3: one DOM element measured at every viewport, merged at --merge-findings time
    // (core/scripts/static-audit.mjs groupTouchFindingsBySelector) — show the full
    // range plus every viewport's own number, never a single instance's size standing
    // in for the whole element the way a flat x14 list used to.
    const fmtRange = (min, max) => (Math.round(min) === Math.round(max) ? `${Math.round(min)}` : `${Math.round(min)}–${Math.round(max)}`);
    const rangeZh = `${fmtRange(c.width.min, c.width.max)}×${fmtRange(c.height.min, c.height.max)}px`;
    // hakuso CRITICAL 2026-08-29: `viewport` is an untrusted string (--merge-findings
    // takes external JSON); it must be escaped here like every other rendered field —
    // sanitizeComputed only checked it WAS a string, never that its content was safe.
    const vpListZh = c.byViewport.map(v => `${escapeHtml(v.viewport)}：${v.width.toFixed(0)}×${v.height.toFixed(0)}px`).join('、');
    const vpListEn = c.byViewport.map(v => `${escapeHtml(v.viewport)}: ${v.width.toFixed(0)}×${v.height.toFixed(0)}px`).join(', ');
    zh = `${rangeZh}（${c.byViewport.length} 個 viewport：${vpListZh}）`;
    en = `${rangeZh} across ${c.byViewport.length} viewports (${vpListEn})`;
  } else if (g.category === 'touch' && c.width !== undefined) {
    const spacingNoteZh = c.spacingExceptionMet === false ? '，另一個可互動元件落在 24px 間距例外圓內，因此例外不成立' : '';
    const spacingNoteEn = c.spacingExceptionMet === false ? ', a neighboring interactive element falls inside the 24px spacing-exception circle, so the exception does not apply' : '';
    zh = `${c.width.toFixed(0)}×${c.height.toFixed(0)}px${spacingNoteZh}`;
    en = `${c.width.toFixed(0)}×${c.height.toFixed(0)}px${spacingNoteEn}`;
  } else {
    return '';
  }
  // MEDIUM-4 (2026-07-26 merge audit): the group's `computed` is only the FIRST instance's
  // measurement; when the group has more than one location, say so rather than presenting
  // one instance's ratio/size as if it applied to the whole group. For a merged touch
  // group, "instances" are unique ELEMENTS (already showing all of that one element's
  // own viewports above), so the caveat names elements, not viewport-flattened items.
  if (g.count > 1) {
    if (c.byViewport) {
      zh += `（${g.count} 個元素中的第 1 個）`;
      en += ` (element 1 of ${g.count})`;
    } else {
      zh += `（${g.count} 項中的第 1 項）`;
      en += ` (1 of ${g.count})`;
    }
  }
  return `<p class="standard-line tier2-measured"><strong>${bi('量測值', 'Measured')}:</strong> ${bi(zh, en)}</p>`;
}

// A3: a merged touch group's count is unique ELEMENTS, not flattened viewport rows —
// say the viewport factor once, next to the count, everywhere the count is shown.
function fgCountHTML(g) {
  if (isMissingBrowserEvidence(g)) return '';
  const byViewport = isTier2Finding(g.sample) && g.category === 'touch' ? g.sample.computed?.byViewport : null;
  const vpNote = byViewport ? bi(`（每個 ${byViewport.length} 個 viewport）`, ` (${byViewport.length} viewports each)`) : '';
  return `<span class="fg-count">&times;${g.count}${vpNote}</span>`;
}

// One snippet per DISTINCT code shape in the group (hakuso medium-d, 2026-08-29) — a
// single-variant group renders exactly as before; a multi-variant group (different
// underlying code triggered the same key) labels each snippet with its own location so
// a reader can tell the fix text may not apply identically to every one.
function diffBlocksHTML(g) {
  if (!g.codeVariants.length) return '';
  if (g.codeVariants.length === 1) {
    return `<div class="diff" aria-label="code snippet / 程式碼片段"><pre class="before"><span class="tag">&minus;</span>${capSnippet(g.codeVariants[0].code)}</pre></div>`;
  }
  return g.codeVariants.map(v => `
    <div class="diff" aria-label="code snippet / 程式碼片段">
      ${v.location ? `<p class="rule-id">${escapeHtml(v.location)}</p>` : ''}
      <pre class="before"><span class="tag">&minus;</span>${capSnippet(v.code)}</pre>
    </div>`).join('');
}

function buildFindingGroupHTML(g) {
  const anchor = `fg-${slugify(g.key)}`;
  const diffHtml = diffBlocksHTML(g);
  return renderFinding({
    id: anchor,
    category: escapeHtml(g.category || 'other'),
    titleHTML: findingText(g.sample, 'title'),
    countHTML: fgCountHTML(g),
    statusHTML: severityChipHTML(g),
    verdictHTML: verdictLineHTML(g),
    impactHTML: blindSpotHTML(g),
    nextHTML: `<p class="fix-line"><strong>${bi('下一步', 'Next step')}:</strong> ${g.fix ? findingText(g.sample, 'fix') : bi('本次未提供具體修復方式；請先查核證據，再決定處理方法。', 'No specific fix was provided. Review the evidence before deciding how to proceed.')}</p>`,
    evidenceHTML: `
        ${g.wcag ? `<p class="standard-line wcag">${escapeHtml(g.wcag)}</p>` : ''}
        ${isMissingBrowserEvidence(g) ? `<p>${bi('執行 Beacon 的 tier2-audit.mjs 或 axe-core，並用 --merge-findings 合併結果；需要可開啟的受測頁面與瀏覽器環境。', 'Run Beacon tier2-audit.mjs or axe-core and merge results with --merge-findings. An accessible audit URL and a browser environment are required.')}</p>` : ''}
        <p class="who-line"><span class="who-badge">${t('finding_affected')}:</span> ${escapeHtml(g.affected_users || 'N/A')}</p>
        ${isMissingBrowserEvidence(g) ? '' : `<p>${precisionHTML(g.key)}</p>`}
        ${diffHtml}
        ${buildLocationListHTML(g.locations)}
        ${FINDING_I18N[g.key]?.zh?.standard ? `<p class="standard-line"><strong>${t('finding_standard')}:</strong> ${findingText(g.sample, 'standard')}</p>` : ''}
        ${tier2MeasuredHTML(g)}
        ${buildLearnMoreHTML(g.sample)}`,
  });
}

function buildFindingsSectionHTML(audit, groups) {
  const categories = audit.summary.categories;
  const presentCats = [...categories];
  for (const g of groups) {
    const id = g.category || 'other';
    if (!presentCats.some(c => c.id === id)) presentCats.push({ id, name: id });
  }
  const groupsHtml = presentCats.map(c => {
    const items = groups.filter(g => (g.category || 'other') === c.id);
    const count = kind => items.filter(g => findingKind(g.sample) === kind).reduce((n, g) => n + g.count, 0);
    const counts = bi(`${count('fail')} 項問題 · ${count('review')} 項待確認 · ${count('advice')} 項建議`, `${count('fail')} failures · ${count('review')} to verify · ${count('advice')} suggestions`);
    const empty = c.state === 'not-applicable'
      ? bi('本次未偵測到適用內容；這不是通過判定。', 'No applicable content detected in this scan; this is not a pass.')
      : c.state === 'not-machine-checkable' || c.review > 0
        ? bi('沒有逐項發現可列出；此分類仍需取得人工或瀏覽器測試證據。', 'No itemized findings; this category still needs human or browser evidence.')
        : bi('本次沒有逐項發現可列出。請對照證據範圍，不代表整個分類已通過。', 'No itemized findings in this scan. Check the evidence scope; this is not a category-wide pass.');
    return renderCategory({ id: `review-${slugify(c.id)}`, nameHTML: catName(c), statusHTML: items.length ? counts : empty, contentHTML: items.map(buildFindingGroupHTML).join(''), backHTML: bi('回到此分類', 'Back to this category') });
  }).join('');
  return `
    <section id="layer-findings" data-report-step aria-labelledby="h-findings">
      <div class="wrap">
        <p class="eyebrow"><span class="num">02</span> ${bi('問題與修復', 'Review and repair')}</p>
        <h2 class="layer-h" id="h-findings">${bi('逐類檢視與修復', 'Review and repair by category')}</h2>
        <p class="layer-sub">${bi(`本次有 ${groups.length} 組發現。待確認項目先驗證；改善建議依需求決定。`, `${groups.length} finding groups. Verify uncertain items first; choose suggestions based on your needs.`)}</p>
        <div class="review-controls"><button type="button" data-review-open="true">${bi('展開所有證據', 'Expand all evidence')}</button><button type="button" data-review-open="false">${bi('收合所有證據', 'Collapse all evidence')}</button></div>
        ${groupsHtml}
        ${buildAxeEvidenceHTML(audit)}
        ${retestGuidanceHTML()}
      </div>
    </section>`;
}

// ============================================================================
// Hero (01 decision layer) + "fix these next" (severity x instance count,
// effort held constant — no per-finding effort estimate exists in the schema).
// ============================================================================

function buildFixcardHTML(g, rank) {
  return `
    <div class="fixcard">
      <span class="rank">${rank}</span>
      <h3><a href="#fg-${slugify(g.key)}">${findingText(g.sample, 'title')}</a>${isMissingBrowserEvidence(g) ? '' : `<span style="font-variant-numeric:tabular-nums;font-weight:700">${bi(`（&times;${g.count}）`, ` (&times;${g.count})`)}</span>`}</h3>
      <p class="who">${escapeHtml(g.affected_users || '')}</p>
      <div class="foot">${severityChipHTML(g)}${g.wcag ? `<span class="chip wcag">${escapeHtml(g.wcag)}</span>` : ''}</div>
    </div>`;
}

// ============================================================================
// B4/B5/B6/C8 (2026-08-29 judgment-precision spec): decision-layer calibration.
// ============================================================================

// Confirmed (check:'fail') vs needs-human-check (check:'review') — the two counts a
// 30-second reader actually needs. A raw "N findings, M critical" count conflates
// confirmed defects with unconfirmed heuristics and non-normative advisories.
function isMissingBrowserEvidence(g) {
  return g.key === 'contrast-not-verified' && g.sample.check === 'review';
}

function findingKind(f) {
  if (f.check === 'review' || !f.check) return 'review';
  if (f.check === 'pass') return 'pass';
  return f.severity === 'tip' ? 'advice' : 'fail';
}

function confirmedVsReviewCounts(findings) {
  return {
    confirmed: findings.filter(f => findingKind(f) === 'fail').length,
    needsHuman: findings.filter(f => findingKind(f) === 'review').length,
    suggestions: findings.filter(f => findingKind(f) === 'advice').length,
  };
}

// Category-level review evidence (e.g. the once-per-scanned-file cognitive/media/
// contrast baseline signal) that never became an itemized finding — real evidence, but
// nothing to click into or fix. B5: "count them" instead of silently asserting the
// itemized findings are 100% of everything found.
function nonItemizedReviewCount(audit, findings) {
  const itemizedByCat = new Map();
  for (const f of findings) {
    if (f.check === 'review') itemizedByCat.set(f.category, (itemizedByCat.get(f.category) || 0) + 1);
  }
  let extra = 0;
  for (const cat of audit.summary.categories || []) {
    extra += Math.max(0, (cat.review || 0) - (itemizedByCat.get(cat.id) || 0));
  }
  return extra;
}

function headlineSentenceHTML(confirmed, needsHuman) {
  const zh = confirmed === 0 && needsHuman === 0
    ? '這次掃描沒有找到已確認的問題，也沒有待人工複審的項目。'
    : `目前有 <b>${confirmed}</b> 個已確認問題，另有 <b>${needsHuman}</b> 項尚待驗證。`;
  const en = confirmed === 0 && needsHuman === 0
    ? 'This scan found no confirmed problems and nothing pending human review.'
    : `<b>${confirmed}</b> confirmed problem${confirmed === 1 ? '' : 's'}, and <b>${needsHuman}</b> item${needsHuman === 1 ? '' : 's'} pending verification.`;
  return `<p class="exec-lead headline-sentence">${bi(zh, en)}</p>`;
}

// IA lens: the decision layer is framed entirely around gaps; the largest verified pass
// set in the whole audit never surfaced there. One positive line, next to the headline.
function largestPassCategoryHTML(audit) {
  const scored = (audit.summary.categories || []).filter(c => c.state === 'scored' && c.pass > 0);
  if (!scored.length) return '';
  const top = scored.reduce((a, b) => (b.pass > a.pass ? b : a));
  const nameZh = I18N.zh[`cat_${top.id}`] || top.name;
  const nameEn = I18N.en[`cat_${top.id}`] || top.name;
  const allPassed = top.fail === 0;
  // hakuso #3 + round-2 micro-fix-2 (2026-08-29): a browser-measured sample that resolved
  // cleanly (no fail, no unresolvable finding) never gets its own "pass" finding object, so
  // static-audit.mjs infers it from a decided-sample count and reports exactly how many of
  // `pass` were derived this way (`derived_pass`). Say "all" only when the real fraction is
  // 100% — claiming "mostly" when it's actually all of them is the same kind of overstated
  // precision this whole spec exists to remove.
  const derivedPass = top.derived_pass || 0;
  const derivedNote = derivedPass === 0
    ? { zh: '', en: '' }
    : derivedPass >= top.pass
      ? { zh: '（全數為瀏覽器量測後推算之乾淨對比，非逐項列出）', en: ' (all derived from decided browser-measured samples, not itemized individually)' }
      : { zh: '（多數為瀏覽器量測後推算之乾淨對比，非逐項列出）', en: ' (mostly derived from decided browser-measured samples, not itemized individually)' };
  const zh = (allPassed
    ? `本次最大量測集合：${nameZh} ${top.pass} 次檢查全數通過。`
    : `本次最大量測集合：${nameZh} ${top.pass}/${top.pass + top.fail} 次檢查通過。`) + derivedNote.zh;
  const en = (allPassed
    ? `Largest measured set: all ${top.pass} ${nameEn} checks passed.`
    : `Largest measured set: ${top.pass}/${top.pass + top.fail} ${nameEn} checks passed.`) + derivedNote.en;
  return `<p class="coverage pass-evidence-line">${bi(zh, en)}</p>`;
}

// C8: one sentence reconciling the band colour with the confirmed-critical count — the
// report's two severity vocabularies (amber/red band vs. a red "critical" chip) never
// explained why they can disagree.
function bandBridgeHTML(bandId, confirmedCritical, needsHuman) {
  if (confirmedCritical > 0) {
    return bi(
      `此帶狀反映 <b>${confirmedCritical}</b> 個已確認的嚴重問題；請先處理這些，再重新解讀分數與帶狀。`,
      `This band reflects <b>${confirmedCritical}</b> confirmed critical issue${confirmedCritical === 1 ? '' : 's'}; address these first, then re-read the score and band.`
    );
  }
  if (bandId === 'pass') {
    return needsHuman > 0
      ? bi(
          `帶狀是綠色，因為目前沒有已確認的嚴重問題；仍有 <b>${needsHuman}</b> 項尚待驗證，不代表已全數驗證完成。`,
          `This band is green because there are no confirmed critical issues; <b>${needsHuman}</b> item${needsHuman === 1 ? '' : 's'} still need${needsHuman === 1 ? 's' : ''} a human check and are not yet fully verified.`
        )
      : bi('帶狀是綠色，且沒有已確認的嚴重問題或待複審項目。', 'This band is green, with no confirmed critical issues or items pending review.');
  }
  return bi(
    `目前沒有已確認的嚴重問題。請對照各分類的失敗、警示與建議解讀分數；另有 <b>${needsHuman}</b> 項待複審，待複審本身不扣分。`,
    `There are no confirmed critical issues. Read the category failures, warnings and suggestions to interpret the score; <b>${needsHuman}</b> items remain pending review. Review status itself does not deduct points.`
  );
}

// B6: duplicate the human-test checklist into the decision layer — it previously
// surfaced only after the entire methodology wall, ~700 lines down.
function decisionTestingChecklistHTML(audit) {
  const recs = asArray(audit.testing_recommendations);
  if (!recs.length) return '';
  return `
    <div class="decision-testing" aria-labelledby="h-decision-testing">
      <h2 id="h-decision-testing" style="font-size:1.05rem;margin:1.4rem 0 .5rem">${bi('上線前建議人工測試', 'Suggested manual tests before launch')}</h2>
      <ul>${recs.map(r => `<li>${localizedText(r)}</li>`).join('')}</ul>
    </div>`;
}

// B5: two tiers, never one ranked list mixing a confirmed defect with a design-judgment
// review item — no cross-tier ranking, and each tier's coverage line is truthful about
// what it actually covers (including evidence that never became an itemized finding).
function buildFixNextHTML(groups, audit, findings) {
  const confirmedGroups = groups.filter(g => findingKind(g.sample) === 'fail');
  const reviewGroups = groups.filter(g => findingKind(g.sample) === 'review');
  const adviceGroups = groups.filter(g => findingKind(g.sample) === 'advice');
  if (!confirmedGroups.length && !reviewGroups.length && !adviceGroups.length) {
    return `<p class="clear-line">${bi('這次靜態掃描沒有發現需要優先處理的問題。', 'This static scan found nothing that needs priority attention.')}</p>`;
  }

  const topConfirmed = confirmedGroups.slice(0, 3);
  const confirmedTotal = confirmedGroups.reduce((s, g) => s + g.count, 0);
  const shownConfirmed = topConfirmed.reduce((s, g) => s + g.count, 0);
  const confirmedBlock = `
    <h3 class="fix-tier-h">${bi('確認可修', 'Confirmed to fix')}</h3>
    ${topConfirmed.length
      ? `<p class="clear-line">${bi(
          `以下 ${topConfirmed.length} 組涵蓋 <b>${shownConfirmed}</b> 個問題；本次共有 <b>${confirmedTotal}</b> 個已確認問題。`,
          `These ${topConfirmed.length} groups cover <b>${shownConfirmed}</b> of <b>${confirmedTotal}</b> confirmed problems.`
        )}</p>
         <div class="fixlist">${topConfirmed.map((g, i) => buildFixcardHTML(g, i + 1)).join('')}</div>`
      : `<p class="clear-line">${bi('這次掃描沒有已確認的失敗項目。', 'This scan found no confirmed failures.')}</p>`}`;

  const topReview = reviewGroups.slice(0, 3);
  const reviewTotal = reviewGroups.reduce((s, g) => s + g.count, 0);
  const shownReview = topReview.reduce((s, g) => s + g.count, 0);
  const extra = nonItemizedReviewCount(audit, findings);
  const extraZh = extra > 0 ? `；另有 ${extra} 項只在類別統計中出現，未逐項列出` : '';
  const extraEn = extra > 0 ? `; ${extra} more exist only as category-level evidence, not itemized here` : '';
  const reviewBlock = topReview.length
    ? `
    <h3 class="fix-tier-h">${bi('需判斷／需驗證', 'Needs judgment or verification')}</h3>
    <p class="clear-line">${bi(
      `以下 ${topReview.length} 組涵蓋 ${shownReview} 項，本次共 ${reviewTotal} 項尚待驗證的發現${extraZh}。`,
      `These ${topReview.length} groups cover ${shownReview} of ${reviewTotal} items needing review${extraEn}.`
    )}</p>
    <div class="fixlist">${topReview.map((g, i) => buildFixcardHTML(g, i + 1)).join('')}</div>`
    : '';

  const adviceBlock = adviceGroups.length ? `<h3>${bi('改善建議（可選）', 'Improvement suggestions (optional)')}</h3><ul>${adviceGroups.map(g => `<li><a href="#fg-${slugify(g.key)}">${findingText(g.sample, 'title')}</a></li>`).join('')}</ul>` : '';
  return `${confirmedBlock}${reviewBlock}${adviceBlock}<p><a href="#layer-findings">${bi('查看全部問題、建議與證據', 'See all findings, suggestions and evidence')}</a></p>`;
}

function retestGuidanceHTML() {
  return `<div class="decision-testing" id="retest" data-report-step><p class="eyebrow"><span class="num">03</span> ${bi('重測與確認', 'Retest and verify')}</p><h2 class="layer-h">${bi('重測與本輪停止條件', 'Retest and close this round')}</h2><ol>
    <li>${bi('保留本次 JSON、受測檔案版本、工具版本與檢查範圍；修改後用相同指令重跑，另存新 JSON。', 'Keep this JSON, source revision, tool versions and scope. Repeat the same command after the fix and save a new JSON.')}</li>
    <li>${bi('逐項對照規則、位置與證據，再操作原本失敗的任務。問題消失或分數提高，不能單獨證明修復成功。', 'Compare each rule, location and evidence, then repeat the affected task. A disappearing finding or higher score alone does not establish a fix.')}</li>
    <li>${bi('本輪指定的失敗項目有重測證據、沒有新增阻擋，才可結束本輪修復。待確認項目保留負責人與下一次測試；建議可接受或附理由暫緩。這不是整站合規或上線批准。', 'Close this repair round when its assigned failures have retest evidence and no new blockers. Keep an owner and next test for unknowns; accept or defer suggestions with a reason. This is not site-wide compliance or release approval.')}</li>
    </ol></div>`;
}

function suggestionsHTML(findings) {
  const { suggestions } = confirmedVsReviewCounts(findings);
  return suggestions ? `<p class="coverage">${bi(`另有 <b>${suggestions}</b> 項改善建議，不計為上方的已確認問題。既有機測分數仍包含 AEO 結構檢查，並非違規數或通過率。`, `<b>${suggestions}</b> improvement suggestions are separate from the confirmed problems above. The existing machine score still includes AEO structural checks; it is not a violation count or pass rate.`)}</p>` : '';
}

// B4: the fixed-scope percentages and the industry-coverage comparison used to compete
// with the single decision-layer headline for the same viewport (four-lens lens 1) —
// keep only score + coverage as first-screen numbers; this detail moves one section
// down, next to the methodology explanation it belongs with.
function buildScopeDetailHTML(audit) {
  const scope = reportCoverage(audit);
  return `
    <div class="scope-summary" aria-label="檢查範圍摘要 / Check-scope summary">
      <p><b>${t('scope_line')}：</b>${bi(`${scope.categoryCount} 類 · ${scope.totalWeight}%`, `${scope.categoryCount} categories · ${scope.totalWeight}%`)}</p>
      <p><b>${t('applicable_line')}：</b>${scope.applicablePercent}% · <b>${t('unverified_line')}：</b>${scope.unverifiedPercent}% · <b>${t('not_applicable_line')}：</b>${scope.notApplicablePercent}%</p>
    </div>
    <div class="honesty">${bi(
      '業界普遍認為自動化工具約涵蓋 WCAG 的 <b>30&ndash;40%</b>。Beacon 實測自己：WCAG 2.2 A+AA 的 55 條準則中，<b>14 條有覆蓋（25.5%）</b>，其中 <b>2 條在自動化可及範圍內完整決定（3.6%）</b>。<strong>高分不代表網站完全可達。</strong>',
      'Industry estimates put automated WCAG coverage at ~<b>30&ndash;40%</b>. Beacon measured itself: of WCAG 2.2\'s 55 A+AA criteria, <b>14 have any coverage (25.5%)</b>, and <b>2 are fully decided within automation\'s reach (3.6%)</b>. A high score does not mean fully accessible.'
    )}
      <p style="margin-top:.2rem"><a href="https://github.com/chiehweihuang/beacon/blob/master/VALIDATION.md#wcag-criterion-coverage">${bi('逐條對照表與重算方式 &rarr;', 'Row-by-row table &amp; how to re-derive it &rarr;')}</a></p>
    </div>`;
}

function buildHeroHTML(audit, previous, groups) {
  const overall = audit.summary.overall_score;
  const scoreTone = overall != null ? bandTone(overall) : 'review';
  const scope = reportCoverage(audit);
  const coverage = scope.evidencePercent;
  const decisionTone = overall != null && bandOf(overall).id === 'pass' && coverage < LOW_COVERAGE_CONCLUSION_MAX
    ? 'review'
    : scoreTone;
  const bandLabel = scoreLabel(overall, coverage);
  const manualCount = audit.summary.categories.filter(c => c.state === 'not-machine-checkable').length;
  const notApplicableCount = audit.summary.categories.filter(c => c.state === 'not-applicable').length;
  const thinCount = audit.summary.categories.filter(c => c.thin === true).length;
  const prevLine = previous?.summary?.overall_score != null
    ? `<p class="coverage" style="margin-top:.3rem">${t('cmp_previous')}: ${previous.summary.overall_score} ${deltaArrow(overall, previous.summary.overall_score)}</p>`
    : '';

  const { confirmed, needsHuman } = confirmedVsReviewCounts(reportFindings);
  // The band-bridge sentence talks specifically about CRITICAL issues, not every
  // confirmed (check:'fail') finding regardless of severity — conflating the two
  // would call a confirmed 'tip' (e.g. jsonld-missing) a "confirmed critical issue".
  const confirmedCritical = reportFindings.filter(f => f.check === 'fail' && f.severity === 'critical').length;
  const bandId = overall != null ? bandOf(overall).id : null;

  return `
    <section class="hero" id="layer-decision" data-report-step aria-labelledby="h-decision">
      <div class="wrap">
        <p class="eyebrow"><span class="num">01</span> ${bi('檢查結果', 'Results')}</p>
        <h1 class="layer-h" id="h-decision">${bi('本次檢查結果', 'Results of this check')}</h1>
        ${audit.summary.life_safety_flag ? buildLifeSafetyBanner() : ''}
        ${headlineSentenceHTML(confirmed, needsHuman)}
        ${suggestionsHTML(reportFindings)}
        ${largestPassCategoryHTML(audit)}

        <details class="score-details"><summary>${bi('查看機測分數與計算方式', 'Machine score and calculation')}</summary>
        <div class="verdict">
          <div class="overall">
            <div class="metric-pair" role="group" aria-label="機測分數與機器證據 / Machine-checked score and machine evidence">
              <div class="metric score-metric">
                <span class="metric-label">${bi('機測分數', 'Machine-checked score')}</span>
                <p class="metric-value s-${scoreTone}"><b>${overall ?? '—'}</b><span>/ 100</span></p>
                <p class="metric-note">${bi('只計算有證據的檢查', 'Evidence-backed checks only')}</p>
              </div>
              <div class="metric coverage-metric">
                <span class="metric-label">${bi('已取得機器證據', 'Machine evidence obtained')}</span>
                <p class="metric-value"><b>${coverage}%</b></p>
                <div class="coverage-track" role="progressbar" aria-label="已取得機器證據 / Machine evidence obtained" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${coverage}"><span style="width:${coverage}%"></span></div>
                <p class="metric-note">${bi('依固定機器檢查範圍計算', 'Against the fixed machine-check scope')}</p>
              </div>
            </div>
            <div class="verdict-detail">
              <span class="band" style="background:var(--${decisionTone}-bg);color:var(--${decisionTone});border-color:var(--${decisionTone}-line)">${bandLabel}</span>
              <p class="coverage">${bandBridgeHTML(bandId, confirmedCritical, needsHuman)}</p>
              <p class="coverage">${bi(`機測分數只代表固定範圍中已取得的 <b>${coverage}%</b> 證據，不是整體無障礙分數。`, `The machine-checked score represents evidence from <b>${coverage}%</b> of the fixed scope; it is not an overall accessibility score.`)}<br>
                <span style="font-size:.85rem;color:var(--ink-soft)">${bi(
                  `${manualCount} 個分類適用但需人工複審、${notApplicableCount} 個分類本頁不適用、${thinCount} 個分類已計分但證據薄弱`,
                  `${manualCount} applicable but human-review-only, ${notApplicableCount} not applicable here, ${thinCount} scored on thin evidence`
                )}</span>${audit.summary.life_safety_flag ? '' : `<br>
                <span style="font-size:.85rem;color:var(--pass);font-weight:600">${bi(
                  '生命安全檢查（閃爍/癲癇風險）：未觸發',
                  'Life-safety check (flashing/seizure risk): not triggered'
                )}</span>`}</p>
              <p style="margin-top:.4rem"><a href="#layer-methodology">${bi('查看完整檢查範圍、方法論與限制 &rarr;', 'See the full check scope, methodology &amp; limits &rarr;')}</a></p>
              ${prevLine}
            </div>
          </div>
        </div>

        </details>
        <p><a href="#layer-methodology">${bi('查看檢查範圍與限制', 'Check scope and limitations')}</a></p>
        <div class="fixnext" aria-labelledby="h-fix">
          <h2 id="h-fix">${bi('接下來怎麼做', 'What to do next')}</h2>
          ${buildFixNextHTML(groups, audit, reportFindings)}
        </div>

        ${decisionTestingChecklistHTML(audit)}
      </div>
    </section>`;
}

// ============================================================================
// Supplementary executive summary; expanded for printing.
// ============================================================================

function buildExecSummaryHTML(audit, groups) {
  const scopeRaw = audit.metadata?.url || audit.metadata?.scope || '';
  const scopeLabel = escapeHtml(scopeRaw);

  // hakuso #4 (2026-08-29): this section used to assert "found N issues, M critical" and
  // frame everything — including non-normative review items — as "batch-fixable patterns",
  // the exact sentence the four-lens audit's most-cited defect names (D1, critical). One
  // document, one framing: reuse the same confirmed/needs-review split §01 uses, instead
  // of a second, disagreeing vocabulary for the reader most likely to act on this page alone.
  const { confirmed, needsHuman } = confirmedVsReviewCounts(reportFindings);
  const nothingFound = confirmed === 0 && needsHuman === 0;
  const execLeadZh = `本次檢測在${scopeLabel || '受測頁面'}上，${nothingFound
    ? '沒有找到已確認的問題，也沒有待人工複審的項目'
    : `找到 <b>${confirmed}</b> 個已確認問題，另有 <b>${needsHuman}</b> 項尚待驗證`}。`;
  const execLeadEn = `On ${scopeLabel || 'the audited page'}, this audit found ${nothingFound
    ? 'no confirmed problems and nothing pending human review'
    : `<b>${confirmed}</b> confirmed problem${confirmed === 1 ? '' : 's'} and <b>${needsHuman}</b> item${needsHuman === 1 ? '' : 's'} pending verification`}.`;

  // Two tiers, never one cross-ranked list mixing a confirmed defect with a design-judgment
  // review item (same split as buildFixNextHTML) — no cross-tier ranking here either.
  const confirmedGroups = groups.filter(g => findingKind(g.sample) === 'fail');
  const reviewGroups = groups.filter(g => findingKind(g.sample) === 'review');
  const adviceGroups = groups.filter(g => findingKind(g.sample) === 'advice');
  const prioListHTML = (list) => `<ol class="prio">${list.map(g => `<li>${findingText(g.sample, 'title')}${g.wcag ? ` (${escapeHtml(g.wcag)})` : ''}</li>`).join('')}</ol>`;
  const prioSectionsHTML = `
    ${confirmedGroups.length ? `<h3>${bi('確認可修', 'Confirmed to fix')}</h3>${prioListHTML(confirmedGroups)}` : ''}
    ${reviewGroups.length ? `<h3>${bi('需判斷／需驗證', 'Needs judgment or verification')}</h3>${prioListHTML(reviewGroups)}` : ''}
    ${adviceGroups.length ? `<h3>${bi('改善建議（可選）', 'Improvement suggestions (optional)')}</h3>${prioListHTML(adviceGroups)}` : ''}`;

  const jurisdictions = buildJurisdictions(audit.legal_risk);
  const jurisdictionChips = jurisdictions.map(j => `<span class="chip review">${bi(escapeHtml(j.name.zh), escapeHtml(j.name.en))}</span>`).join('');

  const nmcCats = audit.summary.categories.filter(c => c.state === 'not-machine-checkable');
  const nmcZh = nmcCats.map(c => I18N.zh[`cat_${c.id}`] || c.name).join('、');
  const nmcEn = nmcCats.map(c => I18N.en[`cat_${c.id}`] || c.name).join(', ');

  return `
    <section class="section-alt" id="layer-client" aria-labelledby="h-client">
      <div class="wrap">
        <p class="eyebrow"><span class="num">04</span> ${bi('客戶層', 'Client Summary')}</p>
        <h2 class="layer-h" id="h-client">${bi('給非技術讀者的執行摘要（可直接列印）', 'Plain-language executive summary — print-ready')}</h2>
        <p class="layer-sub">${bi('彙整本次發現，供交接與列印；不是合規證明。', 'A summary for handoff and printing, not a compliance certificate.')}</p>

        <div class="exec">
          <div class="exec-head">
            <h3>${escapeHtml(audit.metadata?.scope || scopeLabel || 'Accessibility Audit')} ${bi('無障礙檢測 · 執行摘要', '&middot; Executive Summary')}</h3>
            <p>${scopeLabel ? `${scopeLabel} &middot; ` : ''}${escapeHtml(audit.metadata?.date || '')} &middot; ${escapeHtml(audit.metadata?.standard || '')} &middot; ${escapeHtml(audit.metadata?.audit_tier || '')}</p>
          </div>
          <div class="exec-body">
            <p class="exec-lead"><span class="lang-zh" lang="zh-Hant">${execLeadZh}</span><span class="lang-en" lang="en">${execLeadEn}</span></p>

            ${prioSectionsHTML}
            ${suggestionsHTML(reportFindings)}

            <h3>${bi('法規範圍', 'Jurisdiction exposure')}</h3>
            <p style="font-size:.92rem;color:var(--ink-soft);margin:.2rem 0 .5rem">${bi('此靜態基線所示問題可能影響下列司法管轄區的無障礙要求（視實際部署情境而定）：', 'This static baseline may affect accessibility expectations in:')}</p>
            <div class="expose">${jurisdictionChips}</div>

            <div class="exec-note">
              <span class="lang-zh" lang="zh-Hant"><strong>如何解讀這份報告：</strong> 這是 AI 輔助的自動化基線。業界估計自動化工具約涵蓋 WCAG 的 30&ndash;40%；Beacon 實測自己涵蓋 55 條 A+AA 準則中的 14 條（25.5%），在自動化可及範圍內完整決定 2 條（3.6%，逐條對照表公開可查）。分數是起點不是終點；上線前建議與障礙使用者實測核心流程。${nmcCats.length ? `${escapeHtml(nmcZh)} 等 ${nmcCats.length} 個分類本次僅標記為待人工複審。` : ''}</span>
              <span class="lang-en" lang="en" style="display:block;margin-top:.35rem">How to read this: an AI-assisted baseline. Industry estimates put automated WCAG coverage at ~30&ndash;40%; Beacon measured its own coverage at 14 of 55 A+AA criteria (25.5%), fully deciding 2 within automation's reach (3.6%, row-by-row table public). The score is a starting point &mdash; test core flows with disabled users before launch.${nmcCats.length ? ` ${escapeHtml(nmcEn)} ${nmcCats.length === 1 ? 'was' : 'were'} flagged for human review this pass.` : ''}</span>
            </div>
          </div>
        </div>
      </div>
    </section>`;
}

// Life-safety gate notice — rendered before any score so a confirmed seizure risk is
// impossible to miss. Text-first (not colour-only), bilingual, landmark for SR nav.
function buildLifeSafetyBanner() {
  return `
    <section class="life-safety-banner" aria-label="Life-safety warning / 生命安全警示">
      <div class="lang-zh" lang="zh-Hant">
        <div class="banner-title">生命安全警示（WCAG 2.3.1 閃爍／癲癇風險）</div>
        <p>本次審查含已確認的閃爍／癲癇風險發現。總分已強制封頂至紅色帶；請先處理此項，再解讀其他分數。詳見「問題層」中的 critical 項目。</p>
      </div>
      <div class="lang-en" lang="en">
        <div class="banner-title">Life-safety warning (WCAG 2.3.1 flashing / seizure risk)</div>
        <p>This audit contains a confirmed flashing / seizure-risk finding. The overall score is capped into the fail band; address this before reading any other score. See the critical items in the Findings layer.</p>
      </div>
    </section>`;
}

// AEO sub-score honesty note. Scoped to the Agent/AEO category, rendered right
// under the evidence grid — AEO findings are actionable structural
// recommendations; the score remains an eligibility proxy, never proof of
// actual citation outcomes.
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

const READER_OUTCOME_LABELS = {
  completed: ['已完成任務', 'Task completed'],
  failed: ['任務失敗', 'Task failed'],
  ambiguous: ['意圖有歧義', 'Intent was ambiguous'],
  blocked: ['任務受阻', 'Task blocked'],
  'not-assessed': ['尚未判定任務結果', 'Task outcome not assessed'],
};

const AT_STATUS_LABELS = {
  pass: ['已提供通過紀錄', 'Verified pass recorded'],
  fail: ['已提供失敗紀錄', 'Verified failure recorded'],
  blocked: ['測試受阻', 'Test blocked'],
  'not-tested': ['尚未測試', 'Not tested'],
};

const READER_SURFACE_LABELS = {
  captured: ['已擷取 accessibility tree 與鍵盤路徑', 'Accessibility tree and keyboard path captured'],
  failed: ['非視覺瀏覽器擷取失敗', 'Non-visual browser capture failed'],
  'not-captured': ['尚未擷取非視覺瀏覽器表面', 'Non-visual browser surface not captured'],
};

function readerOutcomeLabel(outcome) {
  const [zh, en] = READER_OUTCOME_LABELS[outcome] || READER_OUTCOME_LABELS['not-assessed'];
  return bi(zh, en);
}

function atStatusLabel(status) {
  const [zh, en] = AT_STATUS_LABELS[status] || AT_STATUS_LABELS['not-tested'];
  return bi(zh, en);
}

function readerSurfaceLabel(status) {
  const [zh, en] = READER_SURFACE_LABELS[status] || READER_SURFACE_LABELS['not-captured'];
  return bi(zh, en);
}

function safeReaderSourceUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function readerEvidenceSourceHTML(source) {
  const label = localizedText(source.label || source.note || source.type || 'source');
  const url = safeReaderSourceUrl(source.url);
  return url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    : label;
}

function buildReaderTaskEvidenceHTML(audit) {
  const evidence = audit.reader_evidence;
  if (!evidence) {
    return `
      <section class="reader-task-evidence" aria-labelledby="reader-task-title">
        <h3 id="reader-task-title">${bi('網站意圖與 AI 非視覺任務', 'Site intent &amp; AI non-visual task')}</h3>
        <div class="reader-status reader-status-missing">
          <strong>${bi('尚未執行 AI 非視覺任務測試', 'AI non-visual task test not run')}</strong>
          <span>${bi('目前沒有網站意圖、任務理解或非視覺操作證據。這一層不計入機器分數。', 'No site-intent, task-understanding, or non-visual interaction evidence is attached. This layer is excluded from the machine score.')}</span>
        </div>
        <p class="section-intro">${bi('NVDA、VoiceOver、TalkBack 與真人使用測試也尚未由這份 JSON 證明。', 'This JSON also does not prove NVDA, VoiceOver, TalkBack, or human testing.')}</p>
      </section>`;
  }

  const intent = evidence.intent || {};
  const tasks = asArray(evidence.tasks);
  const surface = evidence.reader_surface || {};
  const keyboard = surface.keyboard;
  const snapshot = surface.snapshot;
  const at = evidence.assistive_technology || {};
  const sourceList = asArray(intent.sources);
  const surfaceStatus = surface.status || 'not-captured';
  const surfaceMissing = surfaceStatus !== 'captured' ? ' reader-status-missing' : '';
  const taskRows = tasks.length
    ? tasks.map((task) => `
        <article class="reader-task-row">
          <div class="reader-task-heading">
            <strong>${escapeHtml(task.id || '')}</strong>
            <span class="reader-outcome">${readerOutcomeLabel(task.outcome)}</span>
          </div>
          <p><strong>${bi('任務：', 'Goal:')}</strong> ${localizedText(task.goal)}</p>
          ${task.success_criteria?.length ? `<p><strong>${bi('成功條件：', 'Success criteria:')}</strong></p><ul>${task.success_criteria.map((criterion) => `<li>${localizedText(criterion)}</li>`).join('')}</ul>` : ''}
          ${task.interpretation ? `<p><strong>${bi('AI／測試者理解：', 'Agent / tester interpretation:')}</strong> ${localizedText(task.interpretation)}</p>` : ''}
          ${task.observations?.length ? `<p><strong>${bi('觀察：', 'Observations:')}</strong></p><ul>${task.observations.map((observation) => `<li>${localizedText(observation)}</li>`).join('')}</ul>` : ''}
          ${task.evidence?.length ? `<p><strong>${bi('證據：', 'Evidence:')}</strong> ${task.evidence.map(readerEvidenceSourceHTML).join(' · ')}</p>` : ''}
        </article>`).join('')
    : `<p class="empty">${bi('沒有任務定義。', 'No task definition was supplied.')}</p>`;
  const atRows = ['nvda', 'voiceover', 'talkback'].map((name) => {
    const item = at[name] || {};
    const title = { nvda: 'NVDA', voiceover: 'VoiceOver', talkback: 'TalkBack' }[name];
    return `<li><strong>${title}</strong><span class="reader-at-status">${atStatusLabel(item.status)}</span>${item.note ? `<span>${localizedText(item.note)}</span>` : ''}</li>`;
  }).join('');
  const snapshotHTML = snapshot?.content
    ? `<details class="reader-snapshot"><summary>${bi('檢視 accessibility tree 擷取內容', 'View captured accessibility tree')}</summary><pre>${escapeHtml(snapshot.content)}</pre></details>`
    : '';

  return `
    <section class="reader-task-evidence" aria-labelledby="reader-task-title">
      <h3 id="reader-task-title">${bi('網站意圖與 AI 非視覺任務', 'Site intent &amp; AI non-visual task')}</h3>
      <div class="reader-status${surfaceMissing}">
        <strong>${readerSurfaceLabel(surfaceStatus)}</strong>
        <span>${bi('這不是 NVDA、VoiceOver、TalkBack 或真人測試；任務判定不計入機器分數。', 'This is not NVDA, VoiceOver, TalkBack, or human testing; task judgements are excluded from the machine score.')}</span>
      </div>
      <div class="reader-intent-grid">
        <div><span class="reader-label">${bi('網站目的', 'Site purpose')}</span><span class="reader-value">${localizedText(intent.purpose) || bi('未提供', 'Not provided')}</span></div>
        <div><span class="reader-label">${bi('目標使用者', 'Audience')}</span><span class="reader-value">${localizedText(intent.audience) || bi('未提供', 'Not provided')}</span></div>
        <div><span class="reader-label">${bi('意圖來源', 'Intent source')}</span><span class="reader-value">${escapeHtml(intent.source || 'inferred')} · ${escapeHtml(intent.confidence || 'medium')}</span></div>
        ${sourceList.length ? `<div><span class="reader-label">${bi('參考來源', 'Reference sources')}</span><span class="reader-value">${sourceList.map(readerEvidenceSourceHTML).join(' · ')}</span></div>` : ''}
      </div>
      <div class="reader-task-list">
        <h4>${bi('主要任務與結果', 'Primary tasks and outcomes')}</h4>
        ${taskRows}
      </div>
      <div class="reader-surface-summary">
        <h4>${bi('擷取範圍', 'Captured surface')}</h4>
        <p>${bi(`通道：${asArray(surface.channel).join('、') || '未提供'}${keyboard ? `；鍵盤停點 ${keyboard.stop_count || 0} / ${keyboard.max_tabs || 0}` : ''}${snapshot ? `；${snapshot.format || 'accessibility tree'} 已擷取` : ''}`, `Channels: ${asArray(surface.channel).join(', ') || 'not provided'}${keyboard ? `; ${keyboard.stop_count || 0} / ${keyboard.max_tabs || 0} keyboard stops` : ''}${snapshot ? `; ${snapshot.format || 'accessibility tree'} captured` : ''}`)}</p>
        ${snapshotHTML}
      </div>
      <div class="reader-at">
        <h4>${bi('實際輔助科技狀態', 'Actual assistive-technology status')}</h4>
        <ul>${atRows}</ul>
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
          '以下清單直接來自 axe 結果；違規項的 DOM nodes 會在對應的問題群組中逐一列出。',
          'The lists below come directly from axe results; violating DOM nodes are listed inside each finding group.'
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
        <p class="meta-note">審查層級：<strong>${escapeHtml(tier)}</strong> &middot;
          信心水準：<strong>${escapeHtml(confidence)}</strong></p>
      </div>
      <div class="lang-en" lang="en">
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
        <p class="section-intro"><a href="https://github.com/chiehweihuang/beacon/blob/master/VALIDATION.md#wcag-criterion-coverage">本審查不檢查的每一條準則，實際排除了誰、依據 WCAG 自己的說明 &rarr;</a></p>

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
              <td>axe 作者明確表示，實務上大多數 WCAG 失敗不是機器可判定的。Beacon 自己的準則層級實測：55 條 A+AA 準則中，14 條有偵測器涵蓋。</td>
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
        <p class="section-intro"><a href="https://github.com/chiehweihuang/beacon/blob/master/VALIDATION.md#wcag-criterion-coverage">Every criterion this audit doesn't check, and who that leaves out, per WCAG's own rationale &rarr;</a></p>

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
              <td>axe's authors say explicitly that most WCAG failures are not machine-decidable in practice. Beacon's own criterion-level measurement: 14 of 55 A+AA criteria have any detector at all.</td>
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

// C8: methodology + legal together were ~38% of the document by character count,
// rendered fully inline with no real folding (four-lens IA audit). The section
// landmark + heading stay visible so the jump-nav still lands somewhere meaningful;
// everything below is collapsed by default behind one <details>, reusing the same
// bordered/accent-border look buildLimitationsHTML's own "methods applied" box already
// uses (.methods-details) rather than inventing a second style for the same idea.
function buildMethodologySectionHTML(audit) {
  return `
    <section id="layer-methodology" aria-labelledby="h-methodology">
      <div class="wrap">
        <h2 class="layer-h" id="h-methodology">${bi('檢查範圍與限制', 'Check scope and limitations')}</h2>
        <details class="methods-details layer-fold">
          <summary>${bi('展開完整檢查範圍、方法論與限制', 'Expand full check scope, methodology & limits')}</summary>
          ${buildScopeDetailHTML(audit)}
          ${buildLimitationsHTML(audit)}
          <h3>${t('h2_testing_recommendations')}</h3>
          ${audit.testing_recommendations?.length ? `<ul>${audit.testing_recommendations.map(rec => `<li>${localizedText(rec)}</li>`).join('')}</ul>` : `<p class="empty">${t('rem_empty')}</p>`}
        </details>
      </div>
    </section>`;
}

function buildLegalSectionHTML(audit) {
  return `
    <section class="section-alt" id="layer-legal" aria-labelledby="h-legal">
      <div class="wrap">
        <h2 class="layer-h" id="h-legal">${bi('各地法規參考', 'Jurisdiction references')}</h2>
        <details class="methods-details layer-fold">
          <summary>${bi('選擇國家／地區查閱參考資料', 'Browse references by country or region')}</summary>
          ${buildLegalRiskHTML(audit.legal_risk, reportFindings)}
        </details>
      </div>
    </section>`;
}

// Jurisdiction-expansion spec (2026-08-29, item 3): cards now render straight from
// jurisdictions.mjs by tier/cardStyle instead of six near-identical hardcoded strings.
// A source string may carry a trailing annotation after the URL (e.g. "https://x (法規原文)")
// — split on whitespace for the href, keep the full string as the visible label.
function sourceLinkHTML(s) {
  const href = String(s).split(/\s/)[0];
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s)}</a>`;
}

const CONFIDENCE_LABEL = {
  high: ['高信心', 'high confidence'], verified: ['高信心（已驗證）', 'verified'],
  medium: ['中信心', 'medium confidence'], low: ['低信心', 'low confidence'],
  uncertain: ['不確定', 'uncertain'],
};

const TIER_NOTE = {
  'framework-no-web-specifics': bi(
    '<strong>屬一般性框架，非網頁專屬立法</strong>——法規本身沒有網站／ICT 專屬條文，任何 WCAG 對照都來自行政指引，不是法規條文本身。',
    '<strong>General framework, not web-specific legislation</strong> — the statute itself has no website/ICT-specific text; any WCAG reference comes from administrative guidance, not the statute.'
  ),
  'no-specific-law': bi(
    '<strong>此法域目前查無網頁無障礙專門法規。</strong>',
    '<strong>No specific web-accessibility law was found for this jurisdiction.</strong>'
  ),
};

function jurisdictionCardHTML(j) {
  const [confZh, confEn] = CONFIDENCE_LABEL[j.confidence] || [j.confidence, j.confidence];
  const statuteHTML = j.statute
    ? `<p><strong>${bi('法規', 'Statute')}:</strong> ${escapeHtml(j.statute.name.original)}${j.statute.name.original !== j.statute.name.en ? ` (${escapeHtml(j.statute.name.en)})` : ''}${j.statute.year ? `, ${j.statute.year}` : ''}${j.statute.provision ? ` — ${escapeHtml(j.statute.provision)}` : ''}</p>`
    : '';
  const scopeHTML = `<p><strong>${bi('範圍', 'Scope')}:</strong> ${bi(
    `公部門${j.scope.public ? '✓' : '✗'}．私部門${j.scope.private ? '✓' : '✗'}`,
    `Public ${j.scope.public ? 'yes' : 'no'} · Private ${j.scope.private ? 'yes' : 'no'}`
  )}<br>${bi(escapeHtml(j.scope.text.zh), escapeHtml(j.scope.text.en))}</p>`;
  const standardHTML = j.standard
    ? `<p><strong>${bi('技術標準', 'Technical standard')}:</strong> ${escapeHtml(j.standard.name)}${j.standard.binding ? ` — ${escapeHtml(String(j.standard.binding))}` : ''}</p>`
    : `<p><strong>${bi('技術標準', 'Technical standard')}:</strong> ${bi('無', 'None')}</p>`;
  const caseHTML = j.enforcement?.realCase
    ? `<p class="case-note"><strong>${bi('真實案例', 'Real case')}:</strong> ${escapeHtml(j.enforcement.realCase.name)} (${j.enforcement.realCase.year}) — ${escapeHtml(j.enforcement.realCase.outcome)}</p>`
    : '';
  const enforcementHTML = j.enforcement?.mechanism
    ? `<p><strong>${bi('執法機制', 'Enforcement')}:</strong> ${bi(escapeHtml(j.enforcement.mechanism.zh), escapeHtml(j.enforcement.mechanism.en))}</p>${caseHTML}`
    : '';
  const sourcesHTML = j.sources?.length
    ? `<p class="sources-line">${bi('來源', 'Sources')}: ${j.sources.map(sourceLinkHTML).join(' &middot; ')}</p>`
    : '';
  return `
    <div class="risk-card" data-tier="${escapeHtml(j.tier)}">
      <div class="risk-header">
        <strong>${bi(escapeHtml(j.name.zh), escapeHtml(j.name.en))}</strong>
        <span class="context-badge">${bi(confZh, confEn)}</span>
      </div>
      ${TIER_NOTE[j.tier] ? `<p class="tier-note">${TIER_NOTE[j.tier]}</p>` : ''}
      ${statuteHTML}
      ${scopeHTML}
      ${standardHTML}
      ${enforcementHTML ? `<details class="legal-background"><summary>${bi('背景與案例', 'Background and cases')}</summary>${enforcementHTML}</details>` : ''}
      ${sourcesHTML}
    </div>`;
}

// south-america.md's "regional-tier note" countries (Chile/Peru/Uruguay/Ecuador): real
// research, but a comparison table rather than four more full cards.
function jurisdictionGroupedTableHTML(list) {
  if (!list.length) return '';
  const rows = list.map(j => {
    const [confZh, confEn] = CONFIDENCE_LABEL[j.confidence] || [j.confidence, j.confidence];
    const scopeZh = [j.scope.public ? '公部門' : '', j.scope.private ? '私部門' : ''].filter(Boolean).join('＋') || '無';
    const scopeEn = [j.scope.public ? 'Public' : '', j.scope.private ? 'Private' : ''].filter(Boolean).join(' + ') || 'None';
    return `<tr>
      <td>${bi(escapeHtml(j.name.zh), escapeHtml(j.name.en))}</td>
      <td>${j.statute ? escapeHtml(j.statute.name.en) : bi('無', 'None')}</td>
      <td>${j.standard ? escapeHtml(j.standard.name) : bi('無', 'None')}</td>
      <td>${bi(scopeZh, scopeEn)}</td>
      <td>${bi(confZh, confEn)}</td>
    </tr>`;
  }).join('');
  return `
    <div class="jurisdiction-group">
      <h3>${bi('南美其他法域比較', 'Other South American jurisdictions (comparison)')}</h3>
      <table class="summary-table">
        <thead><tr><th>${bi('法域', 'Jurisdiction')}</th><th>${bi('法規', 'Statute')}</th><th>${bi('技術標準', 'Standard')}</th><th>${bi('範圍', 'Scope')}</th><th>${bi('信心度', 'Confidence')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// Thin/low-confidence honest-nulls (Venezuela/Bolivia/Paraguay/Guyana/Suriname): one
// compact line each, not a full card — the research itself is thinner here.
function jurisdictionOnelineListHTML(list) {
  if (!list.length) return '';
  const items = list.map(j => {
    const [confZh, confEn] = CONFIDENCE_LABEL[j.confidence] || [j.confidence, j.confidence];
    return `<li><strong>${bi(escapeHtml(j.name.zh), escapeHtml(j.name.en))}:</strong> ${bi(escapeHtml(j.scope.text.zh), escapeHtml(j.scope.text.en))} <span class="rule-id">(${bi(confZh, confEn)})</span></li>`;
  }).join('');
  return `
    <div class="jurisdiction-onelines">
      <h3>${bi('其他查無專門法規的法域', 'Other jurisdictions with no specific law found')}</h3>
      <ul>${items}</ul>
    </div>`;
}

function buildLegalRiskHTML(legal, findings) {
  const criteria = collectCriteria(findings);
  const criteriaText = criteria.length ? criteriaLabel(criteria) : 'No WCAG criteria were mapped by this audit.';
  return `
    <div class="legal-risk-panel">
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
      <p>${bi('選擇地區只改變參考資料的顯示，不判定法律是否適用，也不改變檢查結果。逐地區查核日期未提供；報告產生日期不是法規更新日期。', 'Selecting a region only changes the references shown. It does not determine legal applicability or change audit results. Per-region verification dates are not supplied; the report date is not a legal update date.')}</p>
      <label for="jurisdiction-choice">${bi('國家／地區', 'Country or region')}</label>
      <select id="jurisdiction-choice"><option value="all">全部地區 / All regions</option>${JURISDICTIONS.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.name.zh)} / ${escapeHtml(j.name.en)}</option>`).join('')}</select>
      ${JURISDICTIONS.map(j => `<div class="jurisdiction-entry" data-jurisdiction="${escapeHtml(j.id)}">${j.cardStyle === 'full' ? jurisdictionCardHTML(j) : j.cardStyle === 'grouped' ? jurisdictionGroupedTableHTML([j]) : jurisdictionOnelineListHTML([j])}</div>`).join('')}
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

// Performance Signals section — rendered ONLY when audit.lighthouse is present.
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
      return `<span style="display:inline-block;font-size:.72rem;padding:.1rem .45rem;margin:0 .25rem .25rem 0;border:1px solid var(--border);border-radius:0;color:var(--text);background:var(--bg);">${bi(zh, en)}</span>`;
    })
    .join('');
}

function perfChip(label, score) {
  if (score == null) return '';
  return `<div style="flex:1;min-width:120px;text-align:center;padding:.9rem .6rem;border:1px solid var(--border);border-radius:0;background:var(--surface);">
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

  const banner = `<div role="note" style="border:1px solid var(--warn);border-radius:0;padding:.8rem 1rem;margin:.5rem 0 1.2rem;background:var(--bg);">
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
         <div style="border-left:3px solid var(--accent);padding:.6rem .9rem;margin:.6rem 0;background:var(--surface);border-radius:0;">
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
            <div style="flex:1;background:var(--bg);border-radius:0;overflow:hidden;">
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

function buildPerformanceSectionHTML(audit) {
  if (!audit.lighthouse) return '';
  return `
    <section id="layer-performance" aria-labelledby="h-performance">
      <div class="wrap">
        <p class="eyebrow"><span class="num">07</span> ${bi('效能訊號', 'Performance')}</p>
        <h2 class="layer-h" id="h-performance">${bi('Lighthouse 效能訊號（補充，不併入無障礙分數）', 'Lighthouse performance signals (supplementary, never folded into the a11y score)')}</h2>
        ${buildPerformanceHTML(audit)}
      </div>
    </section>`;
}

function buildMastheadHTML(audit) {
  const pageLine = /^https?:\/\//i.test(audit.metadata?.url || '')
    ? `<div><dt>${t('meta_url')}</dt><dd><a href="${escapeHtml(audit.metadata.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(audit.metadata.url)}</a></dd></div>`
    : audit.metadata?.scope
      ? `<div><dt>${t('meta_scope')}</dt><dd>${escapeHtml(audit.metadata.scope)}</dd></div>`
      : '';
  return `
    <header class="masthead">
      <div class="wrap">
        <div class="brand">
          <span class="beacon-mark" aria-hidden="true"></span>
          <span>Beacon <span style="color:var(--ink-muted);font-weight:600">${bi('無障礙檢測報告', 'Accessibility Audit')}</span></span>
        </div>
        <dl class="metagrid">
          ${pageLine}
          <div><dt>${t('meta_date')}</dt><dd>${escapeHtml(audit.metadata?.date || 'N/A')}</dd></div>
          <div><dt>${t('meta_standard')}</dt><dd>${escapeHtml(audit.metadata?.standard || 'WCAG 2.2 AA')}</dd></div>
          <div><dt>${bi('層級', 'Tier')}</dt><dd>${escapeHtml(audit.metadata?.audit_tier || 'Tier 1')}</dd></div>
        </dl>
      </div>
    </header>`;
}

function buildJumpNavHTML() {
  const items = [
    ['#layer-decision', bi('1. 檢查結果', '1. Results')],
    ['#layer-findings', bi('2. 問題與修復', '2. Review and repair')],
    ['#retest', bi('3. 重測與確認', '3. Retest and verify')],
  ];
  return `
    <nav class="jump" aria-label="Report sections / 報告章節">
      <ul>${items.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul>
    </nav>`;
}

function buildToolbarHTML() {
  return `
    <div class="report-toolbar" role="toolbar" aria-label="Report preferences / 報告偏好設定">
      <div class="tb-group" role="group" aria-label="Language / 語言">
        <button type="button" data-lang-btn="zh" aria-pressed="true">中文</button>
        <button type="button" data-lang-btn="en" aria-pressed="false">EN</button>
      </div>
      <div class="tb-group" role="group" aria-label="Theme / 主題">
        <button type="button" data-theme-btn="light" aria-pressed="false" aria-label="Light mode / 淺色" title="Light mode / 淺色">&#9728;</button>
        <button type="button" data-theme-btn="dark" aria-pressed="false" aria-label="Dark mode / 深色" title="Dark mode / 深色">&#9790;</button>
        <button type="button" data-theme-btn="auto" aria-pressed="true" aria-label="Follow system / 跟隨系統" title="Follow system / 跟隨系統">A</button>
      </div>
    </div>`;
}

function buildFooterHTML(audit) {
  return `
    <footer>
      <div class="wrap">
        <p><span class="lang-zh" lang="zh-Hant">Beacon 是免費開源工具，評分背後的驗證資料全數公開。維護者提供無障礙 AI 檢測與修復的顧問服務：<a href="https://chiehweihuang.github.io/beacon/#services">chiehweihuang.github.io/beacon#services</a></span><span class="lang-en" lang="en">Beacon is free and open source, and the validation data behind its scores is public. The maintainer offers accessibility consulting for AI-assisted development: <a href="https://chiehweihuang.github.io/beacon/#services">chiehweihuang.github.io/beacon#services</a></span></p>
        <p style="margin-top:.6rem;font-size:.82rem;color:var(--ink-muted)">${bi('Beacon 產生的 audit artifacts 留在本機，除非你明確分享。', 'Beacon keeps audit artifacts local unless you explicitly share them.')}</p>
        <p class="foot-engine">${productVersion ? `Beacon ${escapeHtml(productVersion)} &middot; ` : ''}engine ${escapeHtml(audit.metadata?.engine_fingerprint || audit.metadata?.tool_version || '')} &middot; ${escapeHtml(audit.metadata?.audit_tier || '')} &middot; confidence ${escapeHtml(audit.metadata?.confidence_level || '')}</p>
      </div>
    </footer>`;
}

const allGroups = buildFindingGroups(reportFindings);
const groupsByCat = groupByCategory(allGroups);

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beacon 無障礙檢測報告 &middot; Accessibility Audit Report &mdash; ${escapeHtml(titleHost(audit))}</title>
<style>
${REPORT_STYLES}
</style>
</head>
<body>
<a class="skip" href="#main-content">跳到主要內容 · Skip to main content</a>

${buildToolbarHTML()}
${buildMastheadHTML(audit)}
${buildJumpNavHTML(!!audit.lighthouse)}

<main id="main-content" tabindex="-1">
${buildHeroHTML(audit, previous, allGroups)}
${buildFindingsSectionHTML(audit, allGroups)}

<details class="supplement"><summary>${bi('分類證據與分數明細', 'Category evidence and score details')}</summary>
<section class="section-alt" id="layer-evidence" aria-labelledby="h-evidence">
  <div class="wrap">
    <p class="eyebrow"><span class="num">02</span> ${bi('證據層', 'Evidence')}</p>
    <h2 class="layer-h" id="h-evidence">${bi('每個分數旁邊都標出它背後有多少證據', 'Every score shows how much evidence stands behind it')}</h2>
    <p class="layer-sub">${bi('檢查數量表示本次證據的規模，不代表判定一定正確。請逐項對照來源與限制。', 'Check counts describe the amount of evidence, not the certainty of a verdict. Review the sources and limitations.')}</p>
    ${buildReaderTaskEvidenceHTML(audit)}
    ${buildCategoryGridHTML(audit.summary.categories, previous?.summary?.categories, groupsByCat, tier2Evidence)}
  </div>
</section>

</details>
<details class="supplement"><summary>${bi('執行摘要', 'Executive summary')}</summary>
${buildExecSummaryHTML(audit, allGroups)}
</details>
${buildMethodologySectionHTML(audit)}
${buildLegalSectionHTML(audit)}
${buildPerformanceSectionHTML(audit)}
</main>

${buildFooterHTML(audit)}

<script>
${REPORT_INTERACTIONS}
</script>
</body>
</html>`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, html.replace(/[ \t]+$/gm, ''), 'utf8');
console.log(`Report written to: ${outputPath}`);

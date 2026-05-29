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
    tab_legal: '法律風險',
    tab_methodology: '方法論與限制',
    tab_remediation: '修復計畫',
    // Section headings (suggestion-toned)
    h2_category_summary: '分類摘要',
    h2_critical: '建議優先處理',
    h2_warnings: '建議留意項目',
    h2_tips: '參考建議與最佳實踐',
    h2_remediation_priority: '修復優先序',
    h2_testing_recommendations: '測試建議',
    h2_legal_risk: '法律風險評估',
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
    finding_empty: '此分類目前無發現項目。',
    // Legal risk
    legal_deadline: '截止日',
    legal_score: '暴露分數',
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
  },
  en: {
    tab_overview: 'Overview',
    tab_findings: 'Findings',
    tab_legal: 'Legal Risk',
    tab_methodology: 'Methodology & Limits',
    tab_remediation: 'Remediation',
    h2_category_summary: 'Category Summary',
    h2_critical: 'Priority Items',
    h2_warnings: 'Items to Note',
    h2_tips: 'Suggestions & Best Practices',
    h2_remediation_priority: 'Remediation Priority',
    h2_testing_recommendations: 'Testing Recommendations',
    h2_legal_risk: 'Legal Risk Assessment',
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
    finding_empty: 'No observations in this category at the moment.',
    legal_deadline: 'Deadline',
    legal_score: 'Exposure Score',
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
  },
};

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

function scoreColor(score) {
  if (score >= 90) return '#0cce6b';
  if (score >= 50) return '#ffa400';
  return '#ff4e42';
}

function scoreLabel(score) {
  // Returns a bilingual span; choose key based on score band
  if (score >= 90) return t('verdict_pass');
  if (score >= 50) return t('verdict_needs_work');
  return t('verdict_fail');
}

function riskColor(level) {
  const map = { critical: '#ff4e42', high: '#ff4e42', medium: '#ffa400', low: '#0cce6b' };
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
      <tr class="category-row" data-category="${cat.id}">
        <td class="cat-name">${catName(cat)}</td>
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
    return `
      <div class="finding ${severityClass}">
        <div class="finding-header">
          <span class="severity-icon">${icon}</span>
          <strong>${escapeHtml(f.title || '')}</strong>
          <span class="wcag-tag">${escapeHtml(f.wcag || '')}</span>
          <span class="level-tag">${escapeHtml(f.level || '')}</span>
        </div>
        <div class="finding-body">
          <p><strong>${t('finding_affected')}:</strong> ${escapeHtml(f.affected_users || 'N/A')}</p>
          <p><strong>${t('finding_location')}:</strong> <code>${escapeHtml(f.location || 'N/A')}</code></p>
          <p>${escapeHtml(f.description || '')}</p>
          ${f.fix ? `<div class="fix"><strong>${t('finding_fix')}:</strong> ${escapeHtml(f.fix)}</div>` : ''}
          ${f.legal_exposure ? `<div class="legal"><strong>${t('finding_legal')}:</strong> ${escapeHtml(f.legal_exposure)}</div>` : ''}
          ${f.code_before ? `<details><summary>${t('finding_before_after')}</summary><div class="code-compare"><div class="code-before"><div class="code-label">${t('finding_before')}</div><pre><code>${escapeHtml(f.code_before)}</code></pre></div><div class="code-after"><div class="code-label">${t('finding_after')}</div><pre><code>${escapeHtml(f.code_after || '')}</code></pre></div></div></details>` : ''}
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildLegalRiskHTML(legal) {
  if (!legal) return '';
  return `
    <div class="legal-risk-panel">
      <h3>${t('h2_legal_risk')}</h3>
      <div class="risk-grid">
        ${legal.jurisdictions.map(j => `
          <div class="risk-card" style="border-left:4px solid ${riskColor(j.risk_level)}">
            <div class="risk-header">
              <strong>${escapeHtml(j.name || '')}</strong>
              <span class="risk-badge" style="background:${riskColor(j.risk_level)}">${escapeHtml((j.risk_level || '').toUpperCase())}</span>
            </div>
            <p>${escapeHtml(j.law || '')} &mdash; ${escapeHtml(j.detail || '')}</p>
            ${j.deadline ? `<p class="deadline">${t('legal_deadline')}: ${escapeHtml(j.deadline)}</p>` : ''}
            <p class="risk-score">${t('legal_score')}: <strong>${j.score}/10</strong></p>
          </div>`).join('')}
      </div>
      <div class="risk-summary">
        <div class="overall-risk" style="background:${riskColor(legal.overall_level)}">
          ${t('legal_overall')}: ${legal.overall_level.toUpperCase()} (${legal.overall_score}/10)
        </div>
      </div>
    </div>`;
}

function buildContextBanner() {
  return `
    <div class="audit-context-banner" role="note" aria-label="Audit limitations notice">
      <div class="lang-zh" lang="zh-Hant">
        <div class="banner-title">&#9888; 閱讀分數前的脈絡說明</div>
        <p>
          這是一份<strong>自動化基線審查</strong>。依目前的業界資料（包含 axe-core 團隊自己的說明），自動化工具大約能涵蓋
          <strong>30&ndash;40% 的 WCAG 項目</strong>。其餘 60&ndash;70%&mdash;例如認知負荷、真實螢幕閱讀器任務達成率、
          動態互動品質、瀏覽器深色模式覆寫下的效能體驗、以及標籤文字是否<em>真的易懂</em>&mdash;
          較適合透過<strong>與障礙使用者一同測試</strong>來確認。
        </p>
        <p class="banner-cta">
          較高的分數，本身還不足以充分代表網站完全可達。可一併參閱 <strong>Methodology &amp; Limits</strong> 分頁，
          了解本審查擅長與不擅長的範疇、以及建議的工作流程。
        </p>
      </div>
      <div class="lang-en" lang="en">
        <div class="banner-title">&#9888; Context Before Reading the Score</div>
        <p>
          This is an <strong>automated baseline audit</strong>. Based on current industry data
          (including statements from the axe-core team itself), automated tools cover roughly
          <strong>30&ndash;40% of WCAG criteria</strong>. The remaining 60&ndash;70% &mdash; cognitive load,
          real screen-reader task completion, dynamic interaction quality, performance experience
          under user-agent dark-mode overrides, whether labels are actually <em>understandable</em>
          &mdash; are better confirmed through <strong>testing alongside disabled users</strong>.
        </p>
        <p class="banner-cta">
          A high score, on its own, does not yet fully demonstrate accessibility. You can pair this
          report with the <strong>Methodology &amp; Limits</strong> tab to see what this audit
          is well-suited and less-suited for, plus the recommended workflow.
        </p>
      </div>
    </div>`;
}

// AEO sub-score honesty note. Echoes buildContextBanner()'s epistemic stance but
// scoped to the Agent/AEO category detail — it appears exactly where the reader
// sees the AEO sub-score, not at report top. AEO measures structural hygiene
// (an eligibility proxy), never actual citation outcomes.
function buildAeoDisclaimer() {
  return `
    <div class="aeo-disclaimer" role="note" aria-label="AEO sub-score interpretation note">
      <div class="lang-zh" lang="zh-Hant">
        <div class="aeo-disclaimer-title">&#9888; 關於 AEO 子分數的解讀</div>
        <p>
          AEO 子分數衡量的是<strong>被認為有助於 AI 引用的結構衛生</strong>（JSON-LD、meta tags、
          canonical、Open Graph 等），<strong>不是實際引用結果</strong>。結構齊全只代表「具備被引用的
          條件」，不代表 AI 引擎真的引用了你的內容。
        </p>
        <p class="aeo-disclaimer-cta">
          要確認 AI 是否真的引用你的內容，需檢視三項實證訊號：<strong>server log 的 AI 爬蟲記錄</strong>、
          <strong>手動在 answer engine 查詢</strong>、以及 <strong>analytics 的 referral 來源</strong>。
          這三項若皆為零，則不論 AEO 子分數幾分，引用效果尚未發生。
        </p>
      </div>
      <div class="lang-en" lang="en">
        <div class="aeo-disclaimer-title">&#9888; Reading the AEO Sub-score</div>
        <p>
          The AEO sub-score measures <strong>structural hygiene believed to help AI citation</strong>
          (JSON-LD, meta tags, canonical, Open Graph, etc.) &mdash; <strong>not actual citation
          outcomes</strong>. Complete structure means "eligible to be cited", not that any AI engine
          has cited your content.
        </p>
        <p class="aeo-disclaimer-cta">
          To confirm whether AI actually cites your content, check three empirical signals:
          <strong>AI-crawler hits in server logs</strong>, <strong>manual queries on answer
          engines</strong>, and <strong>referral sources in analytics</strong>. If all three are
          zero, then whatever the AEO sub-score, citation impact has not happened yet.
        </p>
      </div>
    </div>`;
}

function buildLimitationsHTML(audit) {
  const tier = audit.metadata?.audit_tier || 'Tier 1 (static HTML only)';
  const confidence = audit.metadata?.confidence_level || 'medium';
  const methods = audit.metadata?.audit_methods || [];
  const methodsHTML = methods.length ? `
    <details open class="methods-details">
      <summary class="lang-zh" lang="zh-Hant"><strong>本次審查實際採用的方法</strong></summary>
      <summary class="lang-en" lang="en"><strong>Methods applied in this audit</strong></summary>
      <ul class="methods-list">${methods.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>
    </details>` : '';

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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit Report — ${audit.metadata?.scope || 'Project'}</title>
<style>
  /* Default: light theme (follows OS via prefers-color-scheme; user can override via toolbar) */
  :root {
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface-2: #f1f5f9;
    --text: #0f172a;
    --text-muted: #475569;
    --border: #e2e8f0;
    --accent: #0369a1;
    --pass: #047857;
    --warn: #b45309;
    --fail: #b91c1c;
    --tip: #0369a1;
    --gold: #c8901c;
    --gold-glow: rgba(200, 144, 28, 0.18);
    --shadow: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04);
    color-scheme: light;
  }

  /* Respect OS preference automatically (fast path — pure CSS variable swap, no JS) */
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --surface-2: #0f3460;
      --text: #e8e8e8;
      --text-muted: #a0a0b0;
      --border: #2a2a4a;
      --accent: #4fc3f7;
      --pass: #0cce6b;
      --warn: #ffa400;
      --fail: #ff4e42;
      --tip: #4fc3f7;
      --gold: #e6b800;
      --gold-glow: rgba(230, 184, 0, 0.22);
      --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
      color-scheme: dark;
    }
  }

  /* User-explicit override via toolbar button (wins over media query) */
  :root[data-theme="light"] {
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface-2: #f1f5f9;
    --text: #0f172a;
    --text-muted: #475569;
    --border: #e2e8f0;
    --accent: #0369a1;
    --pass: #047857;
    --warn: #b45309;
    --fail: #b91c1c;
    --tip: #0369a1;
    --gold: #c8901c;
    --gold-glow: rgba(200, 144, 28, 0.18);
    --shadow: 0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04);
    color-scheme: light;
  }
  :root[data-theme="dark"] {
    --bg: #1a1a2e;
    --surface: #16213e;
    --surface-2: #0f3460;
    --text: #e8e8e8;
    --text-muted: #a0a0b0;
    --border: #2a2a4a;
    --accent: #4fc3f7;
    --pass: #0cce6b;
    --warn: #ffa400;
    --fail: #ff4e42;
    --tip: #4fc3f7;
    --gold: #e6b800;
    --gold-glow: rgba(230, 184, 0, 0.22);
    --shadow: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
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
    color: #fff;
  }
  .toolbar-group button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  h3 { font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
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
  .summary-table .pass { color: var(--pass); }
  .summary-table .fail { color: var(--fail); }
  .category-row { cursor: pointer; }
  .category-row:hover { background: var(--surface-2); }

  .score-bar { height: 20px; background: var(--surface); border-radius: 10px; position: relative; overflow: hidden; min-width: 100px; }
  .score-fill { height: 100%; border-radius: 10px; transition: width 0.8s ease; }
  .score-text { position: absolute; right: 8px; top: 0; line-height: 20px; font-size: 0.75rem; font-weight: 600; }
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
  .fix { background: rgba(12,206,107,0.1); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }
  .legal { background: rgba(255,78,66,0.1); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; }

  .code-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.5rem; }
  .code-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform: uppercase; }
  .code-before pre, .code-after pre { background: var(--bg); padding: 0.5rem; border-radius: 4px;
    overflow-x: auto; font-size: 0.8rem; }
  .code-before pre { border: 1px solid rgba(255,78,66,0.3); }
  .code-after pre { border: 1px solid rgba(12,206,107,0.3); }

  /* Legal Risk */
  .risk-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin: 1rem 0; }
  .risk-card { background: var(--surface); padding: 1rem; border-radius: 8px; }
  .risk-header { display: flex; justify-content: space-between; align-items: center; }
  .risk-badge { color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .deadline { color: var(--warn); font-weight: 600; }
  .risk-score { font-variant-numeric: tabular-nums; }
  .overall-risk { text-align: center; padding: 0.8rem; border-radius: 8px; color: white;
    font-size: 1.1rem; font-weight: 700; }
  .risk-summary { margin-top: 1rem; }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 2px solid var(--border);
    margin: 2rem 0 1rem;
    flex-wrap: wrap;
  }
  .tab {
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
    box-shadow:
      inset 0 0 0 1.5px var(--gold),
      0 2px 12px var(--gold-glow);
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
    background: linear-gradient(135deg, rgba(255,164,0,0.12), rgba(79,195,247,0.08));
    border: 1px solid var(--warn);
    border-left: 6px solid var(--warn);
    border-radius: 8px;
    padding: 1.1rem 1.3rem;
    margin: 1.5rem 0;
    font-size: 0.92rem;
    line-height: 1.7;
  }
  .audit-context-banner .banner-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--warn);
    margin-bottom: 0.5rem;
    letter-spacing: 0.01em;
  }
  .audit-context-banner p { margin-bottom: 0.5rem; }
  .audit-context-banner p:last-child { margin-bottom: 0; }
  .audit-context-banner .banner-cta {
    color: var(--text-muted);
    font-size: 0.88rem;
    border-top: 1px dashed rgba(255,164,0,0.3);
    padding-top: 0.5rem;
    margin-top: 0.5rem;
  }
  .audit-context-banner strong { color: var(--text); }
  .audit-context-banner em { font-style: italic; color: var(--warn); }

  /* AEO sub-score disclaimer — scoped to the Agent/AEO category detail */
  .aeo-disclaimer {
    background: linear-gradient(135deg, rgba(79,195,247,0.10), rgba(255,164,0,0.06));
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
    ${audit.summary.total_findings} ${t('verdict_issues_found')}
    (${audit.summary.critical} ${t('verdict_critical')}, ${audit.summary.warnings} ${t('verdict_warnings')}, ${audit.summary.tips} ${t('verdict_tips')})
  </span>
</div>

<!-- Audit context banner: always shown, sets epistemic frame -->
${buildContextBanner()}

<!-- Tabs -->
<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">${t('tab_overview')}</div>
  <div class="tab" onclick="switchTab('findings')">${t('tab_findings')}</div>
  <div class="tab" onclick="switchTab('legal')">${t('tab_legal')}</div>
  <div class="tab" onclick="switchTab('methodology')">${t('tab_methodology')}</div>
  <div class="tab" onclick="switchTab('remediation')">${t('tab_remediation')}</div>
</div>

<!-- Overview Tab -->
<div id="tab-overview" class="tab-content active">
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
      ${cat.id === 'agent' ? buildAeoDisclaimer() : ''}
      ${buildFindingsHTML(audit.findings?.filter(f => f.category === cat.id))}
    </div>
  `).join('')}
</div>

<!-- Findings Tab -->
<div id="tab-findings" class="tab-content">
  <h2>${t('h2_critical')}</h2>
  ${buildFindingsHTML(audit.findings?.filter(f => f.severity === 'critical'))}

  <h2>${t('h2_warnings')}</h2>
  ${buildFindingsHTML(audit.findings?.filter(f => f.severity === 'warning'))}

  <h2>${t('h2_tips')}</h2>
  ${buildFindingsHTML(audit.findings?.filter(f => f.severity === 'tip'))}
</div>

<!-- Legal Tab -->
<div id="tab-legal" class="tab-content">
  ${buildLegalRiskHTML(audit.legal_risk)}
</div>

<!-- Methodology & Limits Tab -->
<div id="tab-methodology" class="tab-content">
  ${buildLimitationsHTML(audit)}
</div>

<!-- Remediation Tab -->
<div id="tab-remediation" class="tab-content">
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
            <span>&#8226; ${escapeHtml(r.title || '')} &mdash; ${escapeHtml(r.wcag || '')}</span>
            <span class="effort-tag">${escapeHtml(r.effort || '')}</span>
          </div>
        `).join('')}
      </div>`;
  }).join('')}

  <h2>${t('h2_testing_recommendations')}</h2>
  ${audit.testing_recommendations ? `<ul>${audit.testing_recommendations.map(rec => `<li>${escapeHtml(rec)}</li>`).join('')}</ul>` : `<p class="empty">${t('rem_empty')}</p>`}
</div>

<script>
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector(\`.tab[onclick*="\${name}"]\`).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}
document.querySelectorAll('.category-row').forEach(row => {
  row.addEventListener('click', () => {
    const id = row.dataset.category;
    const detail = document.getElementById('detail-' + id);
    if (detail) detail.classList.toggle('open');
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
    b.addEventListener('click', () => setLang(b.dataset.langBtn));
  });
  document.querySelectorAll('[data-theme-btn]').forEach(b => {
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

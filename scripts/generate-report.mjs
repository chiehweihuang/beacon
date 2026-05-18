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

if (!outputPath) {
  outputPath = resolve(dirname(auditPath), `a11y-report-${audit.metadata?.date || 'latest'}.html`);
}

function scoreColor(score) {
  if (score >= 90) return '#0cce6b';
  if (score >= 50) return '#ffa400';
  return '#ff4e42';
}

function scoreLabel(score) {
  if (score >= 90) return 'PASS';
  if (score >= 50) return 'NEEDS WORK';
  return 'FAIL';
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
        <td class="cat-name">${cat.name}</td>
        <td class="num pass">${cat.pass} ${deltaArrow(cat.pass, prevPass)}</td>
        <td class="num fail">${cat.fail} ${deltaArrow(cat.fail, prevFail)}</td>
        <td class="num review">${cat.review || 0}</td>
        <td>
          <div class="score-bar">
            <div class="score-fill" style="width:${cat.score}%;background:${scoreColor(cat.score)}"></div>
            <span class="score-text">${cat.score}%</span>
          </div>
          ${prevScore !== null ? `<div class="prev-score">was ${prevScore}%</div>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function buildFindingsHTML(findings) {
  if (!findings || findings.length === 0) return '<p class="empty">No findings in this category.</p>';
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
          <p><strong>Affected users:</strong> ${escapeHtml(f.affected_users || 'N/A')}</p>
          <p><strong>Location:</strong> <code>${escapeHtml(f.location || 'N/A')}</code></p>
          <p>${escapeHtml(f.description || '')}</p>
          ${f.fix ? `<div class="fix"><strong>Fix:</strong> ${escapeHtml(f.fix)}</div>` : ''}
          ${f.legal_exposure ? `<div class="legal"><strong>Legal:</strong> ${escapeHtml(f.legal_exposure)}</div>` : ''}
          ${f.code_before ? `<details><summary>Before / After</summary><div class="code-compare"><div class="code-before"><div class="code-label">Before</div><pre><code>${escapeHtml(f.code_before)}</code></pre></div><div class="code-after"><div class="code-label">After</div><pre><code>${escapeHtml(f.code_after || '')}</code></pre></div></div></details>` : ''}
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
      <h3>Legal Risk Assessment</h3>
      <div class="risk-grid">
        ${legal.jurisdictions.map(j => `
          <div class="risk-card" style="border-left:4px solid ${riskColor(j.risk_level)}">
            <div class="risk-header">
              <strong>${escapeHtml(j.name || '')}</strong>
              <span class="risk-badge" style="background:${riskColor(j.risk_level)}">${escapeHtml((j.risk_level || '').toUpperCase())}</span>
            </div>
            <p>${escapeHtml(j.law || '')} &mdash; ${escapeHtml(j.detail || '')}</p>
            ${j.deadline ? `<p class="deadline">Deadline: ${escapeHtml(j.deadline)}</p>` : ''}
            <p class="risk-score">Exposure Score: <strong>${j.score}/10</strong></p>
          </div>`).join('')}
      </div>
      <div class="risk-summary">
        <div class="overall-risk" style="background:${riskColor(legal.overall_level)}">
          Overall Risk: ${legal.overall_level.toUpperCase()} (${legal.overall_score}/10)
        </div>
      </div>
    </div>`;
}

function buildContextBanner() {
  return `
    <div class="audit-context-banner" role="note" aria-label="Audit limitations notice">
      <div class="lang-zh" lang="zh-Hant">
        <div class="banner-title">&#9888; 在信任分數之前請先閱讀</div>
        <p>
          這是<strong>自動化基線審查</strong>。業界共識（包括 axe-core 團隊本身）認為自動化工具僅能偵測約
          <strong>30&ndash;40% 的真實 WCAG 問題</strong>。剩下 60&ndash;70%&mdash;認知負荷、真實螢幕閱讀器任務達成率、
          動態互動品質、瀏覽器深色模式覆寫下的效能痛點、以及標籤文字是否<em>真的易懂</em>&mdash;需要
          <strong>找障礙使用者實測</strong>才能驗證。
        </p>
        <p class="banner-cta">
          高分<em>不等於</em>網站可達。請參閱 <strong>Methodology &amp; Limits</strong> 分頁，
          了解本審查能與不能告訴你的事、以及推薦的工作流程。
        </p>
      </div>
      <div class="lang-en" lang="en">
        <div class="banner-title">&#9888; Read Before Trusting the Score</div>
        <p>
          This is an <strong>automated baseline audit</strong>. Industry consensus (including the axe-core team)
          holds that automated tools detect roughly <strong>30&ndash;40% of real WCAG issues</strong>.
          The remaining 60&ndash;70% &mdash; cognitive load, real screen-reader task completion,
          dynamic interaction quality, performance pain under user-agent dark-mode overrides,
          whether labels are actually <em>understandable</em> &mdash; require <strong>testing with disabled users</strong>.
        </p>
        <p class="banner-cta">
          A high score does <em>not</em> mean your site is accessible. See the
          <strong>Methodology &amp; Limits</strong> tab for what this audit can and cannot tell you,
          and the recommended workflow.
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
        <h3>本審查能偵測的事</h3>
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

        <h3>本審查無法偵測的事</h3>
        <p class="section-intro">需要人類判斷、真實使用者、或執行時任務觀察的項目：</p>
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
          <li><strong>自動化基線審查（本份報告）。</strong>抓出機器可偵測的子集。當作 CI 的回歸防線，不要當作完工證書。</li>
          <li><strong>公開可達性聲明。</strong>EU EAA 強制，其他司法管轄推薦。聲明標準、已知限制、回饋管道。</li>
        </ol>

        <h3>常見的誤解陷阱</h3>
        <table class="traps-table">
          <thead>
            <tr><th>你以為&hellip;</th><th>實情&hellip;</th></tr>
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
              <td>標籤文字本身也必須清楚不歧義。<code>&lt;label&gt;欄位&lt;/label&gt;</code> 通過 3.3.2 但對誰都沒用。</td>
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

        <h3>如何使用本份報告</h3>
        <ul class="usage-list">
          <li><strong>作為 CI 回歸防線：</strong>把 <code>axe-core</code> 或本審查接進 CI。阻擋引入新的 critical 違規的 PR。</li>
          <li><strong>作為教育工具：</strong>帶新成員走過 findings 建立 a11y 直覺。before/after 程式碼區塊就是為此設計。</li>
          <li><strong>作為時序追蹤指標：</strong>用 <code>--previous</code> 旗標比對審查。變化方向比絕對分數重要。</li>
          <li><strong>不要當作完工證書：</strong>「Beacon 95 分」不等於「這個產品可達」。在任何公開可達性聲明中，應說明方法論與其限制。</li>
          <li><strong>不要替代「僱用或付費請障礙者測試」：</strong>真實 a11y 工作中最昂貴也最被低估的環節。本報告無法取代這項工作。</li>
        </ul>
      </div>

      <div class="lang-en" lang="en">
        <h3>What This Audit CAN Detect</h3>
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

        <h3>What This Audit CANNOT Detect</h3>
        <p class="section-intro">Items that require human judgement, real users, or runtime task observation:</p>
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
          <li><strong>Automated baseline audit (this report).</strong> Catches the obvious, machine-detectable subset. Use as regression-prevention in CI, not as a completion certificate.</li>
          <li><strong>Public accessibility statement.</strong> Required in EU under EAA, recommended elsewhere. States your standard, known limitations, and feedback contact.</li>
        </ol>

        <h3>Common Misinterpretation Traps</h3>
        <table class="traps-table">
          <thead>
            <tr><th>If you think&hellip;</th><th>The reality is&hellip;</th></tr>
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
              <td>Skip link is one criterion. Focus management in modals, SPA route changes, and dynamic content updates is often broken separately and is invisible to static audits.</td>
            </tr>
            <tr>
              <td>"Half-implemented dark mode is harmless."</td>
              <td>It can cause real performance pain on mobile when users enable browser force-dark, because the browser falls back to slow pixel-level inversion instead of fast CSS swap.</td>
            </tr>
          </tbody>
        </table>

        <h3>How To Use This Report</h3>
        <ul class="usage-list">
          <li><strong>As baseline regression-prevention:</strong> wire <code>axe-core</code> or this audit into CI. Block PRs that introduce new critical-level violations.</li>
          <li><strong>As an education tool:</strong> walk new team members through findings to build a11y intuition. The before/after code blocks are designed for this.</li>
          <li><strong>As a tracking metric over time:</strong> use the <code>--previous</code> flag to compare audits. Direction-of-change matters more than absolute score.</li>
          <li><strong>NOT as a completion certificate:</strong> "Beacon score 95" is not "this product is accessible". State the methodology and its limits in any public accessibility statement.</li>
          <li><strong>NOT as a substitute for hiring or paying disabled users to test:</strong> the most expensive line item in real a11y work, and the most under-invested. This report cannot replace that work.</li>
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
  .tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin: 2rem 0 1rem; }
  .tab { padding: 0.6rem 1.2rem; cursor: pointer; color: var(--text-muted);
    border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
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
  <span>Date: ${audit.metadata?.date || 'N/A'}</span>
  <span>Scope: ${audit.metadata?.scope || 'N/A'}</span>
  <span>Standard: ${audit.metadata?.standard || 'WCAG 2.2 AA'}</span>
  <span>Auditor: Claude Code (a11y-audit)</span>
</div>

${previous ? `
<div class="comparison-banner">
  <div class="comparison-stat">
    <div class="value" style="color:${scoreColor(audit.summary.overall_score)}">${audit.summary.overall_score}</div>
    <div class="label">Current Score</div>
  </div>
  <div class="comparison-stat">
    <div class="value" style="color:${scoreColor(previous.summary.overall_score)}">${previous.summary.overall_score}</div>
    <div class="label">Previous Score</div>
  </div>
  <div class="comparison-stat">
    <div class="value" style="color:${audit.summary.overall_score > previous.summary.overall_score ? 'var(--pass)' : 'var(--fail)'}">
      ${audit.summary.overall_score > previous.summary.overall_score ? '+' : ''}${audit.summary.overall_score - previous.summary.overall_score}
    </div>
    <div class="label">Delta</div>
  </div>
  <div class="comparison-stat">
    <div class="value">${audit.summary.total_findings} / ${previous.summary.total_findings}</div>
    <div class="label">Issues (now / was)</div>
  </div>
</div>
` : ''}

<!-- Score Rings -->
<div class="score-ring-container">
  ${buildScoreRing('Overall', audit.summary.overall_score, previous?.summary?.overall_score)}
  ${audit.summary.categories.map(cat => {
    const prev = previous?.summary?.categories?.find(p => p.id === cat.id);
    return buildScoreRing(cat.name, cat.score, prev?.score);
  }).join('')}
</div>

<!-- Verdict -->
<div style="text-align:center;margin:1.5rem 0">
  <span style="font-size:1.3rem;font-weight:700;color:${scoreColor(audit.summary.overall_score)}">
    ${scoreLabel(audit.summary.overall_score)}
  </span>
  <span style="color:var(--text-muted);margin-left:0.5rem">
    ${audit.summary.total_findings} issues found
    (${audit.summary.critical} critical, ${audit.summary.warnings} warnings, ${audit.summary.tips} tips)
  </span>
</div>

<!-- Audit context banner: always shown, sets epistemic frame -->
${buildContextBanner()}

<!-- Tabs -->
<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('findings')">Findings</div>
  <div class="tab" onclick="switchTab('legal')">Legal Risk</div>
  <div class="tab" onclick="switchTab('methodology')">Methodology &amp; Limits</div>
  <div class="tab" onclick="switchTab('remediation')">Remediation</div>
</div>

<!-- Overview Tab -->
<div id="tab-overview" class="tab-content active">
  <h2>Category Summary</h2>
  <table class="summary-table">
    <thead>
      <tr>
        <th>Category</th>
        <th class="num">Pass</th>
        <th class="num">Fail</th>
        <th class="num">Review</th>
        <th>Coverage</th>
      </tr>
    </thead>
    <tbody>
      ${buildCategoryRows(audit.summary.categories, previous?.summary?.categories)}
    </tbody>
  </table>

  ${audit.summary.categories.map(cat => `
    <div class="category-detail" id="detail-${cat.id}">
      <h3>${cat.name}</h3>
      ${buildFindingsHTML(audit.findings?.filter(f => f.category === cat.id))}
    </div>
  `).join('')}
</div>

<!-- Findings Tab -->
<div id="tab-findings" class="tab-content">
  <h2>Critical Findings</h2>
  ${buildFindingsHTML(audit.findings?.filter(f => f.severity === 'critical'))}

  <h2>Warnings</h2>
  ${buildFindingsHTML(audit.findings?.filter(f => f.severity === 'warning'))}

  <h2>Tips &amp; Best Practices</h2>
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
  <h2>Remediation Priority</h2>
  ${['p0', 'p1', 'p2'].map(priority => {
    const items = audit.remediation?.filter(r => r.priority === priority) || [];
    if (items.length === 0) return '';
    const labels = { p0: 'P0 -- Must Fix (Level A)', p1: 'P1 -- Should Fix (Level AA)', p2: 'P2 -- Nice to Fix (Best Practices)' };
    return `
      <div class="priority-section">
        <h3><span class="priority-tag ${priority}">${priority.toUpperCase()}</span> ${labels[priority]}</h3>
        ${items.map(r => `
          <div class="remediation-item">
            <span>&#8226; ${escapeHtml(r.title || '')} &mdash; ${escapeHtml(r.wcag || '')}</span>
            <span class="effort-tag">${escapeHtml(r.effort || '')}</span>
          </div>
        `).join('')}
      </div>`;
  }).join('')}

  <h2>Testing Recommendations</h2>
  ${audit.testing_recommendations ? `<ul>${audit.testing_recommendations.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : '<p class="empty">No testing recommendations.</p>'}
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
    ? `<div class="ring-prev">was ${prevScore}</div>`
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

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
          <strong>${f.title}</strong>
          <span class="wcag-tag">${f.wcag || ''}</span>
          <span class="level-tag">${f.level || ''}</span>
        </div>
        <div class="finding-body">
          <p><strong>Affected users:</strong> ${f.affected_users || 'N/A'}</p>
          <p><strong>Location:</strong> <code>${f.location || 'N/A'}</code></p>
          <p>${f.description || ''}</p>
          ${f.fix ? `<div class="fix"><strong>Fix:</strong> ${f.fix}</div>` : ''}
          ${f.legal_exposure ? `<div class="legal"><strong>Legal:</strong> ${f.legal_exposure}</div>` : ''}
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
              <strong>${j.name}</strong>
              <span class="risk-badge" style="background:${riskColor(j.risk_level)}">${j.risk_level.toUpperCase()}</span>
            </div>
            <p>${j.law} &mdash; ${j.detail || ''}</p>
            ${j.deadline ? `<p class="deadline">Deadline: ${j.deadline}</p>` : ''}
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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Accessibility Audit Report — ${audit.metadata?.scope || 'Project'}</title>
<style>
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
</style>
</head>
<body>

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

<!-- Tabs -->
<div class="tabs">
  <div class="tab active" onclick="switchTab('overview')">Overview</div>
  <div class="tab" onclick="switchTab('findings')">Findings</div>
  <div class="tab" onclick="switchTab('legal')">Legal Risk</div>
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
            <span>&#8226; ${r.title} &mdash; ${r.wcag || ''}</span>
            <span class="effort-tag">${r.effort || ''}</span>
          </div>
        `).join('')}
      </div>`;
  }).join('')}

  <h2>Testing Recommendations</h2>
  ${audit.testing_recommendations ? `<ul>${audit.testing_recommendations.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="empty">No testing recommendations.</p>'}
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

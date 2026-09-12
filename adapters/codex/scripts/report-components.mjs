// Presentation-only components. HTML slots must be escaped or rendered by the caller.
export function renderEvidence({ id, html }) {
  return `<details class="finding-evidence" id="${id}-evidence">
    <summary aria-describedby="${id}-title">
      <span class="disclosure-closed"><span class="lang-zh" lang="zh-Hant">查看證據與技術詳情</span><span class="lang-en" lang="en">View evidence and technical details</span></span>
      <span class="disclosure-open"><span class="lang-zh" lang="zh-Hant">收合證據與技術詳情</span><span class="lang-en" lang="en">Hide evidence and technical details</span></span>
    </summary>
    ${html}
  </details>`;
}

export function renderFinding({ id, category, titleHTML, countHTML, statusHTML, verdictHTML, impactHTML, nextHTML, evidenceHTML }) {
  return `<article class="fgroup" id="${id}" data-category="${category}">
    <div class="fg-head">
      <h4 class="fg-title" id="${id}-title">${titleHTML}</h4>
      ${countHTML}<div class="meta-row">${statusHTML}</div>
    </div>
    <div class="fg-body">
      ${verdictHTML}${impactHTML}${nextHTML}
      ${renderEvidence({ id, html: evidenceHTML })}
    </div>
  </article>`;
}

export function renderCategory({ id, nameHTML, statusHTML, contentHTML, backHTML }) {
  return `<section class="review-category" id="${id}" aria-labelledby="${id}-title">
    <header class="category-heading"><h3 id="${id}-title">${nameHTML}</h3><p class="category-status">${statusHTML}</p></header>
    <div class="category-content">${contentHTML}<a href="#${id}">${backHTML}</a></div>
  </section>`;
}

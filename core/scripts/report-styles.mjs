// Inlined into the standalone HTML report; no runtime network dependency.
export const REPORT_STYLES = `
/* ============================================================
   Beacon report presentation, shared by both adapters.
   Signature: evidence-density meter — a score's weight is shown
   next to the score, so "0 on 1 check" never reads like "100 on 6".
   ============================================================ */

/* ---- font stacks: explicit CJK-safe everywhere; no legacy serif fallback ---- */
:root{
  /* Arial-first Latin sans; explicit TC + JP sans cover every CJK glyph so
     no Ming/Mincho serif is ever reachable (esp. Japanese on Windows). */
  --sans:Arial,"Segoe UI",system-ui,-apple-system,"Noto Sans TC","Noto Sans JP",
         "Yu Gothic UI","Yu Gothic",Meiryo,"Hiragino Sans","Microsoft JhengHei",sans-serif;
  /* mono Latin for code; CJK inside code falls to an explicit CJK sans
     before the final monospace keyword. */
  --mono:ui-monospace,"Cascadia Code",Consolas,"SFMono-Regular","Noto Sans Mono",
         "Noto Sans TC","Yu Gothic UI",Meiryo,"Microsoft JhengHei",monospace;

  /* light (default) */
  --bg:#ffffff;
  --surface:#f5f7f5;
  --surface-2:#eaf0ec;
  --ink:#202620;
  --ink-soft:#475047;
  --ink-muted:#535d53;
  --border:#707970;
  --border-strong:#535d53;

  --beacon:#285b75;
  --beacon-soft:#e5f0f5;
  --beacon-line:#86a7b8;

  --crit:#b3261e;   --crit-bg:#fbeceb;  --crit-line:#f0c9c6;
  --warn:#8a5a00;   --warn-bg:#fbf3e1;  --warn-line:#ecdcb2;
  --pass:#1f7a43;   --pass-bg:#e7f4ec;  --pass-line:#bfe3cd;
  --review:#465166; --review-bg:#eef1f6;--review-line:#d3dae6;
  --thin:#544bc0;

  --shadow:none;
  --radius:0;
  --interaction-bg:#fff2bb;
  --active-bg:#ffe15a;
  --step-one:#fff4c6;--step-one-active:#ffe15a;
  --step-two:#e4f1fb;--step-two-active:#b6dafa;
  --step-three:#f9e3ea;--step-three-active:#f3bfd1;
  --maxw:1080px;
  color-scheme:light;

  /* ---- compatibility aliases: let the pre-v3.2 CSS blocks below (methodology,
     legal risk, axe evidence, manual checks, AEO/life-safety banners, delta,
     lighthouse) keep working unchanged against the new token names. Declared
     ONCE here (never re-declared in the dark/theme blocks) so they keep
     following --ink/--beacon/--crit/etc. through every override. ---- */
  --text:var(--ink); --text-muted:var(--ink-soft); --text-soft:var(--ink-muted);
  --border-soft:var(--border);
  --accent:var(--beacon); --accent-hover:var(--beacon); --accent-bg:var(--beacon-soft); --accent-text:var(--bg);
  --fail:var(--crit); --fail-bg:var(--crit-bg);
  --tip:var(--beacon); --tip-bg:var(--beacon-soft);
  --info:var(--review); --info-bg:var(--review-bg); --info-border:var(--review-line);
  --font:var(--sans); --font-mono:var(--mono);
  --mid:var(--warn);
}
@media (prefers-color-scheme:dark){
  :root{
    --interaction-bg:#3b3822;
    --active-bg:#514719;
    --step-one:#35301b;--step-one-active:#514719;
    --step-two:#203442;--step-two-active:#31536a;
    --step-three:#3d2831;--step-three-active:#61394b;
    --bg:#151916;
    --surface:#1e2520;
    --surface-2:#29332b;
    --ink:#eef3ef;
    --ink-soft:#bdc8bf;
    --ink-muted:#a0aea3;
    --border:#77877b;
    --border-strong:#94a498;

    --beacon:#8dcbe9;
    --beacon-soft:#233b44;
    --beacon-line:#5f8d9e;

    --crit:#f4877f; --crit-bg:#2b1513; --crit-line:#4a221f;
    --warn:#e8b55c; --warn-bg:#271f0f; --warn-line:#463713;
    --pass:#5fc98a; --pass-bg:#122619; --pass-line:#1f4630;
    --review:#9aa6bc;--review-bg:#1a2230;--review-line:#303c50;
    --thin:#a29cf0;

    --shadow:none;
    color-scheme:dark;
  }
}

/* ---- user-explicit theme override via toolbar; wins over the media query ---- */
:root[data-theme="light"]{
  --interaction-bg:#fff2bb;--active-bg:#ffe15a;
  --step-one:#fff4c6;--step-one-active:#ffe15a;
  --step-two:#e4f1fb;--step-two-active:#b6dafa;
  --step-three:#f9e3ea;--step-three-active:#f3bfd1;
  --bg:#ffffff;--surface:#f5f7f5;--surface-2:#eaf0ec;
  --ink:#202620;--ink-soft:#475047;--ink-muted:#535d53;
  --border:#707970;--border-strong:#535d53;
  --beacon:#285b75;--beacon-soft:#e5f0f5;--beacon-line:#86a7b8;
  --crit:#b3261e;--crit-bg:#fbeceb;--crit-line:#f0c9c6;
  --warn:#8a5a00;--warn-bg:#fbf3e1;--warn-line:#ecdcb2;
  --pass:#1f7a43;--pass-bg:#e7f4ec;--pass-line:#bfe3cd;
  --review:#465166;--review-bg:#eef1f6;--review-line:#d3dae6;
  --thin:#544bc0;
  --shadow:none;
  color-scheme:light;
}
:root[data-theme="dark"]{
  --interaction-bg:#3b3822;--active-bg:#514719;
  --step-one:#35301b;--step-one-active:#514719;
  --step-two:#203442;--step-two-active:#31536a;
  --step-three:#3d2831;--step-three-active:#61394b;
  --bg:#151916;--surface:#1e2520;--surface-2:#29332b;
  --ink:#eef3ef;--ink-soft:#bdc8bf;--ink-muted:#a0aea3;
  --border:#77877b;--border-strong:#94a498;
  --beacon:#8dcbe9;--beacon-soft:#233b44;--beacon-line:#5f8d9e;
  --crit:#f4877f;--crit-bg:#2b1513;--crit-line:#4a221f;
  --warn:#e8b55c;--warn-bg:#271f0f;--warn-line:#463713;
  --pass:#5fc98a;--pass-bg:#122619;--pass-line:#1f4630;
  --review:#9aa6bc;--review-bg:#1a2230;--review-line:#303c50;
  --thin:#a29cf0;
  --shadow:none;
  color-scheme:dark;
}

/* ---- language switch: default zh. .lang-en/.lang-zh toggle by body[data-active-lang];
   compact inline "中文 · English" labels (chips, filter buttons) stay bilingual always. ---- */
body[data-active-lang="zh"] .lang-en,
body:not([data-active-lang]) .lang-en{display:none!important}
body[data-active-lang="en"] .lang-zh{display:none!important}
body[data-active-lang="en"] .lang-en{color:inherit;font-size:1em;
  font-weight:inherit;line-height:inherit;margin:0}

/* ---- report toolbar (language + theme); static so the sticky jump-nav keeps top:0 ---- */
.report-toolbar{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:flex-end;
  max-width:var(--maxw);margin:0 auto;padding:.6rem 20px .4rem}
.tb-group{display:inline-flex;background:var(--surface);border:1px solid var(--border);
  border-radius:0;padding:2px;box-shadow:var(--shadow)}
.tb-group button{background:transparent;border:0;color:var(--ink-soft);font:inherit;
  font-size:.85rem;font-weight:600;cursor:pointer;padding:.4rem .8rem;min-height:44px;
  min-width:44px;border-radius:0;display:inline-flex;align-items:center;
  justify-content:center;line-height:1.2;transition:background .15s,color .15s}
.tb-group button:hover{color:var(--ink)}
.tb-group button[aria-pressed="true"]{background:var(--beacon);color:var(--bg)}

*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;
  font-family:var(--sans);
  font-size:16px;
  line-height:1.6;
  color:var(--ink);
  background:var(--bg);
}
img{max-width:100%;height:auto}
/* UA sets pre/code to bare monospace, defeating .diff's var(--mono); force the
   explicit stack so CJK in code never reaches a legacy font. */
pre,code,kbd,samp{font-family:var(--mono)}
a{color:var(--beacon);text-underline-offset:2px}
p,a,li,td,th,h1,h2,h3{overflow-wrap:anywhere;word-break:break-word}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--beacon);outline-offset:2px;border-radius:0}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
h1,h2,h3{line-height:1.25;letter-spacing:0}
code{background:var(--surface-2);padding:.1rem .35rem;border-radius:0;font-size:.9em}
.skip{position:absolute;left:-9999px;top:0;background:var(--ink);color:var(--bg);
  padding:10px 16px;border-radius:0;z-index:100}
.skip:focus{left:0}

/* ---- eyebrow / layer labels: the numbered layers are a real reading sequence ---- */
.eyebrow{display:flex;align-items:baseline;gap:.6rem;margin:0 0 .35rem;
  font-size:.82rem;font-weight:700;letter-spacing:0;text-transform:uppercase;
  color:var(--beacon)}
.eyebrow .num{font-variant-numeric:tabular-nums;font-size:1rem;
  color:var(--ink-muted);letter-spacing:0}
.layer-h{font-size:1.5rem;margin:.1rem 0 .2rem}
.layer-sub{color:var(--ink-soft);margin:.1rem 0 1.4rem;max-width:62ch}

/* =========================== HEADER =========================== */
.masthead{background:var(--surface);border-bottom:1px solid var(--border)}
.masthead .wrap{padding-top:1.4rem;padding-bottom:1.4rem}
.brand{display:flex;align-items:center;gap:.7rem;font-weight:700;font-size:1.05rem}
.beacon-mark{width:26px;height:26px;flex:0 0 auto;border-radius:0;
  background:radial-gradient(circle at 50% 42%,#fff 0 14%,var(--beacon) 20% 46%,transparent 52%),
             conic-gradient(from 200deg,var(--beacon) 0 22deg,transparent 22deg 90deg,
             var(--beacon) 90deg 112deg,transparent 112deg);
  box-shadow:0 0 0 1px var(--beacon-line) inset}
.metagrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem;margin:1rem 0 0;
  font-size:.9rem;color:var(--ink-soft)}
.metagrid>div{min-width:0;overflow-wrap:anywhere}
.metagrid dt{color:var(--ink);font-weight:600;margin:0 0 .35rem}
.metagrid dd{margin:0;overflow-wrap:anywhere}
@media(max-width:1000px){.metagrid{grid-template-columns:repeat(2,minmax(min(20rem,100%),1fr))}}
@media(max-width:700px){.metagrid{grid-template-columns:minmax(0,1fr)}}
.engine-tag{font-family:var(--mono);font-size:.78rem;color:var(--ink-muted)}

/* jump nav */
.jump{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 88%,transparent);
  backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.jump ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.35rem;margin:0 auto;padding:.4rem 20px;
  list-style:none;max-width:var(--maxw)}
.jump a{white-space:nowrap;text-decoration:none;color:var(--ink-soft);font-size:.86rem;
  font-weight:600;padding:.5rem .7rem;border-radius:0;min-height:44px;display:flex;
  align-items:center;height:100%}
.jump a:hover{background:var(--surface-2);color:var(--ink)}

/* =========================== 01 DECISION / HERO =========================== */
.hero{padding:2.4rem 0 2rem;position:relative}
.hero .wrap{position:relative;z-index:1}
.verdict{display:block}
.overall{display:grid;gap:1rem;min-width:0}
.metric-pair{display:grid;grid-template-columns:repeat(2,minmax(9rem,1fr));gap:.75rem;max-width:40rem}
.metric{min-width:0;padding:1rem;border:1px solid var(--border);border-radius:0;background:var(--surface)}
.metric-label{display:block;font-size:.82rem;font-weight:700;color:var(--ink-soft)}
.metric-value{display:flex;align-items:baseline;gap:.25rem;margin:.35rem 0 0;font-variant-numeric:tabular-nums}
.metric-value b{font-size:2.25rem;line-height:1;font-weight:800;color:var(--ink)}
.metric-value span{font-size:.78rem;color:var(--ink-muted)}
.metric-value.s-crit b{color:var(--crit)}
.metric-value.s-warn b{color:var(--warn)}
.metric-value.s-pass b{color:var(--pass)}
.metric-note{margin:.45rem 0 0;font-size:.78rem;line-height:1.35;color:var(--ink-muted)}
.coverage-track{height:.45rem;margin-top:.55rem;border-radius:0;background:var(--surface-2);overflow:hidden}
.coverage-track span{display:block;height:100%;background:var(--accent)}
.scope-summary{margin-top:.65rem;padding-top:.55rem;border-top:1px solid var(--border);font-size:.78rem;line-height:1.45;color:var(--ink-muted)}
.scope-summary p{margin:.15rem 0}
.scope-summary b{color:var(--ink-soft)}
.verdict-detail{min-width:0}
@media(max-width:430px){.metric-pair{grid-template-columns:minmax(0,1fr)}}
.band{display:inline-flex;align-items:center;gap:.4rem;padding:.28rem .7rem;border-radius:0;
  font-size:.84rem;font-weight:700;border:1px solid transparent}
.coverage{margin-top:.55rem;font-size:.92rem;color:var(--ink-soft)}
.coverage b{color:var(--ink);font-variant-numeric:tabular-nums}
.honesty{margin-top:.9rem;padding:.85rem 1rem;border-left:4px solid var(--beacon);
  background:var(--beacon-soft);border-radius:0;font-size:.92rem;color:var(--ink)}

/* fix these next */
.fixnext{margin-top:2rem;border-top:1px solid var(--border);padding-top:1.3rem}
.fixnext > h2{margin:0;font-size:1.12rem;display:flex;align-items:center;gap:.5rem}
.fixnext .clear-line{margin:.5rem 0 1.1rem;font-size:.95rem;color:var(--ink-soft)}
.fixnext .clear-line b{color:var(--crit);font-variant-numeric:tabular-nums}
.fixlist{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(min(23rem,100%),1fr))}
.fixcard{position:relative;background:var(--bg);border:1px solid var(--border);
  border-radius:0;padding:1rem 1rem 1.05rem;display:flex;flex-direction:column;gap:.5rem}
.fixcard .rank{position:absolute;top:-12px;left:14px;width:26px;height:26px;border-radius:0;
  background:var(--beacon);color:#fff;font-weight:800;font-size:.85rem;display:flex;
  align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
@media (prefers-color-scheme:dark){.fixcard .rank{color:#1a1206}}
.fixcard h3{margin:.35rem 0 0;font-size:1rem;line-height:1.35;font-weight:700}
.fixcard .who{font-size:.86rem;color:var(--ink-soft)}
.fixcard .foot{margin-top:auto;display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;
  font-size:.76rem}

/* chips / badges */
.chip{display:inline-flex;align-items:center;gap:.35rem;padding:.2rem .55rem;border-radius:0;
  font-size:.75rem;font-weight:600;line-height:1.4;border:1px solid transparent}
.chip.crit{background:var(--crit-bg);color:var(--crit);border-color:var(--crit-line)}
.chip.warn{background:var(--warn-bg);color:var(--warn);border-color:var(--warn-line)}
.chip.pass{background:var(--pass-bg);color:var(--pass);border-color:var(--pass-line)}
.chip.review{background:var(--review-bg);color:var(--review);border-color:var(--review-line)}
.chip.wcag{background:var(--surface-2);color:var(--ink-soft);border-color:var(--border);
  font-family:var(--mono);font-size:.72rem}

/* =========================== 02 EVIDENCE / CATEGORIES =========================== */
section{padding:2.2rem 0}
.section-alt{background:var(--surface);border-top:1px solid var(--border);
  border-bottom:1px solid var(--border)}
.catgrid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(23rem,100%),1fr))}
.catcard{display:flex;flex-direction:column;gap:.6rem;background:var(--bg);
  border:1px solid var(--border);border-radius:0;padding:1rem 1.05rem;
  text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}
.catcard:hover{border-color:var(--border-strong);transform:translateY(-2px)}
.catcard.nmc{background:var(--surface);opacity:.9}
.cat-top{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem}
.cat-name{font-weight:700;font-size:1.02rem;line-height:1.3}
.score-badge{flex:0 0 auto;text-align:center;min-width:52px}
.score-badge b{font-size:1.7rem;font-weight:800;font-variant-numeric:tabular-nums;
  line-height:1;letter-spacing:0}
.score-badge b.s-crit{color:var(--crit)}
.score-badge b.s-warn{color:var(--warn)}
.score-badge b.s-pass{color:var(--pass)}
.score-badge small{display:block;font-size:.68rem;color:var(--ink-muted)}
.state-badge{flex:0 0 auto;font-size:.74rem;font-weight:700;text-align:right;max-width:120px}
/* A+ thin-evidence qualifier: same line as the score, same dark/bold weight as the
   score itself — never colour-alone (user ruling 2026-08-08). */
.score-bound{flex:0 0 auto;display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap;
  justify-content:flex-end}
.score-qual{font-size:.78rem;font-weight:700;color:var(--thin);background:var(--bg);
  border:1px solid currentColor;border-radius:0;padding:.1rem .55rem;white-space:nowrap}

/* evidence-density meter — THE signature */
.evi{margin-top:.1rem}
.evi-track{height:8px;border-radius:0;background:var(--surface-2);overflow:hidden;
  border:1px solid var(--border)}
.evi-fill{height:100%;background:linear-gradient(90deg,var(--beacon),var(--beacon-line))}
.evi-label{margin-top:.4rem;font-size:.8rem;color:var(--ink-soft);
  display:flex;justify-content:space-between;gap:.5rem;flex-wrap:wrap}
.evi-label .tier{font-weight:700}
.evi-label .tier.high{color:var(--pass)}
.evi-label .tier.mod{color:var(--ink)}
.evi-label .tier.low{color:var(--thin)}
.evi-label .tier.nmc{color:var(--review)}
.cat-cause{font-size:.87rem;color:var(--ink-soft);margin:0}
.cat-cause b{color:var(--ink)}
.tension{font-size:.83rem;background:var(--crit-bg);border:1px solid var(--crit-line);
  color:var(--ink);border-radius:0;padding:.5rem .6rem;margin:0}
.tension b{color:var(--crit)}

/* =========================== 03 FINDINGS =========================== */
.filters{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1.5rem}
.filters .flabel{font-size:.85rem;color:var(--ink-soft);align-self:center;margin-right:.2rem}
.fbtn{font:inherit;font-size:.83rem;font-weight:600;cursor:pointer;padding:.4rem .75rem;
  border-radius:0;border:1px solid var(--border);background:var(--bg);color:var(--ink-soft);
  min-height:44px}
.fbtn[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.fbtn:hover{border-color:var(--border-strong)}
.fgroup{border-top:1px solid var(--border);margin-bottom:1.5rem;
  background:var(--bg)}
.review-steps,.review-controls{display:flex;flex-wrap:wrap;gap:1rem;margin:1rem 0}
.review-controls button{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--border);border-radius:0;min-height:44px;padding:.5rem 1rem}
.review-category{border-top:2px solid var(--ink);padding:1.5rem 0}
.category-heading h3{font-size:1.3rem;margin:0}
.category-status{display:block;margin:.4rem 0;color:var(--ink-soft)}
.category-content{padding-top:1rem}
.finding-evidence{margin-top:1rem;border-top:1px solid var(--border);padding-top:.5rem}
.finding-evidence>summary{cursor:pointer;min-height:44px;padding:.5rem 0}
.fg-title{margin:0}
.fg-head{padding:1rem 0 .25rem;display:flex;flex-wrap:wrap;gap:.6rem 1rem;
  align-items:baseline}
.fg-head .fg-title{font-size:1.08rem;font-weight:700;flex:1 1 260px;line-height:1.3}
.fg-count{font-variant-numeric:tabular-nums;font-weight:800;font-size:1.05rem}
.fg-body{padding:.5rem 0 1rem}
.who-line{margin:0 0 .85rem;font-size:.93rem;color:var(--ink)}
.who-line .who-badge{font-weight:700;color:var(--beacon)}
.meta-row{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 .9rem}
.diff{font-family:var(--mono);font-size:.82rem;line-height:1.55;border-radius:0;
  border:1px solid var(--border);overflow:hidden;margin:.2rem 0 1rem}
/* pre-wrap + a hanging indent so a wrapped line's continuation aligns under
   the code, not under the +/- tag glyph; overflow-wrap covers unbroken tokens
   (long URLs/class chains) so nothing forces the box wider than its container. */
.diff pre{margin:0;padding:.7rem .9rem .7rem 2.3rem;text-indent:-1.4rem;
  white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.diff .before{background:var(--crit-bg);color:var(--ink)}
.diff .tag{display:inline-block;font-weight:700;margin-right:.5rem;user-select:none;color:var(--crit)}
.loclist{font-family:var(--mono);font-size:.8rem;color:var(--ink-soft);
  background:var(--surface);border:1px solid var(--border);border-radius:0;padding:.55rem .7rem;
  margin:0 0 .6rem;max-height:8.5rem;overflow-y:auto}
.loclist span{display:inline-block;margin:.1rem .5rem .1rem 0;overflow-wrap:anywhere}
.standard-line{font-size:.92rem;margin:.6rem 0 0;color:var(--ink-soft)}
.standard-line strong{color:var(--beacon)}
.fix-line{font-size:.92rem;margin:.6rem 0 0}
.fix-line strong{color:var(--ink)}

/* =========================== 04 CLIENT / EXEC SUMMARY =========================== */
.exec{border:1px solid var(--border-strong);border-radius:0;
  background:var(--bg);box-shadow:var(--shadow)}
.exec-head{padding:1.1rem 1.3rem;background:var(--surface-2);border-bottom:1px solid var(--border)}
.exec-head h3{margin:0;font-size:1.35rem;min-width:0}
.exec-head p{margin:.3rem 0 0;color:var(--ink-soft);font-size:.9rem}
.exec-body{padding:1.3rem}
.exec-body h3{font-size:1.02rem;margin:1.3rem 0 .5rem}
.exec-body h3:first-child{margin-top:0}
.exec-lead{font-size:1.05rem;line-height:1.6}
.exec-lead b{color:var(--crit)}
.prio{counter-reset:p;list-style:none;padding:0;margin:.4rem 0}
.prio li{position:relative;padding:.55rem 0 .55rem 2.2rem;border-bottom:1px dashed var(--border)}
.prio li::before{counter-increment:p;content:counter(p);position:absolute;left:0;top:.5rem;
  width:1.6rem;height:1.6rem;border-radius:0;background:var(--beacon-soft);color:var(--beacon);
  font-weight:800;display:flex;align-items:center;justify-content:center;font-size:.85rem}
.expose{display:flex;flex-wrap:wrap;gap:.4rem;margin:.3rem 0 .2rem}
.exec-note{margin-top:1.2rem;padding:.85rem 1rem;background:var(--beacon-soft);
  border-left:4px solid var(--beacon);border-radius:0;font-size:.9rem}

/* =========================== FOOTER =========================== */
footer{border-top:1px solid var(--border);background:var(--surface);margin-top:1rem}
footer .wrap{padding:1.5rem 20px 2.6rem;font-size:.88rem;color:var(--ink-soft)}
footer p{margin:.2rem 0}
footer a{font-weight:600}
.foot-engine{font-family:var(--mono);font-size:.76rem;color:var(--ink-muted);margin-top:.7rem}

/* =========================== ported from v3.1: methodology / legal / axe / AEO / life-safety / delta =========================== */
.methodology-panel{font-size:.92rem;line-height:1.7}
.methodology-panel h3{margin-top:1.8rem;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:.3rem}
.methodology-panel .meta-note{color:var(--text-muted);font-size:.85rem;background:var(--surface);padding:.5rem .8rem;border-radius:0;margin:.5rem 0 1rem}
.methodology-panel .section-intro{color:var(--text-muted);font-size:.88rem;margin:.3rem 0 .6rem}
.methodology-panel ul,.methodology-panel ol{margin:.4rem 0 .8rem 1.4rem}
.methodology-panel li{margin:.35rem 0}
.capability-list li::marker{color:var(--pass)}
.limitation-list li::marker{color:var(--warn)}
.workflow-list li::marker{color:var(--accent);font-weight:700}
.usage-list li::marker{color:var(--text-muted)}
.methods-details{background:var(--surface);border-radius:0;padding:.6rem .9rem;margin:.5rem 0 1rem;border-left:3px solid var(--accent)}
.methods-details summary{cursor:pointer;color:var(--text-muted);font-size:.9rem}
.methods-list{margin-top:.5rem;font-size:.85rem;color:var(--text-muted)}
.live-audit-note{background:var(--warn-bg);border:1px solid var(--warn);border-left:6px solid var(--warn);border-radius:0;padding:.8rem 1rem;margin:.8rem 0 1rem;color:var(--text)}
.manual-checks{margin:1.2rem 0}
.manual-check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(23rem,100%),1fr));gap:.8rem;margin-top:.8rem}
.manual-check-card{background:var(--surface);border:1px solid var(--border);border-radius:0;padding:.9rem}
.manual-check-card h4{margin:.2rem 0 .45rem;font-size:.98rem}
.manual-check-card p{margin:.35rem 0;font-size:.86rem}
.manual-check-meta{color:var(--text-soft);font-size:.74rem;text-transform:uppercase;letter-spacing:0}
.reader-task-evidence{margin:1.2rem 0 1.6rem;padding:1rem 1.1rem;background:var(--surface);border:1px solid var(--border);border-left:6px solid var(--accent);border-radius:0;line-height:1.65}
.reader-task-evidence h3{margin:.1rem 0 .7rem;color:var(--accent)}
.reader-task-evidence h4{margin:1rem 0 .45rem;color:var(--text)}
.reader-status{display:flex;flex-wrap:wrap;gap:.35rem .9rem;align-items:baseline;padding:.7rem .85rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0}
.reader-status strong{color:var(--text)}
.reader-status span{color:var(--text-muted)}
.reader-status-missing{border-left:4px solid var(--warn)}
.reader-intent-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(20rem,100%),1fr));gap:.7rem;margin:.9rem 0}
.reader-intent-grid>div{min-width:0;padding:.65rem .8rem;border:1px solid var(--border);border-radius:0;background:var(--bg)}
.reader-label{display:block;color:var(--text-muted);font-size:.78rem;font-weight:700}
.reader-value{display:block;overflow-wrap:anywhere}
.reader-task-row{padding:.75rem 0;border-top:1px solid var(--border)}
.reader-task-row:first-of-type{border-top:0}
.reader-task-heading{display:flex;flex-wrap:wrap;gap:.4rem .8rem;align-items:baseline}
.reader-task-heading strong{overflow-wrap:anywhere}
.reader-outcome,.reader-at-status{display:inline-block;padding:.08rem .45rem;border:1px solid var(--border);border-radius:0;color:var(--text-muted);font-size:.78rem}
.reader-task-row p{margin:.35rem 0}
.reader-task-row ul{margin:.25rem 0 .55rem 1.25rem}
.reader-surface-summary{margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--border)}
.reader-snapshot{margin-top:.7rem}
.reader-snapshot summary{cursor:pointer;color:var(--accent);font-weight:600}
.reader-snapshot pre{margin:.6rem 0 0;padding:.8rem;background:var(--bg);border:1px solid var(--border);white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--mono);font-size:.78rem;line-height:1.5}
.reader-at{margin-top:.7rem;padding-top:.7rem;border-top:1px solid var(--border)}
.reader-at ul{list-style:none;margin:.3rem 0 0;padding:0}
.reader-at li{display:flex;flex-wrap:wrap;gap:.35rem .9rem;align-items:baseline;padding:.45rem 0;border-top:1px solid var(--border-soft)}
.axe-evidence{margin:1.2rem 0}
.axe-outcome-list{background:var(--surface);border:1px solid var(--border);border-radius:0;padding:.65rem .85rem;margin:.6rem 0}
.axe-outcome-list summary{cursor:pointer;font-weight:700;color:var(--text)}
.axe-outcome-list ul{margin-top:.6rem}
.axe-outcome-list li{display:flex;flex-wrap:wrap;gap:.3rem .8rem;align-items:baseline;padding:.45rem 0;border-top:1px solid var(--border-soft)}
.rule-id,.rule-criteria{color:var(--text-muted);font-size:.78rem;overflow-wrap:anywhere}
.learn-more a,.axe-outcome-list a{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
.traps-table,.summary-table{width:100%;border-collapse:collapse;margin:.8rem 0;font-size:.9rem}
.traps-table th,.summary-table th{text-align:left;padding:.6rem .8rem;background:var(--surface-2);color:var(--accent);font-weight:600;border-bottom:1px solid var(--border)}
.traps-table td,.summary-table td{padding:.6rem .8rem;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:anywhere}
.traps-table td:first-child{color:var(--text-muted);font-style:italic;width:38%}
.summary-table .num{text-align:right;font-variant-numeric:tabular-nums}
.legal-risk-panel{font-size:.92rem}
.legal-context-note{background:var(--info-bg);border:1px solid var(--info-border);border-left:6px solid var(--info-border);border-radius:0;padding:.9rem 1rem;margin:.8rem 0 1rem}
.risk-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(23rem,100%),1fr));gap:1rem;margin:1rem 0}
.risk-card{background:var(--surface);padding:1rem;border-radius:0;border-left:4px solid var(--accent)}
.risk-header{display:flex;justify-content:space-between;align-items:center}
.context-badge{color:var(--accent);background:var(--accent-bg);padding:2px 8px;border-radius:0;font-size:.75rem;font-weight:700}
.deadline{color:var(--warn);font-weight:600}
.criteria-map{color:var(--text-muted);font-size:.86rem}
.aeo-disclaimer{background:var(--accent-bg);border:1px solid var(--accent);border-left:6px solid var(--accent);border-radius:0;padding:.9rem 1.1rem;margin:1rem 0 0;font-size:.88rem;line-height:1.65}
.aeo-disclaimer-title{font-size:.98rem;font-weight:700;color:var(--accent);margin-bottom:.4rem}
.aeo-disclaimer p{margin-bottom:.45rem}
.aeo-disclaimer p:last-child{margin-bottom:0}
.aeo-disclaimer-cta{color:var(--text-muted);font-size:.84rem;border-top:1px dashed var(--border);padding-top:.45rem;margin-top:.45rem}
.aeo-disclaimer strong{color:var(--text)}
.life-safety-banner{background:var(--surface-2);border:2px solid var(--fail);border-left:8px solid var(--fail);border-radius:0;padding:1.1rem 1.3rem;margin:.9rem 0;font-size:.95rem;line-height:1.7}
.life-safety-banner .banner-title{font-size:1.1rem;font-weight:700;color:var(--fail)}
.delta{font-size:.75rem;margin-left:4px}
.delta.positive{color:var(--pass)}
.delta.negative{color:var(--fail)}
.delta.neutral{color:var(--text-muted)}
.empty{color:var(--text-muted);font-style:italic}

/* =========================== MOTION / PRINT =========================== */
.supplement{max-width:1160px;margin:1rem auto;padding:0 20px}
.supplement>summary,.score-details>summary{min-height:44px;padding:.8rem 0;cursor:pointer;font-weight:700}
.score-details{margin:1rem 0}
main [id]{scroll-margin-top:var(--nav-offset,5rem)}
.score-details[open]>.verdict{padding-top:1rem}
.jurisdiction-entry{margin:1rem 0}
[hidden]{display:none!important}
#jurisdiction-choice{display:block;max-width:100%;min-height:44px;margin:.5rem 0 1rem;font:inherit;color:var(--ink);background:var(--bg);border:2px solid var(--ink-muted);border-radius:0;padding:.5rem}
.jump li:nth-child(1){--step-bg:var(--step-one);--step-active:var(--step-one-active)}
.jump li:nth-child(2){--step-bg:var(--step-two);--step-active:var(--step-two-active)}
.jump li:nth-child(3){--step-bg:var(--step-three);--step-active:var(--step-three-active)}
.jump a{border:2px solid var(--ink-muted);border-bottom-width:4px;border-radius:0;background:var(--step-bg);color:var(--ink);font-weight:700;text-decoration:underline;text-underline-offset:.25em}
.jump a[aria-current]{background:var(--step-active);border-bottom-color:var(--ink);text-decoration-thickness:3px}
.review-controls button,.report-toolbar button,.tb-group{border-color:var(--ink-muted)}
.review-controls button{border-width:2px}
main summary{border-bottom:2px solid var(--ink-muted)}
summary{cursor:pointer;text-decoration:underline;text-underline-offset:.25em;text-decoration-thickness:1px;overflow-wrap:anywhere}
summary:hover,summary:focus-visible,a:hover,a:focus-visible,button:hover,button:focus-visible{background:var(--interaction-bg);text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:.25em}
.jump a:hover,.jump a:focus-visible{background:var(--step-active)}
.disclosure-open{display:none}
details[open] > summary > .disclosure-open{display:inline}
details[open] > summary > .disclosure-closed{display:none}
[data-report-step]{padding-top:2rem;padding-bottom:2rem}
#layer-decision{--section-bg:var(--step-one);--section-accent:var(--step-one-active)}
#layer-findings{--section-bg:var(--step-two);--section-accent:var(--step-two-active)}
#retest{--section-bg:var(--step-three);--section-accent:var(--step-three-active)}
[data-report-step]>.wrap>.eyebrow,[data-report-step]>.eyebrow{margin-top:0;padding:.6rem .8rem;background:var(--section-bg);border-left:6px solid var(--section-accent);color:var(--ink)}
[data-report-step]>.wrap>.eyebrow .num,[data-report-step]>.eyebrow .num{color:var(--ink)}
[data-report-step] .eyebrow{scroll-margin-top:var(--nav-offset,5rem)}
main a{text-decoration:underline;text-underline-offset:.2em}
.legal-background>summary{cursor:pointer;min-height:44px;padding:.5rem 0}
@media(max-width:430px){.supplement{padding:0 8px}.supplement .wrap{padding:0}.jurisdiction-entry .risk-card{padding:12px}}
@media(max-width:430px){
  .wrap{padding:0 8px}
  .jump{position:static}
  .jump ul{grid-template-columns:minmax(0,1fr);padding:.4rem 8px}
  .jump a{white-space:normal;padding:.5rem .25rem}
  .exec-head,.exec-body,.risk-card,.manual-check-card,.aeo-disclaimer{padding:12px}
  .methodology-panel ul,.methodology-panel ol{margin-left:0;padding-left:0}
  .methods-details{padding:8px 0;border-left:0}
  .exec-note{padding:8px 0;border-left:0}
  main ul,main ol{padding-left:0;list-style-position:inside}
  .fixcard,.catcard,.honesty,.metric,.exec,.exec-head,.exec-body,.risk-card,.manual-check-card,.reader-task-evidence,.aeo-disclaimer,.life-safety-banner{padding-left:0;padding-right:0;border-left:0;border-right:0}
  .fixcard .rank{position:static}
  .fg-head .fg-title{flex-basis:100%}
  .diff pre{padding-left:1.4rem;padding-right:0}
  .reader-status,.reader-intent-grid>div,.reader-notes,.reader-step,.axe-outcome-list{padding-left:0;padding-right:0;border-left:0;border-right:0}
  .loclist{padding-left:0;padding-right:0;border-left:0;border-right:0}
  .prio li{padding-left:0;padding-top:2.2rem}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;
    scroll-behavior:auto!important}
}
@media print{
  :root{--bg:#fff!important;--ink:#000!important;--surface:#fff!important;--surface-2:#fff!important}
  body{font-size:12pt;color:#000}
  .jump,.masthead .engine-tag,.filters,.beacon-mark,.report-toolbar{display:none!important}
  .honesty,.fixnext{box-shadow:none}
  .lang-zh,.lang-en{color:#333}
  a{color:#000;text-decoration:underline}
  section{padding:.6rem 0;break-inside:avoid}
  .exec{break-before:page;border:1px solid #000;box-shadow:none}
  .fgroup,.catcard,.fixcard{break-inside:avoid;box-shadow:none}
  .loclist{overflow:visible;max-height:none}
}
`;

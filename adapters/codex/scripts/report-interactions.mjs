// Inlined into the standalone HTML report; no runtime network dependency.
export const REPORT_INTERACTIONS = `
/* Batch controls affect only evidence; issue summaries always remain visible. */
(function(){
  var evidence = document.querySelectorAll('.finding-evidence');
  document.querySelectorAll('[data-review-open]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var open = btn.dataset.reviewOpen === 'true';
      evidence.forEach(function(detail){
        if (!open && detail.contains(document.activeElement)) btn.focus();
        detail.open = open;
      });
    });
  });
  evidence.forEach(function(detail){
    detail.addEventListener('toggle', function(){
      if (!detail.open && detail.contains(document.activeElement)) detail.querySelector('summary').focus();
    });
  });
  function reveal(hash){
    var target = document.getElementById(hash.slice(1));
    if (!target) return;
    var fold = target.querySelector('details.layer-fold');
    if (fold) fold.open = true;
    for (var parent = target.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    var anchor = target.hasAttribute('data-report-step') ? target.querySelector('.eyebrow') : target;
    (anchor || target).scrollIntoView();
  }
  document.querySelectorAll('a[href^="#"]').forEach(function(link){
    link.addEventListener('click', function(event){
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      var hash = link.getAttribute('href');
      var target = document.getElementById(hash.slice(1));
      if (target && target.hasAttribute('data-report-step')) {
        event.preventDefault();
        if (location.hash !== hash) history.pushState(null, '', hash);
      }
      reveal(hash);
      if (target && target.hasAttribute('data-report-step')) {
        var heading = target.querySelector('.layer-h');
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
      }
    });
  });
  window.addEventListener('hashchange', function(){ reveal(location.hash); });
  var chooser = document.getElementById('jurisdiction-choice');
  if (chooser) chooser.addEventListener('change', function(){
    document.querySelectorAll('[data-jurisdiction]').forEach(function(entry){
      entry.hidden = chooser.value !== 'all' && entry.dataset.jurisdiction !== chooser.value;
    });
  });
  var navLinks = Array.from(document.querySelectorAll('.jump a'));
  var nav = document.querySelector('.jump');
  function updateNavOffset(){
    var offset = getComputedStyle(nav).position === 'sticky' ? nav.getBoundingClientRect().height + 24 : 24;
    document.documentElement.style.setProperty('--nav-offset', offset + 'px');
  }
  new ResizeObserver(updateNavOffset).observe(nav);
  updateNavOffset();
  if (location.hash) reveal(location.hash);
  var scheduled = false;
  function updateCurrent(){
    var current = navLinks[0];
    navLinks.forEach(function(link){
      var section = document.getElementById(link.hash.slice(1));
      var threshold = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-offset')) + 1;
      if (section && section.getBoundingClientRect().top <= threshold) current = link;
    });
    navLinks.forEach(function(link){
      if (link === current) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    scheduled = false;
  }
  window.addEventListener('scroll', function(){
    if (!scheduled) { scheduled = true; requestAnimationFrame(updateCurrent); }
  }, { passive: true });
  updateCurrent();
  var printState;
  window.addEventListener('beforeprint', function(){
    if (printState) return;
    printState = Array.from(document.querySelectorAll('main details')).map(function(detail){
      var state = [detail, detail.open];
      detail.open = true;
      return state;
    });
  });
  window.addEventListener('afterprint', function(){
    (printState || []).forEach(function(state){ state[0].open = state[1]; });
    printState = null;
  });
})();

/* Language + theme toggles:
   - default language zh; switch to en, localStorage-persisted
   - theme default auto (prefers-color-scheme) until a manual light/dark override
   - native <button> = keyboard-operable, >=44px targets, visible focus (global :focus-visible). */
(function () {
  var STORE_LANG = 'beacon-report-lang';
  var STORE_THEME = 'beacon-report-theme';
  var root = document.documentElement;
  var body = document.body;

  function setLang(lang) {
    body.dataset.activeLang = lang;
    document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.langBtn === lang ? 'true' : 'false');
    });
    try { localStorage.setItem(STORE_LANG, lang); } catch (e) {}
  }

  function setTheme(theme) {
    if (theme === 'auto') { root.removeAttribute('data-theme'); }
    else { root.setAttribute('data-theme', theme); }
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.themeBtn === theme ? 'true' : 'false');
    });
    try { localStorage.setItem(STORE_THEME, theme); } catch (e) {}
  }

  var savedLang = 'zh';
  var savedTheme = 'auto';
  try {
    savedLang = localStorage.getItem(STORE_LANG) || 'zh';
    savedTheme = localStorage.getItem(STORE_THEME) || 'auto';
  } catch (e) {}
  setLang(savedLang);
  setTheme(savedTheme);

  document.querySelectorAll('[data-lang-btn]').forEach(function (b) {
    b.addEventListener('click', function () { setLang(b.dataset.langBtn); });
  });
  document.querySelectorAll('[data-theme-btn]').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.dataset.themeBtn); });
  });
})();
`;

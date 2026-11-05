// Ep128web: the page's frame: the menu bar, the tabs of the panel, the panel
// under or next to the screen, the recording indicator and the help. The
// controls themselves (and their ids) are the ones ep128.js works with; menu
// items with data-act="<id>" click that control, so it can be in two places.
(function () {
  const $ = (id) => document.getElementById(id);
  const T = (s) => (window.I18N ? window.I18N.T(s) : s);
  const store = (k, v) => { try { localStorage.setItem('ep128web.' + k, v); } catch (e) { } };
  const load = (k) => { try { return localStorage.getItem('ep128web.' + k); } catch (e) { return null; } };
  const bar = $('bar');

  // --- menus: a click opens one, moving over the others while one is open
  // opens them (as in desktop programs), Esc or a click outside closes ---
  let open = null;
  const wide = () => window.matchMedia('(min-width: 761px)').matches;
  function closeMenus() {
    if (open) open.classList.remove('open');
    open = null;
  }
  for (const m of document.querySelectorAll('.menu')) {
    const b = m.querySelector('.menu-btn');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const was = open === m;
      closeMenus();
      if (!was) { m.classList.add('open'); open = m; }
    });
    b.addEventListener('mouseenter', () => {
      if (open && open !== m && wide()) { closeMenus(); m.classList.add('open'); open = m; }
    });
    // a click on an item closes the menu, except on the selects and the
    // check boxes (they are set in place)
    m.querySelector('.drop').addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target.closest('select, .sel, .check')) return;
      if (e.target.closest('button, a, .file')) {
        closeMenus();
        if (!wide()) setMobileMenu(false);
      }
    });
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.menu')) closeMenus(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });

  // phones: the menus are under the ☰ button
  function setMobileMenu(on) {
    bar.classList.toggle('open', on);
    $('menu-toggle').setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  $('menu-toggle').addEventListener('click', (e) => { e.stopPropagation(); setMobileMenu(!bar.classList.contains('open')); });

  // menu items that work a control somewhere else on the page
  for (const it of document.querySelectorAll('[data-act]')) {
    it.addEventListener('click', () => {
      const act = it.dataset.act;
      if (act.startsWith('tab:')) {
        showTab(act.slice(4));
        $('panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (act === 'help') {
        $('help').showModal();
      } else {
        const el = $(act);
        if (el) el.click();
      }
    });
  }

  // --- the tabs of the panel; a tab whose groups are all hidden (e.g. the
  // TVC expansion ports on the Enterprise) is hidden too ---
  const tabs = [...document.querySelectorAll('#panel .tabs button')];
  // sets 'hidden' only when it changes (setting it again is a mutation too,
  // which would wake the observer below again)
  const setHidden = (el, h) => { if (el.hidden !== h) el.hidden = h; };
  let cur = load('tab') || 'disk';
  function showTab(id) {
    const btn = tabs.find((b) => b.dataset.tab === id);
    if (!btn || btn.hidden) return;
    cur = id;
    for (const b of tabs) b.classList.toggle('act', b === btn);
    for (const t of document.querySelectorAll('#panel .tab')) t.classList.toggle('act', t.id === 'tab-' + id);
    store('tab', id);
  }
  for (const b of tabs) b.addEventListener('click', () => showTab(b.dataset.tab));
  function updateTabs() {
    for (const b of tabs) {
      const t = $('tab-' + b.dataset.tab);
      setHidden(b, ![...t.children].some((c) => !c.hidden));
    }
    const btn = tabs.find((b) => b.dataset.tab === cur);
    if (!btn || btn.hidden) {
      const first = tabs.find((b) => !b.hidden);
      if (first) { const keep = cur; showTab(first.dataset.tab); cur = keep; store('tab', keep); }
    } else {
      showTab(cur);
    }
    // menu items for the TVC only (the catalog is shown on the TVC only)
    const tvc = !$('catalog').hidden;
    for (const it of document.querySelectorAll('.drop [data-tvc]')) setHidden(it, !tvc);
    for (const it of document.querySelectorAll('.drop [data-needs]')) setHidden(it, $(it.dataset.needs).hidden);
  }
  new MutationObserver(updateTabs).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  updateTabs();

  // --- the menu bar starts where the emulator's screen does (wide windows) ---
  function alignBar() {
    // the rows under the screen (buttons, status, quick saves) are as wide as the screen
    $('left').style.setProperty('--screen-w', $('screen-wrap').getBoundingClientRect().width + 'px');
    if (!wide()) { bar.style.paddingLeft = ''; return; }
    const x = Math.round($('screen-wrap').getBoundingClientRect().left);
    bar.style.paddingLeft = Math.max(12, x) + 'px';
  }
  new ResizeObserver(alignBar).observe($('screen-wrap'));
  window.addEventListener('resize', alignBar);

  // --- the panel under the screen (default) or next to it ---
  function setLayout(l) {
    document.body.classList.toggle('side', l === 'side');
    for (const it of document.querySelectorAll('[data-layout]')) it.classList.toggle('chosen', it.dataset.layout === l);
    store('layout', l);
    if (typeof alignBar === 'function') requestAnimationFrame(alignBar);
  }
  for (const it of document.querySelectorAll('[data-layout]')) it.addEventListener('click', () => setLayout(it.dataset.layout));
  setLayout(load('layout') === 'side' ? 'side' : 'below');
  alignBar();

  // --- the picture in full screen: keeping its proportions or filling the screen ---
  function setFsFit(f) {
    document.body.classList.toggle('fs-fill', f === 'fill');
    for (const it of document.querySelectorAll('[data-fsfit]')) it.classList.toggle('chosen', it.dataset.fsfit === f);
    store('fsFit', f);
  }
  for (const it of document.querySelectorAll('[data-fsfit]')) it.addEventListener('click', () => setFsFit(it.dataset.fsfit));
  setFsFit(load('fsFit') === 'fill' ? 'fill' : 'keep');

  // --- recording indicator in the bar: the running video / sound / demo
  // recording with its time; a click stops it ---
  const recBtns = ['btn-video', 'btn-audio', 'btn-demo'].map($);
  function updateRec() {
    const r = recBtns.find((b) => b.textContent.trim().startsWith('■') || b.classList.contains('on'));
    const ind = $('rec-ind');
    if (ind.hidden !== !r) ind.hidden = !r;
    if (r) ind.textContent = r.classList.contains('on') ? '■ ' + r.textContent.replace(/^[●■]\s*/, '') : r.textContent;
    ind.onclick = r ? () => r.click() : null;
  }
  for (const b of recBtns) new MutationObserver(updateRec).observe(b, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  updateRec();

  // --- TVC: start the loaded programs even without the AutoRun flag (the
  // setting is stored; ep128.js reads ep128web.tvcAutorun) ---
  const ar = $('tvc-autorun');
  ar.checked = load('tvcAutorun') === '1';
  ar.addEventListener('change', () => store('tvcAutorun', ar.checked ? '1' : '0'));

  // the debugger's close button (the Debugger item turns it on and off)
  $('dbg-close').addEventListener('click', () => $('btn-debug').click());

  // --- the help window ---
  $('help-close').addEventListener('click', () => $('help').close());
  $('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').close(); });
})();

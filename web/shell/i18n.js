// Ep128web: languages of the page (Hungarian, English, German, Ukrainian).
// The texts are Hungarian in the page and in ep128.js; T() looks up their
// translation in i18n-strings.js ([hu, en, de, uk] rows), and apply()
// translates the static page (text nodes and the title, placeholder,
// aria-label, alt attributes). Blocks with mixed markup (the help) are
// translated as a whole: data-i18n-html="key", the row's key is "@key".
// Missing translations stay Hungarian.
(function () {
  const LANGS = [
    { id: 'hu', name: 'Magyar', flag: '🇭🇺' },
    { id: 'en', name: 'English', flag: '🇬🇧' },
    { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { id: 'uk', name: 'Українська', flag: '🇺🇦' }
  ];
  const COL = { hu: 0, en: 1, de: 2, uk: 3 };

  function pickLang() {
    try {
      const v = localStorage.getItem('ep128web.lang');
      if (v && COL[v] !== undefined) return v;
    } catch (e) { }
    for (const l of (navigator.languages || [navigator.language || ''])) {
      const id = String(l).slice(0, 2).toLowerCase();
      if (COL[id] !== undefined) return id;
    }
    return 'en';
  }
  const lang = pickLang();
  document.documentElement.lang = lang;

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const dict = new Map();
  if (lang !== 'hu') {
    for (const row of (window.EP_I18N_STRINGS || [])) {
      const t = row[COL[lang]];
      if (t !== undefined && t !== null) {
        dict.set(row[0], t);
        const n = norm(row[0]);
        if (!dict.has(n)) dict.set(n, t);
      }
    }
  }
  // rows with {0}, {1}… also match texts made from them (e.g. error
  // messages of the disk manager with a file name in them)
  const patterns = [];
  if (lang !== 'hu') {
    for (const [hu, t] of dict) {
      if (!/\{\d\}/.test(hu) || hu.startsWith('@')) continue;
      const order = [];
      const re = hu.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\d)\\?\}/g, (m, d) => { order.push(+d); return '([\\s\\S]*?)'; });
      patterns.push({ re: new RegExp('^' + re + '$'), order, t });
    }
  }
  const missing = new Set();

  // the translation of a Hungarian text (exact, or with its outer spaces
  // kept and the inner whitespace normalised)
  function T(s) {
    if (lang === 'hu' || typeof s !== 'string') return s;
    let t = dict.get(s);
    if (t !== undefined) return t;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    t = dict.get(norm(m[2]));
    if (t !== undefined) return m[1] + t + m[3];
    for (const p of patterns) {
      const r = p.re.exec(s);
      if (r) return p.t.replace(/\{(\d)\}/g, (all, d) => { const i = p.order.indexOf(+d); return i >= 0 ? r[i + 1] : all; });
    }
    if (/[A-Za-zÁ-ű]{2,}/.test(s)) missing.add(s);
    return s;
  }
  // T() with {0}, {1}… replaced by the arguments
  function F(s, ...args) {
    return T(s).replace(/\{(\d+)\}/g, (all, i) => (args[+i] !== undefined ? String(args[+i]) : all));
  }

  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  function apply(root) {
    if (lang === 'hu') return;
    root = root || document.documentElement;
    for (const el of root.querySelectorAll('[data-i18n-html]')) {
      const t = dict.get('@' + el.dataset.i18nHtml);
      if (t !== undefined) el.innerHTML = t;
    }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest('script, style, [data-i18n-html], [data-i18n-skip]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = w.nextNode())) nodes.push(n);
    for (const t of nodes) {
      const v = t.nodeValue;
      if (!/\S/.test(v)) continue;
      const tr = T(v);
      if (tr !== v) t.nodeValue = tr;
    }
    for (const el of root.querySelectorAll(ATTRS.map((a) => '[' + a + ']').join(','))) {
      if (el.closest('[data-i18n-skip]')) continue;
      for (const a of ATTRS) {
        const v = el.getAttribute(a);
        if (v) {
          const tr = T(v);
          if (tr !== v) el.setAttribute(a, tr);
        }
      }
    }
    document.title = T(document.title);
    const md = document.querySelector('meta[name=description]');
    if (md) md.content = T(md.content);
  }

  window.I18N = { lang, LANGS, T, F, apply, missing };
  apply(document.documentElement);
})();

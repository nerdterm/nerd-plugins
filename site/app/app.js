// The browser's part of nerdterm.dev: every page is complete as served; this adds the theme switch, the search, the
// recordings, the plans' hover and click, and draws again only what the query string changes (the list's filters, a
// review tab's release). Loads nothing but this site's own files and keeps two things in the browser: the theme and
// the plugins you opened last.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const R = NERD_RENDER(window.NERD_DATA, window.NERD_DOCS);
  const { esc, all, byName, authors, hay, listHref, docHref, pluginHref, DOCS, DOCNAV, PAGES, FOOT, ROOMS, LIVE, S, THEME_KEY, RECENT_KEY } = R;

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* no storage: the choice lasts until the page closes */ } },
  };
  const recentList = () => { try { return JSON.parse(store.get(RECENT_KEY) || '[]').filter((n) => byName(n)); } catch { return []; } };

  // the page's address: /plugins/<name>/<tab>/ is a plugin, /authors/<name>/ an author, the rest its own name
  function route() {
    let seg = location.pathname.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    if (seg[0] === 'plugins') seg = !seg[1] ? ['catalog'] : seg[1] === 'all' ? ['plugins'] : ['why', 'review', 'add'].includes(seg[1]) ? [seg[1]] : ['plugin', ...seg.slice(1)];
    else if (seg[0] === 'authors') seg = ['author', ...seg.slice(1)];
    return { seg, q: new URLSearchParams(location.search) };
  }
  function remember(rt) {
    if (rt.seg[0] !== 'plugin' || !byName(rt.seg[1])) return;
    store.set(RECENT_KEY, JSON.stringify([rt.seg[1], ...recentList().filter((n) => n !== rt.seg[1])].slice(0, 6)));
  }

  // ---------- recordings: a box render.js left for the player, mounted from its attributes
  function mount(el) {
    if (!window.AsciinemaPlayer) return;
    el.classList.add('snap4');
    // the page has its own Pause and Restart; with controls the player keeps 32px under the terminal for its own bar
    const o = { cols: +el.dataset.cols, rows: +el.dataset.rows, fit: 'width', theme: 'nerd', terminalFontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', loop: true, controls: false };
    if ('still' in el.dataset) Object.assign(o, { autoPlay: false, preload: true, poster: 'npt:0:11' });
    else o.autoPlay = true;
    const pl = AsciinemaPlayer.create(`/casts/${encodeURIComponent(el.dataset.cast)}.cast?v=${encodeURIComponent(el.dataset.fp)}`, el, o);
    S.players[el.id] = { pl, playing: o.autoPlay === true };
    pl.addEventListener('play', () => { S.players[el.id].playing = true; setToggle(el.id); });
    pl.addEventListener('pause', () => { S.players[el.id].playing = false; setToggle(el.id); });
  }
  function setToggle(id) { const b = $(`[data-pl="${id}"][data-act="toggle"]`); if (b) b.textContent = S.players[id].playing ? 'Pause' : 'Play'; }
  function disposePlayers() { Object.values(S.players).forEach((x) => { try { x.pl.dispose(); } catch { /* already gone */ } }); S.players = {}; }

  // ---------- the panel keeps its scroll across pages; the current row is scrolled into view only when it is out of sight
  function renderTree(rt) {
    const sc = [$('#tree'), $('#tree .body')], keep = sc.map((e) => e.scrollTop);
    $('#tree .body').innerHTML = R.treeHtml(rt);
    sc.forEach((e, i) => (e.scrollTop = keep[i]));
    const on = $('#tree .tr.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // ---------- status
  // the buttons are in the page; style.css lights the chosen one from data-pref before any script runs
  function renderTheme() {
    $$('#theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === root.dataset.pref)));
  }
  function applyTheme(pref) {
    root.dataset.pref = pref;
    root.dataset.theme = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  // ---------- what the page needs after it is drawn
  function styleBands() {
    $$('.gl i[data-k]').forEach((i) => {
      const k = +i.dataset.k;
      i.style.clipPath = `inset(${(k * 100) / R.GLITCH.length}% 0 ${100 - ((k + 1) * 100) / R.GLITCH.length}% 0)`;
      i.style.transform = `translateX(${i.dataset.o}%)`;
      i.removeAttribute('data-k');
    });
  }
  // boxes whose height follows their width (the logo, recordings, their stills) round up to the 4px module, so
  // everything under them stays on whole pixels
  // (it watches the box and what is inside it: a player settles its size after the box was first measured)
  const SNAP = '.h-logo, .still-box, .snap4';
  const snap = (t) => { t.style.height = ''; const h = t.getBoundingClientRect().height, s = Math.ceil(h / 4 - 1e-3) * 4; if (s - h > 0.01) t.style.height = s + 'px'; const c = t.firstElementChild; if (c && !c.dataset.snapped) { c.dataset.snapped = 1; snapRO.observe(c); } };
  const snapRO = new ResizeObserver((es) => es.forEach(({ target: t }) => snap(t.matches(SNAP) ? t : t.parentElement)));
  function hydrate() {
    $$('#main [data-cast]').forEach(mount);
    // a plan (the home page's, the catalog's) comes alive by its id: home.js and catalog-front.js register the hand
    for (const [id, f] of Object.entries(window.NERD_HYDRATE || {})) { const el = document.getElementById(id); if (el) f(el, R); }
    styleBands();
    $$(SNAP.split(', ').map((x) => '#main ' + x).join(', ')).forEach((e) => snapRO.observe(e));
  }
  function renderResults() {
    const rt = route();
    disposePlayers();
    $('#results').innerHTML = R.resultsHtml(rt);
    hydrate();
    renderTree(rt);
  }
  function start() {
    const rt = route(), s = rt.seg[0];
    remember(rt);
    // the list with filters, a sort or a view, and a review tab with a release: the query string, which no file can hold
    if (s === 'plugins' && LIVE.some((k) => rt.q.has(k))) { $('#main').innerHTML = R.listView(rt).html; renderTree(rt); }
    else if (s === 'plugin' && rt.seg[2] === 'review' && rt.q.has('r') && byName(rt.seg[1])) $('#main .info > .body').innerHTML = R.reviewBody(byName(rt.seg[1]), rt.q.get('r'));
    hydrate();
    // a page is a new document: the nav's scroll comes over from the last one, and the focus theme.js marked
    let was = {};
    try { was = JSON.parse(sessionStorage.getItem('nerd-site-panel') || '{}'); } catch { /* no storage: the page's own focus */ }
    if (Array.isArray(was.scroll)) { $('#tree').scrollTop = was.scroll[0]; $('#tree .body').scrollTop = was.scroll[1]; }
    const prim = root.dataset.panel === 'tree' ? $('#tree') : $('#main .frame.primary') || $('#main .frame');
    if (prim) prim.classList.add('focus');
    root.dataset.panel = 'set';
  }
  addEventListener('pagehide', () => {
    try { sessionStorage.setItem('nerd-site-panel', JSON.stringify({ tree: $('#tree').classList.contains('focus'), scroll: [$('#tree').scrollTop, $('#tree .body').scrollTop] })); } catch { /* no storage */ }
  });

  // ---------- search: the field in the top bar widens over the page and lists what it finds under itself
  let tqIdx = 0, tqItems = [];
  function palBuild(q) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const ok = (s) => toks.every((t) => s.toLowerCase().includes(t));
    const g = [];
    const docHits = toks.length ? [...DOCNAV, ...DOCS.docs.filter((d) => !DOCNAV.includes(d))].flatMap((d) => [[d.title, docHref(d), 'docs'], ...d.subs.map((x) => [x.title, docHref(d, x.slug), `docs, ${d.title}`])]).filter((x) => ok(x[0] + ' ' + x[2])).slice(0, 8) : [];
    if (docHits.length) g.push(['docs', docHits]);
    const pages = [['Home', '/', 'nerd'], ['Install', '/install/', 'get nerd: the install command, requirements, update, uninstall'], ['Docs', docHref(DOCNAV[0]), 'how to use nerd'], ['Security', '/security/', 'the sandbox and what leaves nerd'], ['Changelog', '/changelog/', `every release, ${DOCS.version} the latest`], ['Plugins', '/plugins/', 'the catalog'], ['All plugins', '/plugins/all/', 'search, filter and sort'], [PAGES.why, '/plugins/why/', 'what is different here'], [PAGES.review, '/plugins/review/', 'the pipeline and the two marks'], [PAGES.add, '/plugins/add/', 'the steps'], ...FOOT.map((k) => [PAGES[k], `/${k}/`, 'about this site'])].filter((x) => ok(x[0] + ' ' + x[2]));
    const pl = all.filter((p) => ok(hay(p))).slice(0, 12).map((p) => [p.name, pluginHref(p), `${p.review}, ${p.summary}`]);
    const au = [...authors()].filter(([a]) => ok(a + ' author')).map(([a, ps]) => [a, `/authors/${encodeURIComponent(a)}/`, `author, ${ps.length} plugin${ps.length > 1 ? 's' : ''}`]);
    const ty = [...new Set(all.flatMap((p) => p.types || []))].filter((t) => toks.length && ok(t)).slice(0, 5).map((t) => [t, listHref({ type: t }), `plugins that open ${t}`]);
    const rm = ROOMS.filter((r) => toks.length && ok(r.w + ' ' + r.n + ' may do')).map((r) => [r.w, listHref({ may: r.k }), 'plugins that may enter this room']);
    if (pl.length) g.push(['plugins', pl]);
    if (au.length) g.push(['authors', au]);
    if (ty.length) g.push(['file types', ty]);
    if (rm.length) g.push(['may do', rm]);
    if (pages.length) g.push(['pages', pages]);
    if (toks.length) g.push(['filter', [[`Filter the list by “${q.trim()}”`, listHref({ q: q.trim() }), 'all plugins that match']]]);
    return g;
  }
  function tqRender() {
    const q = $('#tqIn').value, groups = palBuild(q);
    if (!q) { const r = recentList(); if (r.length) groups.unshift(['recently viewed', r.map((n) => [n, pluginHref(byName(n)), byName(n).summary])]); }
    tqItems = []; let h = '';
    for (const [name, items] of groups) { h += `<div class="gh">${esc(name)}</div>`; for (const it of items) { h += `<a class="it${tqItems.length === tqIdx ? ' on' : ''}" href="${esc(it[1])}" data-tq="${tqItems.length}" role="option"><span class="l">${esc(it[0])}</span><span class="s">${esc(it[2])}</span></a>`; tqItems.push(it); } }
    $('#tqList').innerHTML = h || '<div class="gh">Nothing matches.</div>';
  }
  function tqOpen() {
    if (document.body.classList.contains('drawer')) closeDrawer();
    const tq = $('#tq'); if (tq.classList.contains('on')) return;
    tq.classList.add('on'); document.body.classList.add('tq-on'); tqIdx = 0; tqRender();
    const l = $('#tqList'); l.hidden = false;
    // on a phone the list is fixed to the field's own edges, so the page under it does not scroll or jump
    const fr = $('.tqf').getBoundingClientRect();
    if (innerWidth <= 860) Object.assign(l.style, { top: Math.round(fr.bottom + 4) + 'px', left: Math.round(fr.left) + 'px', width: Math.round(fr.width) + 'px', right: 'auto' });
    else Object.assign(l.style, { top: '', left: '', width: '', right: '' });
  }
  function tqClose() { const tq = $('#tq'); tq.classList.remove('on'); document.body.classList.remove('tq-on'); $('#tqList').hidden = true; $('#tqIn').value = ''; $('#tqIn').blur(); }
  document.addEventListener('focusin', (e) => { if (e.target.id === 'tqIn') tqOpen(); });
  document.addEventListener('input', (e) => { if (e.target.id === 'tqIn') { tqIdx = 0; tqRender(); } });
  document.addEventListener('keydown', (e) => {
    if (e.target.id !== 'tqIn') return;
    if (e.key === 'Escape') { e.preventDefault(); tqClose(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); tqIdx = Math.max(0, Math.min(tqItems.length - 1, tqIdx + (e.key === 'ArrowDown' ? 1 : -1))); tqRender(); const on = $('#tqList .it.on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = tqItems[tqIdx]; if (it) { tqClose(); location.href = it[1]; } }
  });
  document.addEventListener('mousedown', (e) => { if ($('#tq.on') && !e.target.closest('#tq')) tqClose(); });
  document.addEventListener('click', (e) => { if (e.target.closest('#tqList a.it')) tqClose(); });
  // filter menus: one open at a time; a click elsewhere or Escape closes it
  document.addEventListener('toggle', (e) => {
    const d = e.target; if (!d.matches || !d.matches('.dd') || !d.open) return;
    $$('.dd[open]').forEach((x) => { if (x !== d) x.open = false; });
    // the menu opens to the right of its button unless that would cross the window's edge
    d.classList.toggle('flip', false);
    if (d.querySelector('.menu').getBoundingClientRect().right > innerWidth) d.classList.toggle('flip', true);
  }, true);
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('.dd')) $$('.dd[open]').forEach((x) => (x.open = false)); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.dd[open]').forEach((x) => { x.open = false; x.querySelector('summary').focus(); }); });
  matchMedia('(max-width: 860px)').addEventListener('change', () => { closeDrawer(); if ($('#tq.on')) tqClose(); });
  addEventListener('resize', () => { if (innerWidth > 860 && document.body.classList.contains('drawer')) closeDrawer(); });

  // ---------- drawer: on a phone the menu opens right under the search field, at its edges; its button closes it
  function closeDrawer() {
    document.body.classList.remove('drawer');
    ['top', 'left', 'width'].forEach((k) => $('#tree').style.removeProperty(k));
    $('#drawerBtn').setAttribute('aria-expanded', 'false'); $('#drawerBtn').setAttribute('aria-label', 'Menu');
  }
  function toggleDrawer() {
    const o = document.body.classList.toggle('drawer');
    $('#drawerBtn').setAttribute('aria-expanded', String(o)); $('#drawerBtn').setAttribute('aria-label', o ? 'Close the menu' : 'Menu');
    // on a phone the menu opens under the top row, from the logo's left edge to the menu button's right edge
    if (o && innerWidth <= 860) { if ($('#tq.on')) tqClose(); const l = $('.brand').getBoundingClientRect().left, r = $('#drawerBtn').getBoundingClientRect().right; Object.assign($('#tree').style, { top: Math.round($('#bar').getBoundingClientRect().bottom) + 'px', left: Math.round(l) + 'px', width: Math.round(r - l) + 'px' }); }
  }

  // ---------- events
  // the room marks' words: one floating line, placed above the mark, never clipped by a list or a pane
  const tip = document.createElement('div'); tip.id = 'rtip'; tip.hidden = true; document.body.append(tip);
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
  document.addEventListener('mouseover', (e) => {
    const r = e.target.closest?.('.ri.on, .off'); if (!r) { tip.hidden = true; return; }
    tip.textContent = r.dataset.tip; tip.hidden = false;
    const b = r.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + 'px';
    tip.style.top = (b.top - h - 8 < 4 ? b.bottom + 8 : b.top - h - 8) + 'px';
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, a, .frame');
    const fr = e.target.closest('.frame');
    if (fr) { $$('.frame.focus').forEach((x) => x.classList.remove('focus')); fr.classList.add('focus'); }
    if (!t) return;
    if (t.dataset.copy != null) {
      const done = () => { t.textContent = 'Copied'; setTimeout(() => (t.textContent = 'Copy'), 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t.dataset.copy).then(done, () => fallbackCopy(t.dataset.copy, done));
      else fallbackCopy(t.dataset.copy, done);
      return;
    }
    if (t.dataset.pl) {
      const x = S.players[t.dataset.pl]; if (!x) return;
      if (t.dataset.act === 'toggle') { if (x.playing) x.pl.pause(); else x.pl.play(); }
      else { x.pl.seek(0); x.pl.play(); }
      return;
    }
    if (t.id === 'drawerBtn') return toggleDrawer();
    if (t.dataset.theme) { applyTheme(t.dataset.theme); store.set(THEME_KEY, t.dataset.theme); return renderTheme(); }
    if (t.closest('#tree') && t.matches('a')) closeDrawer();
  });
  function fallbackCopy(text, done) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch { /* no clipboard: the text stays selectable */ } ta.remove(); }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDrawer(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) { e.preventDefault(); $('#tqIn').focus(); }
  });
  // typing in the list's filter keeps the address current, so the page can be reloaded or shared as it is
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'fq') return;
    const q = new URLSearchParams(location.search);
    if (e.target.value) q.set('q', e.target.value); else q.delete('q');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : ''));
    renderResults();
  });
  const hint = () => { $('#tqIn').placeholder = innerWidth <= 860 ? 'search' : 'search docs, settings, plugins'; };
  addEventListener('resize', hint); hint();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (root.dataset.pref === 'system') applyTheme('system'); });

  // ---------- start
  renderTheme();
  start();
})();

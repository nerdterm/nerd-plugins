// The catalog site, drawn as a nerd window. The data is embedded in index.html as JSON (and published as catalog.json);
// routes live in the URL hash. Loads nothing but this site's own files and keeps two things in the browser: the theme
// and the plugins you opened last.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const root = document.documentElement;
  const DATA = JSON.parse($('#data').textContent);
  const CATALOG_REPO = 'https://github.com/nerdterm/nerd-plugins';
  const NERD_REPO = 'https://github.com/nerdterm/nerd';
  const INSTALL = 'curl -fsSL https://nerdterm.dev/install.sh | sh';
  const THEME_KEY = 'nerd-plugins-theme';
  const RECENT_KEY = 'nerd-plugins-recent';

  const KIND = { previews: 'previews', panels: 'panels', 'status segments': 'top-row text', 'menu commands': 'menu commands', badges: 'tree marks', agents: 'agent hooks' };
  const ROOMS = [
    { k: 'shows', n: 'Shows in nerd', w: 'shows in nerd' },
    { k: 'files', n: 'Your files', w: 'writes files' },
    { k: 'network', n: 'The network', w: 'reaches the network' },
    { k: 'agent', n: 'Coding agents', w: 'hooks into agents' },
  ];
  const RISKW = ['Only shows things', 'Writes files', 'Reaches the network', 'Hooks into a coding agent'];
  const SORTS = { stars: 'Stars', gain: 'Stars gained, 7 days', newest: 'Newest in the catalog', released: 'Recently released', az: 'A to Z' };
  const PAGES = { why: 'Why nerd plugins', review: 'How review works', add: 'Add your plugin', about: 'About', contact: 'Contact', privacy: 'Privacy', legal: 'Legal' };
  const FOOT = ['about', 'contact', 'privacy', 'legal'];
  const SITE = { install: 'Install', docs: 'Docs', security: 'Security', changelog: 'Changelog' };
  const DOCS = window.NERD_DOCS || { docs: [], changelog: [] };
  // README sections that have a page of their own
  const ALIAS = { requirements: 'install', limitations: 'install', installation: 'install', uninstall: 'install', 'privacy-and-security': 'security' };
  // the docs panel: every other README section in its order, the plugin guide after usage and configuration
  const DOCNAV = DOCS.docs.filter((d) => !Object.hasOwn(ALIAS, d.slug));
  const CATALOG_ROUTES = ['catalog', 'plugins', 'plugin', 'author', 'why', 'review', 'add'];

  const all = DATA.plugins.map((p) => ({ ...p, added: p.added ?? DATA.built, updated: p.updated ?? DATA.built, counted: Number.isInteger(p.stars), stars: p.stars ?? 0 }));
  const S = { players: {}, uid: 0 };
  let pending = [];

  // ---------- helpers
  const dayOf = (d) => new Date(d + 'T00:00:00Z');
  const fmt = (d) => (d ? dayOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
  const fmtShort = (d) => (d ? dayOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
  const num = (n) => n.toLocaleString('en-US');
  const plural = (n, w) => `${num(n)} ${w}${n === 1 ? '' : 's'}`;
  // The build keeps only plain https://github.com/<owner>/<repo> addresses, which a shell takes unquoted.
  const install = (p) => `nerd --plugin-add ${p.url}`;
  const short = (v) => { const parts = String(v).split(/,\s*/); return parts.length > 3 ? `${parts.slice(0, 3).join(', ')} and ${parts.length - 3} more` : String(v); };
  const netWords = (n) => (n === 'localhost' ? "this Mac's own services" : `only ${n.hosts.join(', ')} on port ${n.ports.join(', ')}`);
  const roomVal = (p, k) => {
    const v = p.can && Object.hasOwn(p.can, k) ? p.can[k] : null;
    if (k === 'network' && v) return netWords(v);
    return Array.isArray(v) ? v.join(', ') : v;
  };
  const roomsOf = (p) => ROOMS.filter((r) => roomVal(p, r.k));
  const byName = (n) => all.find((p) => p.name === n);
  const authors = () => { const m = new Map(); all.forEach((p) => m.set(p.author, [...(m.get(p.author) || []), p])); return m; };
  const latestOf = (p) => p.versions[0] || {};
  const spark = (a) => { const lo = Math.min(...a), hi = Math.max(...a); return a.map((v) => '▁▂▃▄▅▆▇█'[hi === lo ? 0 : Math.round(((v - lo) / (hi - lo)) * 7)]).join(''); };
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* no storage: the choice lasts until the page closes */ } },
  };
  const recentList = () => { try { return JSON.parse(store.get(RECENT_KEY) || '[]').filter((n) => byName(n)); } catch { return []; } };

  // the review mark as one square: a tick for checked by the scripts, an eye for read by the catalog's maintainer
  const MARK = {
    checked: ['<path d="M4 8.3l2.6 2.6L12 5.4"/>', 'Checked: passed every automated check. Nobody read the code.'],
    reviewed: ['<path d="M2 8s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z"/><circle cx="8" cy="8" r="1.8"/>', 'Reviewed: passed the checks, and the catalog’s maintainer read it.'],
  };
  const markIcon = (m) => (MARK[m] ? `<span class="ri mark-${esc(m)} on" role="img" aria-label="${esc(m)}" data-tip="${esc(MARK[m][1])}"><svg viewBox="0 0 16 16" aria-hidden="true">${MARK[m][0]}</svg></span>` : esc(m));
  const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.6l3.09 6.26 6.91 1-5 4.87 1.18 6.88L12 17.36l-6.18 3.25L7 13.73 2 8.86l6.91-1z"/></svg>';
  const starN = (p) => (p.counted ? `<span class="sn" aria-label="${esc(p.stars)} stars">${STAR}<b>${esc(p.stars)}</b></span>` : '<span class="sn faint" aria-label="stars not counted yet">no count</span>');
  const gainN = (n) => (n > 0 ? `<span class="gn">+${esc(n)} this week</span>` : '');
  const markHtml = (m) => `<span class="mark ${esc(m)}">${esc(m)}</span>`;
  // the four rooms as square marks: lit where the plugin may enter, empty where it is walled off; the words come on hover
  const ROOM_SVG = {
    shows: '<rect x="2.5" y="3.5" width="11" height="9"/><path d="M2.5 6.5h11"/>',
    files: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
    network: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c-2.2 2.8-2.2 8.2 0 11M8 2.5c2.2 2.8 2.2 8.2 0 11"/>',
    agent: '<path d="M3 3.5h10v7H7l-3 2.5v-2.5H3z"/><path d="M6 6l1.5 1.2L6 8.4M8.6 8.4H10.5"/>',
  };
  const roomTip = (p, r, v) => (r.k === 'shows' ? `${r.n}: ${(p.kinds || []).map((k) => KIND[k]).join(', ') || 'yes'}` : `${r.n}: ${r.k === 'network' ? v : short(v)}`);
  const roomIcons = (p) => {
    if (!p.can) return `<span class="ricons unknown">${esc(RISKW[p.risk])}, details unknown</span>`;
    return `<span class="ricons" role="img" aria-label="${esc(RISKW[p.risk])}">${ROOMS.map((r) => {
      const v = roomVal(p, r.k);
      return `<span class="ri ${r.k}${v ? ' on' : ''}" data-tip="${esc(v ? roomTip(p, r, v) : `${r.n}: walled off`)}"><svg viewBox="0 0 16 16" aria-hidden="true">${ROOM_SVG[r.k]}</svg></span>`;
    }).join('')}</span>`;
  };
  const riskHtml = (n, w) => `<span class="risk r${esc(n)}">${esc(w || RISKW[n])}</span>`;
  const frame = (t, body, o = {}) =>
    `<section class="frame ${o.cls || ''}"${o.id ? ` id="${o.id}"` : ''}><h2 class="t">${t}</h2>${o.r ? `<span class="t r">${o.r}</span>` : ''}${o.tabs || ''}<div class="body">${body}</div></section>`;
  const copyBtn = (text) => `<button class="btn" data-copy="${esc(text)}">Copy</button>`;
  const cmdBox = (text) => `<div class="cmd"><code>${esc(text)}</code>${copyBtn(text)}</div>`;

  function route() {
    const [pa, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const [path, anchor = ''] = pa.split('#');
    let seg = path.split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    // the catalog lives under /plugins: its front is 'catalog', its list 'plugins', its pages by their own names
    if (seg[0] === 'plugins') seg = !seg[1] ? ['catalog'] : seg[1] === 'all' ? ['plugins'] : seg.slice(1);
    // a docs address that is now a part of another page (how-it-works, when nerd's docs are split) opens that page there
    let at = anchor;
    if (seg[0] === 'docs' && seg[1] && !DOCS.docs.some((d) => d.slug === seg[1]) && Object.hasOwn(DOCS.anchors || {}, seg[1])) { at = seg[1]; seg = ['docs', DOCS.anchors[seg[1]]]; }
    if (seg[0] === 'docs' && Object.hasOwn(ALIAS, seg[1] ?? '')) seg = [ALIAS[seg[1]]];
    return { seg, q: new URLSearchParams(qs), anchor: at };
  }
  const listHref = (over, base) => {
    const p = new URLSearchParams(base ? base.toString() : '');
    for (const [k, v] of Object.entries(over)) {
      if (v == null || v === '' || p.get(k) === v) p.delete(k); else p.set(k, v);
    }
    const s = p.toString();
    return '#/plugins/all' + (s ? '?' + s : '');
  };

  // ---------- filtering
  const hay = (p) => [p.name, p.title, p.summary, p.author, (p.types || []).join(' '), p.abilities.join(' '), roomsOf(p).map((r) => r.w).join(' '), RISKW[p.risk], (p.kinds || []).map((k) => KIND[k]).join(' '), p.review, p.official ? 'official' : 'community'].join(' ').toLowerCase();
  function filtered(q) {
    const toks = (q.get('q') || '').toLowerCase().split(/\s+/).filter(Boolean);
    const a = all.filter((p) => {
      if (toks.length && !toks.every((t) => hay(p).includes(t))) return false;
      if (q.get('adds') && !(p.kinds || []).includes(q.get('adds'))) return false;
      if (q.get('may') && !roomVal(p, q.get('may'))) return false;
      if (q.get('type') && !(p.types || []).includes(q.get('type'))) return false;
      if (q.get('review') && p.review !== q.get('review')) return false;
      if (q.get('source') === 'official' && !p.official) return false;
      if (q.get('source') === 'community' && p.official) return false;
      return true;
    });
    const cmps = {
      stars: (x, y) => y.stars - x.stars || x.name.localeCompare(y.name),
      gain: (x, y) => y.gain7 - x.gain7 || y.stars - x.stars,
      newest: (x, y) => y.added.localeCompare(x.added) || x.name.localeCompare(y.name),
      released: (x, y) => y.updated.localeCompare(x.updated) || x.name.localeCompare(y.name),
      az: (x, y) => x.title.localeCompare(y.title),
    };
    return a.sort(Object.hasOwn(cmps, q.get('sort') ?? '') ? cmps[q.get('sort')] : cmps.stars);
  }

  // ---------- rooms
  function roomsHtml(p) {
    if (!p.can) return '<p class="note">What this plugin may do could not be read at build time. It is unknown, not none.</p>';
    // four cells in 1, 2 or 4 columns by the band's width: an open room is lit in its colour with one line of what it may do; a walled room is a dim name
    return `<div class="rband">${ROOMS.map((r) => {
      const v = roomVal(p, r.k);
      const tx = r.k === 'shows' ? ((p.kinds || []).map((k) => KIND[k]).join(', ') || v) : r.k === 'network' ? v : short(v);
      const ico = `<svg viewBox="0 0 16 16" aria-hidden="true">${ROOM_SVG[r.k]}</svg>`;
      return v
        ? `<div class="rcell ${r.k} on"><span class="rn">${ico}${r.n}</span><span class="rd" title="${esc(v)}">${esc(tx)}</span></div>`
        : `<div class="rcell ${r.k}"><span class="rn">${ico}${r.n}</span><span class="rd">walled off</span></div>`;
    }).join('')}</div>`;
  }
  const roomsFrame = (p) => frame('may do', roomsHtml(p), { r: `level ${p.risk}`, cls: 'rooms-f' });

  // ---------- recording
  function recFrame(p) {
    if (!p.cast) return frame(`${esc(p.name)} running in nerd`, sketchHtml(p, true), { cls: 'rec primary' });
    const id = 'pl' + ++S.uid;
    pending.push(() => mount(id, p, false));
    const ctl = `<div class="ctl"><button class="btn sm" data-pl="${id}" data-act="toggle">Pause</button><button class="btn sm" data-pl="${id}" data-act="restart">Restart</button><span>${esc(Math.round(p.cast.duration))} s, ${esc(p.cast.width)} by ${esc(p.cast.height)} cells</span></div>`;
    return frame(`${esc(p.name)} running in nerd`, `<div id="${id}"></div>${ctl}`, { cls: 'rec primary', r: esc(p.tag) });
  }
  function mount(id, p, still) {
    const el = document.getElementById(id);
    if (!el || !window.AsciinemaPlayer) return;
    el.classList.add('snap4');
    // the page has its own Pause and Restart; with controls the player keeps 32px under the terminal for its own bar
    const o = { cols: p.cast.width, rows: p.cast.height, fit: 'width', theme: 'nerd', terminalFontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', loop: true, controls: false };
    if (still) Object.assign(o, { autoPlay: false, preload: true, poster: 'npt:0:11' });
    else o.autoPlay = true;
    const pl = AsciinemaPlayer.create(`casts/${encodeURIComponent(p.name)}.cast?v=${encodeURIComponent(p.cast.v)}`, el, o);
    S.players[id] = { pl, playing: o.autoPlay === true };
    pl.addEventListener('play', () => { S.players[id].playing = true; setToggle(id); });
    pl.addEventListener('pause', () => { S.players[id].playing = false; setToggle(id); });
  }
  function setToggle(id) { const b = $(`[data-pl="${id}"][data-act="toggle"]`); if (b) b.textContent = S.players[id].playing ? 'Pause' : 'Play'; }
  function disposePlayers() { Object.values(S.players).forEach((x) => { try { x.pl.dispose(); } catch { /* already gone */ } }); S.players = {}; }

  // ---------- tree
  // The panel is the whole site map, the same rows on every page: nothing folds, appears or moves; only the
  // highlight follows the page. Pages under a page (docs, the kinds of plugins) sit one level in.
  function treeHtml(rt) {
    const s0 = rt.seg[0] || '';
    const onList = s0 === 'plugins';
    const cnt = (f) => all.filter(f).length;
    const row = (r, last, plast) => `<a class="tr${r.sub ? ' sub' : ''}${r.on ? ' on' : ''}${last ? ' last' : ''}${plast ? ' plast' : ''}" href="${r.h}"${r.on ? ' aria-current="page"' : ''}><span class="g" aria-hidden="true"></span><span class="l">${r.l}</span>${r.n != null ? `<span class="n">${r.n}</span>` : ''}</a>`;
    // rows: [{h, l, on, n, kids: [...]}]; a kid's guide continues its parent's line unless the parent is the last row
    const rows = (list) => list.map((r, i) => {
      const last = i === list.length - 1;
      return row(r, last) + (r.kids || []).map((k, j) => row({ ...k, sub: true }, j === r.kids.length - 1, last)).join('');
    }).join('');
    const sec = (label, list) => `<div class="sec open"><div class="h">${label}</div>${rows(list)}</div>`;
    const docSlug = s0 === 'docs' ? rt.seg[1] || DOCNAV[0].slug : null;
    const kinds = Object.keys(KIND).map((k) => [k, cnt((p) => (p.kinds || []).includes(k))]).filter((x) => x[1] > 0);
    const nerd = [
      { h: '#/', l: 'Home', on: s0 === '' },
      { h: '#/install', l: 'Install', on: s0 === 'install' },
      { h: '#/docs', l: 'Docs', on: false, kids: DOCNAV.map((d) => ({ h: `#/docs/${d.slug}`, l: esc(d.title), on: docSlug === d.slug })) },
      { h: '#/security', l: 'Security', on: s0 === 'security' },
      { h: '#/changelog', l: 'Changelog', on: s0 === 'changelog' },
    ];
    const plugins = [
      { h: '#/plugins', l: 'Catalog', on: s0 === 'catalog' },
      { h: '#/plugins/all', l: 'All plugins', n: all.length, on: (onList && !rt.q.get('adds')) || s0 === 'plugin' || s0 === 'author', kids: kinds.map(([k, n]) => ({ h: listHref({ adds: k }), l: KIND[k], n, on: onList && rt.q.get('adds') === k })) },
      { h: '#/plugins/why', l: PAGES.why, on: s0 === 'why' },
      { h: '#/plugins/review', l: PAGES.review, on: s0 === 'review' },
      { h: '#/plugins/add', l: PAGES.add, on: s0 === 'add' },
    ];
    const site = FOOT.map((k) => ({ h: `#/${k}`, l: PAGES[k], on: s0 === k }));
    return sec('nerd', nerd) + sec('plugins', plugins) + sec('this site', site);
  }
  function remember(rt) {
    if (rt.seg[0] !== 'plugin' || !byName(rt.seg[1])) return;
    store.set(RECENT_KEY, JSON.stringify([rt.seg[1], ...recentList().filter((n) => n !== rt.seg[1])].slice(0, 6)));
  }
  // the panel keeps its scroll across pages; the current row is scrolled into view only when it is out of sight
  function renderTree(rt) {
    rt = rt || route(); remember(rt);
    const sc = [$('#tree'), $('#tree .body')], keep = sc.map((e) => e.scrollTop);
    $('#tree .body').innerHTML = treeHtml(rt);
    sc.forEach((e, i) => (e.scrollTop = keep[i]));
    const on = $('#tree .tr.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }

  // ---------- status
  function renderTheme() {
    const pref = root.dataset.pref;
    $('#theme').innerHTML = ['System', 'Light', 'Dark'].map((t) => `<button class="${pref === t.toLowerCase() ? 'on' : ''}" data-theme="${t.toLowerCase()}" aria-pressed="${pref === t.toLowerCase()}">${t}</button>`).join('');
  }
  function applyTheme(pref) {
    root.dataset.pref = pref;
    root.dataset.theme = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  // ---------- views
  const lrHead = () => '<div class="lr hd"><span>name</span><span class="sm">summary</span><span class="ad">adds</span><span class="rk">may do</span><span class="mk">review</span><span class="au">author</span><span class="num st">stars</span></div>';
  const lrow = (p) => `<a class="lr" href="#/plugin/${esc(p.name)}"><span class="nm">${esc(p.name)}</span><span class="sm muted">${esc(p.summary)}</span><span class="ad muted">${(p.kinds || []).map((k) => KIND[k]).join(', ')}</span><span class="rk">${roomIcons(p)}</span><span class="mk">${markIcon(p.review)}</span><span class="au muted">${esc(p.author)}</span><span class="num st">${starN(p)}</span></a>`;
  // No recording: the globe out of sync, cut into bands with a few pushed sideways; the bands are the same image, clipped.
  const GLITCH = [0, 0, 6, -10, 0, 14, 0, -5, 0, 9, 0, 0];
  // each plugin's bands are pushed its own way, from its name, so a grid of them does not repeat one picture
  const glitchOf = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; const r = h % GLITCH.length; return GLITCH.map((_, k) => GLITCH[(k + r) % GLITCH.length] * (h & 1 ? 1 : -1)); };
  // the page's style-src allows no style attribute: each band gets its clip and push from here, after it is drawn
  const sketchHtml = (p, big) => `<div class="noshot${big ? ' big snap4' : ''}" role="img" aria-label="${esc(p.name)}: no recording yet"><div class="gl">${glitchOf(p.name).map((o, k) => `<i data-k="${k}" data-o="${o}"></i>`).join('')}</div><small>no recording yet</small></div>`;
  function styleBands() {
    $$('.gl i[data-k]').forEach((i) => {
      const k = +i.dataset.k;
      i.style.clipPath = `inset(${(k * 100) / GLITCH.length}% 0 ${100 - ((k + 1) * 100) / GLITCH.length}% 0)`;
      i.style.transform = `translateX(${i.dataset.o}%)`;
      i.removeAttribute('data-k');
    });
  }
  function cardHtml(p, right, rank) {
    const id = p.cast ? 'pl' + ++S.uid : '';
    if (id) pending.push(() => mount(id, p, true));
    return `<a class="frame card" href="#/plugin/${esc(p.name)}"><h3 class="t">${rank ? `<span class="rank">${rank}</span>` : ''}${esc(p.name)}</h3><span class="t r">${right}</span><div class="body">${id ? `<div class="still-box"><div id="${id}" class="still"></div></div>` : sketchHtml(p)}<span>${esc(p.summary)}</span><span class="meta">${roomIcons(p)}<span class="faint">${esc(p.author)}</span></span></div></a>`;
  }

  function catalogView(rt) {
    const WEEK = new Date(dayOf(DATA.built) - 7 * 864e5).toISOString().slice(0, 10);
    const grp = (title, r, body) => `<section class="grp"><header><h2>${title}</h2>${r ? `<span>${r}</span>` : ''}</header><div class="body">${body}</div></section>`;
    const top = all.filter((p) => p.gain7 > 0).sort((a, b) => b.gain7 - a.gain7 || b.stars - a.stars).slice(0, 5);
    const week = top.length ? `<div class="carousel" data-carousel><div class="track">${top.map((p, n) => `<div class="slide">${cardHtml(p, `${starN(p)}${gainN(p.gain7)}`, n + 1)}</div>`).join('')}</div>${top.length > 1 ? '<div class="cnav"><button class="btn" data-cs="-1" aria-label="Previous plugins">← Previous</button><span class="cpos" aria-live="polite"></span><button class="btn" data-cs="1" aria-label="Next plugins">Next →</button></div>' : ''}</div>` : '<p class="note">No plugin gained stars on GitHub this week.</p>';
    const gainedAll = all.reduce((n, p) => n + p.gain7, 0);
    const nAuthors = authors().size;
    const hero = `<section class="hero2">
      <div class="h2-main">
        <h1>Plugins for nerd.</h1>
        <p class="lede">Previews, panels, top-row text, menu commands, tree marks and hooks into coding agents. Each plugin runs in its own sandbox: it writes outside its own data folder, reaches the network and hooks into coding agents only where its manifest says, and you see that before you install it. What it can read is wider, as for any program you run: <a href="#/docs/plugins#roles-and-authorization">most of your files and the environments of your other programs</a>.</p>
        <p class="trust"><span class="dot"></span>Every plugin is checked by the catalog before it is listed. <a href="#/plugins/review">How review works →</a></p>
        <div class="get" id="get"><span class="caps">Get nerd</span><span class="code"><code>${esc(INSTALL).replace(/\//g, '/<wbr>').replace(' | ', '&nbsp;|&nbsp;')}</code>${copyBtn(INSTALL)}</span><a href="${NERD_REPO}" rel="noopener">nerd on GitHub</a></div>
        <div class="stats"><p><b>${num(all.length)}</b><span class="caps">${all.length === 1 ? 'plugin' : 'plugins'}</span></p><p><b>${num(nAuthors)}</b><span class="caps">${nAuthors === 1 ? 'author' : 'authors'}</span></p>${gainedAll ? `<p class="teal-caps"><b>+${num(gainedAll)}</b><span class="caps">stars this week</span></p>` : ''}<a class="add" href="#/plugins/add"><b>Add your plugin →</b><span class="caps">open source, on GitHub</span></a></div>
      </div>
      <div class="h2-side">
        <div class="h-logo"><img class="dk" src="brand/nerd-logo-dark.svg" alt="nerd: world control for your terminal" width="896" height="404"><img class="lt" src="brand/nerd-logo-light.svg" alt="nerd: world control for your terminal" width="896" height="404"></div>
      </div>
    </section>`;
    const groups = all.length
      ? `${grp('top of the week', `most stars gained since ${fmtShort(WEEK)}`, week)}
      ${grp('most stars', `${all.length > 10 ? `the first 10 of ${all.length} · ` : ''}<a href="#/plugins/all">all plugins, with filters →</a>`, `<div class="lst">${lrHead()}${[...all].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name)).slice(0, 10).map(lrow).join('')}</div>`)}`
      : grp('plugins', '', '<p class="note">The catalog has no plugins yet.</p>');
    const html = `<section class="frame fill home-pane"><h2 class="t">plugins</h2>${DATA.updated ? `<span class="t r">updated ${fmtShort(DATA.updated)}</span>` : ''}<div class="home"><div class="home-in">${hero}
      ${groups}
      </div></div></section>`;
    return { html };
  }

  const listViewOf = (q) => (['list', 'wide', 'grid'].includes(q.get('view')) ? q.get('view') : 'list');
  function filterBar(rt) {
    const q = rt.q, cnt = (f) => all.filter(f).length;
    const menu = (key, label, items) => {
      const cur = items.find(([v]) => q.get(key) === v);
      return `<details class="dd${cur ? ' set' : ''}"><summary class="btn">${label}${cur ? `: <b>${esc(cur[1])}</b>` : ''} <span aria-hidden="true">▾</span></summary><div class="menu"><a href="${listHref({ [key]: null }, q)}"${!cur ? ' aria-current="true"' : ''}>any</a>${items.map(([v, l, n]) => `<a href="${listHref({ [key]: v }, q)}"${cur && cur[0] === v ? ' aria-current="true"' : ''}><span>${esc(l)}</span><span class="n">${n}</span></a>`).join('')}</div></details>`;
    };
    return `<div class="fbar">${menu('adds', 'adds', Object.keys(KIND).map((k) => [k, KIND[k], cnt((p) => (p.kinds || []).includes(k))]).filter((x) => x[2]))}${menu('may', 'may do', ROOMS.map((r) => [r.k, r.w, cnt((p) => roomVal(p, r.k))]))}${menu('review', 'review', [['checked', 'checked', cnt((p) => p.review === 'checked')], ['reviewed', 'reviewed', cnt((p) => p.review === 'reviewed')]])}${menu('source', 'source', [['official', 'official', cnt((p) => p.official)], ['community', 'community', cnt((p) => !p.official)]])}</div>`;
  }
  function listView(rt) {
    const q = rt.q;
    // sort is one of nerd's menus, like the filters beside it: the chosen order in the accent, the rest as rows
    const cur = Object.hasOwn(SORTS, q.get('sort') ?? '') ? q.get('sort') : 'stars';
    const sortHref = (v) => { const p = new URLSearchParams(q.toString()); if (v === 'stars') p.delete('sort'); else p.set('sort', v); const t = p.toString(); return '#/plugins/all' + (t ? '?' + t : ''); };
    const sel = `<details class="dd srt"><summary class="btn">sort: <b>${esc(SORTS[cur])}</b> <span aria-hidden="true">▾</span></summary><div class="menu">${Object.entries(SORTS).map(([v, l]) => `<a href="${sortHref(v)}"${v === cur ? ' aria-current="true"' : ''}><span>${esc(l)}</span></a>`).join('')}</div></details>`;
    const view = (v, l) => { const p = new URLSearchParams(q.toString()); if (v === 'list') p.delete('view'); else p.set('view', v); const s = p.toString(); return `<a class="btn" href="#/plugins/all${s ? '?' + s : ''}"${listViewOf(q) === v ? ' aria-pressed="true"' : ''}>${l}</a>`; };
    const html = `<div class="page p-one"><div class="col">${frame('plugins',
      `<div class="qrow"><label class="qin"><span>/</span><input id="fq" type="search" value="${esc(q.get('q') || '')}" placeholder="filter by name, summary, author, file type, what it may do" aria-label="Filter plugins"></label>
        <span class="views" role="group" aria-label="View">${view('list', 'List')}${view('wide', 'Wide list')}${view('grid', 'Grid')}</span>
        ${sel}</div>${filterBar(rt)}<div id="results"></div>`,
      { cls: 'fill primary', r: `${all.length} in the catalog` })}</div></div>`;
    pending.push(() => renderResults());
    return { html };
  }
  const FILTERS = ['q', 'adds', 'may', 'type', 'review', 'source'];
  function renderResults() {
    const rt = route();
    const items = filtered(rt.q);
    const view = listViewOf(rt.q);
    const active = FILTERS.filter((k) => rt.q.get(k));
    let out = `<div class="res"><span><b>${items.length}</b> of ${all.length} plugins</span>${active.length > 1 ? '<span class="applied"><a class="clear" href="#/plugins/all">Clear all</a></span>' : ''}</div>`;
    if (!items.length) {
      const q = rt.q.get('q');
      out += `<div class="empty"><h3>${q ? `No plugin matches “${esc(q)}”.` : 'No plugin matches these filters.'}</h3>
        <p class="note">Nothing is hidden: the catalog has ${all.length} plugins and none fits.${active.length > 1 ? ' Try fewer filters.' : ''} Search also reads file types such as <b>.db</b> or <b>.jsonl</b>, and what a plugin may do, such as <b>network</b>.</p>
        <div class="row up"><a class="btn" href="#/plugins/all">Show all plugins</a><a class="btn" href="#/plugins/add">Add your plugin</a></div></div>`;
    } else if (view === 'grid') {
      out += `<div class="tiles">${items.map((p) => {
        const id = p.cast ? 'pl' + ++S.uid : '';
        if (id) pending.push(() => mount(id, p, true));
        return `<a class="tile" href="#/plugin/${esc(p.name)}">${id ? `<div class="still-box"><div id="${id}" class="still"></div></div>` : sketchHtml(p)}<span class="nm">${esc(p.name)}<span class="num">${starN(p)}</span></span><span class="s">${esc(p.summary)}</span><span class="meta">${roomIcons(p)}</span></a>`;
      }).join('')}</div>`;
    } else if (view === 'wide') {
      out += `<div class="wide">${items.map((p) => `<a class="wr" href="#/plugin/${esc(p.name)}"><span class="nm">${esc(p.name)}</span><span class="s">${esc(p.summary)}</span><span class="meta">${roomIcons(p)}<span>adds ${(p.kinds || []).map((k) => KIND[k]).join(', ')}</span>${markIcon(p.review)}<span class="faint">${esc(p.author)}</span></span><span class="num">${starN(p)}</span></a>`).join('')}</div>`;
    } else {
      out += `<div class="lst">${lrHead()}${items.map(lrow).join('')}</div>`;
    }
    const box = $('#results');
    if (box) box.innerHTML = out;
    runPending();
    renderTree(rt);
  }

  function pluginView(rt) {
    const p = byName(rt.seg[1]);
    if (!p) return missing(`No plugin called “${esc(rt.seg[1])}”.`);
    const sub = rt.seg[2] || 'overview';
    const tab = (id, label) => `<a href="#/plugin/${esc(p.name)}${id === 'overview' ? '' : '/' + id}"${sub === id ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
    const byAuthor = all.filter((x) => x.author === p.author && x !== p).sort((a, b) => b.stars - a.stars);
    const overlap = (x) => (x.kinds || []).filter((k) => (p.kinds || []).includes(k)).length;
    const alike = all.filter((x) => x !== p && x.author !== p.author && overlap(x)).sort((a, b) => overlap(b) - overlap(a) || b.stars - a.stars).slice(0, 6);
    const nRel = byAuthor.length + alike.length;
    const tabs = `<div class="ptabs">${tab('overview', 'Overview')}${tab('review', 'Review')}${tab('releases', 'Releases')}${nRel ? tab('related', `Related <span class="tn">${nRel}</span>`) : ''}</div>`;
    const latest = latestOf(p);
    const rv = p.revoked;
    let body = '';
    if (sub === 'overview') {
      const notices = [
        rv && rv.current ? `<p class="notice bad"><b>Revoked.</b> The catalog ${rv.level === 'hard' ? 'revoked' : 'warns about'} ${esc(rv.release)}${rv.on ? ` on ${fmtShort(rv.on)}` : ''}: ${esc(rv.why)}. ${rv.level === 'hard' ? 'nerd will not run it. Do not install it.' : 'nerd warns whoever has it.'}</p>` : '',
        p.unavailable ? '<p class="notice warn"><b>Source unavailable at build time.</b> The catalog could not read this release from its repository when this page was built, so what it may do in detail, its README and its recording are not shown. Its risk level and review mark are the catalog’s.</p>' : '',
      ].join('');
      body = `${notices}<p class="sum">${esc(p.summary)}</p>
        <div class="row"><span>by <a href="#/author/${encodeURIComponent(p.author)}">${esc(p.author)}</a>${p.official ? ' <span class="faint">official</span>' : ''}</span><a class="mk" href="#/plugin/${esc(p.name)}/review">${markIcon(p.review)}</a>${roomIcons(p)}</div>
        <h3 class="sect">Install</h3>${cmdBox(install(p))}${(p.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
        <h3 class="sect">Facts</h3>
        <dl class="facts">
          <dt>release</dt><dd>${esc(p.tag)}, ${fmtShort(latest.date || p.updated)}</dd>
          <dt>works with</dt><dd>${p.min_nerd ? `nerd ${esc(p.min_nerd)} or later` : 'any nerd'}</dd>
          <dt>licence</dt><dd>${esc(p.licence || 'unknown')}</dd>
          ${p.types && p.types.length ? `<dt>opens</dt><dd class="types">${p.types.length > 8 ? `<details><summary>${p.types.slice(0, 8).map(esc).join(' ')} <span class="more">+${p.types.length - 8} more</span></summary>${p.types.slice(8).map(esc).join(' ')}</details>` : p.types.map(esc).join(' ')}</dd>` : ''}
          <dt>stars</dt><dd>${starN(p)}${gainN(p.gain7)}${p.stars30.length ? ` <span class="spark" aria-label="Stars by day: ${esc(p.stars30.join(', '))}">${spark(p.stars30)}</span>` : ''}</dd>
        </dl>
        <p class="links">${p.url ? `<a href="${esc(p.url)}" rel="noopener">Source on GitHub</a>` : ''}<a href="${CATALOG_REPO}/issues/new?title=${encodeURIComponent('Report: ' + p.name + ' ' + p.tag)}" rel="noopener">Report this plugin</a></p>`;
    } else if (sub === 'review') {
      const v = p.versions.find((x) => x.tag === rt.q.get('r')) || latest;
      const commit = esc(String(v.commit).slice(0, 10));
      body = `${p.versions.length > 1 ? '' : `<p class="sum">Release <b>${esc(v.tag)}</b></p>`}<div class="relsel${p.versions.length > 1 ? '' : ' one'}"><span class="faint">release</span>${p.versions.map((x) => `<a class="btn" href="#/plugin/${esc(p.name)}/review?r=${encodeURIComponent(x.tag)}"${x.tag === v.tag ? ' aria-pressed="true"' : ''}>${esc(x.tag)} <span class="dim">${esc(x.mark)}</span></a>`).join('')}</div>
        <dl class="facts sect">
          <dt>commit</dt><dd>${p.url ? `<a href="${esc(p.url)}/commit/${esc(v.commit)}" rel="noopener"><code>${commit}</code></a>` : `<code>${commit}</code>`}</dd>
          <dt>in the catalog</dt><dd>${v.date ? fmt(v.date) : 'not yet committed'}</dd>
          <dt>review</dt><dd>${esc(v.mark)}: ${esc((MARK[v.mark] || ['', ''])[1].replace(/^\w+: /, ''))}</dd>
          ${v.pr ? `<dt>pull request</dt><dd><a href="${esc(v.pr)}" rel="noopener">${esc(v.pr.replace(/^.*\/pull\//, '#'))} in the catalog</a></dd>` : ''}
        </dl>
        <p class="note">The full receipt of each check will appear here once the review publishes it.</p>
        <p><a href="#/plugins/review">How review works</a></p>`;
    } else if (sub === 'related') {
      const item = (x) => `<a class="rel-i" href="#/plugin/${esc(x.name)}"><span class="nm">${esc(x.name)}</span><span class="st">${starN(x)}</span><span class="s">${esc(x.summary)}</span><span class="meta">${roomIcons(x)}${markIcon(x.review)}<span class="faint">${esc(x.author)}</span></span></a>`;
      body = `${byAuthor.length ? `<h3 class="sect first">From ${esc(p.author)}</h3><div class="rel">${byAuthor.map(item).join('')}</div>` : ''}
        ${alike.length ? `<h3 class="sect${byAuthor.length ? '' : ' first'}">Also adds ${(p.kinds || []).map((k) => KIND[k]).join(', ')}</h3><div class="rel">${alike.map(item).join('')}</div>` : ''}`;
    } else if (sub === 'releases') {
      const revoked = (v) => (rv && rv.release === v.tag ? `<span class="${rv.level === 'hard' ? 'bad' : 'warn'}">${rv.level === 'hard' ? 'revoked' : 'warning'}</span>` : '');
      body = `<p class="note lead6">What each release may do, version by version. nerd asks again when a release wants more than the one before.</p>${p.versions.map((v) => `<div class="rel"><div class="row"><b>${esc(v.tag)}</b><span class="faint">${v.date ? fmt(v.date) : 'not yet committed'}</span>${markHtml(v.mark)}${riskHtml(v.risk, 'level ' + v.risk + ': ' + RISKW[v.risk].toLowerCase())}${revoked(v)}</div>
        <p class="perm${v.widened ? ' widened' : ''}">${esc(v.perm)}</p>${v.diff ? `<ul class="plain">${v.diff.map((d) => `<li>${esc(d[0])} ${esc(d[1])}</li>`).join('')}</ul>` : ''}</div>`).join('')}`;
    } else return missing('No such tab.');
    const info = frame(`${esc(p.name)} ${esc(p.tag)}`, body, { cls: 'fill info', r: esc(p.review), tabs });
    const readme = p.readme ? frame('README.md', `<div class="readme">${p.readme}</div>`, { cls: 'readme-f', r: esc(p.tag) }) : '';
    return { html: `<div class="page p-split"><div class="col">${recFrame(p)}${roomsFrame(p)}${readme}</div><div class="col">${info}</div></div>` };
  }

  function authorView(rt) {
    const name = rt.seg[1];
    const ps = authors().get(name);
    if (!ps) return missing(`No author called “${esc(name)}” in the catalog.`);
    const stars = ps.reduce((a, p) => a + p.stars, 0);
    const reachable = ROOMS.map((r) => [r, ps.filter((p) => roomVal(p, r.k)).length]).filter((x) => x[1]);
    const side = frame(esc(name), `<dl class="facts narrow">
      <dt>plugins</dt><dd>${esc(ps.length)}</dd><dt>stars</dt><dd>${esc(stars)} in all</dd>
      <dt>source</dt><dd><a href="https://github.com/${encodeURIComponent(name)}" rel="noopener">github.com/${esc(name)}</a></dd>
      <dt>official</dt><dd>${ps.every((p) => p.official) ? 'yes, an official plugin author' : ps.some((p) => p.official) ? 'some plugins' : 'no, community author'}</dd>
      <dt>first listed</dt><dd>${fmt(ps.map((p) => p.added).sort()[0])}</dd></dl>
      <h3 class="sect">Rooms its plugins may enter</h3><ul class="plain">${reachable.map(([r, n]) => `<li>${r.w}: ${n} of ${ps.length}</li>`).join('')}</ul>`, { cls: 'fill primary', r: 'author' });
    const list = [...ps].sort((a, b) => b.stars - a.stars).map((p) => {
      const id = p.cast ? 'pl' + ++S.uid : '';
      if (id) pending.push(() => mount(id, p, true));
      return frame(`<a class="plain-link" href="#/plugin/${esc(p.name)}">${esc(p.name)}</a>`, `${id ? `<div id="${id}" class="still gap"></div>` : ''}<p class="sum snug">${esc(p.summary)}</p><div class="row">${markHtml(p.review)}${riskHtml(p.risk)}<span class="faint">${esc(p.stars)} stars</span><a href="#/plugin/${esc(p.name)}">Open ${esc(p.name)}</a></div>`, { r: esc(p.tag) });
    }).join('');
    return { html: `<div class="page p-two"><div class="col">${side}</div><div class="col">${list}</div></div>` };
  }

  const step = (n, t, b) => `<div class="step"><span class="no">${n}</span><div><b>${t}</b>${b}</div></div>`;
  const cell = (t, b) => `<div class="cell"><b>${t}</b><p>${b}</p></div>`;
  const textPage = (title, body) => ({ html: `<div class="page p-one"><div class="col">${frame(title, `<div class="prose">${body}</div>`, { cls: 'fill primary' })}</div></div>` });

  function reviewView() {
    const flow = frame('the pipeline',
      `<div class="prose">
      ${step(1, 'An author opens a pull request', '<p>It adds or changes one file, <code>plugins/&lt;name&gt;.json</code>, that names a release tag and the commit it points at. nerd installs exactly that commit and refuses when the tag no longer points at it.</p>')}
      ${step(2, 'The checks run', `<p>They run on a fresh GitHub-hosted Mac, from the catalog’s own scripts, with no token and no secrets, never from the plugin’s. A failed check stops the pull request.</p>
        <ul class="plain"><li>The manifest is valid and the risk level is computed from it.</li><li>The licence is an open source one.</li><li>No compiled binaries, no file over 1 MB that is not text, no minified line, no long encoded blob. This is a heuristic, not a proof.</li><li>Every package manifest has a lockfile that pins exact versions.</li><li>OSV-Scanner for known vulnerabilities and malicious packages; GuardDog, YARA and Gitleaks over the files.</li></ul>`)}
      ${step(3, 'The trial in the sandbox', '<p>The plugin runs in nerd’s sandbox with no network, even when its manifest names hosts, and nowhere to write but a temporary data folder. The report says whether it connected, what it registered, how it ended and what it printed. macOS does not let the review read the sandbox’s own list of what it denied, so that list is not in the report.</p>')}
      ${step(4, 'The decision', '<p>The risk level decides who looks next.</p>')}
      </div>
      <div class="two">
        <div class="frame chk"><h3 class="t">checked</h3><div class="body prose"><p>The plugin is at level 0, it only shows things. Every check passed and its level did not rise. It is labelled automatically; nobody read the code.</p></div></div>
        <div class="frame rev"><h3 class="t">reviewed</h3><div class="body prose"><p>Everything else: a plugin that writes files, reaches the network or hooks into an agent, or whose level rose. The catalog maintainer reads it and approves it by hand. The maintainer may ask for an AI analysis; it can only add findings and cannot approve anything.</p></div></div>
      </div>
      <div class="prose">${step(5, 'After it is listed', '<p>Each new release goes through the same pipeline again. A release can be revoked: a hard revocation makes nerd turn the plugin off until it is updated or removed, a soft one warns the people who have it.</p>')}</div>`, { cls: 'fill primary', r: 'review' });
    const levels = frame('risk levels',
      `<table class="rtab">${RISKW.map((w, i) => `<tr><td class="risk r${i}">${i}</td><td>${w}</td><td class="muted">${['It adds previews, panels, top-row text or menu commands, and nothing more.', 'It may write files.', 'It may reach the hosts and ports its manifest names, or this Mac’s own services.', 'It hooks into a coding agent.'][i]}</td></tr>`).join('')}</table>
      <h3 class="sect">What a mark does not say</h3><p class="note flat">The checks look for known problems. They do not prove a plugin is good. That is why a plugin shows what it may do, in rooms, next to the mark.</p>
      <h3 class="sect">Releases</h3><p class="note flat">Every plugin page has a Review tab with each release, its commit, its day in the catalog and its mark.${all.length ? ` <a href="#/plugin/${esc((all.find((p) => p.cast) || all[0]).name)}/review">See one</a>.` : ''}</p>`, { r: 'levels' });
    return { html: `<div class="page p-two p-rv"><div class="col">${flow}</div><div class="col">${levels}</div></div>` };
  }

  function addView() {
    const entry = `{
  "title": "Big files",
  "summary": "Marks files over 1 MB in the tree and the tab.",
  "url": "https://github.com/you/nerd-bigfiles",
  "tag": "v1.2.0",
  "commit": "<the 40 characters the tag points at>",
  "version": "1.2.0",
  "risk": 0,
  "review": "checked"
}`;
    const steps = frame('four steps',
      `<div class="prose">
      ${step(1, 'Open source, on public GitHub', '<p>Your plugin has a licence file (any open source licence) and lives in a public GitHub repository. nerd installs from no other host.</p>')}
      ${step(2, 'A manifest and a tag', '<p>Its <code>plugin.json</code> has <code>version</code> and <code>min_nerd</code>, and a release tag <code>v&lt;version&gt;</code> points at the commit you submit.</p>')}
      ${step(3, 'Check it yourself', `<p>Both must be clean: the check, then the trial in the sandbox.</p>${cmdBox('nerd --plugin-check --catalog <folder>')}${cmdBox('nerd --plugin-trial <folder>')}`)}
      ${step(4, 'Open a pull request', `<p>Add or change <code>plugins/&lt;name&gt;.json</code> in the <a href="${CATALOG_REPO}" rel="noopener">catalog repository</a>. One plugin per pull request.</p><p><a class="btn" href="${CATALOG_REPO}/pulls" rel="noopener">Open the catalog repository</a></p>`)}
      </div>`, { cls: 'fill primary', r: 'add' });
    const side = frame('the entry',
      `<p class="note lead5">One file per plugin, named after its manifest.</p><div class="cmd"><code class="pre">${esc(entry)}</code></div>${copyBtn(entry)}
      <p class="note">nerd installs exactly <code>commit</code>. <code>risk</code> is what <code>nerd --plugin-check --json</code> says; nerd recomputes it and refuses an entry that disagrees. Open the pull request with <code>"review": "checked"</code>: the review sets the real mark, not you.</p>
      <h3 class="sect">What happens next</h3><p class="note flat">The review runs. A plugin that only shows things gets the mark <b>checked</b> by itself; any other gets <b>reviewed</b> after the maintainer reads it. <a href="#/plugins/review">How review works</a>.</p>
      <h3 class="sect">Featured</h3><p class="note flat">Set by the catalog’s maintainer, not by you.</p>`, { r: 'plugins/name.json' });
    return { html: `<div class="page p-two p-ad"><div class="col">${steps}</div><div class="col">${side}</div></div>` };
  }

  function whyView() {
    return textPage('why nerd plugins', `
      <p class="lede">A plugin runs code on your Mac. This catalog is built around what that code is allowed to do.</p>
      <div class="cells">
        ${cell('A sandbox for every plugin', `Every plugin runs in nerd’s macOS sandbox. Besides showing things in nerd and writing its own data folder, it writes only to the folders its manifest names, reaches the network only as its manifest names and speaks only for the agents it names. Reading is wider, as for any program you run: the command lines and environments of your other programs, so a key in an environment variable is readable to it, and your files except those <a href="#/docs/plugins#roles-and-authorization">the plugin guide</a> names: ${DOCS.pluginReads.html}. ${DOCS.pluginReads.otherHtml}`)}
        ${cell('You see it before you install', 'A plugin’s page shows four rooms: what it shows in nerd, your files, the network and coding agents. A room it may enter is lit and says what it may do there; the others say walled off. nerd shows the same before it installs anything, and installs nothing until you say yes.')}
        ${cell('Every release is checked', 'A plugin that only shows things is checked automatically and marked checked. Every other plugin, and any release that may do more than the one before, is read by the catalog’s maintainer and marked reviewed. <a href="#/plugins/review">How review works</a>.')}
        ${cell('Updates only on your button', 'nerd installs a plugin’s newer release only when you ask for it, and asks again when that release can do more than the one before. A release the catalog revokes is turned off, or you are warned, depending on how it was revoked.')}
      </div>
      <p>The catalog is open source, and so is every plugin in it. <a href="#/plugins/add">Add your plugin</a>, or read <a href="${CATALOG_REPO}" rel="noopener">the catalog’s repository</a>.</p>`);
  }

  function aboutView() {
    return textPage('about', `
      <h2>nerd</h2>
      <p>nerd is a terminal multiplexer for AI agents on macOS. It runs your shells and coding agents side by side in panes and tabs, and shows in a sidebar which one is working, which is waiting for you and which has finished. Panes live in a background server, so closing the window or rebooting loses neither the layout nor the pane text. <a href="${NERD_REPO}" rel="noopener">nerd on GitHub</a></p>
      <h2>This site</h2>
      <p>nerdterm.dev is made by Evgeniy Kovrov (<a href="https://github.com/nyxene" rel="noopener">github.com/nyxene</a>), a private person, as a personal, non-commercial open-source project; no money is taken. Its pages about nerd are built from nerd's own README and changelog, so they say what the repository says. The plugin catalog is built from <a href="${CATALOG_REPO}" rel="noopener">github.com/nerdterm/nerd-plugins</a> and is also published as <a href="catalog.json">catalog.json</a>.</p>
      <h2>Principles</h2>
      <ul class="plain">
        <li>No accounts.</li>
        <li>No cookies.</li>
        <li>No analytics and no download counts.</li>
        <li>nerd reads the catalog only when you choose Refresh catalog.</li>
      </ul>`);
  }

  function contactView() {
    return textPage('contact', `
      <h2>The catalog</h2>
      <p>Questions, ideas and problems with the catalog or this site: <a href="${CATALOG_REPO}/issues" rel="noopener">issues on GitHub</a>.</p>
      <h2>Report a plugin</h2>
      <p>Open <a href="${CATALOG_REPO}/issues/new?title=${encodeURIComponent('Report: ')}" rel="noopener">an issue in the catalog</a> that names the plugin and its release. Every plugin page has a Report this plugin link that fills that in.</p>
      <h2>Security</h2>
      <p>Report a vulnerability privately through GitHub, as nerd’s <a href="${NERD_REPO}/blob/master/SECURITY.md" rel="noopener">SECURITY.md</a> says: <b>Security, Report a vulnerability</b> on nerd’s repository. Do not open a public issue, pull request or discussion for it.</p>
      <h2>Anything else</h2>
      <p>There is no e-mail address. Anything else goes to the issues of the repository it is about: <a href="${NERD_REPO}/issues" rel="noopener">nerd</a> or <a href="${CATALOG_REPO}/issues" rel="noopener">the catalog and this site</a>.</p>`);
  }

  function privacyView() {
    return textPage('privacy', `
      <p>This page sets no cookies and has no accounts.</p>
      <h2>What stays in your browser</h2>
      <p>Two things in localStorage, and nothing else. They never leave your browser.</p>
      <ul class="plain">
        <li><code>${THEME_KEY}</code>: whether you chose System, Light or Dark.</li>
        <li><code>${RECENT_KEY}</code>: the names of the last plugins you opened, up to six, for the recently viewed list.</li>
      </ul>
      <h2>What it loads</h2>
      <p>Only files from this site. Its Content-Security-Policy allows nothing from other hosts, so no font, script, image or counter is fetched from anywhere else. Links to GitHub leave this site only when you click them.</p>
      <h2>Stars</h2>
      <p>The star counts come from GitHub through the catalog’s repository, once a day. This page asks GitHub nothing.</p>
      <h2>Analytics</h2>
      <p>None. Downloads are not counted.</p>
      <h2>Hosting</h2>
      <p>The site is hosted on GitHub Pages. GitHub logs visitors’ IP addresses for security and operations, under <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub’s General Privacy Statement</a>. The site itself sets no cookies, has no analytics and loads nothing from other hosts.</p>`);
  }

  function legalView() {
    return textPage('legal', `
      <h2>Licence</h2>
      <p>The catalog, its scripts and this site’s code are under the MIT licence: <a href="${CATALOG_REPO}/blob/main/LICENSE" rel="noopener">LICENSE</a>. The recordings player is asciinema-player, under the Apache-2.0 licence, which ships with the site.</p>
      <p>Each plugin has a licence of its own, shown on its page under Facts. The catalog’s licence does not cover plugins.</p>
      <h2>Published by</h2>
      <p>Evgeniy Kovrov (<a href="https://github.com/nyxene" rel="noopener">github.com/nyxene</a>), a private person. nerd, its plugin catalog and this site are a personal, non-commercial open-source project; no money is taken.</p>
      <h2>Names and logos</h2>
      <p>“nerd” and its logo are the project’s names. Other names belong to their owners.</p>`);
  }

  function missing(msg) {
    return { html: `<div class="page p-one"><div class="col">${frame('not found', `<div class="empty"><h3>${msg}</h3><p class="note">Nothing is at this address.</p><div class="row"><a class="btn" href="#/plugins/all">All plugins</a><a class="btn" href="#/">Home</a></div></div>`, { cls: 'primary' })}</div></div>` };
  }

  // ---------- what the home page and page files may use
  const later = (f) => pending.push(f);
  function mountCast(id, src, o = {}) {
    later(() => {
      const el = document.getElementById(id);
      if (!el || !window.AsciinemaPlayer) return;
      el.classList.add('snap4');
      const pl = AsciinemaPlayer.create(src, el, { fit: 'width', theme: 'nerd', terminalFontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', loop: true, autoPlay: true, controls: false, ...o });
      S.players[id] = { pl, playing: o.autoPlay !== false };
    });
    return id;
  }
  const uid = () => 'x' + ++S.uid;
  const API = { missing, $, $$, esc, fmt, fmtShort, num, plural, frame, copyBtn, cmdBox, later, mountCast, uid, cardHtml, starN, gainN, roomIcons, markIcon, roomsHtml, roomVal, netWords, install, KIND, ROOMS, RISKW, all, authors, byName, DATA, DOCS, DOCNAV, INSTALL, NERD_REPO, CATALOG_REPO, route, sketchHtml };
  window.NERD_API = API;

  // ---------- render
  // boxes whose height follows their width (the logo, recordings, their stills) round up to the 4px module, so
  // everything under them stays on whole pixels
  // (it watches the box and what is inside it: a player settles its size after the box was first measured)
  const SNAP = '.h-logo, .still-box, .snap4';
  const snap = (t) => { t.style.height = ''; const h = t.getBoundingClientRect().height, s = Math.ceil(h / 4 - 1e-3) * 4; if (s - h > 0.01) t.style.height = s + 'px'; const c = t.firstElementChild; if (c && !c.dataset.snapped) { c.dataset.snapped = 1; snapRO.observe(c); } };
  const snapRO = new ResizeObserver((es) => es.forEach(({ target: t }) => snap(t.matches(SNAP) ? t : t.parentElement)));
  function runPending() { const p = pending; pending = []; p.forEach((f) => f()); styleBands(); $$(SNAP.split(', ').map((x) => '#main ' + x).join(', ')).forEach((e) => snapRO.observe(e)); }
  function render() {
    disposePlayers();
    const rt = route();
    const s = rt.seg[0] || '';
    const ext = Object.fromEntries(Object.entries(window.NERD_VIEWS || {}).map(([k, f]) => [k, (r) => f(r, API)]));
    const homeView = (r) => ((window.NERD_HOMES || {}).home || catalogView)(r, API);
    // a page file may replace a built-in view (the catalog's front is catalog-front.js)
    const views = { '': homeView, catalog: catalogView, plugins: listView, plugin: pluginView, author: authorView, review: reviewView, add: addView, why: whyView, about: aboutView, contact: contactView, privacy: privacyView, legal: legalView, ...ext };
    const v = Object.hasOwn(views, s) ? views[s] : null;
    const out = v ? v(rt) : missing('This address does not exist.');
    $('#main').innerHTML = out.html;
    renderTree(rt);
    runPending();
    $$('#main .col, #main .page').forEach((e) => (e.scrollTop = 0));
    const prim = $('#main .frame.primary') || $('#main .frame');
    $$('.frame.focus').forEach((x) => x.classList.remove('focus'));
    if (S.treeLit && innerWidth > 860) $('#tree').classList.add('focus'); else if (prim) prim.classList.add('focus');
    root.dataset.route = s || 'home';
    closeDrawer();
    document.title = s === '' ? 'nerd: a terminal multiplexer for AI agents' : Object.hasOwn(SITE, s) ? `${SITE[s]} · nerd` : s === 'catalog' ? 'Plugins · nerd' : Object.hasOwn(PAGES, s) ? `${PAGES[s]} · nerd` : s === 'plugins' ? 'All plugins · nerd' : rt.seg[1] ? rt.seg[1] + ' · nerd plugins' : 'nerd';
    if (rt.anchor) { const a = document.getElementById(rt.anchor); if (a) a.scrollIntoView({ block: 'start' }); }
  }

  // ---------- search: the field in the top bar widens over the page and lists what it finds under itself
  let tqIdx = 0, tqItems = [];
  function palBuild(q) {
    const toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    const ok = (s) => toks.every((t) => s.toLowerCase().includes(t));
    const g = [];
    const docHits = toks.length ? [...DOCNAV, ...DOCS.docs.filter((d) => !DOCNAV.includes(d))].flatMap((d) => [[d.title, `#/docs/${d.slug}`, 'docs'], ...d.subs.map((x) => [x.title, `#/docs/${d.slug}#${x.slug}`, `docs, ${d.title}`])]).filter((x) => ok(x[0] + ' ' + x[2])).slice(0, 8) : [];
    if (docHits.length) g.push(['docs', docHits]);
    const pages = [['Home', '#/', 'nerd'], ['Install', '#/install', 'get nerd: the install command, requirements, update, uninstall'], ['Docs', '#/docs', 'how to use nerd'], ['Security', '#/security', 'the sandbox and what leaves nerd'], ['Changelog', '#/changelog', `every release, ${DOCS.version} the latest`], ['Plugins', '#/plugins', 'the catalog'], ['All plugins', '#/plugins/all', 'search, filter and sort'], [PAGES.why, '#/plugins/why', 'what is different here'], [PAGES.review, '#/plugins/review', 'the pipeline and the two marks'], [PAGES.add, '#/plugins/add', 'the steps'], ...FOOT.map((k) => [PAGES[k], '#/' + k, 'about this site'])].filter((x) => ok(x[0] + ' ' + x[2]));
    const pl = all.filter((p) => ok(hay(p))).slice(0, 12).map((p) => [p.name, `#/plugin/${p.name}`, `${p.review}, ${p.summary}`]);
    const au = [...authors()].filter(([a]) => ok(a + ' author')).map(([a, ps]) => [a, `#/author/${encodeURIComponent(a)}`, `author, ${ps.length} plugin${ps.length > 1 ? 's' : ''}`]);
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
    if (!q) { const r = recentList(); if (r.length) groups.unshift(['recently viewed', r.map((n) => [n, `#/plugin/${n}`, byName(n).summary])]); }
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
    else if (e.key === 'Enter') { e.preventDefault(); const it = tqItems[tqIdx]; if (it) { tqClose(); location.hash = it[1]; } }
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
  const carouselPos = (c) => {
    const t = c.querySelector('.track'), sl = [...t.children]; if (!sl.length) return;
    const w = sl[0].getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 0);
    const per = Math.max(1, Math.round(t.clientWidth / w)), first = Math.round(t.scrollLeft / w);
    const last = Math.min(sl.length, first + per);
    const pos = c.querySelector('.cpos'); if (pos) pos.textContent = per >= sl.length ? `all ${sl.length}` : `${first + 1}${last > first + 1 ? '–' + last : ''} of ${sl.length}`;
    const [pv, nx] = c.querySelectorAll('[data-cs]'); if (pv) { pv.disabled = first <= 0; nx.disabled = last >= sl.length; }
    c.classList.toggle('fits', per >= sl.length);
  };
  document.addEventListener('scroll', (e) => { const c = e.target.closest?.('[data-carousel]'); if (c) carouselPos(c); }, true);
  document.addEventListener('scrollend', (e) => { const c = e.target.closest?.('[data-carousel]'); if (c) carouselPos(c); }, true);
  addEventListener('resize', () => $$('[data-carousel]').forEach(carouselPos));
  new MutationObserver(() => $$('[data-carousel]:not([data-on])').forEach((c) => { c.dataset.on = 1; requestAnimationFrame(() => carouselPos(c)); })).observe(document.body, { childList: true, subtree: true });
  // the room marks' words: one floating line, placed above the mark, never clipped by a list or a pane
  const tip = document.createElement('div'); tip.id = 'rtip'; tip.hidden = true; document.body.append(tip);
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
  document.addEventListener('mouseover', (e) => {
    const r = e.target.closest?.('.ri.on'); if (!r) { tip.hidden = true; return; }
    tip.textContent = r.dataset.tip; tip.hidden = false;
    const b = r.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, b.left + b.width / 2 - w / 2)) + 'px';
    tip.style.top = (b.top - h - 8 < 4 ? b.bottom + 8 : b.top - h - 8) + 'px';
  });
  document.addEventListener('click', (e) => {
    const cs = e.target.closest('[data-cs]');
    if (cs) { const c = cs.closest('[data-carousel]'), t = c.querySelector('.track'), w = t.children[0].getBoundingClientRect().width + parseFloat(getComputedStyle(t).columnGap || 0); const per = Math.max(1, Math.round(t.clientWidth / w)), at = Math.round(t.scrollLeft / w), to = Math.max(0, Math.min(t.children.length - per, at + Math.sign(+cs.dataset.cs) * per)); t.scrollTo({ left: to * w, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setTimeout(() => carouselPos(c), 450); return; }
    const t = e.target.closest('button, a, .frame');
    const fr = e.target.closest('.frame');
    if (fr) { $$('.frame.focus').forEach((x) => x.classList.remove('focus')); fr.classList.add('focus'); S.treeLit = fr.id === 'tree'; }
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
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'fq') return;
    const q = new URLSearchParams(route().q.toString());
    if (e.target.value) q.set('q', e.target.value); else q.delete('q');
    history.replaceState(null, '', location.pathname + location.search + '#/plugins/all' + (q.toString() ? '?' + q : ''));
    renderResults();
  });
  const hint = () => { $('#tqIn').placeholder = innerWidth <= 860 ? 'search' : 'search docs, settings, plugins'; };
  addEventListener('resize', hint); hint();
  addEventListener('hashchange', render);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (root.dataset.pref === 'system') applyTheme('system'); });

  // ---------- start
  if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/');
  $('#sVer').textContent = `nerd ${DOCS.version || ''}`;
  renderTheme();
  render();
})();

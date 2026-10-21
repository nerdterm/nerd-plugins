// Every page of nerdterm.dev as HTML, from the catalog and nerd's docs. build.mjs writes each page to its own file;
// the browser draws again only what the query string changes (the list's filters, a review tab's release).
// Loaded by build.mjs as a CommonJS module and by every page as a script: it touches no DOM and no window.
(() => {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CATALOG_REPO = 'https://github.com/nerdterm/nerd-plugins';
  const NERD_REPO = 'https://github.com/nerdterm/nerd';
  const INSTALL = 'curl -fsSL https://nerdterm.dev/install.sh | sh';
  const BREW = 'brew install nerdterm/tap/nerd';
  const THEME_KEY = 'nerd-plugins-theme';
  const RECENT_KEY = 'nerd-plugins-recent';
  const TITLE_HOME = 'nerd: a terminal multiplexer that shows what your AI agents are doing';
  const DESC_HOME = 'nerd is a terminal multiplexer for AI agents on macOS: it shows which agent is working, which is waiting for you and which has finished.';
  const NOT_FOUND = ['Not found · nerd', 'Nothing is at this address.'];

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
  const SITE = { install: 'Install', security: 'Security', changelog: 'Changelog' };
  const FILTERS = ['q', 'adds', 'may', 'type', 'review', 'source'];
  const LIVE = [...FILTERS, 'sort', 'view'];

  function make(DATA, DOCS) {
    // the docs panel: every README section that is not a part of Install or Security, the plugin guide after usage and configuration
    const DOCNAV = DOCS.docs.filter((d) => !d.part);
    const docHref = (d, a) => `${d.part ? `/${d.part}/` : `/docs/${d.slug}/`}${a ? `#${a}` : ''}`;
    const all = DATA.plugins.map((p) => ({ ...p, added: p.added ?? DATA.built, updated: p.updated ?? DATA.built, counted: Number.isInteger(p.stars), stars: p.stars ?? 0 }));
    const S = { players: {}, uid: 0 };

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
    const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

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
    const listHref = (over, base) => {
      const p = new URLSearchParams(base ? base.toString() : '');
      for (const [k, v] of Object.entries(over)) {
        if (v == null || v === '' || p.get(k) === v) p.delete(k); else p.set(k, v);
      }
      const s = p.toString();
      return '/plugins/all/' + (s ? '?' + s : '');
    };
    const pluginHref = (p, tab) => `/plugins/${esc(p.name)}/${tab ? tab + '/' : ''}`;

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

    // ---------- recording: a box the browser mounts the player into, from these attributes (app.js mount)
    const castBox = (p, cls, still) => `<div id="pl${++S.uid}"${cls ? ` class="${cls}"` : ''} data-cast="${esc(p.name)}" data-fp="${esc(p.cast.v)}" data-cols="${esc(p.cast.width)}" data-rows="${esc(p.cast.height)}"${still ? ' data-still' : ''}></div>`;
    function recFrame(p) {
      if (!p.cast) return frame(`${esc(p.name)} running in nerd`, sketchHtml(p, true), { cls: 'rec primary' });
      const box = castBox(p, '', false), id = `pl${S.uid}`;
      const ctl = `<div class="ctl"><button class="btn sm" data-pl="${id}" data-act="toggle">Pause</button><button class="btn sm" data-pl="${id}" data-act="restart">Restart</button><span>${esc(Math.round(p.cast.duration))} s, ${esc(p.cast.width)} by ${esc(p.cast.height)} cells</span></div>`;
      return frame(`${esc(p.name)} running in nerd`, `${box}${ctl}`, { cls: 'rec primary', r: esc(p.tag) });
    }

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
        { h: '/', l: 'Home', on: s0 === '' },
        { h: '/install/', l: 'Install', on: s0 === 'install' },
        { h: docHref(DOCNAV[0]), l: 'Docs', on: false, kids: DOCNAV.map((d) => ({ h: docHref(d), l: esc(d.title), on: docSlug === d.slug })) },
        { h: '/security/', l: 'Security', on: s0 === 'security' },
        { h: '/changelog/', l: 'Changelog', on: s0 === 'changelog' },
      ];
      const plugins = [
        { h: '/plugins/', l: 'Catalog', on: s0 === 'catalog' },
        { h: '/plugins/all/', l: 'All plugins', n: all.length, on: (onList && !rt.q.get('adds')) || s0 === 'plugin' || s0 === 'author', kids: kinds.map(([k, n]) => ({ h: listHref({ adds: k }), l: KIND[k], n, on: onList && rt.q.get('adds') === k })) },
        { h: '/plugins/why/', l: PAGES.why, on: s0 === 'why' },
        { h: '/plugins/review/', l: PAGES.review, on: s0 === 'review' },
        { h: '/plugins/add/', l: PAGES.add, on: s0 === 'add' },
      ];
      const site = FOOT.map((k) => ({ h: `/${k}/`, l: PAGES[k], on: s0 === k }));
      return sec('nerd', nerd) + sec('plugins', plugins) + sec('this site', site);
    }

    // ---------- views
    const lrHead = () => '<div class="lr hd"><span>name</span><span class="sm">summary</span><span class="ad">adds</span><span class="rk">may do</span><span class="mk">review</span><span class="au">author</span><span class="num st">stars</span></div>';
    const lrow = (p) => `<a class="lr" href="${pluginHref(p)}"><span class="nm">${esc(p.name)}</span><span class="sm muted">${esc(p.summary)}</span><span class="ad muted">${(p.kinds || []).map((k) => KIND[k]).join(', ')}</span><span class="rk">${roomIcons(p)}</span><span class="mk">${markIcon(p.review)}</span><span class="au muted">${esc(p.author)}</span><span class="num st">${starN(p)}</span></a>`;
    // No recording: the globe out of sync, cut into bands with a few pushed sideways; the bands are the same image, clipped.
    const GLITCH = [0, 0, 6, -10, 0, 14, 0, -5, 0, 9, 0, 0];
    // each plugin's bands are pushed its own way, from its name, so a grid of them does not repeat one picture
    const glitchOf = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; const r = h % GLITCH.length; return GLITCH.map((_, k) => GLITCH[(k + r) % GLITCH.length] * (h & 1 ? 1 : -1)); };
    // the page's style-src allows no style attribute: each band gets its clip and push from app.js, after it is drawn
    const sketchHtml = (p, big) => `<div class="noshot${big ? ' big snap4' : ''}" role="img" aria-label="${esc(p.name)}: no recording yet"><div class="gl">${glitchOf(p.name).map((o, k) => `<i data-k="${k}" data-o="${o}"></i>`).join('')}</div><small>no recording yet</small></div>`;

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
      const sortHref = (v) => { const p = new URLSearchParams(q.toString()); if (v === 'stars') p.delete('sort'); else p.set('sort', v); const t = p.toString(); return '/plugins/all/' + (t ? '?' + t : ''); };
      const sel = `<details class="dd srt"><summary class="btn">sort: <b>${esc(SORTS[cur])}</b> <span aria-hidden="true">▾</span></summary><div class="menu">${Object.entries(SORTS).map(([v, l]) => `<a href="${sortHref(v)}"${v === cur ? ' aria-current="true"' : ''}><span>${esc(l)}</span></a>`).join('')}</div></details>`;
      const view = (v, l) => { const p = new URLSearchParams(q.toString()); if (v === 'list') p.delete('view'); else p.set('view', v); const s = p.toString(); return `<a class="btn" href="/plugins/all/${s ? '?' + s : ''}"${listViewOf(q) === v ? ' aria-pressed="true"' : ''}>${l}</a>`; };
      const html = `<div class="page p-one"><div class="col">${frame('plugins',
        `<div class="qrow"><label class="qin"><span>/</span><input id="fq" type="search" value="${esc(q.get('q') || '')}" placeholder="filter by name, summary, author, file type, what it may do" aria-label="Filter plugins"></label>
          <span class="views" role="group" aria-label="View">${view('list', 'List')}${view('wide', 'Wide list')}${view('grid', 'Grid')}</span>
          ${sel}</div>${filterBar(rt)}<div id="results">${resultsHtml(rt)}</div>`,
        { cls: 'fill primary', r: `${all.length} in the catalog` })}</div></div>`;
      return { html };
    }
    function resultsHtml(rt) {
      const items = filtered(rt.q);
      const view = listViewOf(rt.q);
      const active = FILTERS.filter((k) => rt.q.get(k));
      let out = `<div class="res"><span><b>${items.length}</b> of ${all.length} plugins</span>${active.length > 1 ? '<span class="applied"><a class="clear" href="/plugins/all/">Clear all</a></span>' : ''}</div>`;
      if (!items.length) {
        const q = rt.q.get('q');
        out += `<div class="empty"><h3>${q ? `No plugin matches “${esc(q)}”.` : 'No plugin matches these filters.'}</h3>
          <p class="note">Nothing is hidden: the catalog has ${all.length} plugins and none fits.${active.length > 1 ? ' Try fewer filters.' : ''} Search also reads file types such as <b>.db</b> or <b>.jsonl</b>, and what a plugin may do, such as <b>network</b>.</p>
          <div class="row up"><a class="btn" href="/plugins/all/">Show all plugins</a><a class="btn" href="/plugins/add/">Add your plugin</a></div></div>`;
      } else if (view === 'grid') {
        out += `<div class="tiles">${items.map((p) => `<a class="tile" href="${pluginHref(p)}">${p.cast ? `<div class="still-box">${castBox(p, 'still', true)}</div>` : sketchHtml(p)}<span class="nm">${esc(p.name)}<span class="num">${starN(p)}</span></span><span class="s">${esc(p.summary)}</span><span class="meta">${roomIcons(p)}</span></a>`).join('')}</div>`;
      } else if (view === 'wide') {
        out += `<div class="wide">${items.map((p) => `<a class="wr" href="${pluginHref(p)}"><span class="nm">${esc(p.name)}</span><span class="s">${esc(p.summary)}</span><span class="meta">${roomIcons(p)}<span>adds ${(p.kinds || []).map((k) => KIND[k]).join(', ')}</span>${markIcon(p.review)}<span class="faint">${esc(p.author)}</span></span><span class="num">${starN(p)}</span></a>`).join('')}</div>`;
      } else {
        out += `<div class="lst">${lrHead()}${items.map(lrow).join('')}</div>`;
      }
      return out;
    }

    // the plugins a plugin's Related tab shows: the author's others, then up to six that add the same things
    function relatedOf(p) {
      const byAuthor = all.filter((x) => x.author === p.author && x !== p).sort((a, b) => b.stars - a.stars);
      const overlap = (x) => (x.kinds || []).filter((k) => (p.kinds || []).includes(k)).length;
      const alike = all.filter((x) => x !== p && x.author !== p.author && overlap(x)).sort((a, b) => overlap(b) - overlap(a) || b.stars - a.stars).slice(0, 6);
      return { byAuthor, alike, n: byAuthor.length + alike.length };
    }
    // the Review tab's body for one release: the browser draws it again when ?r= names another
    function reviewBody(p, tag) {
      const latest = latestOf(p);
      const v = p.versions.find((x) => x.tag === tag) || latest;
      const commit = esc(String(v.commit).slice(0, 10));
      return `${p.versions.length > 1 ? '' : `<p class="sum">Release <b>${esc(v.tag)}</b></p>`}<div class="relsel${p.versions.length > 1 ? '' : ' one'}"><span class="faint">release</span>${p.versions.map((x) => `<a class="btn" href="${pluginHref(p, 'review')}?r=${encodeURIComponent(x.tag)}"${x.tag === v.tag ? ' aria-pressed="true"' : ''}>${esc(x.tag)} <span class="dim">${esc(x.mark)}</span></a>`).join('')}</div>
        <dl class="facts sect">
          <dt>commit</dt><dd>${p.url ? `<a href="${esc(p.url)}/commit/${esc(v.commit)}" rel="noopener"><code>${commit}</code></a>` : `<code>${commit}</code>`}</dd>
          <dt>in the catalog</dt><dd>${v.date ? fmt(v.date) : 'not yet committed'}</dd>
          <dt>review</dt><dd>${esc(v.mark)}: ${esc((MARK[v.mark] || ['', ''])[1].replace(/^\w+: /, ''))}</dd>
          ${v.pr ? `<dt>pull request</dt><dd><a href="${esc(v.pr)}" rel="noopener">${esc(v.pr.replace(/^.*\/pull\//, '#'))} in the catalog</a></dd>` : ''}
        </dl>
        <p class="note">The full receipt of each check will appear here once the review publishes it.</p>
        <p><a href="/plugins/review/">How review works</a></p>`;
    }
    function pluginView(rt) {
      const p = byName(rt.seg[1]);
      if (!p) return missing(`No plugin called “${esc(rt.seg[1])}”.`);
      const sub = rt.seg[2] || 'overview';
      const tab = (id, label) => `<a href="${pluginHref(p, id === 'overview' ? '' : id)}"${sub === id ? ' class="on" aria-current="page"' : ''}>${label}</a>`;
      const { byAuthor, alike, n: nRel } = relatedOf(p);
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
          <div class="row"><span>by <a href="/authors/${encodeURIComponent(p.author)}/">${esc(p.author)}</a>${p.official ? ' <span class="off" role="img" aria-label="nerd official" data-tip="Official: published by the nerd project"><b>nerd</b>official</span>' : ''}</span><a class="mk" href="${pluginHref(p, 'review')}">${markIcon(p.review)}</a>${roomIcons(p)}</div>
          <h3 class="sect">Install</h3>${cmdBox(install(p))}${(p.notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
          ${p.official ? `<h3 class="sect">Official: published by the nerd project</h3>
          <dl class="facts">
            <dt>repository</dt><dd>${esc(p.url)}</dd>
            <dt>tag</dt><dd>${esc(p.tag)}</dd>
            <dt>commit</dt><dd>${esc(p.commit)}</dd>
          </dl>
          <p class="note">Only the nerd project can tag its own repository. Check it yourself: this prints the commit above, on the line ending in ^{} for an annotated tag.</p>${cmdBox(`git ls-remote ${p.url} refs/tags/${p.tag}`)}` : ''}
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
        body = reviewBody(p, rt.q.get('r'));
      } else if (sub === 'related') {
        const item = (x) => `<a class="rel-i" href="${pluginHref(x)}"><span class="nm">${esc(x.name)}</span><span class="st">${starN(x)}</span><span class="s">${esc(x.summary)}</span><span class="meta">${roomIcons(x)}${markIcon(x.review)}<span class="faint">${esc(x.author)}</span></span></a>`;
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
      const list = [...ps].sort((a, b) => b.stars - a.stars).map((p) =>
        frame(`<a class="plain-link" href="${pluginHref(p)}">${esc(p.name)}</a>`, `${p.cast ? castBox(p, 'still gap', true) : ''}<p class="sum snug">${esc(p.summary)}</p><div class="row">${markHtml(p.review)}${riskHtml(p.risk)}<span class="faint">${esc(p.stars)} stars</span><a href="${pluginHref(p)}">Open ${esc(p.name)}</a></div>`, { r: esc(p.tag) })).join('');
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
        <h3 class="sect">Releases</h3><p class="note flat">Every plugin page has a Review tab with each release, its commit, its day in the catalog and its mark.${all.length ? ` <a href="${pluginHref(all.find((p) => p.cast) || all[0], 'review')}">See one</a>.` : ''}</p>`, { r: 'levels' });
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
        <h3 class="sect">What happens next</h3><p class="note flat">The review runs. A plugin that only shows things gets the mark <b>checked</b> by itself; any other gets <b>reviewed</b> after the maintainer reads it. <a href="/plugins/review/">How review works</a>.</p>
        <h3 class="sect">Featured</h3><p class="note flat">Set by the catalog’s maintainer, not by you.</p>`, { r: 'plugins/name.json' });
      return { html: `<div class="page p-two p-ad"><div class="col">${steps}</div><div class="col">${side}</div></div>` };
    }

    function whyView() {
      return textPage('why nerd plugins', `
        <p class="lede">A plugin runs code on your Mac. This catalog is built around what that code is allowed to do.</p>
        <div class="cells">
          ${cell('A sandbox for every plugin', `Every plugin runs in nerd’s macOS sandbox. Besides showing things in nerd and writing its own data folder, it writes only to the folders its manifest names, reaches the network only as its manifest names and speaks only for the agents it names. Reading is wider, as for any program you run: the command lines and environments of your other programs, so a key in an environment variable is readable to it, and your files except those <a href="/docs/plugins/#roles-and-authorization">the plugin guide</a> names: ${DOCS.pluginReads.html}. ${DOCS.pluginReads.otherHtml}`)}
          ${cell('You see it before you install', 'A plugin’s page shows four rooms: what it shows in nerd, your files, the network and coding agents. A room it may enter is lit and says what it may do there; the others say walled off. nerd shows the same before it installs anything, and installs nothing until you say yes.')}
          ${cell('Every release is checked', 'A plugin that only shows things is checked automatically and marked checked. Every other plugin, and any release that may do more than the one before, is read by the catalog’s maintainer and marked reviewed. <a href="/plugins/review/">How review works</a>.')}
          ${cell('Updates only on your button', 'nerd installs a plugin’s newer release only when you ask for it, and asks again when that release can do more than the one before. A release the catalog revokes is turned off, or you are warned, depending on how it was revoked.')}
        </div>
        <p>The catalog is open source, and so is every plugin in it. <a href="/plugins/add/">Add your plugin</a>, or read <a href="${CATALOG_REPO}" rel="noopener">the catalog’s repository</a>.</p>`);
    }

    function aboutView() {
      return textPage('about', `
        <h2>nerd</h2>
        <p>nerd is a terminal multiplexer for AI agents on macOS. It runs your shells and coding agents side by side in panes and tabs, and shows in a sidebar which one is working, which is waiting for you and which has finished. Panes live in a background server, so closing the window or rebooting loses neither the layout nor the pane text. <a href="${NERD_REPO}" rel="noopener">nerd on GitHub</a></p>
        <h2>This site</h2>
        <p>nerdterm.dev is made by Evgeniy Kovrov (<a href="https://github.com/nyxene" rel="noopener">github.com/nyxene</a>), a private person, as a personal, non-commercial open-source project; no money is taken. Its pages about nerd are built from nerd's own README and changelog, so they say what the repository says. The plugin catalog is built from <a href="${CATALOG_REPO}" rel="noopener">github.com/nerdterm/nerd-plugins</a> and is also published as <a href="/catalog.json">catalog.json</a>.</p>
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
      return { html: `<div class="page p-one"><div class="col">${frame('not found', `<div class="empty"><h3>${msg}</h3><p class="note">Nothing is at this address.</p><div class="row"><a class="btn" href="/plugins/all/">All plugins</a><a class="btn" href="/">Home</a></div></div>`, { cls: 'primary' })}</div></div>` };
    }

    // ---------- pages
    // a docs page is described by its first paragraph, cut at a word
    const firstPara = (html) => { const t = text((html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<[^>]+>/g, '')); return t.length > 160 ? t.slice(0, t.lastIndexOf(' ', 157)) + '…' : t; };
    function meta(rt) {
      const s = rt.seg[0] || '', n = rt.seg[1];
      if (s === '') return [TITLE_HOME, DESC_HOME];
      if (s === 'install') return ['Install · nerd', 'How to install nerd on macOS: the install command, what it needs, its limits, building from source, updating and uninstalling.'];
      if (s === 'docs') { const d = DOCNAV.find((x) => x.slug === n); return d ? [`${d.title} · nerd docs`, firstPara(d.html || '') || `${d.title}, from nerd’s documentation.`] : NOT_FOUND; }
      if (s === 'security') return ['Security · nerd', 'What leaves nerd and what does not: the server’s sandbox, every way out, what a pane and a plugin can do, and how to report a vulnerability.'];
      if (s === 'changelog') return ['Changelog · nerd', `Every release of nerd, newest first${DOCS.version ? `, ${DOCS.version} the latest` : ''}.`];
      if (s === 'catalog') return ['Plugins · nerd', 'Plugins for nerd: previews, panels, top-row text, menu commands, tree marks and hooks into coding agents, each showing what it may do before you install it.'];
      if (s === 'plugins') return ['All plugins · nerd', `All ${all.length} plugins in the nerd catalog, filtered by what they add, what they may do, their review mark and their source.`];
      if (s === 'why') return [`${PAGES.why} · nerd`, 'Why every nerd plugin runs in a sandbox, shows what it may do before you install it, and is checked on every release.'];
      if (s === 'review') return [`${PAGES.review} · nerd`, 'How the nerd plugin catalog reviews a plugin: the checks, the trial in the sandbox, the two marks, and revocation.'];
      if (s === 'add') return [`${PAGES.add} · nerd`, 'How to add your plugin to the nerd catalog: open source on GitHub, a manifest and a tag, your own check, one pull request.'];
      if (s === 'about') return ['About · nerd', 'What nerd is, who makes nerdterm.dev, and the principles of this site: no accounts, no cookies, no analytics.'];
      if (s === 'contact') return ['Contact · nerd', 'Where to ask, report a plugin or report a vulnerability: the issues of nerd and its catalog on GitHub.'];
      if (s === 'privacy') return ['Privacy · nerd', 'What nerdterm.dev keeps in your browser, what it loads, and what its host logs.'];
      if (s === 'legal') return ['Legal · nerd', 'The licences of the catalog, this site and the recordings player, who publishes them, and the names.'];
      if (s === 'plugin') {
        const p = byName(n), tab = rt.seg[2];
        if (!p) return NOT_FOUND;
        const desc = { review: `Each release of ${p.name} in the nerd catalog: its commit, its day in the catalog and its review mark.`, releases: `What each release of ${p.name} may do, version by version.`, related: `Plugins related to ${p.name}: by the same author, or adding the same things.` }[tab] || p.summary;
        return [`${p.name}${tab ? ` · ${tab}` : ''} · nerd plugins`, desc];
      }
      if (s === 'author') { const ps = authors().get(n); return ps ? [`${n} · nerd plugins`, `${plural(ps.length, 'plugin')} by ${n} in the nerd plugin catalog.`] : NOT_FOUND; }
      return NOT_FOUND;
    }
    // every page of the site and its address; a plugin's Related tab exists only when it has something to show
    function pages() {
      const list = [['/', ['']], ['/install/', ['install']], ...DOCNAV.map((d) => [`/docs/${d.slug}/`, ['docs', d.slug]]), ['/security/', ['security']], ['/changelog/', ['changelog']],
        ['/plugins/', ['catalog']], ['/plugins/all/', ['plugins']], ...['why', 'review', 'add'].map((k) => [`/plugins/${k}/`, [k]])];
      for (const p of all) {
        for (const tab of ['', 'review', 'releases', ...(relatedOf(p).n ? ['related'] : [])]) list.push([`/plugins/${p.name}/${tab ? tab + '/' : ''}`, ['plugin', p.name, ...(tab ? [tab] : [])]]);
      }
      for (const a of authors().keys()) if (a) list.push([`/authors/${a}/`, ['author', a]]);
      for (const k of FOOT) list.push([`/${k}/`, [k]]);
      return list.map(([path, seg]) => ({ path, seg }));
    }
    // a page: its main, its panel with the highlight, its title and description; page files may add views
    function page(rt) {
      S.uid = 0;
      const s = rt.seg[0] || '';
      const ext = Object.fromEntries(Object.entries(globalThis.NERD_VIEWS || {}).map(([k, f]) => [k, (r) => f(r, API)]));
      const home = (globalThis.NERD_HOMES || {}).home;
      const views = { '': (r) => home(r, API), plugins: listView, plugin: pluginView, author: authorView, review: reviewView, add: addView, why: whyView, about: aboutView, contact: contactView, privacy: privacyView, legal: legalView, ...ext };
      const out = Object.hasOwn(views, s) ? views[s](rt) : missing('This address does not exist.');
      const [title, desc] = meta(rt);
      return { html: out.html, tree: treeHtml(rt), title, desc };
    }

    const API = { missing, esc, text, fmt, fmtShort, num, plural, frame, copyBtn, cmdBox, starN, gainN, roomIcons, markIcon, roomsHtml, roomVal, netWords, install, hay, filtered, listView, resultsHtml, reviewBody, treeHtml, listHref, docHref, pluginHref, page, pages, S, KIND, ROOMS, RISKW, PAGES, FOOT, SITE, FILTERS, LIVE, all, authors, byName, DATA, DOCS, DOCNAV, INSTALL, BREW, NERD_REPO, CATALOG_REPO, THEME_KEY, RECENT_KEY, sketchHtml, GLITCH };
    return API;
  }

  globalThis.NERD_RENDER = make;
  if (typeof module !== 'undefined') module.exports = make;
})();

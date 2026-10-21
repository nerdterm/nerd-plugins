// Install, Docs, Security, Changelog: every word of them is rendered from nerd's docs at build time; the browser never loads this file.
(() => {
  const V = (globalThis.NERD_VIEWS ||= {});
  const REPO = 'https://github.com/nerdterm/nerd';
  const SCRIPT = `${REPO}/blob/master/install.sh`;

  const doc = (html) => `<div class="pg-doc">${html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (m, c) =>
    `<div class="pg-code">${m}<button class="btn" data-copy="${c.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;')}">Copy</button></div>`)}</div>`;
  // the part of a section between two of its headings
  // a heading is <h4> in a README section and <h3> in a docs/ page: the part runs to the next heading of its level or above
  const part = (html, id) => { const m = html.match(new RegExp(`<h([34]) id="${id}">`)); if (!m) return ''; const r = html.slice(html.indexOf(`</h${m[1]}>`, m.index) + 5); const n = r.search(new RegExp(`<h[2-${m[1]}][ >]`)); return n < 0 ? r : r.slice(0, n); };
  const toc = (items) => `<nav class="pg-toc" aria-label="On this page"><span class="pg-toc-t">On this page</span>${items.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>`;
  // one scrolling column of frames, the same list as a row at the top on a phone and as a column at the side on a wide screen
  const layout = (items, frames) => ({ html: `<div class="page pg"><div class="col pg-main">${items.length > 1 ? toc(items).replace('pg-toc"', 'pg-toc pg-toc-in"') : ''}${frames}</div>${items.length > 1 ? `<aside class="pg-side">${toc(items)}</aside>` : ''}</div>` });
  const link = (href, t, ext) => `<a href="${href}"${ext ? ' rel="noopener"' : ''}>${t}</a>`;

  const install = (rt, api) => {
    const D = api.DOCS, sec = (s) => D.docs.find((d) => d.slug === s).html, fr = api.frame;
    const inst = sec('installation'), cut = inst.indexOf('<pre>', inst.indexOf('</pre>'));
    const items = [['/install/', 'Install'], ['/install/#requirements', 'Requirements'], ['/install/#limitations', 'Limitations'], ['/install/#build-from-source', 'Build from source'], ['/install/#updating', 'Updating'], ['/install/#uninstall', 'Uninstall']];
    const frames =
      fr('install', `${api.cmdBox(api.INSTALL)}
        <p class="pg-line">${link(SCRIPT, 'Read the script first', 1)}. Current version: <b>${api.esc(D.version)}</b>, released ${api.esc(D.released)}; ${link('/changelog/', 'what changed')}.</p>
        ${doc(inst.slice(inst.indexOf('</pre>') + 6, cut))}`, { cls: 'primary', id: 'install', r: `nerd ${api.esc(D.version)}` }) +
      fr('requirements', doc(sec('requirements')), { id: 'requirements' }) +
      fr('limitations', doc(sec('limitations')), { id: 'limitations' }) +
      fr('build from source', doc(inst.slice(cut)), { id: 'build-from-source' }) +
      fr('updating', doc(part(sec('usage'), 'updating')), { id: 'updating' }) +
      fr('uninstall', doc(sec('uninstall')), { id: 'uninstall' }) +
      `<p class="pg-next"><span>Next</span> ${link('/docs/quick-start/', 'Quick start')}</p>`;
    return layout(items, frames);
  };

  const docs = (rt, api) => {
    const D = api.DOCS, slug = rt.seg[1] || 'quick-start', nav = api.DOCNAV, d = nav.find((x) => x.slug === slug) || D.docs.find((x) => x.slug === slug);
    if (!d) return api.missing('This page is not in the docs.');
    const i = nav.indexOf(d), prev = nav[i - 1], next = nav[i + 1], file = d.file || 'README.md';
    const items = d.subs.map((s) => [api.docHref(d, s.slug), api.esc(s.title)]);
    const pager = `<div class="pg-pager">${prev ? `<a class="prev" href="${api.docHref(prev)}"><span>Previous</span>${api.esc(prev.title)}</a>` : '<i></i>'}${next ? `<a class="next" href="${api.docHref(next)}"><span>Next</span>${api.esc(next.title)}</a>` : '<i></i>'}</div>
      <p class="pg-edit">${link(`${REPO}/edit/master/${file}`, 'Edit on GitHub', 1)}</p>`;
    return layout(items, api.frame(api.esc(d.title), doc(d.html), { cls: 'primary' }) + pager);
  };

  const security = (rt, api) => {
    const D = api.DOCS, fr = api.frame;
    const items = [['/security/', 'In short'], ['/security/#privacy', 'Privacy and security'], ['/security/#what-leaves-nerd', 'What leaves nerd'], ['/security/#what-a-program-inside-a-pane-can-do', 'What a pane can do'], ['/security/#report', 'Report a vulnerability']];
    return layout(items,
      fr('in short', `<ul class="plain pg-sum">
        <li>nerd sends no telemetry.</li>
        <li>The server runs in a macOS Seatbelt sandbox that denies the network. <code>nerd --sandbox-selftest</code> shows that the profile refuses it.</li>
        <li>${D.waysOut} The list is below.</li>
        <li>Plugins each run in a sandbox and write or reach the network only as their manifest names. Like any program you run, a plugin can read most of your files and the command lines and environments of your other programs.</li>
        <li>Programs in your panes, agents included, run as you unless their isolation says otherwise. A pane left at Everything and Open has your full access to files and the network; <b>Isolation…</b> narrows that with a sandbox of its own, a proxy for Only these providers, or another account.</li></ul>
        ${api.cmdBox('nerd --sandbox-selftest')}`, { cls: 'primary' }) +
      fr('privacy and security', doc(D.docs.find((x) => x.slug === 'privacy-and-security').html), { id: 'privacy' }) +
      fr('report a vulnerability', doc(D.security), { id: 'report' }));
  };

  const changelog = (rt, api) => {
    const D = api.DOCS;
    return { html: `<div class="page p-one"><div class="col pg-main pg-log"><p class="pg-line">Newest first. The same list is ${link(`${REPO}/blob/master/CHANGELOG.md`, 'CHANGELOG.md', 1)} in the repository.</p>${D.changelog.map((c, n) =>
      api.frame(api.esc(c.version), doc(c.html.replace(/ id="[^"]*"/g, '')), { cls: n ? '' : 'primary', r: `${api.esc(c.date)}${/^https:\/\//.test(c.compare) ? ' ' + link(api.esc(c.compare), 'compare', 1) : ''}` })).join('')}</div></div>` };
  };

  Object.assign(V, { install, docs, security, changelog });
})();

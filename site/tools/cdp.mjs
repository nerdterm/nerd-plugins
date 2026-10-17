// Headless Chrome over CDP: screenshots, console errors and measurements of a built site served at $SITE
// (default http://127.0.0.1:4110/; serve a build with `python3 site/tools/serve.py 4110 <out>`: the page loads its
// files in parallel, and Python's plain http.server drops some of them).
// node tools/cdp.mjs <url path, e.g. "?v=2#/"> [--w 1440] [--h 900] [--shot shots/x.png] [--full] [--wait 1500]
//   [--eval "js returning JSON-able"] [--theme light|dark] [--clip x,y,w,h]
// Prints console errors and the --eval result as JSON. Exits non-zero on a page error.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
const has = (k) => a.includes('--' + k);
let url = (process.env.SITE || 'http://127.0.0.1:4110/') + (a[0] && !a[0].startsWith('--') ? a[0] : '');
// theme.js reads ?theme=, which beats a saved choice and the system's
if (opt('theme')) { const u = new URL(url); u.searchParams.set('theme', opt('theme')); url = u.href; }
const W = +opt('w', 1440), H = +opt('h', 900), wait = +opt('wait', 1500);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'nsite-'));
const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`, '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const kill = () => { try { ch.kill('SIGKILL'); } catch {} };
setTimeout(() => { console.error('timeout'); kill(); process.exit(2); }, 30000);
let log = '';
const port = await new Promise((res, rej) => { ch.stderr.on('data', (d) => { log += d; const m = log.match(/ws:\/\/127\.0\.0\.1:(\d+)/); if (m) res(m[1]); }); ch.on('exit', () => rej(new Error('chrome exited'))); });
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const waits = new Map(); const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((x) => x.value ?? x.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon\.ico/.test(m.params.entry.url || '')) errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waits.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: +opt('scale', 2), mobile: false });
if (opt('theme')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opt('theme') }] });
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, wait));
const out = { url, w: W, errors };
if (opt('eval')) {
  const r = await send('Runtime.evaluate', { expression: `JSON.stringify((()=>{${opt('eval')}})())`, returnByValue: true, awaitPromise: true });
  out.eval = r.result?.result?.value ? JSON.parse(r.result.result.value) : r.result?.exceptionDetails?.exception?.description;
}
if (opt('shot')) {
  const p = { format: 'png' };
  if (opt('clip')) { const [x, y, w, h] = opt('clip').split(',').map(Number); p.clip = { x, y, width: w, height: h, scale: 1 }; }
  if (has('full')) { const m = await send('Page.getLayoutMetrics'); const c = m.result.cssContentSize; p.clip = { x: 0, y: 0, width: W, height: Math.min(c.height, 8000), scale: 1 }; p.captureBeyondViewport = true; }
  const r = await send('Page.captureScreenshot', p);
  fs.writeFileSync(opt('shot'), Buffer.from(r.result.data, 'base64'));
}
console.log(JSON.stringify(out, null, 1));
ws.close(); kill(); // the profile stays in the OS temp folder, which macOS clears
process.exit(errors.length ? 1 : 0);

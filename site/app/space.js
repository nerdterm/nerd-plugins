// Very wide screens: the window stays at the left; the room on the right is space in a Y2K way.
// A wireframe planet with an orbit, a field of pixel stars and four-point sparkles, a perspective grid
// running to the horizon, and a few small terminal windows drifting. Drawn on one canvas, in nerd's palette.
(() => {
  const cv = document.createElement('canvas');
  cv.id = 'space';
  cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const x = cv.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  let W = 0, H = 0, dpr = 1, stars = [], sparks = [], terms = [], raf = 0, t0 = performance.now();

  // a new sky on every visit; a resize keeps the same one
  const SKY = 1 + Math.floor(Math.random() * 2147483645);
  let seed = SKY;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgba = (hex, a) => {
    const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  };

  const SCENE = {};
  const LINES = [
    ['catalog', ['plugins for nerd', 'checked ✓  reviewed ◉', 'shells · agents · you']],
    ['sandbox', ['shows      ● may enter', 'network    ○ walled off', 'agents     ○ walled off']],
    ['nerd 1', ['$ nerd --plugin-add <url>', 'fetching… checked ✓', 'shows what it may do']],
    ['agents', ['claude  ● needs you', 'codex   ● thinking', 'shell   ○ idle']],
    ['world', ['> world control', '> for your terminal', '> you decide_']],
  ];

  function layout() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    cv.width = W * dpr; cv.height = H * dpr;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed = SKY;
    // the planet's place, size and orbit, and which terminals show, are drawn from this visit's sky
    SCENE.cx = W * (.38 + rnd() * .32); SCENE.cy = H * (.28 + rnd() * .2); SCENE.R = Math.min(W * (.14 + rnd() * .1), H * (.13 + rnd() * .09));
    SCENE.tilt = (rnd() - .5) * .9; SCENE.orb = 1.45 + rnd() * .55; SCENE.speed = (rnd() < .5 ? -1 : 1) * (.00025 + rnd() * .0002);
    SCENE.lines = [...LINES].sort(() => rnd() - .5);
    stars = Array.from({ length: Math.round((W * H) / 2600) }, () => ({ x: rnd() * W, y: rnd() * H * .74, s: rnd() < .12 ? 2 : 1, p: rnd() * 6.28, k: .4 + rnd() * .9 }));
    sparks = Array.from({ length: Math.max(3, Math.round(W / 180)) }, () => ({ x: rnd() * W, y: rnd() * H * .66, r: 5 + rnd() * 9, p: rnd() * 6.28, c: rnd() < .5 ? '--accent' : '--teal' }));
    // terminals stand in the corners left free by the planet and its orbit; one that would cover them is left out
    const R = SCENE.R, cx = SCENE.cx, cy = SCENE.cy, box = [cx - R * (SCENE.orb + .1), cy - R * 1.05, cx + R * (SCENE.orb + .1), cy + R * 1.05];
    const spots = [[W * .05, H * .07], [W * .05, H * .6], [W - 240, H * .6], [W - 240, H * .07]];
    const free = spots.filter(([sx, sy]) => sx >= 8 && (sx + 220 < box[0] || sx > box[2] || sy + 84 < box[1] || sy > box[3]));
    terms = SCENE.lines.slice(0, free.length).map(([title, lines], i) => ({ title, lines, x: free[i][0], y: free[i][1], p: rnd() * 6.28 }));
  }

  function star4(cx, cy, r, col, a) {
    x.strokeStyle = rgba(col, a); x.lineWidth = 1;
    x.beginPath(); x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r); x.stroke();
    x.beginPath(); x.moveTo(cx - r * .3, cy - r * .3); x.lineTo(cx + r * .3, cy + r * .3); x.moveTo(cx + r * .3, cy - r * .3); x.lineTo(cx - r * .3, cy + r * .3); x.stroke();
    x.fillStyle = rgba(col, a); x.fillRect(cx - 1, cy - 1, 2, 2);
  }

  function planet(cx, cy, R, t, acc, line) {
    // latitudes
    x.lineWidth = 1;
    for (let k = -3; k <= 3; k++) {
      const yy = cy + (k / 4) * R, rx = R * Math.sqrt(1 - (k / 4) ** 2);
      x.strokeStyle = rgba(line, .55); x.beginPath(); x.ellipse(cx, yy, rx, rx * .18, 0, 0, Math.PI * 2); x.stroke();
    }
    // meridians turn slowly
    for (let k = 0; k < 6; k++) {
      const ph = (k / 6) * Math.PI + t * .00012, rx = Math.abs(Math.cos(ph)) * R;
      x.strokeStyle = rgba(line, .55); x.beginPath(); x.ellipse(cx, cy, rx, R, 0, 0, Math.PI * 2); x.stroke();
    }
    x.strokeStyle = rgba(acc, .75); x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    // a tilted orbit and its satellite
    const tilt = SCENE.tilt, orx = R * SCENE.orb, ory = R * .42;
    x.strokeStyle = rgba(acc, .55); x.lineWidth = 1; x.beginPath(); x.ellipse(cx, cy, orx, ory, tilt, 0, Math.PI * 2); x.stroke();
    const a = t * SCENE.speed, sx = orx * Math.cos(a), sy = ory * Math.sin(a);
    const px = cx + sx * Math.cos(tilt) - sy * Math.sin(tilt), py = cy + sx * Math.sin(tilt) + sy * Math.cos(tilt);
    x.fillStyle = rgba(acc, .95); x.fillRect(px - 3, py - 3, 6, 6);
  }

  function floor(t, acc) {
    const hz = H * .74, vx = W * .5;
    x.strokeStyle = rgba(acc, .5); x.lineWidth = 1; x.beginPath(); x.moveTo(0, hz); x.lineTo(W, hz); x.stroke();
    for (let k = -14; k <= 14; k++) { x.strokeStyle = rgba(acc, .18); x.beginPath(); x.moveTo(vx, hz); x.lineTo(vx + k * W * .16, H); x.stroke(); }
    const shift = (t * .00006) % 1;
    for (let k = 0; k < 14; k++) {
      const d = (k + shift) / 14, y = hz + (H - hz) * d * d;
      x.strokeStyle = rgba(acc, .1 + .25 * d); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke();
    }
  }

  function terminal(o, t, line, text, acc, ground) {
    const w = 210, h = 74, bob = Math.sin(t * .0006 + o.p) * 6, X = Math.round(o.x), Y = Math.round(o.y + bob);
    x.fillStyle = rgba(ground, .9); x.fillRect(X, Y, w, h);
    x.strokeStyle = rgba(line, .9); x.lineWidth = 1; x.strokeRect(X + .5, Y + .5, w, h);
    x.font = '11px ui-monospace, "SF Mono", Menlo, monospace'; x.textBaseline = 'middle';
    const tw = x.measureText(o.title).width;
    x.fillStyle = rgba(ground, 1); x.fillRect(X + 8, Y - 1, tw + 8, 3);
    x.fillStyle = rgba(acc, .9); x.fillText(o.title, X + 12, Y + 1);
    o.lines.forEach((l, i) => { x.fillStyle = rgba(i === 0 ? text : line, i === 0 ? .85 : .95); x.fillText(l, X + 10, Y + 22 + i * 16); });
  }

  function draw(t) {
    if (!W) return;
    const acc = css('--accent'), teal = css('--teal'), line = css('--slab'), text = css('--text'), ground = css('--ground');
    x.clearRect(0, 0, W, H);
    for (const s of stars) { x.fillStyle = rgba(text, (.25 + .35 * Math.sin(t * .0015 * s.k + s.p) ** 2)); x.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s); }
    floor(t, acc);
    planet(SCENE.cx, SCENE.cy, SCENE.R, t, acc, line);
    for (const s of sparks) star4(s.x, s.y, s.r * (.75 + .25 * Math.sin(t * .002 + s.p)), css(s.c), .8);
    for (const o of terms) if (o.x + 220 < W) terminal(o, t, line, text, acc, ground);
  }

  function frame(now) { draw(now - t0); raf = still.matches || document.hidden ? 0 : requestAnimationFrame(frame); }
  function start() { cancelAnimationFrame(raf); layout(); draw(1000); if (!still.matches && W > 1) raf = requestAnimationFrame(frame); }

  addEventListener('resize', start);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  still.addEventListener('change', start);
  new MutationObserver(() => draw(performance.now() - t0)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  start();
})();

// The theme before the first paint: ?theme=light|dark, else the saved choice, else the system's. Nothing else is read or kept.
(function () {
  // A hash route from the site's first weeks is its page's file now: /x/, a plugin under /plugins/, an author under /authors/.
  var old = location.hash.match(/^#\/([^?#]*)(\?[^#]*)?(#.*)?$/);
  if (old) {
    var p = old[1].replace(/\/$/, '').replace(/^plugin\//, 'plugins/').replace(/^author\//, 'authors/');
    location.replace('/' + (p ? p + '/' : '') + (old[2] || '') + (old[3] || ''));
  }
  var pref = new URLSearchParams(location.search).get('theme'), h = document.documentElement;
  try { pref = pref || localStorage.getItem('nerd-plugins-theme'); } catch (e) {}
  if (pref !== 'light' && pref !== 'dark') pref = 'system';
  // Framed by another site, the page stays hidden: its Copy buttons must not be clicked through someone else's page.
  try { if (top !== self && top.location.origin !== location.origin) throw 0; } catch (e) { h.hidden = true; }
  h.dataset.pref = pref;
  h.dataset.theme = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
})();

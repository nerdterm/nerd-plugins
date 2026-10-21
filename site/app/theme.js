// The theme before the first paint: ?theme=light|dark, else the saved choice, else the system's. Nothing else is read or kept.
(function () {
  // A hash route from the site's first weeks is its page's file now: /x/, a plugin under /plugins/, an author under /authors/.
  var old = location.hash.match(/^#\/([^?#]*)(\?[^#]*)?(#.*)?$/);
  if (old) {
    var p = old[1].replace(/\/$/, '').replace(/^plugin\//, 'plugins/').replace(/^author\//, 'authors/');
    // only this site's own pages: a hash with a second slash or a backslash would otherwise name another site
    var to = new URL('/' + (p ? p + '/' : '') + (old[2] || '') + (old[3] || ''), location.href);
    if (to.origin === location.origin && /^\/[a-z0-9._\/-]*$/i.test(to.pathname)) location.replace(to.href);
  }
  var pref = new URLSearchParams(location.search).get('theme'), h = document.documentElement;
  try { pref = pref || localStorage.getItem('nerd-plugins-theme'); } catch (e) {}
  if (pref !== 'light' && pref !== 'dark') pref = 'system';
  // Framed by another site, the page stays hidden: its Copy buttons must not be clicked through someone else's page.
  try { if (top !== self && top.location.origin !== location.origin) throw 0; } catch (e) { h.hidden = true; }
  h.dataset.pref = pref;
  // the panel the visitor was in on the last page is drawn focused from the first paint (app.js takes it over)
  try { if (JSON.parse(sessionStorage.getItem('nerd-site-panel') || '{}').tree) h.dataset.panel = 'tree'; } catch (e) {}
  h.dataset.theme = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
})();

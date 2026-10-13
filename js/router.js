// router.js: draws the page for the current address; loaded last, it starts the app
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- router ----------
function route() {
  trackNav(); deferTrack = false;
  const p = location.hash.replace(/^#\/?/, '').split('/');
  const html = (ROUTES.get(p[0]) || viewMissing)(p);
  app.innerHTML = `<div class="fadein">${html}</div>`;
  if (!deferTrack) UNMAPPED = null;     // keep the flag across the loading placeholder
  if (p[0] !== 'cta' && !deferTrack) trackView(routePath(p), (document.querySelector('#app h1') || {}).textContent || 'Kingdom Code Source Index');
  while (pendingEvents.length) { const [n, k] = pendingEvents.shift(); track(n, k); }
  window.scrollTo(0, 0);
  PAGE_HOOKS.forEach(fn => fn(p));     // each feature wires up its own forms and buttons (see onPage)
}
window.addEventListener('hashchange', route);
initAnalytics();
try { if (standalone() && !sessionStorage.getItem('kc-app-open')) { sessionStorage.setItem('kc-app-open', '1'); track('app/open'); } } catch (e) {}
route();

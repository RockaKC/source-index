// router.js: draws the page for the current address; loaded last, it starts the app
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- router ----------
let firstRoute = true;
function route() {
  trackNav(); deferTrack = false;
  const p = curHash().replace(/^#\/?/, '').split('/');
  const html = (ROUTES.get(p[0]) || viewMissing)(p);
  // The app's first page is already there when the launch screen fades away, so it takes no entrance of its own; every later page does.
  const enter = firstRoute && (PROFILE.id === 'app' || app.dataset.pre) ? '' : 'fadein';   // a page the server already drew is not drawn again with an entrance
  firstRoute = false;
  app.innerHTML = `<div class="${enter}">${html}</div>`;
  if (!deferTrack) UNMAPPED = null;     // keep the flag across the loading placeholder
  if (p[0] !== 'cta' && !deferTrack) trackView(routePath(p), (document.querySelector('#app h1') || {}).textContent || PROFILE.name);
  while (pendingEvents.length) { const [n, k] = pendingEvents.shift(); track(n, k); }
  delete app.dataset.pre;
  cleanLinks(app);
  if (!deferTrack) applySeo(p);
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event('kcroute'));
  PAGE_HOOKS.forEach(fn => fn(p));     // each feature wires up its own forms and buttons (see onPage)
}
if (!CLEAN) window.addEventListener('hashchange', route);
initAnalytics();
try { if (standalone() && !sessionStorage.getItem('kc-app-open')) { sessionStorage.setItem('kc-app-open', '1'); track('app/open'); } } catch (e) {}
route();

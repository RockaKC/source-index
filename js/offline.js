// offline.js: the installable app and offline reading
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- installable app and offline reading ----------
const swOK = 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const OFFLINE_CACHE = 'kc-books-v2';           // the same cache sw.js keeps Bible text in
let installPrompt = null;
if (swOK) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; const b = document.getElementById('install'); if (b) b.hidden = false; });
window.addEventListener('appinstalled', () => { installPrompt = null; track('app/installed'); const b = document.getElementById('install'); if (b) b.hidden = true; });
async function savedBooks() { try { return (await (await caches.open(OFFLINE_CACHE)).keys()).length; } catch (e) { return 0; } }
async function saveOffline(btn, stat) {         // fetch every book once, so the whole Bible reads without a connection
  btn.disabled = true;
  try {
    const cache = await caches.open(OFFLINE_CACHE), ids = D.order.slice(), total = ids.length; let done = 0;
    const worker = async () => {
      while (ids.length) {
        const url = bookUrl(ids.shift());
        if (!(await cache.match(url))) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); await cache.put(url, r); }
        stat.textContent = `Saving ${++done} of ${total}\u2026`;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    stat.textContent = 'Saved. The whole Bible now opens without a connection.'; track('offline/saved');
  } catch (e) { stat.textContent = 'Could not finish saving. Check your connection and try again.'; btn.disabled = false; }
}
async function initOffline() {                  // runs after the About page is drawn
  const stat = document.getElementById('offstat'), ins = document.getElementById('install');
  if (ins && installPrompt) ins.hidden = false;
  if (stat && (await savedBooks()) >= D.order.length) stat.textContent = 'Saved. The whole Bible opens without a connection.';
}
document.addEventListener('click', e => {
  const t = e.target.closest('#install, #offline'); if (!t) return;
  if (t.id === 'offline') saveOffline(t, document.getElementById('offstat'));
  else if (installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; t.hidden = true; }); }
});

onPage(p => { if (p[0] === 'about') initOffline(); });

/* Service worker for the Kingdom Code Source Index.
   Lets the site open without a connection and keeps Bible text a reader has opened.
   Pages: network first, so a reader online always gets the current site; the last copy is the offline fallback.
   Bible text (bible/<book id>.json): served from the saved copy at once, refreshed in the background.
   Everything on another origin (analytics, Ko-fi) is left alone.
   Bump SHELL when the caching rules below change. BOOKS is also used by the page's "Save for offline" button. */
const SHELL = 'kc-shell-v2';
const BOOKS = 'kc-books-v1';
const PRECACHE = ['./', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kc-') && k !== SHELL && k !== BOOKS).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

const root = () => new URL('./', self.registration.scope).href;

async function page(request) {                       // network first; the saved copy only when offline
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(root(), res.clone());
    return res;
  } catch (err) {
    return (await cache.match(root())) || Response.error();
  }
}

async function saved(request, name) {                // saved copy first, refreshed in the background
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(res => { if (res.ok) cache.put(request, res.clone()); return res; });
  if (hit) { refresh.catch(() => {}); return hit; }
  return refresh;
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
  if (/\/bible\/\d+\.json$/.test(url.pathname)) { e.respondWith(saved(req, BOOKS)); return; }
  if (/\/(icons\/|manifest\.webmanifest$)/.test(url.pathname)) e.respondWith(saved(req, SHELL));
});

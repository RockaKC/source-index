/* Service worker for the Kingdom Code Source Index.
   Lets the site open without a connection and keeps Bible text a reader has opened.
   Pages: network first, so a reader online always gets the current site; the last copy of each page (index.html
   under ./, app.html under its own address) is the offline fallback.
   The page's own files (profiles/*.js, data/site.js, js/*.js, css/*.css): network first, like pages; one saved copy of each,
   kept under its plain address whatever its ?v= stamp.
   Bible text (bible/<translation>/<book id>.json) and essay text (essay-text/<id>.json): served from the saved copy at once,
   refreshed in the background, so an essay already read opens offline.
   Everything on another origin (analytics, Ko-fi) is left alone.
   Bump SHELL when the caching rules below change. */
const SHELL = 'kc-shell-v10';
const BOOKS = 'kc-books-v2';
const PRECACHE = ['./', 'profiles/site.js', 'data/site.js', 'css/site.css',
  'js/core.js', 'js/text.js', 'js/words.js', 'js/essays.js', 'js/search.js', 'js/reader.js', 'js/readerbar.js', 'js/marks.js', 'js/backup.js', 'js/guide.js',
  'js/pages.js', 'js/updates.js', 'js/analytics.js', 'js/chrome.js', 'js/offline.js', 'js/router.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'img/translations-tier-list.webp', 'img/app-icon.webp', 'img/guides/the-ungovernable-mind.webp'];

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

function pageKey(request) {                          // each page under its own address, without ?query or #hash
  const url = new URL(request.url);
  url.search = ''; url.hash = '';
  return /\/index\.html$/.test(url.pathname) ? root() : url.href;
}

async function page(request) {                       // network first; the saved copy only when offline
  const cache = await caches.open(SHELL), key = pageKey(request);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(key)) || (await cache.match(root())) || Response.error();
  }
}

async function asset(request) {                      // network first; one saved copy per file whatever its ?v= stamp
  const cache = await caches.open(SHELL), url = new URL(request.url);
  url.search = '';
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(url.href, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(url.href)) || Response.error();
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
  if (/\/(data\/site\.js|(js|profiles)\/[\w-]+\.js|css\/[\w-]+\.css)$/.test(url.pathname)) { e.respondWith(asset(req)); return; }
  if (/\/(bible\/[a-z]+|essay-text)\/\d+\.json$/.test(url.pathname)) { e.respondWith(saved(req, BOOKS)); return; }
  if (/\/(icons\/|manifest\.webmanifest$)/.test(url.pathname)) e.respondWith(saved(req, SHELL));
});

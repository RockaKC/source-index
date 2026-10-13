// offline.js: offline reading on the website, and knowing when the page runs inside the Android app
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- offline reading ----------
// On the website, sw.js keeps the site and every chapter a reader opens, so they open again without a connection.
// The Android app carries every file on the phone already, so it needs no worker. The app is offered on #/app (pages.js).
const native = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());   // inside the Android app
const swOK = !native && 'serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname));
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
if (swOK) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
window.addEventListener('beforeinstallprompt', e => e.preventDefault());   // no browser install banner: the Android app is the one offered
window.addEventListener('appinstalled', () => track('app/installed'));

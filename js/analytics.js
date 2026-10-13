// analytics.js: cookieless visit counts
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- analytics: cookieless visit counts, off until a site is set ----------
// provider 'goatcounter' (site = your GoatCounter code) or 'umami' (site = website id). Blank = off.
// Counts only on the live domain, and never when the browser sends Do Not Track or Global Privacy Control.
const ANALYTICS = {provider: 'goatcounter', site: 'rocka', hosts: ['sources.kingdomcodearchive.com']};
let analyticsOn = false;
const analyticsQueue = [];
function initAnalytics() {
  const A = ANALYTICS;
  if (!PROFILE.analytics) return;
  if (!A.provider || !A.site || !A.hosts.includes(location.hostname)) return;
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  const s = document.createElement('script');
  s.async = true;
  if (A.provider === 'goatcounter') {
    s.setAttribute('data-goatcounter', `https://${A.site}.goatcounter.com/count`);
    s.setAttribute('data-goatcounter-settings', '{"no_onload":true}');
    s.src = 'https://gc.zgo.at/count.js';
  } else if (A.provider === 'umami') {
    s.defer = true; s.src = 'https://cloud.umami.is/script.js';
    s.setAttribute('data-website-id', A.site); s.setAttribute('data-auto-track', 'false');
  } else return;
  s.onload = flushAnalytics;
  s.onerror = () => { analyticsOn = false; analyticsQueue.length = 0; };
  analyticsOn = true;
  document.head.appendChild(s);
}
function flushAnalytics() {
  const gc = ANALYTICS.provider === 'goatcounter' && window.goatcounter && window.goatcounter.count;
  const um = ANALYTICS.provider === 'umami' && window.umami && window.umami.track;
  if (!gc && !um) return;
  while (analyticsQueue.length) {
    const e = analyticsQueue.shift();
    if (gc) window.goatcounter.count({path: e.path, title: e.title, event: e.event});
    else if (e.event) window.umami.track(e.name, {key: e.key, label: e.label});
    else window.umami.track(p => Object.assign({}, p, {url: e.path, title: e.title}));
  }
}
function queueAnalytics(e) { if (analyticsOn && analyticsQueue.length < 100) { analyticsQueue.push(e); flushAnalytics(); } }
const trackView = (path, title) => queueAnalytics({path, title, event: false});
const track = (name, key, label) => queueAnalytics({path: key ? name + '/' + key : name, title: label || key || name, event: true, name, key, label});
function routePath(p) {               // readable page names for the visit report
  const nm = b => (D.books[b] ? bname(b) : b);
  if (p[0] === 'verse') return `/verse/${nm(+p[1])}/${p[2]}/${p[3]}`;
  if (p[0] === 'range') return `/range/${nm(+p[1])}/${p[2]}/${p[3]}-${p[4]}`;
  if (p[0] === 'read') return `/read/${nm(+p[1])}/${p[2]}`;
  if (p[0] === 'book') { const e = entryOf(+p[1]); return '/book/' + (e ? e.name : p[1]); }
  if (p[0] === 'search') return '/search';   // the words typed are logged only when nothing was found
  return '/' + p.filter(Boolean).join('/');
}
document.addEventListener('click', e => {   // clicks that leave the site: essays, Patreon, Substack, Ko-fi, email
  if (!analyticsOn) return;
  const a = e.target.closest('a[href]'); if (!a) return;
  const href = a.getAttribute('href') || '';
  if (/^mailto:/i.test(href)) { track('click/contact'); return; }
  if (!/^https?:/i.test(href)) return;
  const where = a.closest('#menu') ? 'menu' : 'page';
  if (a.dataset.pid) track('click/essay', a.dataset.pid, (a.getAttribute('aria-label') || a.textContent || '').replace(/^Read the essay:\s*/, '').trim().slice(0, 80));
  else if (/patreon\.com$/.test(a.hostname)) track('click/patreon', where);
  else if (/substack\.com$/.test(a.hostname)) track('click/substack', where);
  else if (/ko-fi\.com$/.test(a.hostname)) track('click/kofi', where);
});

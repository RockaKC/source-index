// urls.js: the website's permanent addresses (/bible/john/3/16/), and the bridge to the page names the router uses (#/verse/…)
// Loaded as a plain script after js/core.js; see index.html for the order. Shared names live in the page's global scope.
// Only the website (PROFILE.cleanUrls) uses clean addresses. The Android app has no server, so it keeps the '#/…' form.
// An old '#/…' address still opens the right page and is tidied to its clean address the moment it loads.

const CLEAN = !!PROFILE.cleanUrls;
const SITE_ORIGIN = PROFILE.origin || location.origin;

const slugOf = s => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const BOOK_SLUG = {}, SLUG_BOOK = {}, ENTRY_SLUG = {}, SLUG_ENTRY = {};
Object.keys(D.books).forEach(b => { BOOK_SLUG[b] = slugOf(D.books[b][0]); SLUG_BOOK[BOOK_SLUG[b]] = +b; });
D.entries.forEach(e => { ENTRY_SLUG[e.id] = slugOf(e.name); SLUG_ENTRY[ENTRY_SLUG[e.id]] = e.id; });
const essaySlug = pid => {                       // the essay's number, then its title cut at a whole word
  const s = slugOf((P[pid] && P[pid][0]) || ''), cut = s.length > 70 ? s.slice(0, 70).replace(/-[^-]*$/, '') : s;
  return pid + '-' + cut;
};

const SIMPLE = {books: 'bible', english: 'english', words: 'words', names: 'names', guide: 'guides', guides: 'guides/kingdom-code',
  translations: 'translations', essays: 'essays', kc: 'questions', about: 'about', app: 'app', credits: 'credits'};
const SIMPLE_BACK = {};
Object.keys(SIMPLE).forEach(k => { SIMPLE_BACK[SIMPLE[k]] = k; });

// '#/verse/1/3/16' -> '/bible/genesis/3/16/'; null for a page that has no clean address (it stays '#/…')
function pathOf(hash) {
  const p = String(hash).replace(/^#\/?/, '').split('/'), a = p[0];
  const tail = q => '/' + q.join('/') + '/';
  if (a === '') return '/';
  if (SIMPLE[a] && p.length === 1) return tail(SIMPLE[a].split('/'));
  if (a === 'book' && ENTRY_SLUG[p[1]]) return tail(['bible', ENTRY_SLUG[p[1]]]);
  if (a === 'read' && BOOK_SLUG[p[1]] && +p[2]) return tail(['bible', BOOK_SLUG[p[1]], +p[2]]) + (p[3] ? '?v=' + encodeURIComponent(p[3]) : '');
  if (a === 'verse' && BOOK_SLUG[p[1]] && +p[2] && +p[3]) return tail(['bible', BOOK_SLUG[p[1]], +p[2], +p[3]]);
  if (a === 'range' && BOOK_SLUG[p[1]] && +p[2] && +p[3] && +p[4]) return tail(['bible', BOOK_SLUG[p[1]], +p[2], p[3] + '-' + p[4]]);
  if (a === 'word' && p[1]) return tail(['words', p[1]]);
  if (a === 'person' && p[1]) return tail(['names', p[1]]);
  if (a === 'guides' && p[1]) return tail(['guides', 'kingdom-code', p[1]]);
  if (a === 'essay' && P[p[1]]) return tail(['essays', essaySlug(p[1])]);
  if (a === 'path' && p[1]) return tail(['questions', p[1]]);
  if (a === 'search') return tail(['search', encodeURIComponent(decodeURIComponent(p.slice(1).join('/')))]);
  if (a === 'cta') return tail(['cta', encodeURIComponent(decodeURIComponent(p.slice(1).join('/')))]);
  return null;
}

// '/bible/genesis/3/16/' -> '#/verse/1/3/16'; '#/missing' for an address that is no page of the site
function hashOf(path, search) {
  const s = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
  const [a, b, c, d] = s, none = '#/missing';
  if (!a || (s.length === 1 && a === 'index.html')) return '#/';
  if (a === 'bible') {
    if (s.length === 1) return '#/books';
    if (s.length === 2) return SLUG_ENTRY[b] ? '#/book/' + SLUG_ENTRY[b] : SLUG_BOOK[b] ? '#/book/' + D.bookEntry[SLUG_BOOK[b]] : none;
    const bk = SLUG_BOOK[b];
    if (!bk || !/^\d+$/.test(c)) return none;
    if (s.length === 3) { const v = new URLSearchParams(search || '').get('v'); return '#/read/' + bk + '/' + c + (v ? '/' + v : ''); }
    if (s.length === 4 && /^\d+$/.test(d)) return '#/verse/' + bk + '/' + c + '/' + d;
    const m = s.length === 4 && /^(\d+)-(\d+)$/.exec(d);
    return m ? '#/range/' + bk + '/' + c + '/' + m[1] + '/' + m[2] : none;
  }
  if (a === 'guides' && b === 'kingdom-code') return s.length === 2 ? '#/guides' : s.length === 3 ? '#/guides/' + c : none;
  const joined = s.join('/');
  if (SIMPLE_BACK[joined]) return '#/' + SIMPLE_BACK[joined];
  if (s.length === 2 && a === 'words') return '#/word/' + b;
  if (s.length === 2 && a === 'names') return '#/person/' + b;
  if (s.length === 2 && a === 'questions') return '#/path/' + b;
  if (s.length === 2 && a === 'essays') { const id = /^\d+/.exec(b); return id ? '#/essay/' + id[0] : none; }
  if (a === 'search' && s.length >= 2) return '#/search/' + encodeURIComponent(s.slice(1).join('/'));
  if (a === 'cta' && s.length >= 2) return '#/cta/' + encodeURIComponent(s.slice(1).join('/'));
  return none;
}

// The page being shown, as the router's '#/…' name, whichever form the address is in.
function curHash() {
  if (!CLEAN) return location.hash;
  if (/^#\/./.test(location.hash)) return location.hash;      // an old address, until it is tidied
  return hashOf(location.pathname, location.search);
}
const hrefOf = hash => (CLEAN && pathOf(hash)) || hash;            // the address a link to this page should carry
const absUrl = hash => (CLEAN && pathOf(hash)) ? SITE_ORIGIN + pathOf(hash) : BASE + hash;   // a full address, for copying out of the site

// Go to a page (navigate): the clean address on the website, the hash in the app.
function navigate(hash) {
  const path = CLEAN && pathOf(hash);
  if (!path) { location.hash = hash; return; }
  if (path === location.pathname + location.search) { route(); return; }
  history.pushState({}, '', path);
  route();
}

// Links the views write as '#/…' are given their clean address after each page is drawn (what a search engine reads), and a click on
// any of them goes through navigate() without a page load.
function cleanLinks(root) {
  if (!CLEAN) return;
  root.querySelectorAll('a[href^="#/"]').forEach(a => { const p = pathOf(a.getAttribute('href')); if (p) a.setAttribute('href', p); });
}
if (CLEAN) {
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const h = a.getAttribute('href');
    if (/^#\/./.test(h)) { e.preventDefault(); navigate(h); return; }
    if (h.startsWith('/') && !h.startsWith('//')) {
      const u = new URL(h, location.href), hash = hashOf(u.pathname, u.search);
      if (hash !== '#/missing' || u.pathname === '/missing/') { e.preventDefault(); navigate(hash); }
    }
  });
  window.addEventListener('popstate', () => route());
  window.addEventListener('hashchange', () => {       // an old '#/…' address typed or followed: tidy it, then draw it
    const h = location.hash, p = /^#\/./.test(h) && pathOf(h);
    if (p) history.replaceState(history.state, '', p);
    route();
  });
  { const h = location.hash, p = /^#\/./.test(h) && pathOf(h); if (p) history.replaceState(history.state, '', p); }
}

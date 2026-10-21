// core.js: shared helpers, local storage, the Back link, and the route registry every feature adds its pages to
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

const app = document.getElementById('app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bname = b => D.books[b][0];
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const PLAT = {substack:'Substack', patreon:'Patreon'};
const TRANS = {LXX:'Septuagint', BLB:'Berean Literal Bible', CHARLES:'R. H. Charles', REF:'Reference'};
const fmtDate = d => d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : '';
const BASE = PROFILE.cleanUrls ? (PROFILE.origin || location.origin) + '/' : location.origin + location.pathname;
const P = D.pieces, entryOf = id => D.entries.find(e => e.id === id);

const hasVerse = (b, ch, v) => !!(D.verses[b] && D.verses[b][ch] && D.verses[b][ch][v]);
// Where a link to Scripture goes. On the website only a verse that essays cite has a page of its own saved at its address (tools/prerender.js
// writes no other verse and no passage), so a link to anything else opens its chapter at that verse, which is a saved page too. The app keeps the verse and passage pages.
function scriptureHash([b, ch, vs, ve]) {
  const verse = `#/verse/${b}/${ch}/${vs}`, passage = ve > vs;
  if (!PROFILE.cleanUrls || (!passage && hasVerse(b, ch, vs))) return passage ? `#/range/${b}/${ch}/${vs}/${ve}` : verse;
  return hasChapter(b, ch) ? `#/read/${b}/${ch}/${vs}` : passage ? `#/range/${b}/${ch}/${vs}/${ve}` : verse;
}
const vrefLabel = ([b,ch,vs,ve]) => `${bname(b)} ${ch}:${vs}${ve > vs ? '\u2013' + ve : ''}`;

const MEM = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return MEM[k] || null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { MEM[k] = v; } }
};

const pendingEvents = [];            // [name, key] pairs views leave for route() to send after the page is drawn

const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const backLink = href => `<a class="back" href="${href}" data-back>${BACK_ICON}Back</a>`;
let navIdx = -1;                      // how many pages deep the reader is inside the site (0 = the page they landed on)
function trackNav() {                 // new visits get the next number; back and forward restore the number saved with the entry
  const st = history.state;
  if (st && typeof st.i === 'number') navIdx = st.i;
  else { navIdx += 1; try { history.replaceState({i: navIdx}, '', location.href); } catch (e) {} }
}
document.addEventListener('click', e => {   // Back goes to the previous page; a reader who landed here directly goes to the parent page instead
  const a = e.target.closest('[data-back]');
  if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (navIdx > 0) { e.preventDefault(); history.back(); }
});

// ---------- route registry ----------
// Each feature file registers its pages and any wiring its pages need after they are drawn:
//   addRoute('read', p => viewRead(+p[1], +p[2], p[3]));   // p = the address split on '/', p[0] = the first part
//   onPage(p => { ... });                                     // runs after every page is drawn
const ROUTES = new Map(), PAGE_HOOKS = [];
function addRoute(name, view) {
  if (ROUTES.has(name)) throw new Error('route registered twice: ' + name);
  ROUTES.set(name, view);
}
const onPage = fn => { PAGE_HOOKS.push(fn); };

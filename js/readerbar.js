// readerbar.js: the app's reading bar (top), reading toolbar (bottom) and reading history
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.
// Everything here is switched on by PROFILE.readerTools (profiles/app.js) and works only where the page has the markup
// (#readbar and #readtools in app.html), so the website is untouched.

// ---------- reading history ----------
// The chapters a reader has opened, newest first, kept on the phone (localStorage 'kc-history'): [[book id, chapter, time], ...].
const HISTORY_MAX = 100;
function readHistory() {
  try {
    const h = JSON.parse(store.get('kc-history') || '[]');
    return Array.isArray(h) ? h.filter(x => Array.isArray(x) && hasChapter(x[0], x[1])) : [];
  } catch (e) { return []; }
}
function noteRead(b, ch) {
  const h = readHistory().filter(x => !(x[0] === b && x[1] === ch));
  h.unshift([b, ch, Date.now()]);
  store.set('kc-history', JSON.stringify(h.slice(0, HISTORY_MAX)));
}

// ---------- the trail: this visit's chapters, for the toolbar's back and forward ----------
const TRAIL = {list: [], i: -1};
function noteTrail(b, ch) {
  const cur = TRAIL.list[TRAIL.i];
  if (cur && cur[0] === b && cur[1] === ch) return;     // also what a toolbar move lands on: its index is already set
  TRAIL.list = TRAIL.list.slice(0, TRAIL.i + 1);        // a new chapter after going back drops what was ahead
  TRAIL.list.push([b, ch]);
  if (TRAIL.list.length > 50) TRAIL.list.shift();
  TRAIL.i = TRAIL.list.length - 1;
}
function trailGo(dir) {
  const n = TRAIL.list[TRAIL.i + dir];
  if (!n) return;
  TRAIL.i += dir;
  navigate(`#/read/${n[0]}/${n[1]}`);
}

// ---------- the bar and the toolbar ----------
const readbar = document.getElementById('readbar'), readtools = document.getElementById('readtools');
function showReadBar(p) {
  if (!readbar || !readtools) return;
  const b = +p[1], ch = +p[2], on = PROFILE.readerTools && p[0] === 'read' && hasChapter(b, ch);
  document.body.dataset.view = on ? 'read' : '';
  readbar.hidden = readtools.hidden = !on;
  readtools.classList.remove('away');
  if (!on) return;
  const set = (id, n, dir) => {                          // a chapter link, or a greyed one at either end of the Bible
    const a = document.getElementById(id);
    if (n) { a.href = `#/read/${n[0]}/${n[1]}`; a.removeAttribute('aria-disabled'); a.setAttribute('aria-label', `${dir}: ${bname(n[0])} ${n[1]}`); }
    else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); a.setAttribute('aria-label', dir + ' chapter (none)'); }
  };
  set('rb-prev', neighbour(b, ch, -1), 'Previous');
  set('rb-next', neighbour(b, ch, 1), 'Next');
  const title = document.getElementById('rb-title');
  title.href = `#/book/${D.bookEntry[b]}`;
  title.setAttribute('aria-label', `${bname(b)} ${ch}. Choose a chapter`);
  title.querySelector('b').textContent = `${bname(b)} ${ch}`;
  title.querySelector('span').textContent = TR[b] || '';
  document.getElementById('rt-back').disabled = TRAIL.i <= 0;
  document.getElementById('rt-fwd').disabled = TRAIL.i >= TRAIL.list.length - 1;
}
onPage(p => {
  if (!PROFILE.readerTools) return;
  const b = +p[1], ch = +p[2];
  if (p[0] === 'read' && hasChapter(b, ch) && chapterText(b, ch)) { noteRead(b, ch); noteTrail(b, ch); }   // not the loading placeholder
  showReadBar(p);
});
if (readtools) {
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  readtools.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || t.disabled) return;
    if (t.id === 'rt-back') trailGo(-1);
    else if (t.id === 'rt-fwd') trailGo(1);
    else if (t.id === 'rt-top') window.scrollTo({top: 0, behavior: reduced ? 'auto' : 'smooth'});
  });
  // The toolbar slips away while the reader scrolls down and returns when they scroll up, at the top and at the end.
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    if (readtools.hidden) return;
    const y = window.scrollY, d = y - lastY;
    if (Math.abs(d) < 8) return;
    lastY = y;
    const atEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
    readtools.classList.toggle('away', d > 0 && y > 120 && !atEnd);
  }, {passive: true});
}

// ---------- the history page ----------
const dayLabel = ts => {
  const d = new Date(ts), t = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const n = Math.round((day(t) - day(d)) / 864e5);
  return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});
};
function viewHistory() {
  const h = readHistory();
  if (!h.length) return `
  ${backLink('#/')}
  <h1>History</h1>
  <p class="lede">Chapters you read will be listed here, newest first. They stay on this phone.</p>
  <p class="act"><a class="btn secondary" href="#/books">Open the books</a></p>`;
  let last = '';
  const rows = h.map(([b, ch, ts]) => {
    const day = dayLabel(ts), head = day === last ? '' : `<h2 class="dayhead">${esc(day)}</h2>`;
    last = day;
    return `${head}<a class="hrow" href="#/read/${b}/${ch}"><span class="t">${esc(bname(b))} ${ch}</span><span class="cap">${esc(TR[b] || '')}</span></a>`;
  }).join('');
  return `
  ${backLink('#/')}
  <h1>History</h1>
  <p class="lede">The chapters you read, newest first. They stay on this phone.</p>
  <div class="hlist">${rows}</div>
  <p class="act"><button class="btn secondary" type="button" id="clearhist">Clear history</button></p>`;
}
if (PROFILE.readerTools) addRoute('history', () => viewHistory());
document.addEventListener('click', e => {               // clearing takes two taps, so a stray touch cannot erase it
  const btn = e.target.closest('#clearhist'); if (!btn) return;
  if (btn.dataset.sure) { store.set('kc-history', '[]'); route(); return; }
  btn.dataset.sure = '1'; btn.textContent = 'Tap again to clear';
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.sure; btn.textContent = 'Clear history'; } }, 4000);
});

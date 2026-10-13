// marks.js: the app's verse panel: favorite, highlight, copy and share a verse, and the Favorites and Highlights pages
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.
// Switched on by PROFILE.verseTools (profiles/app.js); works only where the page has the #sheet markup (app.html).

// ---------- the marks a reader keeps ----------
// One object on the phone (localStorage 'kc-marks'), keyed by verse "book id:chapter:verse" in the house text's own numbering:
//   { "1:1:3": { f: 1, h: "c2", t: 1760000000000 } }      f = favorite, h = highlight (below), t = when it last changed
// Notes (part 3 of the reading tools) join the same record as n, so one object is everything to export and restore.
const MARKS_KEY = 'kc-marks';
const HIGHLIGHTS = [['c1', 'Yellow'], ['c2', 'Green'], ['c3', 'Blue'], ['c4', 'Pink'], ['c5', 'Orange'], ['c6', 'Purple'],
  ['u1', 'Underline'], ['u2', 'Double underline']];
const HL_NAME = Object.fromEntries(HIGHLIGHTS);
let MARKS = null;
function loadMarks() {
  if (MARKS) return MARKS;
  try { const m = JSON.parse(store.get(MARKS_KEY) || '{}'); MARKS = m && typeof m === 'object' && !Array.isArray(m) ? m : {}; }
  catch (e) { MARKS = {}; }
  return MARKS;
}
const vkey = (b, ch, v) => `${b}:${ch}:${v}`;
const vparts = k => { const [b, ch, v] = k.split(':'); return [+b, +ch, /^\d+$/.test(v) ? +v : v]; };
function setMark(key, patch) {
  const m = loadMarks(), rec = Object.assign({}, m[key], patch, {t: Date.now()});
  if (!rec.f) delete rec.f;
  if (!HL_NAME[rec.h]) delete rec.h;
  if (rec.f || rec.h || rec.n) m[key] = rec; else delete m[key];
  store.set(MARKS_KEY, JSON.stringify(m));
}

// ---------- marks on the page ----------
const verseEls = () => document.querySelectorAll('#rtext p[id^="v"]');
function paintVerse(el) {
  const rec = loadMarks()[el.dataset.k] || {};
  el.className = el.className.replace(/\b(m-\w+|fav)\b/g, '').trim();
  if (rec.h && HL_NAME[rec.h]) el.classList.add('m-' + rec.h);
  if (rec.f) el.classList.add('fav');
}
onPage(p => {
  if (!PROFILE.verseTools || p[0] !== 'read' || !document.getElementById('sheet')) return;
  verseEls().forEach(el => { el.dataset.k = vkey(+p[1], +p[2], el.id.slice(1)); paintVerse(el); });
});

// ---------- a short message at the bottom ----------
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
}

// ---------- the verse panel ----------
const sheet = document.getElementById('sheet');
let sheetKey = null, sheetEl = null, sheetEntry = false;
let backPending = false, openAfterBack = null;   // closing asks the browser to go back one entry; that finishes a moment later
const verseTextOf = el => { const c = el.cloneNode(true); c.querySelectorAll('sup').forEach(s => s.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
function citation(key) {
  const [b, ch, v] = vparts(key), eng = engLabel(b, ch, v);
  return `${bname(b)} ${ch}:${v} (${TR[b]})${eng ? `, ${eng}` : ''}`;
}
function openSheet(el) {
  sheetEl = el; sheetKey = el.dataset.k;
  const [b, ch, v] = vparts(sheetKey), rec = loadMarks()[sheetKey] || {};
  document.getElementById('sheet-t').textContent = `${bname(b)} ${ch}:${v}`;
  document.getElementById('sheet-v').textContent = verseTextOf(el);
  const fav = sheet.querySelector('[data-act="fav"]');
  fav.setAttribute('aria-pressed', String(!!rec.f)); fav.querySelector('span').textContent = rec.f ? 'Unfavorite' : 'Favorite';
  sheet.querySelectorAll('[data-hl]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.hl === rec.h)));
  sheet.querySelector('[data-act="unhl"]').disabled = !rec.h;
  el.classList.add('sel');
  sheet.showModal();
  document.documentElement.classList.add('sheet-open');       // the page behind stays still
  history.pushState({kcSheet: true}, ''); sheetEntry = true;  // the phone's Back button closes the panel, not the page
}
const closeSheet = () => { if (sheet.open) sheet.close(); };
if (sheet && PROFILE.verseTools) {
  document.addEventListener('click', e => {                   // a tap on a verse; not while the reader is selecting text
    const el = e.target.closest('#rtext p[id^="v"]');
    if (!el || !el.dataset.k || sheet.open) return;
    const sel = window.getSelection && window.getSelection();
    if (sel && String(sel).trim()) return;
    if (backPending) { openAfterBack = el; return; }          // a late Back from the last panel would close this one
    openSheet(el);
  });
  sheet.addEventListener('close', () => {
    document.documentElement.classList.remove('sheet-open');
    if (sheetEl) sheetEl.classList.remove('sel');
    if (sheetEntry) {
      sheetEntry = false; backPending = true; history.back();
      setTimeout(() => backDone(), 400);                      // in case no Back ever arrives
    }
  });
  const backDone = () => {
    if (!backPending) return;
    backPending = false;
    if (openAfterBack) { const el = openAfterBack; openAfterBack = null; if (el.isConnected) openSheet(el); }
  };
  window.addEventListener('popstate', () => {
    if (backPending) { backDone(); return; }
    if (sheet.open) { sheetEntry = false; closeSheet(); }
  });
  sheet.addEventListener('click', async e => {
    if (e.target === sheet || e.target.closest('#sheetx')) { closeSheet(); return; }
    const key = sheetKey, el = sheetEl, rec = loadMarks()[key] || {};
    const act = e.target.closest('[data-act]'), hl = e.target.closest('[data-hl]');
    let msg = '';
    if (hl && !hl.disabled) {
      const on = hl.dataset.hl !== rec.h;                     // the same highlight again takes it off
      setMark(key, {h: on ? hl.dataset.hl : null}); msg = on ? 'Highlighted' : 'Highlight removed';
    } else if (act && act.dataset.act === 'unhl' && !act.disabled) { setMark(key, {h: null}); msg = 'Highlight removed'; }
    else if (act && act.dataset.act === 'fav') { setMark(key, {f: rec.f ? 0 : 1}); msg = rec.f ? 'Removed from favorites' : 'Added to favorites'; }
    else if (act && act.dataset.act === 'copy') msg = (await copyText(shareText(key, el))) ? 'Copied' : 'Could not copy';
    else if (act && act.dataset.act === 'share') msg = await shareVerse(key, el);
    else return;
    paintVerse(el); closeSheet(); if (msg) toast(msg);
  });
}

// ---------- copy and share ----------
const shareText = (key, el) => `“${verseTextOf(el)}”\n— ${citation(key)}`;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
  try {                                                       // older browser views
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
async function shareVerse(key, el) {                          // the phone's share sheet; copy when there is none
  const text = shareText(key, el);
  const plugin = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share;
  try {
    if (plugin) { await plugin.share({text, dialogTitle: 'Share this verse'}); return ''; }
    if (navigator.share) { await navigator.share({text}); return ''; }
  } catch (e) { if (e && (e.name === 'AbortError' || /cancel/i.test(e.message || ''))) return ''; }   // the reader closed the sheet
  return (await copyText(text)) ? 'Copied' : 'Could not share';
}

// ---------- the Favorites and Highlights pages ----------
function marksPage(kind) {
  const m = loadMarks();
  const rows = Object.keys(m).filter(k => m[k] && (kind === 'f' ? m[k].f : m[k].h) && hasChapter(...vparts(k).slice(0, 2)))
    .sort((a, c) => m[c].t - m[a].t);
  const title = kind === 'f' ? 'Favorites' : 'Highlights';
  const empty = kind === 'f' ? 'No favorites yet. Tap a verse, then Favorite.' : 'No highlights yet. Tap a verse, then choose a color or an underline.';
  const list = rows.map(k => {
    const [b, ch, v] = vparts(k), h = m[k].h;
    return `<a class="mrow${h ? ' m-' + h : ''}" href="#/read/${b}/${ch}/${v}">
      <span class="t">${esc(bname(b))} ${ch}:${esc(String(v))}${kind === 'h' ? `<i>${esc(HL_NAME[h])}</i>` : ''}</span>
      <span class="vp" data-k="${k}"></span></a>`;
  }).join('');
  return `
  ${backLink('#/')}
  <h1>${title}</h1>
  ${rows.length ? `<p class="lede">Newest first. They stay on this phone.</p><div class="mlist">${list}</div>` : `<p class="lede">${empty}</p>
  <p class="act"><a class="btn secondary" href="#/books">Open the books</a></p>`}`;
}
if (PROFILE.verseTools) {
  addRoute('favorites', () => marksPage('f'));
  addRoute('highlights', () => marksPage('h'));
  onPage(p => {                                               // the verse's words, once its book is loaded
    if (p[0] !== 'favorites' && p[0] !== 'highlights') return;
    document.querySelectorAll('#app .vp[data-k]').forEach(el => {
      const [b, ch, v] = vparts(el.dataset.k);
      ensureBook(b).then(() => { const t = verseText(b, ch, v); if (t) el.innerHTML = fmtText(b, t.text); }).catch(() => {});
    });
  });
}

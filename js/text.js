// text.js: Bible text: loading books by translation, verse lookup, numbering notices
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- scripture text ----------
const T = D.T || {}, TR = D.TR || {}, SP = D.SP || {}, PM = D.PM || {}, PE = D.PE || {}, PD = D.PD || [];
const PSALMS = +Object.keys(D.books).find(k => D.books[k][0] === 'Psalms');
const HT = D.HT || {};                       // each book's house translation, e.g. HT[1] = 'lxx'
const bookUrl = (b, tr = HT[b]) => `bible/${tr}/${b}.json`;
const TEXT = {}, textP = {};                 // TEXT['lxx/1'] = every chapter of Genesis in the Septuagint, fetched when first needed
function loadBook(b, tr = HT[b]) {
  const k = tr + '/' + b;
  if (TEXT[k]) return Promise.resolve(TEXT[k]);
  if (!textP[k]) textP[k] = fetch(bookUrl(b, tr)).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => (TEXT[k] = j)).catch(e => { delete textP[k]; throw e; });
  return textP[k];
}
const BIBLE = {};                            // BIBLE[book id] = that book's chapters in its house translation
function ensureBook(b) { return BIBLE[b] ? Promise.resolve() : loadBook(b).then(j => { BIBLE[b] = j; }); }
const chapterText = (b, ch) => (BIBLE[b] && BIBLE[b][ch]) || (T[b] || {})[ch] || null;
let deferTrack = false;               // a loading placeholder is not counted as a visit; the page that replaces it is
function lazyText(b, ch, back, label, what) {   // chapters nobody cites are not inlined: fetch the text, then show the page
  if (!hasChapter(b, ch) || chapterText(b, ch)) return null;
  const want = location.hash; deferTrack = true;
  ensureBook(b).then(() => { if (location.hash === want) route(); })
    .catch(() => { const m = document.getElementById('loadmsg'); if (m) m.innerHTML = 'The Bible text could not load. Check your connection, then <a href="' + want + '">try again</a>.'; });
  return `${backLink(back)}<h1>${esc(label)}</h1><p class="lede" id="loadmsg" role="status">Loading the ${what}\u2026</p>`;
}
const hasChapter = (b, ch) => !!(D.CC[b] && D.CC[b].includes(+ch));
let ORD = null;
function chapterOrder() { if (!ORD) { ORD = []; for (const b of D.order) for (const ch of D.CC[b]) ORD.push([b, ch]); } return ORD; }
function neighbour(b, ch, dir) {
  const o = chapterOrder(), i = o.findIndex(x => x[0] === +b && x[1] === +ch), j = i + dir;
  return i > -1 && j >= 0 && j < o.length ? o[j] : null;
}
const citedIn = (b, ch) => Object.keys(((D.verses[b] || {})[ch]) || {}).length;
function verseText(b, ch, v) {
  const chap = chapterText(b, ch); if (!chap) return null;
  const carried = SP[`${b}:${ch}:${v}`], want = carried || v;
  const row = chap.find(r => r[0] === want); if (!row) return null;
  return {text: row[1], label: TR[b], carried: carried || null};
}
function fmtText(b, t) {
  let s = esc(t);
  if ((TR[b] || '').startsWith('Septuagint')) s = s.replace(/\[([^\]]+)\]/g, '<span class="sw">$1</span>');
  return s;
}
const engLabel = (b, ch, v) => { const e = (PE[b] || {})[`${ch}:${v}`]; return e ? `${b === PSALMS ? 'Psalm' : bname(b)} ${e[0]}:${e[1]} in English Bibles` : null; };
let UNMAPPED = null;                  // set by go() when a typed English number in a partly mapped book could not be converted
const isMapped = (b, ch, v) => !!((PM[b] || {})[ch] || {})[v];
// A typed English number in a partly mapped book is only trusted as typed if an essay cites that exact verse
// (those addresses were checked against the text) and it is not the Septuagint address of a different English verse.
const PC = D.PC || {};               // partly mapped books where only some chapters are known to differ: book id -> those chapters
const inScope = (b, ch) => !PC[b] || PC[b].includes(+ch);
const typedUnverified = (b, ch, v) => PD.includes(b) && inScope(b, ch) && !isMapped(b, ch, v) && (!hasVerse(b, ch, v) || !!(PE[b] || {})[`${ch}:${v}`]);
function numNote(b, key, labelled) {  // honest notice for books whose Septuagint numbers differ from English Bibles in places
  if (!PD.includes(b) || !inScope(b, key.split(':')[1]) || (labelled && UNMAPPED !== key)) return '';   // an English label already says it
  if (UNMAPPED === key) pendingEvents.push(['notice/unconverted', `${bname(b)}/${key.split(':').slice(1).join('/')}`]);
  const msg = UNMAPPED === key
    ? `You searched ${esc(bname(b))} by an English number that has not been converted. In Septuagint ${esc(bname(b))} the numbers can differ from English Bibles, so check the verses on either side.`
    : `Septuagint numbering. Some verses in ${esc(bname(b))} are numbered differently in English Bibles.`;
  return `<p class="lede" style="margin-top:16px">${msg}</p>`;
}
function mapRef(b, ch, v) {          // typed English numbers -> Septuagint numbers, for books that have a map
  const m = (PM[b] || {})[ch]; if (!m) return [ch, v];
  if (v == null) return m['1'] ? [m['1'][0], null] : [ch, v];
  return m[v] ? m[v] : [ch, v];
}
function textCard(b, ch, vs, ve, label) {
  const rows = [];
  for (let v = vs; v <= ve && rows.length < 4; v++) { const t = verseText(b, ch, v); if (t) rows.push([v, t]); }
  if (!rows.length) return '';
  const many = ve > vs, eng = engLabel(b, ch, vs), capStyle = 'font:400 13px/18px var(--sans)';
  return `<figure class="verse" style="margin:16px 0 0">${rows.map(([v, t]) => `<p>${many ? `<sup class="vn">${v}</sup> ` : ''}${fmtText(b, t.text)}</p>`).join('')}<p class="cap" style="${capStyle}">${esc(label)}, ${esc(rows[0][1].label)}</p>${eng ? `<p class="cap" style="${capStyle}">${esc(eng)}</p>` : ''}</figure>`;
}
const noteFor = (b, ch) => { const n = D.BN && D.BN[b], t = n && (ch ? (n.c || {})[ch] : n.p); return t ? `<p class="cap" style="margin-top:8px">${esc(t)}</p>` : ''; };
function fromLine(b) { return `${TR[b]}, translated from ${D.TS[b]}`; }

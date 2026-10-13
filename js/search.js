// search.js: reading a typed reference, the search box suggestions, and the title search page
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- search ----------
const aliases = {};
const addAlias = (k, b) => { k = k.toLowerCase().replace(/[^a-z0-9]/g,''); if (k && !aliases[k]) aliases[k] = +b; };
for (const b in D.books) addAlias(D.books[b][0], b);
const EXTRA = {Psalms:['psalm','ps'],Genesis:['gen'],Exodus:['exod','ex'],Leviticus:['lev'],Numbers:['num'],Deuteronomy:['deut'],Joshua:['josh'],Judges:['judg'],'1 Samuel':['1sam'],'2 Samuel':['2sam'],'1 Kings':['1kgs','1ki'],'2 Kings':['2kgs','2ki'],'1 Chronicles':['1chr'],'2 Chronicles':['2chr'],Nehemiah:['neh'],Esther:['esth'],Proverbs:['prov'],Ecclesiastes:['eccl'],'Song of Songs':['song','songofsolomon'],Isaiah:['isa'],Jeremiah:['jer'],Lamentations:['lam'],Ezekiel:['ezek'],Daniel:['dan'],Hosea:['hos'],Micah:['mic'],Nahum:['nah'],Habakkuk:['hab'],Zephaniah:['zeph'],Zechariah:['zech'],Malachi:['mal'],Matthew:['matt','mt'],Mark:['mk'],Luke:['lk'],John:['jn'],Romans:['rom'],'1 Corinthians':['1cor'],'2 Corinthians':['2cor'],Galatians:['gal'],Ephesians:['eph'],Philippians:['phil'],Colossians:['col'],'1 Thessalonians':['1thess'],'2 Thessalonians':['2thess'],'1 Timothy':['1tim'],'2 Timothy':['2tim'],Hebrews:['heb'],'1 Peter':['1pet'],'2 Peter':['2pet'],'1 John':['1jn'],James:['jas'],Revelation:['rev'],Enoch:['1enoch'],Jubilees:['jub']};
for (const b in D.books) (EXTRA[bname(b)]||[]).forEach(a => addAlias(a, b));
function findBook(raw) {
  const k = raw.toLowerCase().replace(/[^a-z0-9]/g,'');
  if (!k) return null; if (aliases[k]) return aliases[k]; if (k.length < 3) return null;
  const hits = [...new Set(Object.keys(aliases).filter(a => a.startsWith(k)).map(a => aliases[a]))];
  return hits.length === 1 ? hits[0] : null;
}
function parseRef(q) {
  const m = q.trim().toLowerCase().replace(/\./g,'').match(/^((?:[123]\s*)?[a-z][a-z\s]*?)\s*(?:(\d+)(?:\s*[:]\s*(\d+)(?:\s*[-–—]\s*(\d*))?)?)?$/);
  if (!m) return null; const b = findBook(m[1]); if (!b) return null;
  return {b, ch: m[2] ? +m[2] : null, v: m[3] ? +m[3] : null, ve: m[4] ? +m[4] : null};
}
function rangeRef(b, ch, vs, ve) {      // typed English range -> [chapter, first, last] in the indexed numbering, or null
  if (!(ve > vs)) return null;
  const a = mapRef(b, ch, vs), z = mapRef(b, ch, ve);
  return a[0] === z[0] && z[1] > a[1] ? [a[0], a[1], z[1]] : null;
}
function go(q) {
  q = q.trim(); if (!q) return;
  const r = parseRef(q);
  const wd = !r && findWord(q);
  track(wd ? 'search/word' : r ? 'search/ref' : 'search/title');
  if (wd) { location.hash = '#/word/' + wd.slug; return; }
  if (r) {
    if (r.ch && r.v) {
      const rg = r.ve && rangeRef(r.b, r.ch, r.v, r.ve), unm = typedUnverified(r.b, r.ch, r.v);
      if (rg) { UNMAPPED = unm ? `${r.b}:${rg[0]}:${rg[1]}` : null; location.hash = `#/range/${r.b}/${rg[0]}/${rg[1]}/${rg[2]}`; }
      else { const m = mapRef(r.b, r.ch, r.v); UNMAPPED = unm ? `${r.b}:${m[0]}:${m[1]}` : null; location.hash = `#/verse/${r.b}/${m[0]}/${m[1]}`; }
    }
    else if (r.ch) { const m = mapRef(r.b, r.ch, null); location.hash = chapterText(r.b, m[0]) ? `#/read/${r.b}/${m[0]}` : `#/book/${D.bookEntry[r.b]}`; }
    else location.hash = `#/book/${D.bookEntry[r.b]}`;
  } else location.hash = '#/search/' + encodeURIComponent(q);
}

// ---------- suggestions ----------
const bookIds = Object.keys(D.books).map(Number).sort((a,b) => a-b);
const aliasKeys = {};
for (const k in aliases) (aliasKeys[aliases[k]] = aliasKeys[aliases[k]] || []).push(k);
function essayCount(b, ch) {
  const s = new Set(), v = D.verses[b] || {};
  for (const c in v) if (ch == null || +c === +ch) for (const x in v[c]) v[c][x].forEach(p => s.add(p));
  return s.size;
}
function suggest(raw) {
  const q = raw.trim().toLowerCase().replace(/\./g, '');
  if (!q) return [];
  const out = [], add = o => { if (out.length < 7 && !out.some(x => x.href === o.href)) out.push(o); };
  const verseOpt = (b, ch, v) => {
    const n = ((D.verses[b] || {})[ch] || {})[v] ? D.verses[b][ch][v].length : 0, e = (PE[b] || {})[`${ch}:${v}`];
    return {label: `${bname(b)} ${ch}:${v}${e ? ` (English ${e[0]}:${e[1]})` : ''}`, meta: n ? `Verse \u00b7 ${plural(n,'essay')}` : 'Verse', href: `#/verse/${b}/${ch}/${v}`};
  };
  const bookOpt = b => { const n = essayCount(b); return {label: bname(b), meta: n ? `Book \u00b7 ${plural(n,'essay')}` : 'Book', href: `#/book/${D.bookEntry[b]}`}; };
  const m = q.match(/^((?:[123]\s*)?[a-z][a-z\s]*?)\s*(?:(\d+)(?:\s*:\s*(\d*)(?:\s*[-–—]\s*(\d*))?)?)?$/);
  let bookHits = [];
  if (m) {
    const key = m[1].replace(/[^a-z0-9]/g, ''), ch = m[2], vp = m[3];
    if (key.length >= 1) bookHits = bookIds.filter(b => (aliasKeys[b] || []).some(k => k.startsWith(key)));
    const exact = bookHits.find(b => (aliasKeys[b] || []).some(k => k === key));
    const target = exact != null ? exact : (bookHits.length === 1 ? bookHits[0] : null);
    if (target != null && ch !== undefined) {
      const rg = vp && m[4] ? rangeRef(target, +ch, +vp, +m[4]) : null;
      if (rg) add({label: `${bname(target)} ${ch}:${vp}\u2013${m[4]}`, meta: 'Passage \u00b7 range', href: `#/range/${target}/${rg[0]}/${rg[1]}/${rg[2]}`});
      else if (m[4] !== undefined && vp) { const lc = mapRef(target, +ch, +vp); if (verseText(target, lc[0], lc[1])) add(verseOpt(target, lc[0], lc[1])); }
      else if (PM[target] && vp && inScope(target, +ch)) {      // typed English verse -> Septuagint verse
        const mm = mapRef(target, +ch, +vp);
        if (verseText(target, mm[0], mm[1])) add(verseOpt(target, mm[0], mm[1]));
      } else {
        const lch = mapRef(target, +ch, null)[0];
        if (chapterText(target, lch)) add({label: `Read ${bname(target)} ${ch}`, meta: 'Chapter', href: `#/read/${target}/${lch}`});
        const chap = (D.verses[target] || {})[lch] || {};
        const vs = Object.keys(chap).map(Number).sort((a,c) => a-c).filter(v => !vp || String(v).startsWith(vp));
        vs.slice(0, 6).forEach(v => add(verseOpt(target, lch, v)));
        if (!vs.length && !chapterText(target, lch)) add({label: `${bname(target)} ${ch}`, meta: 'Not cited yet', href: `#/book/${D.bookEntry[target]}`});
      }
    } else if (target != null) {
      add(bookOpt(target));
      const all = []; const dv = D.verses[target] || {};
      for (const c in dv) for (const v in dv[c]) all.push([+c, +v, dv[c][v].length]);
      all.sort((a,c) => c[2]-a[2] || a[0]-c[0] || a[1]-c[1]).slice(0, 4).forEach(([c,v]) => add(verseOpt(target, c, v)));
    } else bookHits.slice().sort((a,c) => essayCount(c)-essayCount(a) || a-c).slice(0, q.length === 1 ? 4 : 6).forEach(b => add(bookOpt(b)));
  } else if (/^[123]\s*$/.test(q)) {
    const key = q.trim();
    bookIds.filter(b => (aliasKeys[b] || []).some(k => k.startsWith(key)))
      .sort((a,c) => essayCount(c)-essayCount(a) || a-c).slice(0, 4).forEach(b => add(bookOpt(b)));
  }
  const k = normW(q);
  if (k.length >= 1) WORDS.filter(w => wordMatches(w, k))
    .slice(0, 3).forEach(w => add({label: w.title, meta: w.en, href: `#/word/${w.slug}`, kind: 'word'}));
  if (q.length >= 3 && !(m && m[2] !== undefined) && !(bookHits.length && q.length <= 5)) {
    const ws = q.split(/\s+/).filter(Boolean);
    Object.keys(P).filter(pid => P[pid] && hasRefs(pid) && ws.every(w => P[pid][0].toLowerCase().includes(w)))
      .sort((a,c) => P[c][5]-P[a][5]).slice(0, 3).forEach(pid => add({label: P[pid][0], meta: 'Essay \u00b7 Sources', href: `#/essay/${pid}`}));
  }
  return out;
}
function initSuggest() {
  const input = document.getElementById('q'), list = document.getElementById('sug'), stat = document.getElementById('sugstat');
  let opts = [], active = -1;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const setActive = i => {
    active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', 'sug-' + i); list.children[i].scrollIntoView({block: 'nearest'}); }
    else input.removeAttribute('aria-activedescendant');
  };
  const render = () => {
    opts = suggest(input.value); active = -1; input.removeAttribute('aria-activedescendant');
    list.innerHTML = opts.map((o, i) => `<li role="option" id="sug-${i}" class="opt${o.kind === 'word' ? ' w' : ''}" aria-selected="false" data-i="${i}"><span class="t">${esc(o.label)}</span><span class="m">${esc(o.meta)}</span></li>`).join('');
    if (opts.length) {
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      stat.textContent = `${plural(opts.length, 'suggestion')} available. Use the up and down arrows to review and Enter to select.`;
    } else { close(); stat.textContent = input.value.trim() ? 'No suggestions.' : ''; }
  };
  const pick = i => { const o = opts[i]; if (!o) return; close(); stat.textContent = ''; location.hash = o.href; };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value.trim()) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { if (!opts.length) return; e.preventDefault(); if (list.hidden) { list.hidden = false; input.setAttribute('aria-expanded', 'true'); } setActive(active < opts.length - 1 ? active + 1 : 0); }
    else if (e.key === 'ArrowUp') { if (!opts.length) return; e.preventDefault(); setActive(active > 0 ? active - 1 : opts.length - 1); }
    else if (e.key === 'Enter') { if (active >= 0 && !list.hidden) { e.preventDefault(); pick(active); } }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); close(); } else if (input.value) { input.value = ''; stat.textContent = ''; } }
    else if (e.key === 'Tab') close();
  });
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => { const li = e.target.closest('[role=option]'); if (li) pick(+li.dataset.i); });
  input.addEventListener('blur', () => setTimeout(close, 200));
}
function viewSearch(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = Object.keys(P).filter(pid => P[pid] && words.every(w => P[pid][0].toLowerCase().includes(w))).sort((a,b) => P[b][5]-P[a][5]);
  if (!hits.length) pendingEvents.push(['search/none', q.toLowerCase().trim().slice(0, 60)]);
  return `
  ${backLink(`#/`)}
  <h1>Results for \u201c${esc(q)}\u201d</h1>
  <p class="lede">${hits.length ? plural(hits.length,'essay') + ' with that in the title.' : 'Nothing matched. Try a verse such as Genesis 6:4, or a shorter title.'}</p>
  ${hits.length ? `<div style="margin-top:24px">${pieceList(hits.slice(0,12))}</div>` : ''}`;
}

addRoute('search', p => viewSearch(decodeURIComponent(p.slice(1).join('/'))));
onPage(() => {
  if (document.getElementById('sug')) initSuggest();
  const sf = document.getElementById('sf');
  if (sf) sf.addEventListener('submit', e => { e.preventDefault(); go(document.getElementById('q').value); });
});

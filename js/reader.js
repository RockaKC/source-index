// reader.js: the Bible: the 81 books, book pages, chapters, verses and passages
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

function shelf(es) {
  return `<ul class="grid">${es.map(e => {
    const n = PROFILE.essaysInBible ? piecesForBook(e.books).length : 0, txt = e.books.some(b => D.CC[b]);
    const meta = n ? plural(n,'essay') : (txt ? '' : 'Text not in the index yet');
    return `<li><a class="bk" href="#/book/${e.id}"><span class="n">${esc(e.name)}</span>${meta ? `<span class="m">${meta}</span>` : ''}</a></li>`;
  }).join('')}</ul>`;
}
function viewBooks(t) {
  t = t || 'OT';
  const es = D.entries.filter(e => e.t === t);
  return `
  ${backLink(`#/`)}
  <h1>The 81 books</h1>
  <p class="lede">As the Ethiopian Orthodox Church lists them: 46 in the Old Testament and 35 in the New.</p>
  ${D.EN ? `<p style="margin-top:8px"><a href="#/english" style="color:var(--accent)">Which of these can you read in English?</a></p>` : ''}
  <div class="tabs" role="tablist" aria-label="Testament">
    <button class="tab" role="tab" aria-selected="${t==='OT'}" data-t="OT">Old Testament</button>
    <button class="tab" role="tab" aria-selected="${t==='NT'}" data-t="NT">New Testament</button>
  </div>
  <div id="shelf">${shelf(es)}</div>`;
}
function viewEnglish() {
  const en = D.EN; if (!en) return viewMissing();
  const name = id => (entryOf(id) || {}).name || '';
  const groups = en.groups.map(g => `<h2>${esc(g.t)}</h2>${g.note ? `<p class="lede" style="margin-top:8px">${esc(g.note)}</p>` : ''}
  ${g.items.some(i => i[1])
    ? `<div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${g.items.map(([id, t]) =>
        `<li><a class="wl" href="#/book/${id}"><b>${esc(name(id))}</b>${t ? `<span class="en">${esc(t)}</span>` : ''}</a></li>`).join('')}</ul></div>`
    : `<ul class="chips" style="margin-top:12px">${g.items.map(([id]) => `<li><a class="chip" href="#/book/${id}">${esc(name(id))}</a></li>`).join('')}</ul>`}`).join('');
  return `
  ${backLink('#/books')}
  <h1>${esc(en.title)}</h1>
  <p class="lede">${esc(en.lede)}</p>
  ${(() => { const k = Object.keys(D.CC), ge = k.filter(b => /Ethiopic/.test(D.TS[b])).length; return `<p class="lede" style="margin-top:8px">Of the ${k.length} books with text in this index, ${ge} ${ge === 1 ? 'is' : 'are'} translated from Ethiopic (Ge\u2019ez) and ${k.length - ge} from Greek. No direct Ge\u2019ez translation of the others is here yet.</p>`; })()}
  ${groups}
  ${en.foot ? `<p class="cap" style="margin-top:24px">${esc(en.foot)}</p>` : ''}
  <p style="margin-top:16px"><a class="btn secondary" href="${esc(D.guide[1])}" target="_blank" rel="noopener">${esc(D.guide[0])}</a></p>`;
}
function viewBook(eid) {
  const e = entryOf(eid); if (!e) return viewMissing();
  const same = D.entries.filter(x => x.t === e.t);
  const pos = `Number ${same.findIndex(x => x.id === e.id) + 1} of ${same.length} in the ${e.t === 'OT' ? 'Old' : 'New'} Testament list.`;
  const loaded = e.books.filter(b => D.CC[b]);
  const grids = loaded.map(b => `${e.books.length > 1 ? `<h3 style="margin-top:16px">${esc(bname(b))}</h3>` : ''}<ul class="chgrid">${D.CC[b].map(ch => {
      const n = PROFILE.essaysInBible ? citedIn(b, ch) : 0;
      return `<li><a class="cht" href="#/read/${b}/${ch}" aria-label="${esc(bname(b))} chapter ${ch}${n ? `, ${plural(n,'cited verse')}` : ''}">${ch}${n ? '<span class="dot" aria-hidden="true"></span>' : ''}</a></li>`;
    }).join('')}</ul>`).join('');
  const anyCited = PROFILE.essaysInBible && loaded.some(b => D.verses[b]);
  const psNote = e.books.includes(PSALMS) ? '<p class="cap" style="margin-top:12px">Septuagint numbering. Most English Bibles number most psalms one higher.</p>' : '';
  const reading = loaded.length ? `
    <p style="margin-top:24px"><a class="btn primary" href="#/read/${loaded[0]}/${D.CC[loaded[0]][0]}">Start reading</a></p>
    <h2>Chapters</h2>${grids}
    ${anyCited ? '<p class="cap legend"><span class="dot" aria-hidden="true"></span>Has verses cited in Kingdom Code essays</p>' : ''}${psNote}`
    : `<div class="card" style="margin-top:24px"><p style="margin:0">The text of ${esc(e.name)} isn\u2019t in the index yet. The free reference guide covers every book in the canon.</p>
       <p style="margin:16px 0 0"><a class="btn secondary" href="${esc(D.guide[1])}" target="_blank" rel="noopener">Open the reference guide</a></p></div>`;
  return `
  ${backLink(`#/books`)}
  <h1>${esc(e.name)}</h1>
  <p class="lede">${pos}${loaded.length ? ' ' + esc(fromLine(loaded[0])) + '.' : ''}</p>
  ${loaded.map(b => noteFor(b)).join('')}
  ${reading}`;
}
function viewVerse(b, ch, v) {
  if (!D.books[b]) return viewMissing();
  const wait = lazyText(b, ch, `#/book/${D.bookEntry[b]}`, `${bname(b)} ${ch}:${v}`, 'verse'); if (wait) return wait;
  const ids = rank(((D.verses[b] || {})[ch] || {})[v] || []);
  const key = `${b}:${ch}:${v}`, nt = D.notes && D.notes[key];
  const label = `${bname(b)} ${ch}:${v}`;
  const vt = verseText(b, ch, v), eng = engLabel(b, ch, v), cs = 'font:400 13px/18px var(--sans)';
  const text = vt ? `<figure class="verse" style="margin:24px 0 0"><p>${fmtText(b, vt.text)}</p><p class="cap" style="${cs}">${esc(label)}, ${esc(vt.label)}</p>${eng ? `<p class="cap" style="${cs}">${esc(eng)}</p>` : ''}${vt.carried ? `<p class="cap" style="${cs}">Printed together with verse ${vt.carried}.</p>` : ''}</figure>
    <div class="vnav">${verseText(b, ch, v - 1) ? `<a class="navbtn" href="${scriptureHash([b, ch, v - 1])}" aria-label="Previous verse, ${esc(bname(b))} ${ch}:${v-1}">‹ ${ch}:${v-1}</a>` : '<span></span>'}
      <a class="btn secondary" href="#/read/${b}/${ch}/${v}">Read ${esc(bname(b))} ${ch}</a>
      ${verseText(b, ch, v + 1) ? `<a class="navbtn" href="${scriptureHash([b, ch, v + 1])}" aria-label="Next verse, ${esc(bname(b))} ${ch}:${v+1}">${ch}:${v+1} ›</a>` : '<span></span>'}</div>` : '';
  const note = nt ? `<p class="lede" style="margin-top:16px">${esc(nt.text)}${nt.to ? ` <a href="${scriptureHash(nt.to)}" style="color:var(--accent)">${esc(nt.label)}</a>` : ''}</p>` : '';
  if (!ids.length) pendingEvents.push(['miss/verse', `${bname(b)}/${ch}/${v}`]);
  const main = !PROFILE.essaysInBible ? '' : citedSection(ids, 'No Kingdom Code essay cites this verse yet.', `${plural(ids.length, 'Kingdom Code essay')} ${ids.length === 1 ? 'cites' : 'cite'} this verse. Sources lists the other verses each one quotes.`);
  return `
  ${backLink(`#/book/${D.bookEntry[b]}`)}
  <h1>${esc(label)}</h1>
  ${text}${note}${numNote(b, key, !!eng)}
  ${wordsForVerse(b, ch, v).length ? `<h2>Words in this verse</h2><div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${wordsForVerse(b, ch, v).map(w => `<li><a class="wl" href="#/word/${w.slug}"><b>${esc(w.title)}</b><span class="en">${esc(w.en)}</span><span class="lang">${esc(w.lang)}</span></a></li>`).join('')}</ul></div>` : ''}
  ${main}`;
}
function viewRange(b, ch, vs, ve) {
  if (!D.books[b] || !(ve > vs) || ve - vs > 60) return viewMissing();
  const wait = lazyText(b, ch, `#/book/${D.bookEntry[b]}`, `${bname(b)} ${ch}:${vs}\u2013${ve}`, 'passage'); if (wait) return wait;
  const score = {};
  for (let v = vs; v <= ve; v++) { const ps = ((D.verses[b] || {})[ch] || {})[v]; if (!ps) continue; ps.forEach(p => { score[p] = (score[p] || 0) + 1; }); }
  const ids = rank(Object.keys(score).map(Number)).sort((a,c) => score[c] - score[a]);
  const label = `${bname(b)} ${ch}:${vs}\u2013${ve}`, n = ve - vs + 1;
  if (!ids.length) pendingEvents.push(['miss/verse', `${bname(b)}/${ch}/${vs}-${ve}`]);
  const card = textCard(b, ch, vs, ve, label);
  const more = n > 4 ? `<p class="cap" style="margin-top:8px">Showing the first 4 of ${n} verses. <a href="#/read/${b}/${ch}/${vs}" style="color:var(--accent)">Read the full passage</a>.</p>` : '';
  const main = !PROFILE.essaysInBible ? '' : citedSection(ids, 'No Kingdom Code essay cites a verse in this passage yet.',
    `${plural(ids.length, 'Kingdom Code essay')} ${ids.length === 1 ? 'cites' : 'cite'} a verse in this passage, most verses first.`, pid => `${plural(score[pid], 'verse')} in this passage`);
  return `
  ${backLink(`#/book/${D.bookEntry[b]}`)}
  <h1>${esc(label)}</h1>
  ${card}${more}${numNote(b, `${b}:${ch}:${vs}`, !!engLabel(b, ch, vs))}
  ${main}`;
}
function viewRead(b, ch, focus) {
  if (!hasChapter(b, ch)) return viewMissing();
  const chap = chapterText(b, ch);
  if (!chap) {
    const want = curHash();
    ensureBook(b).then(() => { if (curHash() === want) route(); })
      .catch(() => { const m = document.getElementById('loadmsg'); if (m) m.innerHTML = 'The Bible text could not load. Check your connection, then <a href="' + want + '">try again</a>.'; });
    return `${backLink(`#/book/${D.bookEntry[b]}`)}<h1>${esc(bname(b))} ${ch}</h1><p class="lede" id="loadmsg" role="status">Loading the chapter\u2026</p>`;
  }
  store.set('kc-last', `${b}/${ch}`);
  const size = +(store.get('kc-size') || 19);
  const verses = chap.map(([v, tx]) => {
    const num = typeof v === 'number', n = PROFILE.essaysInBible && num && hasVerse(b, ch, v) ? D.verses[b][ch][v].length : 0;
    const f = focus && String(focus) === String(v) ? ' f' : '';
    if (n) return `<p id="v${v}"><a class="vv${f}" href="#/verse/${b}/${ch}/${v}" aria-label="${esc(bname(b))} ${ch}:${v}, cited in ${plural(n,'essay')}. Open the verse."><sup>${v}</sup>${fmtText(b, tx)}</a></p>`;
    return `<p id="v${v}"${f ? ' class="f"' : ''}><sup>${esc(String(v))}</sup>${fmtText(b, tx)}</p>`;
  }).join('');
  const prev = neighbour(b, ch, -1), next = neighbour(b, ch, 1);
  const lbl = x => `${esc(bname(x[0]))} ${x[1]}`;
  let eng = null; for (const [v] of chap) { eng = (PE[b] || {})[`${ch}:${v}`]; if (eng) break; }
  const cited = PROFILE.essaysInBible ? citedIn(b, ch) : 0;
  const bar = PROFILE.readerTools;       // the app's header already holds the chapter bar (js/readerbar.js)
  return `
  ${bar ? '' : backLink(`#/book/${D.bookEntry[b]}`)}
  ${bar ? '' : `<div class="rbar" role="navigation" aria-label="Chapters">
    <a class="navbtn" ${prev ? `href="#/read/${prev[0]}/${prev[1]}" aria-label="Previous: ${lbl(prev)}"` : 'aria-disabled="true"'}>\u2039</a>
    <a class="where" href="#/book/${D.bookEntry[b]}" aria-label="${esc(bname(b))} ${ch}. Choose a chapter">${esc(bname(b))} ${ch}</a>
    <a class="navbtn" ${next ? `href="#/read/${next[0]}/${next[1]}" aria-label="Next: ${lbl(next)}"` : 'aria-disabled="true"'}>\u203a</a>
  </div>`}
  <h1 style="margin-top:24px">${esc(bname(b))} ${ch}</h1>
  <p class="lede">${esc(fromLine(b))}.${b === PSALMS && eng ? ` This is Psalm ${eng[0]} in English Bibles.` : ''}${PD.includes(b) ? ` Some verses in this book are numbered differently in English Bibles.` : ''}${cited ? ` Highlighted verses are cited in Kingdom Code essays. Tap one to see them.` : ''}</p>
  ${noteFor(b, ch)}
  <div class="rtools"><span class="cap">Text size</span>
    <button class="navbtn" type="button" data-size="-1" aria-label="Smaller text">A\u2212</button>
    <button class="navbtn" type="button" data-size="1" aria-label="Larger text">A+</button></div>
  <div class="text" id="rtext" lang="en" style="--rs:${size}px">${verses}</div>
  <nav class="endnav" aria-label="Next and previous chapter">
    ${prev ? `<a class="btn secondary" href="#/read/${prev[0]}/${prev[1]}"><small>Previous</small>${lbl(prev)}</a>` : '<span></span>'}
    ${next ? `<a class="btn secondary next" href="#/read/${next[0]}/${next[1]}"><small>Next</small>${lbl(next)}</a>` : '<span></span>'}
  </nav>`;
}
document.addEventListener('keydown', e => {
  if (!curHash().startsWith('#/read/') || /input|textarea|select/i.test((e.target.tagName || '')) || e.altKey || e.metaKey || e.ctrlKey) return;
  const p = curHash().slice(2).split('/'), n = e.key === 'ArrowRight' ? neighbour(+p[1], +p[2], 1) : e.key === 'ArrowLeft' ? neighbour(+p[1], +p[2], -1) : null;
  if (n) navigate(`#/read/${n[0]}/${n[1]}`);
});

addRoute('books', () => viewBooks('OT'));
addRoute('english', () => viewEnglish());
addRoute('book', p => viewBook(+p[1]));
addRoute('read', p => viewRead(+p[1], +p[2], p[3]));
addRoute('verse', p => viewVerse(+p[1], +p[2], +p[3]));
addRoute('range', p => viewRange(+p[1], +p[2], +p[3], +p[4]));
onPage(p => {
  document.querySelectorAll('[data-size]').forEach(btn => btn.addEventListener('click', () => {
    const cur = +(store.get('kc-size') || 19), nx = Math.max(15, Math.min(28, cur + 2 * +btn.dataset.size));
    store.set('kc-size', String(nx)); const rt = document.getElementById('rtext'); if (rt) rt.style.setProperty('--rs', nx + 'px');
  }));
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.getElementById('shelf').innerHTML = shelf(D.entries.filter(e => e.t === t.dataset.t));
    document.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x === t));
  }));
  const fv = p[0] === 'read' && p[3] ? document.getElementById('v' + p[3]) : null;
  if (fv) fv.scrollIntoView({block: 'center'});
});

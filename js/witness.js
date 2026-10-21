// witness.js: The Daily Witness: one passage a day, each a step in a larger study (the website only)
// Loaded as a plain script after js/account.js; see index.html for the order. Shared names live in the page's global scope.
// The schedule is edited by hand in tools/witness.json; tools/witness.py checks it against the stored text and writes D.W (the index, in
// data/site.js) and data/witness/<n>.json (each study's context, investigation and cross-references). The Bible text itself is never copied:
// a study reads its passage from the archive's own book files, as every verse page does.
// Nothing is public until a study is approved in the plan and the schedule has a start date. Until then a draft is visible only to a browser
// that opened any page of the site with ?witness-preview=1 (off again with =0). That switch hides drafts from the page; it is not access control.

const WIT = D.W || null;
if (PROFILE.witness && WIT) { const m = /[?&]witness-preview=([01])(&|$)/.exec(location.search); if (m) store.set('kc-witness-preview', m[1]); }
const witPreview = () => store.get('kc-witness-preview') === '1';
const WIT_ON = !!(PROFILE.witness && WIT && WIT.e.length);
const WITF = {};                                 // each study's file, once fetched

// ---------- which study is today's ----------
// Everyone sees the same study on the same date: the date is the calendar date in the schedule's own time zone, not the reader's.
function witDay(now = new Date()) {              // [year, month, day] in the schedule's time zone
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: WIT.tz, year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(now).map(x => [x.type, x.value]));
    return [+p.year, +p.month, +p.day];
  } catch (e) { return [now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()]; }
}
function witSeq(now = new Date()) {              // the number of the study that belongs to today's date; null when the schedule has no start
  if (!WIT.ws) return null;
  const [y, m, d] = witDay(now), [sy, sm, sd] = WIT.ws.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 864e5) + 1;
}
const witDate = n => {                           // the date study n is shown, e.g. Tue 3 Nov; '' while the schedule has no start
  if (!WIT.ws) return '';
  const [y, m, d] = WIT.ws.split('-').map(Number);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short'}).formatToParts(new Date(Date.UTC(y, m - 1, d + n - 1))).map(x => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
};
const witPublished = (now = new Date()) => {    // the studies a reader may see in lists: approved, and whose date has come (all of them in preview)
  const seq = witSeq(now);
  return WIT.e.filter(e => witPreview() || (e.st === 'approved' && seq !== null && e.n <= seq));
};
function witToday(now = new Date()) {            // {e, exact}: today's study, or the latest one once the schedule has run out
  const pub = witPublished(now); if (!pub.length) return null;
  const seq = witSeq(now);
  if (seq === null || seq < 1) return witPreview() ? {e: pub[0], exact: false} : null;
  const e = pub.find(x => x.n === seq);
  return {e: e || pub[pub.length - 1], exact: !!e};
}
const witEntry = n => WIT.e.find(e => e.n === n);
const witVisible = e => !!e && (witPreview() || e.st === 'approved');
const witRef = r => `${bname(r[0])} ${r[1]}:${r[2]}${r[3] > r[2] ? '–' + r[3] : ''}`;
const witHash = scriptureHash;
const witThread = id => WIT.th.find(t => t.id === id);

// Prose arrives as segments: a string, {i} italics, {r} a link to a verse, {r, q} a quotation the exporter checked against the stored text.
const witSegs = segs => segs.map(s => typeof s === 'string' ? esc(s) : s.i ? `<em>${esc(s.i)}</em>`
  : s.q ? `<q class="wq">${esc(s.q)}</q> (<a class="wcite" href="${witHash(s.r)}">${esc(witRef(s.r))}</a>)` : `<a class="wcite" href="${witHash(s.r)}">${esc(witRef(s.r))}</a>`).join('');
const witParas = paras => paras.map(p => `<p>${witSegs(p)}</p>`).join('');

// ---------- the front-page card ----------
function witCard() {
  if (!WIT_ON) return '';
  const t = witToday(); if (!t) return '';
  const {e, exact} = t, date = witDate(e.n), th = witThread(e.th);
  const label = exact ? `No. ${e.n}${date ? ' · ' + date : ''}` : witSeq() === null ? `Preview · No. ${e.n}` : `Latest · No. ${e.n}`;
  return `<section class="dw" aria-labelledby="dw-t" data-dw="${e.n}">
    <p class="eyebrow"><span>The Daily Witness</span><span>${esc(label)}${witPreview() && e.st !== 'approved' ? ' · draft' : ''}</span></p>
    <h2 class="dwt" id="dw-t"><a href="#/witness/${e.n}">${esc(e.t)}</a></h2>
    <p class="dwref">${esc(e.ref)} · ${esc(TR[e.bk])}</p>
    <p class="dwobs">${esc(e.obs)}</p>
    <p class="dwact"><a class="btn primary" href="#/witness/${e.n}">${exact ? 'Read today’s study' : 'Read the study'}</a><a class="btn secondary" href="#/witness">All studies</a></p>
    <p class="cap dwthread">Part of ${esc(th.name)}</p></section>`;
}

// ---------- one study ----------
function witFile(n) {
  if (WITF[n]) return Promise.resolve(WITF[n]);
  return fetch(`data/witness/${n}.json`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => (WITF[n] = j));
}
const witCitedIds = f => {                       // essays that cite any verse of the passage, most relevant first
  const ids = new Set();
  for (const [b, ch, a, z] of f.ps) for (let v = a; v <= z; v++) ((((D.verses[b] || {})[ch]) || {})[v] || []).forEach(p => ids.add(String(p)));
  return rank([...ids].filter(p => P[p]));
};
function witPassage(f) {
  return f.ps.map(([b, ch, a, z], k) => {
    const rows = [];
    for (let v = a; v <= z; v++) { const t = verseText(b, ch, v); if (t) rows.push([v, t.text]); }
    const eng = engLabel(b, ch, a);
    return `<figure class="witpass">${rows.map(([v, t]) => `<p>${z > a ? `<sup class="vn">${v}</sup> ` : ''}${fmtText(b, t)}</p>`).join('')}
      <figcaption><a href="${witHash([b, ch, a, z])}">${esc(witRef([b, ch, a, z]))}</a>${k === 0 ? `, ${esc(fromLine(b))}` : ''}${eng ? `<br>${esc(eng)}` : ''}</figcaption></figure>`;
  }).join('');
}
function witRelated(f, cited) {
  const r = f.rel, rows = [];
  for (const slug of r.guides) { const g = kcGuide(slug); if (g) rows.push(`<li><a class="wl" href="#/guides/${esc(slug)}"><b>${esc(g.title)}</b><span class="en">${esc(g.sub)}</span><span class="lang">Guide</span></a></li>`); }
  for (const slug of r.church) { const c = churchFigure(slug); if (c) rows.push(`<li><a class="wl" href="#/church/${esc(slug)}"><b>${esc(c.name)}</b><span class="en">${esc(c.line)}</span><span class="lang">Early Church</span></a></li>`); }
  for (const slug of r.names) { const x = (D.PP || []).find(p => p.slug === slug); if (x) rows.push(`<li><a class="wl" href="#/person/${esc(slug)}"><b>${esc(x.name)}</b><span class="en">${esc(x.line)}</span><span class="lang">Name</span></a></li>`); }
  for (const slug of r.words) { const w = D.words.find(x => x.slug === slug); if (w) rows.push(`<li><a class="wl" href="#/word/${esc(slug)}"><b>${esc(w.title)}</b><span class="en">${esc(w.en)}</span><span class="lang">Word</span></a></li>`); }
  const essays = r.essays.filter(p => P[String(p)] && !cited.includes(String(p))).map(String);     // an essay already listed as citing the passage is not listed twice
  if (!rows.length && !essays.length) return '';
  return `<section aria-labelledby="wit-rel"><h2 id="wit-rel">Related Kingdom Code investigations</h2>
    ${essays.length ? pieceList(essays) : ''}${rows.length ? `<div class="card" style="margin-top:${essays.length ? 16 : 0}px;padding-top:8px;padding-bottom:8px"><ul class="list">${rows.join('')}</ul></div>` : ''}</section>`;
}
function witSequence(e) {                        // where the study sits: what it builds on, and what comes before and after
  const pub = witPublished(), vis = n => pub.find(x => x.n === n);
  const prev = vis(e.n - 1), next = vis(e.n + 1), up = e.up.map(vis).filter(Boolean), th = witThread(e.th);
  return `<section class="witseq" aria-labelledby="wit-seq"><h2 id="wit-seq">In this sequence</h2>
    <p class="cap" style="margin-top:4px"><b>${esc(th.name)}.</b> ${esc(th.line)}</p>
    ${up.length ? `<p class="witbuilds">Builds on ${up.map(x => `<a href="#/witness/${x.n}">No. ${x.n}, ${esc(x.t)}</a>`).join('; ')}.</p>` : ''}
    <nav class="witnav" aria-label="Neighbouring studies">${prev ? `<a class="btn secondary" href="#/witness/${prev.n}"><small>Before</small>${esc(prev.t)}</a>` : '<span></span>'}
      ${next ? `<a class="btn secondary next" href="#/witness/${next.n}"><small>After</small>${esc(next.t)}</a>` : '<span></span>'}</nav></section>`;
}
function viewWitnessStudy(n) {
  const e = witEntry(n);
  if (!witVisible(e)) return viewMissing();
  const f = WITF[n];
  if (!f || (f.ps || []).some(([b, ch]) => !chapterText(b, ch))) {      // fetch the study and its book, then draw the page again
    const want = curHash(); deferTrack = true;
    Promise.all([witFile(n), ensureBook(e.bk)]).then(() => { if (curHash() === want) route(); })
      .catch(() => { const m = document.getElementById('loadmsg'); if (m) m.innerHTML = 'The study could not load. Check your connection, then <a href="' + want + '">try again</a>.'; });
    return `${backLink('#/witness')}<h1>${esc(e.t)}</h1><p class="lede" id="loadmsg" role="status">Loading the study…</p>`;
  }
  pendingEvents.push(['witness/open', String(n)]);
  const [b, ch, a] = f.ps[0], date = witDate(n);
  return `
  ${backLink('#/witness')}
  <article class="wit">
    <p class="eyebrow"><span>The Daily Witness</span><span>No. ${n}${date ? ' · ' + date : ''}</span></p>
    <h1>${esc(e.t)}</h1>
    <p class="witrefline">${esc(e.ref)} · ${esc(TR[e.bk])}</p>
    <p class="lede">${esc(e.obs)}</p>
    ${e.st !== 'approved' ? '<p class="cap witdraft">Draft for review. This study is not public yet.</p>' : ''}
    <h2>The passage</h2>
    ${witPassage(f)}
    <h2>Where this sits</h2>
    <p class="cap witplace">${esc(bname(b))} · chapter ${ch} of ${D.CC[b].length} · ${esc(TR[b])}</p>
    <div class="wittext">${witParas(f.ctx)}</div>
    <h2>The investigation</h2>
    <div class="wittext">${witParas(f.inv)}</div>
    <aside class="wittake" aria-label="Take with you"><b>Take this with you</b><p>${witSegs(f.take)}</p></aside>
    <h2>Cross-references</h2>
    <ul class="witx">${f.x.map(c => `<li><a class="witxref" href="${witHash(c.r)}">${esc(witRef(c.r))}</a>${c.q ? `<q class="wq">${esc(c.q)}</q>` : ''}<p>${witSegs(c.w)}</p></li>`).join('')}</ul>
    <h2>Read further</h2>
    <p class="act"><a class="btn primary" href="#/read/${b}/${ch}/${a}">Read ${esc(bname(b))} ${ch}</a><a class="btn secondary" href="${witHash(f.ps[0])}">Study this passage verse by verse</a></p>
    ${(() => { const ids = witCitedIds(f); return (ids.length ? citedSection(ids, '', `${plural(ids.length, 'Kingdom Code essay')} cite${ids.length === 1 ? 's' : ''} verses of this passage.`, null, 'Cited in Kingdom Code essays') : '') + witRelated(f, ids); })()}
    ${witSequence(e)}
  </article>`;
}

// ---------- the archive ----------
function witCoverage(pub) {                      // which books of the canon the published studies have been about, and which they only cross-reference
  const studied = new Set(pub.map(e => e.bk)), crossed = new Set(pub.flatMap(e => e.xb));
  const withText = b => !!D.CC[b];
  const total = Object.keys(D.CC).length, n1 = [...studied].filter(withText).length;
  const missing = D.entries.filter(en => !en.books.some(withText)).length;
  const groups = WIT.g.map(g => `<div class="covg"><h3>${esc(g.name)}</h3><ul class="chips">${g.books.filter(withText).map(b =>
    `<li><a class="chip cv${studied.has(b) ? ' t' : crossed.has(b) ? ' x' : ''}" href="#/book/${D.bookEntry[b]}">${esc(bname(b))}</a></li>`).join('')}</ul></div>`).join('');
  return `<section class="witcov" aria-labelledby="wit-cov"><h2 id="wit-cov">Canon coverage</h2>
    <p class="cap" style="margin-top:4px">${n1} of the ${total} books with text in this archive have been the subject of a study; ${[...crossed].filter(b => withText(b) && !studied.has(b)).length} more appear as cross-references. Filled: studied. Outlined: cross-referenced.
    ${missing ? `${missing} of the canon’s 81 entries have no stored text yet, so no study can draw on them.` : ''}</p>${groups}</section>`;
}
function viewWitnessArchive() {
  const pub = witPublished();
  if (!pub.length && !(witPreview() || WIT.e.some(e => e.st === 'approved'))) return viewMissing();
  const threads = WIT.th.map(th => {
    const es = pub.filter(e => e.th === th.id); if (!es.length) return '';
    return `<section class="witthread"><h2>${esc(th.name)}</h2><p class="cap" style="margin-top:4px">${esc(th.line)}</p>
      <div class="card"><ul class="list">${es.map(e => `<li><a class="wl witrow" href="#/witness/${e.n}"><b>${esc(e.t)}</b><span class="en">${esc(e.obs)}</span>
        <span class="lang">No. ${e.n}${witDate(e.n) ? ' · ' + esc(witDate(e.n)) : ''}${e.st !== 'approved' ? ' · draft' : ''}</span></a></li>`).join('')}</ul></div></section>`;
  }).join('');
  return `
  ${backLink('#/')}
  ${witPreview() && !WIT.e.some(e => e.st === 'approved') ? '<p class="cap accpreview">Preview: no study is approved yet, so none is public.</p>' : ''}
  <p class="eyebrow"><span>Kingdom Code</span><span></span></p>
  <h1>The Daily Witness</h1>
  <p class="lede">One passage a day, each a step in a longer study. Every study asks what the text says, what else in Scripture confirms it, and what that changes.</p>
  <ul class="witrules">
    <li><b>The same for every reader.</b> The day’s study follows the calendar date in one time zone, so everyone reads the same passage together.</li>
    <li><b>Built to build.</b> Studies belong to sequences. Later ones return to what earlier ones found.</li>
    <li><b>The whole canon.</b> The Ethiopian canon is read alongside the rest, not after it.</li>
    <li><b>Checked words.</b> Every quotation in a study is checked against the Bible text in this archive before it is published.</li>
  </ul>
  ${pub.length ? threads + witCoverage(pub) : `<p class="witsoon">The first study opens on ${esc(witDate(1))}.</p>`}`;
}

// ---------- the menu and the footer ----------
let witChromeDone = false;
function witChrome() {
  if (!WIT_ON || witChromeDone || !witPublished().length) return;
  witChromeDone = true;
  const ul = document.querySelector('#menu ul');
  if (ul) {
    const li = document.createElement('li'); li.id = 'witli';
    li.innerHTML = `<a href="${esc(hrefOf('#/witness'))}"><svg class="line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h9a3 3 0 0 1 3 3v11H7a3 3 0 0 1-3-3z"/><path d="M16 8h2a2 2 0 0 1 2 2v9h-4"/></svg>The Daily Witness</a>`;
    ul.insertBefore(li, ul.firstChild);
  }
  const f = document.querySelector('footer .cap');
  if (f) f.insertAdjacentHTML('beforeend', ` · <a href="${esc(hrefOf('#/witness'))}">The Daily Witness</a>`);
}

if (WIT_ON) {
  addRoute('witness', p => p[1] ? viewWitnessStudy(+p[1]) : viewWitnessArchive());
  onPage(() => witChrome());
  document.addEventListener('visibilitychange', () => {       // a page left open past the schedule's midnight shows the new study when it is looked at again
    const c = document.querySelector('[data-dw]'), t = c && witToday();
    if (!document.hidden && t && +c.dataset.dw !== t.e.n) route();
  });
}

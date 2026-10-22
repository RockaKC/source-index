// essays.js: Kingdom Code essays: citations, essay lists, question paths, seasonal reads, the essay page and the call-to-action tool
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- essay -> verses ----------
const REFS = {};
for (const b in D.verses) for (const ch in D.verses[b]) for (const v in D.verses[b][ch])
  for (const p of D.verses[b][ch][v]) (REFS[p] = REFS[p] || []).push([+b, +ch, +v]);
const hasRefs = pid => !!(REFS[pid] && REFS[pid].length);
function spans(list) {
  const s = list.slice().sort((a,c) => a[0]-c[0] || a[1]-c[1] || a[2]-c[2]), out = [];
  for (const [b,ch,v] of s) { const l = out[out.length-1];
    if (l && l.b === b && l.ch === ch && v === l.ve + 1) l.ve = v; else out.push({b, ch, vs:v, ve:v}); }
  return out;
}
const spanLabel = s => `${bname(s.b)} ${s.ch}:${s.vs}${s.ve > s.vs ? '\u2013' + s.ve : ''}`;
function related(pid, n) {
  const score = {};
  for (const [b,ch,v] of (REFS[pid] || [])) for (const p of D.verses[b][ch][v]) if (+p !== +pid) score[p] = (score[p] || 0) + 1;
  return Object.keys(score).sort((a,c) => score[c]-score[a] || P[c][5]-P[a][5]).slice(0, n).map(p => [+p, score[p]]);
}
const PUB = new Set((D.PUB || []).map(String));   // public Substack essays: listed even before their citations are in
const ET = D.ET || {};                    // essay id -> words, for the essays whose text is on this website (site profile only)
const onSite = pid => !!(PROFILE.essayText && ET[pid]);
const srcLink = pid => !onSite(pid) && hasRefs(pid) ? ` \u00b7 <a href="#/essay/${pid}">Sources</a>` : '';

// ---------- piece pieces ----------
const meta = pid => `${PLAT[P[pid][2]] || esc(P[pid][2])}, ${fmtDate(P[pid][3])}`;
const seriesCap = pid => P[pid][4] ? `<p class="cap">${esc(P[pid][4])}</p>` : '';
const link = pid => onSite(pid) ? `href="#/essay/${pid}" data-pid="${pid}"` : `href="${esc(P[pid][1])}" target="_blank" rel="noopener" data-pid="${pid}"`;   // an essay with its text here opens here
function feature(pid) {
  return `<div class="card feature">${seriesCap(pid)}
    <h3><a ${link(pid)}>${esc(P[pid][0])}</a></h3>
    <p class="cap">${meta(pid)}${srcLink(pid)}</p>
    <a class="btn primary" ${link(pid)} aria-label="Read the essay: ${esc(P[pid][0])}">Read the essay</a></div>`;
}
function pieceList(ids) {
  return `<div class="card"><ul class="list">${ids.map(pid => `<li class="piece">${seriesCap(pid)}
    <div class="t"><a ${link(pid)}>${esc(P[pid][0])}</a></div><p class="cap">${meta(pid)}${srcLink(pid)}</p></li>`).join('')}</ul></div>`;
}
const rank = ids => ids.slice().sort((a,b) => {
  const ca = D.conv.indexOf(+a), cb = D.conv.indexOf(+b);
  if ((ca > -1) !== (cb > -1)) return ca > -1 ? -1 : 1;
  if (ca > -1 && cb > -1) return ca - cb;
  return P[b][5] - P[a][5];
});
// The one place the Bible's own pages point to essays: a separate section, last on the page, listing every essay that cites the verse or passage.
function citedSection(ids, none, lede, note, title) {      // note(pid): an extra line before an essay's date, e.g. how many verses of a passage it cites
  const body = ids.length ? `<div class="card"><ul class="list">${ids.map(pid => `<li class="piece">${seriesCap(pid)}
    <div class="t"><a ${link(pid)}>${esc(P[pid][0])}</a></div><p class="cap">${note ? note(pid) + ' \u00b7 ' : ''}${meta(pid)}${srcLink(pid)}</p></li>`).join('')}</ul></div>` : '';
  return `<section class="cited" aria-labelledby="cited-t"><h2 id="cited-t">${title || 'Cited in Kingdom Code essays'}</h2>
    <p class="cap" style="margin-top:4px">${ids.length ? lede : none}</p>${body}</section>`;
}

function piecesForBook(bs) {
  const s = new Set();
  bs.forEach(b => { const v = D.verses[b] || {}; for (const ch in v) for (const x in v[ch]) v[ch][x].forEach(p => s.add(+p)); });
  return [...s];
}

// ---------- reads ----------
function rangeLabel(r) {
  const [, , b, cs, vs, ce, ve] = r, n = bname(b);
  if (ve === 999) return cs === ce ? `${n} ${cs}` : `${n} ${cs} to ${ce}`;
  if (cs === ce) return vs === ve ? `${n} ${cs}:${vs}` : `${n} ${cs}:${vs}\u2013${ve}`;
  return `${n} ${cs}:${vs}\u2013${ce}:${ve}`;
}
function readLabel(r) {                 // Psalms: add the English number when it differs from the Septuagint one
  let e = null;
  const pe = PE[r[2]]; if (pe) for (let v = r[4]; v < r[4] + 4 && !e; v++) e = pe[`${r[3]}:${v}`];   // a superscription can shift verse 1
  return rangeLabel(r) + (e && e[0] !== r[3] ? ` (${e[0]} in English Bibles)` : '');
}
function viewPath(id) {
  const p = D.paths.find(x => x.id === id); if (!p) return viewMissing();
  const [first, ...rest] = p.p;
  return `
  ${backLink(`#/`)}
  <h1>${esc(p.q)}</h1>
  <p class="lede">${esc(p.intro)}</p>
  <h2>Start here</h2>
  <div style="margin-top:16px">${feature(first)}</div>
  <h2>Then read</h2>
  ${pieceList(rest)}`;
}
// ---------- an essay's text, read on the website ----------
const ESSAYS = {};                       // essay id -> page HTML, once fetched
const srefLinks = h => h.replace(/<a class="sref" data-ref="([\d:-]+)" href="[^"]*"/g, (m, k) => {      // each reference the author wrote goes to its passage
  const [b, ch, vs, ve] = k.split(/[:-]/).map(Number);
  return `<a class="sref" data-ref="${k}" href="${scriptureHash([b, ch, vs, ve || vs])}"`;
});
// A figure's name inside an essay read on the site: the first mention in the essay's own words links to the figure's page. Added when the page is
// drawn, so the essay's words and files stay exactly as written. Only the figures the database connects to this essay (D.PP[].essays, from the
// confirmed about links) and the Early Church figures the essay cites or discusses (D.EL, tools/connections.py) are linked, never inside a quotation, a heading
// or another link, and at most six to an essay.
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function figureLinks(pid, h) {
  const figs = [...(D.PP || []).filter(f => f.al && f.al.length && f.essays.includes(+pid)).map(f => ({slug: f.slug, al: f.al, href: '#/person/' + f.slug})),
    ...(D.EC || []).filter(f => (f.link_terms || {}).names && ((D.EL || {})['church/' + f.slug] || []).some(r => r[0] === +pid))
      .map(f => ({slug: f.slug, al: f.link_terms.names.slice().sort((a, b) => b.length - a.length), href: '#/church/' + f.slug}))];
  if (!figs.length) return h;
  const root = new DOMParser().parseFromString(`<div>${h}</div>`, 'text/html').body.firstChild;
  let made = 0;
  for (const f of figs) {
    if (made >= 6) break;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${f.al.map(escRe).join('|')})(?![\\p{L}\\p{N}])`, 'u');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('blockquote, a, h2, h3, h4, sup')) continue;
      const m = re.exec(n.nodeValue); if (!m) continue;
      const hit = n.splitText(m.index + m[1].length); hit.splitText(m[2].length);
      const a = document.createElement('a');
      a.className = 'fref'; a.href = f.href; a.dataset.fig = f.slug; a.textContent = m[2];
      hit.replaceWith(a); made++;
      break;
    }
  }
  return made ? root.innerHTML : h;
}
async function ensureEssay(pid) {
  if (ESSAYS[pid]) return;
  const r = await fetch(`essay-text/${pid}.json`);
  if (!r.ok) throw new Error('essay');
  ESSAYS[pid] = figureLinks(pid, srefLinks((await r.json()).h));
}
function essayHead(pid) {                // the title, the line under it, and (once loaded) the text itself
  const [title, , , date] = P[pid], mins = Math.max(1, Math.round(ET[pid] / 220));
  return `${backLink('#/essays')}<div class="essayhead">${seriesCap(pid)}<h1>${esc(title)}</h1>
  <div class="essayline"><p class="cap essaymeta">${meta(pid)} \u00b7 ${mins} min read</p></div></div>`;
}
function essayBody(pid) {
  const [, url, plat] = P[pid];
  return `<article class="essaytext">${ESSAYS[pid]}</article>
  <div class="card essayfoot"><p class="cap" style="margin:0">Originally published on ${PLAT[plat] || esc(plat)}, ${fmtDate(P[pid][3])}.
    <a href="${esc(url)}" target="_blank" rel="noopener" data-pid="${pid}">Read it there</a>, or subscribe to the publication.</p></div>`;
}
function viewEssay(pid) {
  if (!P[pid]) return viewMissing();
  const [title, url, plat, date] = P[pid];
  if (onSite(pid) && !ESSAYS[pid]) {     // fetch the text, then draw the page again
    const want = curHash(); deferTrack = true;
    ensureEssay(pid).then(() => { if (curHash() === want) route(); })
      .catch(() => { const m = document.getElementById('loadmsg'); if (m) m.innerHTML = 'The essay could not load. Check your connection, then <a href="' + want + '">try again</a>.'; });
    return `${essayHead(pid)}<p class="lede" id="loadmsg" role="status">Loading the essay\u2026</p>`;
  }
  if (onSite(pid) && !hasRefs(pid)) return `${essayHead(pid)}${essayBody(pid)}`;
  if (!hasRefs(pid)) return `${backLink(`#/`)}<h1>${esc(title)}</h1>
    <p class="lede">No Scripture references from this essay are in the index yet.</p>
    <p style="margin-top:24px"><a class="btn primary" ${link(pid)}>Read the essay</a></p>`;
  const refs = REFS[pid], books = [...new Set(refs.map(r => r[0]))].sort((a,c) => a-c);
  const groups = books.map(b => `<div class="grp"><h3>${esc(bname(b))}</h3><ul class="chips">${
    spans(refs.filter(r => r[0] === b)).map(s => `<li><a class="chip" href="#/verse/${s.b}/${s.ch}/${s.vs}" aria-label="${esc(spanLabel(s))}">${esc(s.ch + ':' + s.vs + (s.ve > s.vs ? '\u2013' + s.ve : ''))}</a></li>`).join('')}</ul></div>`).join('');
  const sorted = refs.slice().sort((a,c) => a[0]-c[0] || a[1]-c[1] || a[2]-c[2]);
  const shown = sorted.filter(([b,ch,v]) => verseText(b,ch,v)).slice(0, 6);
  const texts = shown.length ? `<h2>The verses</h2>${shown.map(([b,ch,v]) => textCard(b, ch, v, v, `${bname(b)} ${ch}:${v}`)).join('')}${sorted.length > shown.length ? `<p class="cap" style="margin-top:12px">Showing ${shown.length} of ${sorted.length}. Tap any verse above to read the rest.</p>` : ''}` : '';
  const rel = related(pid, 3);
  const relHtml = rel.length ? `<h2>Essays that cite the same verses</h2><div class="card"><ul class="list">${rel.map(([p,n]) => `<li class="piece">${seriesCap(p)}
    <div class="t"><a ${link(p)}>${esc(P[p][0])}</a></div><p class="cap">${plural(n,'shared verse')} \u00b7 ${meta(p)}${srcLink(p)}</p></li>`).join('')}</ul></div>` : '';
  if (onSite(pid)) return essayReading(pid, refs, books, groups, texts, rel);
  return `${backLink(`#/`)}
  <h1>${esc(title)}</h1>
  <p class="lede">${meta(pid)}. Cites ${plural(refs.length,'verse')} across ${plural(books.length,'book')}.</p>
  <p style="margin-top:24px"><a class="btn primary" ${link(pid)} aria-label="Read the essay: ${esc(title)}">Read the essay</a></p>
  <h2>Scripture cited</h2>${groups}
  ${wordsForEssay(pid).length ? `<h2>Words discussed</h2><ul class="chips">${wordsForEssay(pid).map(w => `<li><a class="chip" href="#/word/${w.slug}">${esc(w.title)}</a></li>`).join('')}</ul>` : ''}
  ${libraryChips(pid)}
  ${connectionChips(pid)}
  ${texts}
  ${relHtml}`;
}
// An essay read on the site: the text, then one compact Sources & Scripture section (everything the Source Index holds for it, folded away), then the related investigations.
function essayReading(pid, refs, books, groups, texts, rel) {
  const disc = (title, count, body) => `<details class="disc"><summary><span>${title}</span>${count === '' ? '' : `<span class="count">${count}</span>`}</summary><div class="discbody">${body}</div></details>`;
  const words = wordsForEssay(pid).length ? `<h3>Words discussed</h3><ul class="chips">${wordsForEssay(pid).map(w => `<li><a class="chip" href="#/word/${w.slug}">${esc(w.title)}</a></li>`).join('')}</ul>` : '';
  const more = [words, libraryChips(pid), connectionChips(pid)].join('').replace(/<h2>/g, '<h3>').replace(/<\/h2>/g, '</h3>');
  const relHtml = rel.length ? `<section class="relinv" aria-labelledby="relinv-t"><h2 id="relinv-t">Related investigations</h2>
    <p class="cap" style="margin-top:4px">Kingdom Code essays that cite the same verses.</p>
    <div class="card"><ul class="list">${rel.map(([p, n]) => `<li class="piece">${seriesCap(p)}
    <div class="t"><a ${link(p)}>${esc(P[p][0])}</a></div><p class="cap">${plural(n, 'shared verse')} \u00b7 ${meta(p)}${srcLink(p)}</p></li>`).join('')}</ul></div></section>` : '';
  return `${essayHead(pid)}${essayBody(pid)}
  <section class="srcs" aria-labelledby="srcs-t"><h2 id="srcs-t">Sources &amp; Scripture</h2>
    <p class="cap">${plural(refs.length, 'verse')} across ${plural(books.length, 'book')} cited in this essay.</p>
    ${disc('All cited passages', refs.length, groups)}
    ${texts ? disc('The verses', 'first ' + Math.min(6, refs.filter(([b, ch, v]) => verseText(b, ch, v)).length), texts.replace(/<h2>[^<]*<\/h2>/, '')) : ''}
    ${more.trim() ? disc('In the Source Index', '', more) : ''}
  </section>
  ${relHtml}`;
}
function ctaFor(pid) {
  const url = absUrl('#/essay/' + pid) + (CLEAN ? '?utm_source=substack&utm_campaign=essay-' + pid : '');    // the visit report then names the essay that sent the reader
  return {
    html: `<p><strong>Sources for this essay.</strong> Every verse cited here, and every other Kingdom Code essay that quotes it, is in the <a href="${url}">Source Index</a>.</p>`,
    text: `Sources for this essay. Every verse cited here, and every other Kingdom Code essay that quotes it, is in the Source Index: ${url}`
  };
}
function viewCta(q) {
  q = (q || '').toLowerCase().trim();
  const ids = Object.keys(P).filter(pid => P[pid] && hasRefs(pid) && (!q || P[pid][0].toLowerCase().includes(q)))
    .sort((a,b) => P[b][3].localeCompare(P[a][3]));
  return `
  ${backLink(`#/`)}
  <h1>Essay call-to-action</h1>
  <p class="lede">Add this to the end of an essay. It sends readers to the sources behind it.</p>
  <div class="card" style="margin-top:24px"><p class="cap">Links point to</p><p class="base" style="margin:4px 0 0">${esc(BASE)}</p></div>
  <form class="search" role="search" id="cf">
    <label class="sr" for="cq">Find an essay</label>
    <input id="cq" type="search" value="${esc(q)}" placeholder="Part of an essay title" autocomplete="off" enterkeyhint="search">
    <button class="btn secondary" type="submit" style="height:48px">Find</button>
  </form>
  <div class="card" style="margin-top:16px"><ul class="list">${ids.slice(0, 40).map(pid => `<li class="piece">
    <div class="t">${esc(P[pid][0])}</div><p class="cap">${meta(pid)}</p>
    <button class="btn secondary" data-cta="${pid}" aria-label="Copy the call-to-action for: ${esc(P[pid][0])}">Copy CTA</button><span class="cap ok" data-st="${pid}" role="status"></span></li>`).join('')}</ul></div>
  ${ids.length > 40 ? `<p class="cap" style="margin-top:12px">Showing the 40 newest of ${ids.length}. Search to narrow.</p>` : ''}`;
}
async function copyRich(html, text) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({'text/html': new Blob([html], {type:'text/html'}), 'text/plain': new Blob([text], {type:'text/plain'})})]);
      return true;
    }
  } catch (e) {}
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

function viewKC() {                 // From Kingdom Code: the essays in their own section
  const qs = D.paths.map(p => `<li><a class="q" href="#/path/${p.id}"><span>${esc(p.q)}</span><i aria-hidden="true">Read</i></a></li>`).join('');
  return `
  ${backLink('#/')}
  <h1>From Kingdom Code</h1>
  <p class="lede">Kingdom Code is an independent, investigative publication for the Body of Christ. Its essays are gathered here, apart from the Bible text.</p>
  <h2>Start with a question</h2>
  <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${qs}</ul></div>
  <p style="margin-top:24px"><a class="btn secondary" href="https://kingdomcode.substack.com" target="_blank" rel="noopener">Read the publication</a></p>`;
}

addRoute('kc', () => viewKC());
addRoute('path', p => viewPath(p[1]));
addRoute('essay', p => viewEssay(+p[1]));
addRoute('cta', p => viewCta(decodeURIComponent(p.slice(1).join('/'))));
onPage(() => {
  const cf = document.getElementById('cf');
  if (cf) cf.addEventListener('submit', e => { e.preventDefault(); navigate('#/cta/' + encodeURIComponent(document.getElementById('cq').value.trim())); });
  document.querySelectorAll('[data-cta]').forEach(b => b.addEventListener('click', async () => {
    const c = ctaFor(+b.dataset.cta), ok = await copyRich(c.html, c.text), st = document.querySelector(`[data-st="${b.dataset.cta}"]`);
    if (st) st.textContent = ok ? 'Copied' : 'Copy was blocked. Press and hold the text instead.';
  }));
});

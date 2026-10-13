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
const srcLink = pid => hasRefs(pid) ? ` \u00b7 <a href="#/essay/${pid}">Sources</a>` : '';

// ---------- piece pieces ----------
const meta = pid => `${PLAT[P[pid][2]] || esc(P[pid][2])}, ${fmtDate(P[pid][3])}`;
const seriesCap = pid => P[pid][4] ? `<p class="cap">${esc(P[pid][4])}</p>` : '';
const link = pid => `href="${esc(P[pid][1])}" target="_blank" rel="noopener" data-pid="${pid}"`;
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
function elsewhere(b, ch, shown) {      // essays that cite this chapter but are not already on the page
  const seen = new Set(shown.map(Number)), out = new Set();
  Object.values((D.verses[b] || {})[ch] || {}).forEach(ps => ps.forEach(p => { if (!seen.has(+p)) out.add(+p); }));
  const ids = rank([...out]).slice(0, 3);
  return ids.length ? `<h2>Elsewhere in ${esc(bname(b))} ${ch}</h2>${pieceList(ids)}` : '';
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
function readList(rs) {
  rs = rs.slice().sort((a,b) => a[3]-b[3] || a[4]-b[4] || a[0]-b[0] || a[1]-b[1]);
  return `<div class="card"><ul class="list">${rs.map(r => {
    const g = D.guides[r[0]];
    const act = g[1] ? `<a class="btn secondary" href="${esc(g[1])}" target="_blank" rel="noopener" aria-label="Open the guide: ${esc(g[0])}">Open the guide</a>` : `<span class="cap">Returns next winter</span>`;
    return `<li class="row"><div><div class="r">${esc(readLabel(r))}</div><p class="cap">${esc(g[0])}, day ${r[1]}, ${TRANS[r[7]] || esc(r[7])}</p></div>${act}</li>`;
  }).join('')}</ul></div>`;
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
function viewEssay(pid) {
  if (!P[pid]) return viewMissing();
  const [title, url, plat, date] = P[pid];
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
  return `
  ${backLink(`#/`)}
  <h1>${esc(title)}</h1>
  <p class="lede">${meta(pid)}. Cites ${plural(refs.length,'verse')} across ${plural(books.length,'book')}.</p>
  <p style="margin-top:24px"><a class="btn primary" ${link(pid)} aria-label="Read the essay: ${esc(title)}">Read the essay</a></p>
  <h2>Scripture cited</h2>${groups}
  ${wordsForEssay(pid).length ? `<h2>Words discussed</h2><ul class="chips">${wordsForEssay(pid).map(w => `<li><a class="chip" href="#/word/${w.slug}">${esc(w.title)}</a></li>`).join('')}</ul>` : ''}
  ${texts}
  ${relHtml}`;
}
function ctaFor(pid) {
  const url = `${BASE}#/essay/${pid}`;
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

addRoute('path', p => viewPath(p[1]));
addRoute('essay', p => viewEssay(+p[1]));
addRoute('cta', p => viewCta(decodeURIComponent(p.slice(1).join('/'))));
onPage(() => {
  const cf = document.getElementById('cf');
  if (cf) cf.addEventListener('submit', e => { e.preventDefault(); location.hash = '#/cta/' + encodeURIComponent(document.getElementById('cq').value.trim()); });
  document.querySelectorAll('[data-cta]').forEach(b => b.addEventListener('click', async () => {
    const c = ctaFor(+b.dataset.cta), ok = await copyRich(c.html, c.text), st = document.querySelector(`[data-st="${b.dataset.cta}"]`);
    if (st) st.textContent = ok ? 'Copied' : 'Copy was blocked. Press and hold the text instead.';
  }));
});

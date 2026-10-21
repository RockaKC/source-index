// words.js: the Hebrew and Greek word entries and their pages
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

// ---------- words ----------
const WORDS = D.words || [];
const wordBySlug = s => WORDS.find(w => w.slug === s);
const normW = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
function wordMatches(w, k) {
  const hay = [w.title, ...w.forms.map(f => f.t), ...(w.kw || [])];
  return hay.some(h => normW(h).startsWith(k) || h.toLowerCase().split(/[^a-z\u2019']+/).some(tok => normW(tok).startsWith(k)));
}
function findWord(q) {
  const k = normW(q); if (k.length < 3) return null;
  return WORDS.find(w => w.forms.some(f => normW(f.t) === k) || (w.kw || []).some(x => normW(x) === k))
      || WORDS.find(w => normW(w.title).includes(k)) || null;
}
const wordsForVerse = (b, ch, v) => WORDS.filter(w => w.verses.some(([wb,wch,vs,ve]) => wb === b && wch === ch && v >= vs && v <= ve));
const wordsForEssay = pid => WORDS.filter(w => +w.essay === +pid);
function viewWords() {
  return `
  ${backLink(`#/`)}
  <h1>Words</h1>
  <p class="lede">Each entry shows the Hebrew or Greek term, its English meaning, and where it appears.</p>
  <div class="card" style="margin-top:24px;padding-top:8px;padding-bottom:8px"><ul class="list">${WORDS.map(w =>
    `<li><a class="wl" href="#/word/${w.slug}"><b>${esc(w.title)}</b><span class="en">${esc(w.en)}</span><span class="lang">${esc(w.lang)}</span></a></li>`).join('')}</ul></div>`;
}
const baseStrongs = k => k.replace(/[A-Za-z]$/, '');
function dictPanel(w) {               // dictionary entries for the Strong's numbers each form is linked to
  const items = w.forms.map(f => D.LX && f.n && D.LX[f.n]).filter(Boolean);
  if (!items.length) return '';
  const row = e => `<li class="dict"><div class="dh"><span class="dw" lang="${e.lang === 'grc' ? 'grc' : 'he'}">${esc(e.l)}</span><span class="dt">${esc(e.t)}</span><span class="dn">${esc(baseStrongs(e.k))}</span></div>
      <p class="dg">${esc(e.g)}</p>
      ${e.m.length ? `<p class="cap" style="margin-top:2px">Other senses: ${esc(e.m.join(', '))}</p>` : ''}
      ${e.d ? `<details><summary>Full entry</summary><div class="dd">${e.d.split('\n').map(x => `<p>${esc(x)}</p>`).join('')}</div></details>` : ''}</li>`;
  return `<h2>In the dictionary</h2>
  <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${items.map(row).join('')}</ul></div>`;
}
function viewWord(slug) {
  const w = wordBySlug(slug); if (!w) return viewMissing();
  const pid = w.essay;
  const rows = w.forms.map(f => `<li class="wf"><div class="lg">${esc(f.l)}</div><div><div class="w">${esc(f.t)}</div>${f.s ? `<span class="sc" lang="he">${esc(f.s)}</span>` : ''}<p class="g">${esc(f.g)}</p></div></li>`).join('');
  const refHref = scriptureHash;
  const vs = w.verses.map(r => hasVerse(r[0], r[1], r[2]) || hasChapter(r[0], r[1])
    ? `<li><a class="chip" href="${refHref(r)}">${esc(vrefLabel(r))}</a></li>`
    : `<li><span class="chip static">${esc(vrefLabel(r))}</span></li>`).join('')
    + (w.labels || []).map(l => `<li><span class="chip static">${esc(l)}</span></li>`).join('');
  const cards = w.verses.slice(0, 3).map(r => textCard(r[0], r[1], r[2], r[3], vrefLabel(r))).join('');
  return `
  ${backLink(`#/words`)}
  <h1>${esc(w.title)}</h1>
  <p class="enline"><span class="cap">In English</span><b>${esc(w.en)}</b></p>
  <p class="lede">${esc(w.lang)}. Explained in a Kingdom Code essay.</p>
  <h2>Side by side</h2>
  <div class="card" style="margin-top:16px"><ul class="list">${rows}</ul></div>
  <h2>How Kingdom Code explains it</h2>
  <div class="card say" style="margin-top:16px">${w.excerpt.map(e => `<p>${esc(e)}</p>`).join('')}<p class="cap" style="margin-top:16px">From \u201c${esc(P[pid][0])}\u201d, ${meta(pid)}</p></div>
  <p style="margin-top:24px"><a class="btn primary" ${link(pid)} aria-label="Read the essay: ${esc(P[pid][0])}">Read the essay</a></p>
  ${dictPanel(w)}
  ${vs ? `<h2>Verses</h2><ul class="chips">${vs}</ul>` : ''}
  ${cards}`;
}

addRoute('words', () => viewWords());
addRoute('word', p => viewWord(p[1]));

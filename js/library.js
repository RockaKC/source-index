// library.js: the Essays library: search, subjects, topics, the year archive and (later) reading collections
// Loaded as a plain script after js/connections.js; see index.html for the order. Shared names live in the page's global scope.
// The data is D.LIB (tools/library.json through tools/export_site.py): each essay has one subject and several topics. A subject or a topic is a
// page that lists its essays and the Source Index pages it connects to (books, names, words, figures), so essays, the Bible and the
// history pages reach each other. A reading collection is a curated, ordered list (D.LIB.cols); none exist yet, and the page is ready for them.

const LIB = PROFILE.library && D.LIB ? D.LIB : null;
const libCat = id => LIB && LIB.cats.find(c => c.id === id);
const libTag = id => LIB && LIB.tags.find(t => t.id === id);
const libEssays = () => essayIds().filter(pid => LIB.ess[pid]);
const libLinks = links => links.length ? `<h2>In the Source Index</h2><ul class="chips">${links.map(x => `<li><a class="chip" href="${x.h}">${esc(x.l)}</a></li>`).join('')}</ul>` : '';
const libTopicChips = (ids, skip) => {          // the topics the essays in `ids` carry, most used first, with their counts
  const n = {};
  ids.forEach(pid => LIB.ess[pid][1].forEach(t => { if (t !== skip) n[t] = (n[t] || 0) + 1; }));
  return Object.keys(n).sort((a, b) => n[b] - n[a] || libTag(a).name.localeCompare(libTag(b).name));
};
const libChip = t => `<li><a class="chip" href="#/essays/topic/${t.id}">${esc(t.name)}</a></li>`;
const libByYear = ids => {                      // a long list read year by year, newest first
  const years = [...new Set(ids.map(pid => P[pid][3].slice(0, 4)))];
  return years.map(y => `<h2>${y}</h2>${pieceList(ids.filter(pid => P[pid][3].startsWith(y)))}`).join('');
};
const libList = ids => ids.length > 12 ? libByYear(ids) : pieceList(ids);

// ---- search: titles, subjects, topics. The essays' text is not on the site, so it matches what each essay is filed under as well as its title ----
function libSearch(q) {
  const words = q.toLowerCase().split(/[^a-z0-9À-ɏ']+/).filter(w => w.length > 1);
  if (!words.length) return null;
  const hits = [];
  for (const pid of libEssays()) {
    const [cat, tags] = LIB.ess[pid], title = P[pid][0].toLowerCase(), filed = [libCat(cat).name, ...tags.map(t => libTag(t).name), P[pid][4] || ''].join(' ').toLowerCase();
    let score = 0;
    for (const w of words) {
      const inTitle = title.includes(w), inFiled = filed.includes(w);
      if (!inTitle && !inFiled) { score = 0; break; }
      score += (inTitle ? 10 : 0) + (inFiled ? 4 : 0);
    }
    if (score) hits.push([pid, score]);
  }
  hits.sort((a, b) => b[1] - a[1] || P[b[0]][3].localeCompare(P[a[0]][3]));
  const has = s => words.every(w => s.toLowerCase().includes(w));
  return {ids: hits.map(h => h[0]), subjects: LIB.cats.filter(c => has(c.name)), topics: LIB.tags.filter(t => has(t.name))};
}
function libResults(q) {
  const r = libSearch(q);
  if (!r) return '';
  const where = [...r.subjects.map(c => `<li><a class="chip" href="#/essays/subject/${c.id}">${esc(c.name)}</a></li>`), ...r.topics.map(libChip)].join('');
  return `<h2>${r.ids.length ? plural(r.ids.length, 'essay') : 'No essays'} for “${esc(q.trim())}”</h2>
    ${where ? `<p class="cap" style="margin-top:4px">Subjects and topics with that name</p><ul class="chips">${where}</ul>` : ''}
    ${r.ids.length ? pieceList(r.ids.slice(0, 40)) + (r.ids.length > 40 ? `<p class="cap" style="margin-top:8px">Showing the first 40. Narrow the search to see the rest.</p>` : '')
      : '<p class="cap" style="margin-top:8px">Try a topic such as Enoch, canon or Rome, or part of a title.</p>'}`;
}
onPage(p => {
  if (!LIB || p[0] !== 'essays' || p[1]) return;
  const input = document.getElementById('esq'), out = document.getElementById('esr'), browse = document.getElementById('esb');
  if (!input) return;
  const show = () => {
    const html = libResults(input.value);
    out.innerHTML = html; cleanLinks(out); out.hidden = !html; browse.hidden = !!html;
  };
  input.addEventListener('input', show);
  document.getElementById('esf').addEventListener('submit', e => { e.preventDefault(); show(); });
});

// ---- the pages ----
function viewEssaysHome() {
  const ids = libEssays(), years = [...new Set(ids.map(pid => P[pid][3].slice(0, 4)))];
  const count = {};
  ids.forEach(pid => { const c = LIB.ess[pid][0]; count[c] = (count[c] || 0) + 1; });
  const cards = LIB.cats.filter(c => count[c.id]).map(c => `<li><a class="cc" href="#/essays/subject/${c.id}"><span class="cn">${count[c.id]}</span><b>${esc(c.name)}</b><span class="cd">${esc(c.line)}</span></a></li>`).join('');
  const popular = LIB.tags.slice().sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, 14);
  const cols = LIB.cols.length ? `<h2>Reading collections</h2><div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${LIB.cols.map(c => `<li><a class="wl" href="#/essays/collection/${c.id}"><b>${esc(c.title)}</b><span class="en">${esc(c.line)}</span><span class="lang">${plural(c.items.length, 'essay')}</span></a></li>`).join('')}</ul></div>` : '';
  const yearRows = years.map(y => { const n = ids.filter(pid => P[pid][3].startsWith(y)); return `<li><a class="wl" href="#/essays/${y}"><b>${y}</b><span class="en">${esc(P[n[0]][0])}</span><span class="lang">${plural(n.length, 'essay')}</span></a></li>`; }).join('');
  return `
  ${backLink('#/')}
  <h1>Essays</h1>
  <p class="lede">${plural(ids.length, 'Kingdom Code essay')}. Search them, browse by subject, or read them year by year.</p>
  <form class="search" role="search" id="esf">
    <label class="sr" for="esq">Search the essays</label>
    <input id="esq" type="search" placeholder="Search the essays" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
    <button class="btn primary" type="submit">Search</button>
  </form>
  <div id="esr" aria-live="polite" hidden></div>
  <div id="esb">
    <h2>Browse by subject</h2>
    <ul class="coll">${cards}</ul>
    <h2>Latest investigations</h2>${pieceList(ids.slice(0, 5))}
    <h2>Popular topics</h2>
    <ul class="chips">${popular.map(libChip).join('')}</ul>
    <p class="cap" style="margin-top:12px"><a href="#/essays/topics" style="color:var(--accent)">All ${LIB.tags.length} topics</a></p>
    ${cols}
    <h2>Browse by year</h2>
    <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${yearRows}</ul></div>
  </div>`;
}
function viewEssayYear(year) {                  // one year's essays, newest first
  const ids = libEssays().filter(pid => P[pid][3].startsWith(year));
  if (!ids.length) return viewMissing();
  const years = [...new Set(libEssays().map(pid => P[pid][3].slice(0, 4)))];
  return `
  ${backLink('#/essays')}
  <h1>Essays, ${year}</h1>
  <p class="lede">${plural(ids.length, 'Kingdom Code essay')} from ${year}, newest first. Each opens where it was published; Sources lists the verses it quotes.</p>
  <ul class="chips" aria-label="Other years">${years.filter(y => y !== year).map(y => `<li><a class="chip" href="#/essays/${y}">${y}</a></li>`).join('')}</ul>
  ${pieceList(ids)}`;
}
function viewSubject(id) {
  const c = libCat(id), ids = c && libEssays().filter(pid => LIB.ess[pid][0] === id);
  if (!c || !ids.length) return viewMissing();
  const topics = libTopicChips(ids).map(libTag).filter(Boolean);
  return `
  ${backLink('#/essays')}
  <h1>${esc(c.name)}</h1>
  <p class="lede">${esc(c.line)}</p>
  <p class="cap" style="margin-top:4px">${plural(ids.length, 'essay')}, newest first</p>
  ${topics.length ? `<h2>Topics in this subject</h2><ul class="chips">${topics.map(libChip).join('')}</ul>` : ''}
  ${libLinks(c.links)}
  <h2>The essays</h2>${libList(ids)}`;
}
function viewTopic(id) {
  const t = libTag(id), ids = t && libEssays().filter(pid => LIB.ess[pid][1].includes(id));
  if (!t || !ids.length) return viewMissing();
  const related = libTopicChips(ids, id).slice(0, 8).map(libTag).filter(Boolean);
  return `
  ${backLink('#/essays/topics')}
  <h1>${esc(t.name)}</h1>
  <p class="lede">${esc(t.line)}</p>
  <p class="cap" style="margin-top:4px">${plural(ids.length, 'essay')}, newest first</p>
  ${libLinks(t.links)}
  <h2>The essays</h2>${libList(ids)}
  ${related.length ? `<h2>Related topics</h2><ul class="chips">${related.map(libChip).join('')}</ul>` : ''}`;
}
function viewTopics() {
  const tags = LIB.tags.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `
  ${backLink('#/essays')}
  <h1>All topics</h1>
  <p class="lede">${plural(tags.length, 'topic')} across the essays. Each essay has one subject and several topics.</p>
  <ul class="chips">${tags.map(t => `<li><a class="chip" href="#/essays/topic/${t.id}">${esc(t.name)} <span style="opacity:.6">${t.n}</span></a></li>`).join('')}</ul>`;
}
function viewCollection(id) {                   // a curated reading path: an ordered list, each essay with its place in the order
  const c = LIB.cols.find(x => x.id === id), ids = c && c.items.filter(pid => P[pid]);
  if (!c || !ids.length) return viewMissing();
  return `
  ${backLink('#/essays')}
  <h1>${esc(c.title)}</h1>
  ${c.line ? `<p class="lede">${esc(c.line)}</p>` : ''}
  <p class="cap" style="margin-top:4px">${plural(ids.length, 'essay')}, in reading order</p>
  <ol class="gtoc">${ids.map((pid, i) => `<li><span class="gpg">${i + 1}</span><div><b><a ${link(pid)}>${esc(P[pid][0])}</a></b><span>${meta(pid)}${srcLink(pid)}</span></div></li>`).join('')}</ol>`;
}

// ---- on an essay's Sources page: its subject, its topics, and the Source Index pages those lead to ----
function libraryChips(pid) {
  const e = LIB && LIB.ess[pid];
  if (!e) return '';
  const tags = e[1].map(libTag).filter(Boolean), shown = new Set(((connections().byEssay.get(String(pid))) || []).map(c => c.href)), seen = new Set(), related = [];
  for (const x of [...libCat(e[0]).links, ...tags.flatMap(t => t.links)]) if (!seen.has(x.h) && !shown.has(x.h)) { seen.add(x.h); related.push(x); }
  return `<h2>Subject and topics</h2>
  <p style="margin-top:12px"><a class="btn secondary" href="#/essays/subject/${e[0]}">${esc(libCat(e[0]).name)}</a></p>
  <ul class="chips" style="margin-top:12px">${tags.map(libChip).join('')}</ul>
  ${related.length ? `<h2>Related in the Source Index</h2><ul class="chips">${related.slice(0, 6).map(x => `<li><a class="chip" href="${x.h}">${esc(x.l)}</a></li>`).join('')}</ul>` : ''}`;
}

if (LIB && PROFILE.archiveHome) addRoute('essays', p => {
  if (!p[1]) return viewEssaysHome();
  if (/^\d{4}$/.test(p[1])) return viewEssayYear(p[1]);
  if (p[1] === 'subject') return viewSubject(p[2]);
  if (p[1] === 'topic') return viewTopic(p[2]);
  if (p[1] === 'topics') return viewTopics();
  if (p[1] === 'collection') return viewCollection(p[2]);
  return viewMissing();
});

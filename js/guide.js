// guide.js: the Guide: Names profiles and the translation tier list
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

function viewTranslations() {
  const t = D.TL; if (!t || !P[t.essay]) return viewMissing();
  const tiers = t.tiers.map(g => {
    const lettered = /^[A-Z]$/.test(g.id);
    return `<section class="tier${g.id === 'S' ? ' s' : ''}">
    <h2><span class="tb" aria-hidden="true">${esc(g.id)}</span>${lettered ? `<span class="sr">${esc(g.id)} tier</span>` : ''}${g.sub ? `<span class="ts">${esc(g.sub)}</span>` : ''}</h2>
    <div class="card" style="padding-top:8px;padding-bottom:8px"><ul class="list">${g.items.map(i => `<li><b>${esc(i.n)}</b><p>${esc(i.t)}</p></li>`).join('')}</ul></div></section>`;
  }).join('');
  return `
  ${backLink('#/')}
  <h1>${esc(t.title)}</h1>
  <p class="lede">${esc(t.lede)}</p>
  <p class="lede" style="margin-top:8px">${esc(t.standard)}</p>
  <figure class="tierfig"><img src="img/translations-tier-list.webp" width="1536" height="1024" alt="The tier list as a chart. S: BLB, NASB, LSB. A: ESV. B: NET, RSV. C: KJV, NKJV. D: NIV, CSB, NRSV Updated Edition. F: NLT, MEV, The Message, The Passion Translation.">
    <figcaption class="cap">The list at a glance. The reasons for every placement follow.</figcaption></figure>
  ${tiers}
  <dl class="use">${t.use.map(u => `<div><dt>${esc(u[0])}</dt><dd>${esc(u[1])}</dd></div>`).join('')}</dl>
  <p class="act" style="margin-top:var(--s3)"><a class="btn secondary" ${link(t.essay)}>Read the full essay</a></p>`;
}
function personRef([b, ch, vs, ve]) {
  const label = esc(vrefLabel([b, ch, vs, ve]));
  return `<li><a class="chip" href="#/${ve > vs ? 'range' : 'verse'}/${b}/${ch}/${vs}${ve > vs ? '/' + ve : ''}">${label}</a></li>`;
}
function viewNames() {
  const pp = D.PP || []; if (!pp.length) return viewMissing();
  return `
  ${backLink('#/')}
  <h1>Names</h1>
  <p class="lede">Short profiles of the names in Scripture, with the verses where each appears and the essays that touch them.</p>
  <div class="card" style="margin-top:24px;padding-top:8px;padding-bottom:8px"><ul class="list">${pp.map(x =>
    `<li><a class="wl" href="#/person/${x.slug}"><b>${esc(x.name)}</b><span class="en">${esc(x.line)}</span></a></li>`).join('')}</ul></div>`;
}
function viewPerson(slug) {
  const pr = (D.PP || []).find(x => x.slug === slug); if (!pr) return viewMissing();
  const groups = pr.groups.map(g => `<h3 class="pg">${esc(g.t)}</h3>${g.g ? `<p style="margin:4px 0 0">${esc(g.g)}</p>` : ''}
  <ul class="chips" style="margin-top:12px">${g.refs.map(personRef).join('')}</ul>`).join('');
  return `
  ${backLink('#/names')}
  <h1>${esc(pr.name)}</h1>
  <div class="about">${pr.about.map(t => `<p>${esc(t)}</p>`).join('')}</div>
  <h2>In Scripture</h2>
  ${groups}
  <h2>Essays</h2>
  <div class="pp" style="margin-top:16px">${pieceList(pr.essays)}</div>`;
}

function guideList() {              // the Guide's sections, for the Guide page and the app's home
  const items = [];
  if (D.PP && D.PP.length) items.push(`<li><a class="wl" href="#/names"><b>Names</b><span class="en">Short profiles, with the verses where each appears.</span><span class="lang">${plural(D.PP.length, 'name')}</span></a></li>`);
  items.push(`<li><a class="wl" href="#/words"><b>Words</b><span class="en">Hebrew and Greek terms, side by side.</span><span class="lang">${WORDS.length} words</span></a></li>`);
  if (D.TL) items.push(`<li><a class="wl" href="#/translations"><b>Translations</b><span class="en">Which New Testament translations let the Greek speak, judged by accuracy and closeness to the apostles.</span><span class="lang">Tier list</span></a></li>`);
  if (D.EN) items.push(`<li><a class="wl" href="#/english"><b>The Ethiopian books in English</b><span class="en">Which of the 81 books you can read in English, and where.</span></a></li>`);
  return `<div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${items.join('')}</ul></div>`;
}
function viewGuide() {
  return `
  ${backLink('#/')}
  <h1>Guide</h1>
  <p class="lede">Help for reading: names, words, and which translations to trust.</p>
  ${guideList()}`;
}

addRoute('guide', () => viewGuide());
addRoute('translations', () => viewTranslations());
addRoute('names', () => viewNames());
addRoute('person', p => viewPerson(p[1]));

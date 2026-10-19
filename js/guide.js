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
  <figure class="tierfig"><img src="img/translations-tier-list.webp" width="1672" height="941" alt="The tier list as a chart. S: BLB, NASB 1995, LSB. A: ESV. B: NET, RSV. C: KJV, NKJV. D: NIV, CSB, NRSV Updated Edition. F: NLT, MEV, The Message, The Passion Translation.">
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

const fileSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const kcGuide = slug => ((PROFILE.kcGuides && D.KG) || []).find(g => g.slug === slug);
const guideMeta = g => {
  const day = new Date(g.date + 'T12:00:00Z'), when = isNaN(day) ? '' : ` \u00b7 ${day.toLocaleDateString('en-GB', {month: 'long', year: 'numeric', timeZone: 'UTC'})}`;
  return `PDF \u00b7 ${g.pages} pages \u00b7 ${fileSize(g.bytes)}${when}`;
};
const guideButtons = g => `<p class="act"><a class="btn primary" href="${esc(g.file)}" download="${esc(g.slug)}.pdf" data-guide="${esc(g.slug)}">Download PDF</a>
  <a class="btn secondary" href="${esc(g.file)}" target="_blank" rel="noopener" data-guide-read="${esc(g.slug)}">Read online</a></p>`;
document.addEventListener('click', e => {
  const d = e.target.closest('[data-guide]'), r = e.target.closest('[data-guide-read]');
  if (d) track('guide/download', d.dataset.guide); else if (r) track('guide/read', r.dataset.guideRead);
});

function guideList() {              // the Guide's sections, for the Guide page and the app's home
  const items = [];
  if (PROFILE.kcGuides && D.KG && D.KG.length) items.push(`<li><a class="wl" href="#/guides"><b>Kingdom Code Guides</b><span class="en">Guides from Kingdom Code, to download and keep.</span><span class="lang">${plural(D.KG.length, 'guide')}</span></a></li>`);
  if (PROFILE.earlyChurch && D.EC && D.EC.length) items.push(`<li><a class="wl" href="#/church"><b>Early Church</b><span class="en">The lives, writings, and testimonies of the early Christians, from the apostolic age to the Desert Fathers.</span><span class="lang">${plural(D.EC.length, 'figure')}</span></a></li>`);
  if (D.PP && D.PP.length) items.push(`<li><a class="wl" href="#/names"><b>Names</b><span class="en">Short profiles, with the verses where each appears.</span><span class="lang">${plural(D.PP.length, 'name')}</span></a></li>`);
  items.push(`<li><a class="wl" href="#/words"><b>Words</b><span class="en">Hebrew and Greek terms, side by side.</span><span class="lang">${WORDS.length} words</span></a></li>`);
  if (D.TL) items.push(`<li><a class="wl" href="#/translations"><b>Translations</b><span class="en">Which New Testament translations let the Greek speak, judged by accuracy and closeness to the apostles.</span><span class="lang">Tier list</span></a></li>`);
  if (D.EN) items.push(`<li><a class="wl" href="#/english"><b>The Ethiopian books in English</b><span class="en">Which of the 81 books you can read in English, and where.</span></a></li>`);
  return `<div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${items.join('')}</ul></div>`;
}
function viewGuide() {
  const kc = PROFILE.kcGuides && D.KG && D.KG.length;
  return `
  ${backLink('#/')}
  <h1>${kc ? 'Guides' : 'Guide'}</h1>
  <p class="lede">${kc ? 'Guides from Kingdom Code, and help for reading the Bible: names, words, and which translations to trust.' : 'Help for reading: names, words, and which translations to trust.'}</p>
  ${guideList()}`;
}

// ---------- Kingdom Code Guides (website): the list, and a page for each guide ----------
function viewKcGuides() {           // every guide as a card; the cover and title open the guide's own page
  return `
  ${backLink('#/guide')}
  <h1>Kingdom Code Guides</h1>
  <p class="lede">Guides from Kingdom Code, free to read and keep. Each one is a PDF you can download.</p>
  <ul class="gcards">${D.KG.map(g => `<li class="gcard">
    <a class="gcover" href="#/guides/${esc(g.slug)}" aria-label="${esc(g.title)}: about this guide"><img src="${esc(g.cover)}" width="1200" height="675" alt="" loading="lazy"></a>
    <div class="gbody">
      <h3><a href="#/guides/${esc(g.slug)}">${esc(g.title)}</a></h3>
      <p class="gsub">${esc(g.sub)}</p>
      <p class="gabout">${esc(g.about)}</p>
      <p class="cap">${esc(guideMeta(g))}</p>
      ${guideButtons(g)}
    </div></li>`).join('')}</ul>`;
}
function viewKcGuide(slug) {        // one guide: the cover, what it is, what is inside, and the download
  const g = kcGuide(slug); if (!g) return viewMissing();
  const toc = (g.contents || []).length ? `<h2>Inside this guide</h2>
  <ol class="gtoc">${g.contents.map(c => `<li><span class="gpg">${c.page}</span><div><b>${esc(c.title)}</b><span>${esc(c.about)}</span></div></li>`).join('')}</ol>` : '';
  return `
  ${backLink('#/guides')}
  <figure class="gcard gwide"><img class="gcoverimg" src="${esc(g.cover)}" width="1200" height="675" alt="${esc(g.title)}, ${esc(g.sub)}"></figure>
  <h1>${esc(g.title)}</h1>
  <p class="gsub">${esc(g.sub)}</p>
  <p class="gabout">${esc(g.about)}</p>
  <p class="cap">${esc(guideMeta(g))}</p>
  ${guideButtons(g)}
  ${toc}`;
}

// ---------- Early Church (website): a short historical overview of each figure ----------
const churchFigure = slug => ((PROFILE.earlyChurch && D.EC) || []).find(f => f.slug === slug);
function viewEarlyChurch() {
  return `
  ${backLink('#/guide')}
  <h1>Early Church</h1>
  <p class="lede">Explore the lives, writings, and testimonies of the early Christians who shaped the Church, from the apostolic age to the Desert Fathers.</p>
  <ul class="efigs">${D.EC.map(f => `<li><a class="efig" href="#/church/${esc(f.slug)}">
    <img src="${esc(f.image)}" width="${f.width}" height="${f.height}" alt="" loading="lazy">
    <span><b>${esc(f.name)}</b><span class="en">${esc(f.line)}</span><span class="cap">${esc(f.dates)}</span></span></a></li>`).join('')}</ul>`;
}
function viewChurchFigure(slug) {
  const f = churchFigure(slug); if (!f) return viewMissing();
  return `
  ${backLink('#/church')}
  <h1>${esc(f.name)}</h1>
  <p class="lede">${esc(f.line)}</p>
  <figure class="efigure"><img src="${esc(f.image)}" width="${f.width}" height="${f.height}" alt="${esc(f.alt)}"></figure>
  <p class="cap">${esc(f.dates)}</p>
  ${(f.aka || []).length ? `<p class="cap">Also known as ${esc(f.aka.join(' and '))}</p>` : ''}
  <div class="eover">${f.overview.map(p => `<p>${esc(p)}</p>`).join('')}</div>
  ${featuredSection('church/' + f.slug, f.name)}
  ${(f.sources || []).length ? `<h2>Primary sources</h2><div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${f.sources.map(s => `<li><a class="wl" href="${esc(s.url)}" target="_blank" rel="noopener"><b>${esc(s.title)}</b><span class="en">${esc(s.note)}</span></a></li>`).join('')}</ul></div>` : ''}`;
}

addRoute('guide', () => viewGuide());
addRoute('translations', () => viewTranslations());
addRoute('names', () => viewNames());
addRoute('person', p => viewPerson(p[1]));
if (PROFILE.earlyChurch) addRoute('church', p => p[1] ? viewChurchFigure(p[1]) : viewEarlyChurch());
if (PROFILE.kcGuides) addRoute('guides', p => p[1] ? viewKcGuide(p[1]) : viewKcGuides());

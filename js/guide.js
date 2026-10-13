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

addRoute('translations', () => viewTranslations());
addRoute('names', () => viewNames());
addRoute('person', p => viewPerson(p[1]));

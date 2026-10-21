// seo.js: what search engines, link previews and AI assistants read about each page: its title, description, canonical address and structured data
// Loaded as a plain script after js/urls.js; see index.html for the order. Shared names live in the page's global scope.
// router.js calls applySeo() after every page is drawn. The same code runs when tools/prerender.js saves each page as a real file at its clean
// address, so a crawler that never runs a script still receives the finished page. Only the website (PROFILE.cleanUrls) writes this.

const SEO_HOME = 'Kingdom Code Source Index: the Ethiopian canon, verse by verse';
const SEO_DESC = 'Read the books of the Ethiopian canon, look up any verse, and see the Hebrew and Greek words behind the text. Free to read.';
const SEO_IMAGE = 'img/og-card.png';
const NOINDEX = new Set(['search', 'cta', 'missing', 'find', 'berean', 'mylibrary']);

function seoClip(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1), sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
}

// The pages a reader moves through to reach this one (also the trail shown to search engines).
function seoCrumbs(p, name) {
  const home = ['Kingdom Code', '/'], a = p[0], out = [home];
  const add = (n, h) => out.push([n, pathOf(h) || '/']);
  if (a === 'book' || a === 'read' || a === 'verse' || a === 'range') {
    add('Bible', '#/books');
    const b = a === 'book' ? (entryOf(+p[1]) || {books: [0]}).books[0] : +p[1];
    if (a !== 'book') { const e = D.bookEntry[b]; if (e && entryOf(e)) add(entryOf(e).name, '#/book/' + e); }
    if (a === 'verse' || a === 'range') add(`${bname(b)} ${p[2]}`, `#/read/${b}/${p[2]}`);
  } else if (a === 'word') add('Words', '#/words');
  else if (a === 'person') add('Names', '#/names');
  else if (a === 'guides' && p[1]) { add('Guides', '#/guide'); add('Kingdom Code guides', '#/guides'); }
  else if (a === 'witness') { if (p[1]) add('The Daily Witness', '#/witness'); }
  else if (a === 'church') { add('Guides', '#/guide'); if (p[1]) add('Early Church', '#/church'); }
  else if (a === 'guides') add('Guides', '#/guide');
  else if (a === 'essay' || (a === 'essays' && p[1] && !/^\d{4}$/.test(p[1]))) add('Essays', '#/essays');
  else if (a === 'essays' && /^\d{4}$/.test(p[1] || '')) add('Essays', '#/essays');
  else if (a === 'path') add('Questions', '#/kc');
  if (a !== '') out.push([name, pathOf(p.join('/').replace(/^/, '#/')) || '/']);
  return out;
}

function seoLd(p, name, desc, url) {
  const org = {'@type': 'Organization', name: 'Kingdom Code', url: SITE_ORIGIN + '/', sameAs: ['https://kingdomcode.substack.com', 'https://www.patreon.com/KingdomCode']};
  const crumbs = seoCrumbs(p, name);
  const list = {'@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({'@type': 'ListItem', position: i + 1, name: c[0], item: SITE_ORIGIN + c[1]}))};
  const a = p[0], page = {'@context': 'https://schema.org', '@type': 'WebPage', name, description: desc, url, inLanguage: 'en', isPartOf: {'@type': 'WebSite', name: PROFILE.name, url: SITE_ORIGIN + '/'}, publisher: org};
  let main = page;
  if (a === '') {
    main = {'@context': 'https://schema.org', '@type': 'WebSite', name: PROFILE.name, url: SITE_ORIGIN + '/', description: SEO_DESC, inLanguage: 'en', publisher: org,
      potentialAction: {'@type': 'SearchAction', target: {'@type': 'EntryPoint', urlTemplate: SITE_ORIGIN + '/search/{search_term_string}/'}, 'query-input': 'required name=search_term_string'}};
  } else if (a === 'essay' && P[p[1]]) {
    const e = P[p[1]];
    main = {'@context': 'https://schema.org', '@type': 'Article', headline: e[0], description: desc, url, mainEntityOfPage: url, inLanguage: 'en', datePublished: e[3] || undefined,
      author: org, publisher: org, isBasedOn: e[1], isAccessibleForFree: true};
    const about = PROFILE.connections ? (connections().byEssay.get(String(p[1])) || []).filter(c => c.how !== 'p') : [];
    if (about.length) main.mentions = about.map(c => ({'@type': 'Person', name: c.name, url: SITE_ORIGIN + pathOf(c.href)}));
  } else if (a === 'essays' && (p[1] === 'subject' || p[1] === 'topic') && typeof LIB !== 'undefined' && LIB) {
    const ids = libEssays().filter(pid => p[1] === 'subject' ? LIB.ess[pid][0] === p[2] : LIB.ess[pid][1].includes(p[2]));
    main = {'@context': 'https://schema.org', '@type': 'CollectionPage', name, description: desc, url, inLanguage: 'en', isPartOf: {'@type': 'WebSite', name: PROFILE.name, url: SITE_ORIGIN + '/'}, publisher: org,
      mainEntity: {'@type': 'ItemList', numberOfItems: ids.length, itemListElement: ids.slice(0, 100).map((pid, i) => ({'@type': 'ListItem', position: i + 1, name: P[pid][0], url: SITE_ORIGIN + pathOf('#/essay/' + pid)}))}};
  } else if (a === 'church' && p[1] && churchFigure(p[1])) {
    const f = churchFigure(p[1]);
    main = {'@context': 'https://schema.org', '@type': 'Person', name: f.name, alternateName: f.aka, description: f.line, url, image: SITE_ORIGIN + '/' + f.image, mainEntityOfPage: url};
  } else if (a === 'word') {
    main = {'@context': 'https://schema.org', '@type': 'DefinedTerm', name, description: desc, url, inDefinedTermSet: {'@type': 'DefinedTermSet', name: 'Words of the Bible: Hebrew and Greek', url: SITE_ORIGIN + '/words/'}};
  } else if (a === 'guides' && p[1] && kcGuide(p[1])) {
    const g = kcGuide(p[1]);
    main = {'@context': 'https://schema.org', '@type': 'Book', name: g.title, alternateName: g.sub, description: g.about, url, inLanguage: 'en', author: org, publisher: org,
      numberOfPages: g.pages, datePublished: g.date, isAccessibleForFree: true, image: SITE_ORIGIN + '/' + g.cover,
      workExample: {'@type': 'Book', bookFormat: 'https://schema.org/EBook', encodingFormat: 'application/pdf', url: SITE_ORIGIN + '/' + g.file}};
  }
  return [main, list];
}

function seoPage(p) {
  const hash = '#/' + p.join('/');
  const h1 = (document.querySelector('#app h1') || {}).textContent || '';
  const home = p[0] === '';
  const title = home ? SEO_HOME : h1 ? `${h1.trim()} | ${PROFILE.name}` : PROFILE.name;
  const lede = document.querySelector('#app .lede, #app .alede') || document.querySelector('#app p:not(.cap):not(.sr)');
  const text = (lede && lede.textContent || '').replace(/\s+/g, ' ').trim(), name = h1.trim();
  let desc = SEO_DESC;
  if (p[0] === 'read') {                                // a chapter: which text it is, and how many verses lead to essays
    const cited = Object.keys((D.verses[p[1]] || {})[p[2]] || {}).length, src = text.split(/\.\s/)[0].replace(/\.$/, '');
    desc = seoClip(`${name}. ${src}.${cited ? ` ${plural(cited, 'verse')} here ${cited === 1 ? 'is' : 'are'} cited in Kingdom Code essays, linked from the text.` : ' Read it free in the Kingdom Code Source Index.'}`, 158);
  } else if (p[0] === 'about') {                        // the publication's own one-line description, not the page's opening lines
    desc = seoClip('Kingdom Code is an independent Christian publication examining Scripture, history, philosophy, and the machinery of power.', 158);
  } else if (!home) {                                   // every other page: its own name first, so no two pages share a description
    desc = seoClip(text.toLowerCase().startsWith(name.toLowerCase()) ? text : `${name}. ${text}`, 158);
    if (desc.length < 40) desc = seoClip(`${name}. ${SEO_DESC}`, 158);
  }
  const keep = p[0] === 'read' ? [p[0], p[1], p[2]] : p;               // a chapter opened at one verse is the chapter's page
  const path = pathOf('#/' + keep.join('/')) || '/';
  const url = SITE_ORIGIN + path;
  const guide = p[0] === 'guides' && p[1] && kcGuide(p[1]), fig = p[0] === 'church' && p[1] && churchFigure(p[1]);
  return {hash, title, desc, url, noindex: NOINDEX.has(p[0]) || !ROUTES.has(p[0]), type: p[0] === 'essay' ? 'article' : 'website',
    image: SITE_ORIGIN + '/' + (guide ? guide.cover : fig ? fig.image : SEO_IMAGE), ld: seoLd(keep, h1.trim() || PROFILE.name, desc, url)};
}

function seoTag(sel, make) {
  let el = document.head.querySelector(sel);
  if (!el) { el = make(); document.head.appendChild(el); }
  return el;
}
function seoMeta(attr, key, value) {
  seoTag(`meta[${attr}="${key}"]`, () => { const m = document.createElement('meta'); m.setAttribute(attr, key); return m; }).setAttribute('content', value);
}

function applySeo(p) {
  if (!CLEAN) return;
  const s = seoPage(p);
  document.title = s.title;
  seoMeta('name', 'description', s.desc);
  seoMeta('name', 'robots', s.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1');
  seoTag('link[rel="canonical"]', () => { const l = document.createElement('link'); l.rel = 'canonical'; return l; }).href = s.url;
  seoMeta('property', 'og:title', s.title); seoMeta('property', 'og:description', s.desc); seoMeta('property', 'og:url', s.url);
  seoMeta('property', 'og:type', s.type); seoMeta('property', 'og:site_name', 'Kingdom Code'); seoMeta('property', 'og:image', s.image);
  seoMeta('property', 'og:locale', 'en_US');
  seoMeta('name', 'twitter:card', 'summary_large_image'); seoMeta('name', 'twitter:title', s.title);
  seoMeta('name', 'twitter:description', s.desc); seoMeta('name', 'twitter:image', s.image);
  const ld = seoTag('script#ld', () => { const l = document.createElement('script'); l.id = 'ld'; l.type = 'application/ld+json'; return l; });
  ld.textContent = JSON.stringify(s.noindex ? [] : s.ld);
}

// Every page worth indexing, as the router's '#/…' names, with the date it last changed where the data knows it (tools/prerender.js).
function seoRoutes() {
  const out = [], add = (hash, lastmod, priority) => { if (ROUTES.has(hash.replace(/^#\/?/, '').split('/')[0]) && pathOf(hash)) out.push({hash, lastmod, priority}); };
  add('#/', null, 1.0);
  ['books', 'essays', 'kc', 'guide', 'church', 'guides', 'words', 'names', 'translations', 'english', 'about', 'app', 'credits', 'privacy'].forEach(r => add('#/' + r, null, 0.8));
  D.entries.forEach(e => add('#/book/' + e.id, null, 0.7));
  Object.keys(D.CC).forEach(b => D.CC[b].forEach(ch => add(`#/read/${b}/${ch}`, null, 0.6)));
  Object.keys(D.verses).forEach(b => Object.keys(D.verses[b]).forEach(ch => Object.keys(D.verses[b][ch]).forEach(v => add(`#/verse/${b}/${ch}/${v}`, null, 0.5))));
  D.words.forEach(w => add('#/word/' + w.slug, null, 0.7));
  D.PP.forEach(x => add('#/person/' + x.slug, null, 0.7));
  (PROFILE.kcGuides && D.KG || []).forEach(g => add('#/guides/' + g.slug, g.date, 0.8));
  (PROFILE.earlyChurch && D.EC || []).forEach(f => add('#/church/' + f.slug, null, 0.7));
  D.paths.forEach(x => add('#/path/' + x.id, null, 0.7));
  [...new Set(essayIds().map(pid => P[pid][3].slice(0, 4)))].forEach(y => add('#/essays/' + y, null, 0.7));
  if (typeof LIB !== 'undefined' && LIB) {
    LIB.cats.forEach(c => add('#/essays/subject/' + c.id, null, 0.8));
    LIB.tags.forEach(t => add('#/essays/topic/' + t.id, null, 0.7));
    add('#/essays/topics', null, 0.6);
    LIB.cols.forEach(c => add('#/essays/collection/' + c.id, null, 0.8));
  }
  essayIds().forEach(pid => add('#/essay/' + pid, P[pid][3], 0.6));
  if (typeof WIT_ON !== 'undefined' && WIT_ON && D.W.e.some(e => e.st === 'approved')) {        // the Daily Witness: approved studies only, never a draft
    add('#/witness', null, 0.8);
    D.W.e.filter(e => e.st === 'approved').forEach(e => add('#/witness/' + e.n, null, 0.7));
  }
  return out.map(r => Object.assign(r, {path: pathOf(r.hash)}));
}

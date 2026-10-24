// pages.js: the home page, About, Sources and credits, and the not-found page
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.

function topVerses() {
  const all = [];
  for (const b in D.verses) for (const ch in D.verses[b]) for (const v in D.verses[b][ch]) all.push([+b, +ch, +v, D.verses[b][ch][v].length]);
  all.sort((a,c) => c[3]-a[3] || a[0]-c[0] || a[1]-c[1] || a[2]-c[2]);
  const per = {}, out = [];
  for (const x of all) { per[x[0]] = (per[x[0]]||0) + 1; if (per[x[0]] > 1) continue; out.push(x); if (out.length === 4) break; }
  return out;
}
function continueCard() {           // the last chapter read, or the first chapter of the Bible
  const last = (store.get('kc-last') || '').split('/').map(Number); const ok = last.length === 2 && hasChapter(last[0], last[1]);
  const b = ok ? last[0] : D.order[0], ch = ok ? last[1] : D.CC[D.order[0]][0];
  return `<div class="contcard"><div><span class="cap">${ok ? 'Continue reading' : 'Read the Bible'}</span><b>${esc(bname(b))} ${ch}</b></div><a class="btn secondary" href="#/read/${b}/${ch}">${ok ? 'Continue' : 'Start'}</a></div>`;
}
function searchForm() {            // the search box with its suggestions (js/search.js wires it up by these ids)
  return `<form class="search" role="search" id="sf">
    <label class="sr" for="q">Search by verse or word</label>
    <input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug" aria-haspopup="listbox" placeholder="A verse or a word" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
    <button class="btn primary" type="submit">Search</button>
    <ul class="sug" id="sug" role="listbox" aria-label="Suggestions" hidden></ul>
    <div class="sr" id="sugstat" role="status" aria-live="polite"></div>
  </form>`;
}
function viewReaderHome() {         // the app's home: the Bible first, the Guide and the essays after
  const withText = D.entries.filter(e => e.books.some(b => D.CC[b])).length;
  return `
  <h1>Read the Bible.</h1>
  <p class="lede">All 81 books of the Ethiopian canon, as the Ethiopian and Eritrean Orthodox Tewahedo Churches list them. ${withText} have their text here so far.</p>
  ${continueCard()}
  ${searchForm()}
  <h2>The 81 books</h2>
  <div class="tabs" role="tablist" aria-label="Testament">
    <button class="tab" role="tab" aria-selected="true" data-t="OT">Old Testament</button>
    <button class="tab" role="tab" aria-selected="false" data-t="NT">New Testament</button>
  </div>
  <div id="shelf">${shelf(D.entries.filter(e => e.t === 'OT'))}</div>
  <h2>Guide</h2>
  ${guideList()}
  <h2>From Kingdom Code</h2>
  <p class="lede" style="margin-top:8px">Essays from the publication behind this app, kept in their own section, apart from the Bible text.</p>
  <p style="margin-top:16px"><a class="btn secondary" href="#/kc">Open From Kingdom Code</a></p>`;
}
// The website's front page, laid out as the Kingdom Code archive: the mission and the search first, then the featured guide and the
// newest essays, the collections as catalog cards with their counts, and the questions to start with.
const essayIds = () => Object.keys(P).filter(pid => P[pid] && (hasRefs(pid) || PUB.has(pid))).sort((a, c) => P[c][3].localeCompare(P[a][3]) || c - a);   // cited in the index, or a public Substack essay (a new one is listed before its citations are in)
function archiveHome() {
  const withText = D.entries.filter(e => e.books.some(b => D.CC[b])).length, extras = D.entries.filter(e => e.extra);
  const chips = topVerses().map(([b,ch,v]) => `<li><a class="chip" href="#/verse/${b}/${ch}/${v}">${esc(bname(b))} ${ch}:${v}</a></li>`).join('');
  const qs = D.paths.map(p => `<li><a class="q" href="#/path/${p.id}"><span>${esc(p.q)}</span><i aria-hidden="true">Read</i></a></li>`).join('');
  const g = (D.KG || [])[0], latest = essayIds().slice(0, 5);
  const coll = [
    ['#/books', withText, 'The Bible', `All 81 books of the Ethiopian canon. ${withText} have their text here.`],
    ['#/essays', essayIds().length, 'Essays', 'Kingdom Code essays, newest first, and the verses each one cites.'],
    g ? ['#/guides', D.KG.length, 'Guides', 'Kingdom Code guides to download and keep.'] : null,
    D.PP && D.PP.length ? ['#/names', D.PP.length, 'Names', 'Short profiles, with the verses where each appears.'] : null,
    ['#/words', WORDS.length, 'Words', 'Hebrew and Greek terms from the essays, side by side.'],
    D.TL ? ['#/translations', 'NT', 'Translations', 'Which New Testament translations let the Greek speak.'] : null,
    D.EN ? ['#/english', extras.length, 'Outside most Bibles', 'The books not in a Protestant Bible, and where to read them in English.'] : null,
  ].filter(Boolean);
  return `
  <section class="ahero" aria-labelledby="ah-t">
    <h1 id="ah-t">Kingdom <em>Code</em></h1>
    <p class="ahead"><span>Examine the Scriptures daily.</span></p>
    <p class="alede">A free Christian publication in the heritage of the Ethiopian canon. Every essay, word study and profile sends you back to the text, so you can test what you hear against it, as the Bereans did.</p>
    <form class="search" role="search" id="sf">
      <label class="sr" for="q">Search by verse, word, or title</label>
      <input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug" aria-haspopup="listbox" placeholder="Verse, word, or title" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
      <button class="btn primary" type="submit">Search</button>
      <ul class="sug" id="sug" role="listbox" aria-label="Suggestions" hidden></ul>
      <div class="sr" id="sugstat" role="status" aria-live="polite"></div>
    </form>
    <p class="astd">The standard is Scripture. Everything here is free to read and free to check.</p>
    <ul class="chips" aria-label="Popular verses">${chips}</ul>
  </section>

  ${typeof witCard === 'function' ? witCard() : ''}

  <div class="acols">
    ${g ? `<section aria-labelledby="ah-g"><h2 id="ah-g" class="ah2">Featured guide</h2>
      <a class="afeat" href="#/guides/${esc(g.slug)}"><img src="${esc(g.cover)}" width="1200" height="675" alt="" loading="lazy">
        <span class="afeat-b"><b>${esc(g.title)}</b><span>${esc(g.sub)}</span><i>${esc(guideMeta(g))}</i></span></a></section>` : ''}
    <section aria-labelledby="ah-l"><h2 id="ah-l" class="ah2">Latest essays</h2>
      ${pieceList(latest)}
      <p class="cap" style="margin-top:12px"><a href="#/essays" style="color:var(--accent)">All ${essayIds().length} essays</a></p></section>
  </div>

  <h2 class="ah2">The collections</h2>
  <ul class="coll">${coll.map(([href, n, t, d]) => `<li><a class="cc" href="${href}"><span class="cn">${esc(String(n))}</span><b>${esc(t)}</b><span class="cd">${esc(d)}</span></a></li>`).join('')}</ul>

  ${continueCard()}

  <h2 class="ah2">Start with a question</h2>
  <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${qs}</ul></div>
`;
}
function viewHome() {
  if (PROFILE.home === 'reader') return viewReaderHome();
  if (PROFILE.archiveHome) return archiveHome();
  const chips = topVerses().map(([b,ch,v]) => `<li><a class="chip" href="#/verse/${b}/${ch}/${v}">${esc(bname(b))} ${ch}:${v}</a></li>`).join('');
  const qs = D.paths.map(p => `<li><a class="q" href="#/path/${p.id}"><span>${esc(p.q)}</span><i aria-hidden="true">Read</i></a></li>`).join('');
  const extras = D.entries.filter(e => e.extra);
  return `
  <h1>Look up a verse.</h1>
  <p class="lede">Read the books of the Ethiopian canon, search any verse, and see the Hebrew and Greek words behind the text. Essays that quote a verse are listed with it.</p>
  <form class="search" role="search" id="sf">
    <label class="sr" for="q">Search by verse, word, or title</label>
    <input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug" aria-haspopup="listbox" placeholder="A verse, a word, or a title" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
    <button class="btn primary" type="submit">Search</button>
    <ul class="sug" id="sug" role="listbox" aria-label="Suggestions" hidden></ul>
    <div class="sr" id="sugstat" role="status" aria-live="polite"></div>
  </form>
  <ul class="chips" aria-label="Popular verses">${chips}</ul>
  ${continueCard()}

  <h2>Start with a question</h2>
  <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">${qs}</ul></div>

  <h2>Explore</h2>
  <div class="card" style="margin-top:16px;padding-top:8px;padding-bottom:8px"><ul class="list">
    <li><a class="wl" href="#/words"><b>Words</b><span class="en">Hebrew and Greek terms from the essays, side by side.</span><span class="lang">${WORDS.length} words</span></a></li>
    ${D.PP && D.PP.length ? `<li><a class="wl" href="#/names"><b>Names</b><span class="en">Short profiles, with the verses where each appears.</span><span class="lang">${plural(D.PP.length, 'name')}</span></a></li>` : ''}
    ${D.TL ? `<li><a class="wl" href="#/translations"><b>Translations</b><span class="en">Which New Testament translations let the Greek speak.</span><span class="lang">Tier list</span></a></li>` : ''}
  </ul></div>

  ${(() => { const have = extras.filter(e => piecesForBook(e.books).length || e.books.some(b => D.CC[b])), rest = extras.length - have.length;
    return `<h2>Books outside most Bibles</h2>
  <p class="lede">${extras.length} of the 81 are not in a Protestant Bible. ${have.length} have their text here.</p>
  ${shelf(have)}
  ${rest ? `<p class="cap" style="margin-top:12px">${rest} more are listed, with their text still to come.${D.EN ? ` <a href="#/english" style="color:var(--accent)">Where to read them in English</a>` : ''}</p>` : ''}
  <p style="margin-top:16px"><a class="btn secondary" href="#/books">Browse all 81 books</a></p>`; })()}
`;
}
function viewAbout() {
  return `
  ${navIdx > 0 ? backLink('#/') : ''}
  <h1>About</h1>
  <div class="about">
    ${PROFILE.id === 'site' ? `<p>Kingdom Code is an independent Christian publication examining Scripture, history, philosophy, and the machinery of power. We investigate established narratives, challenge inherited assumptions, and pursue truths that convenience and consensus would rather leave undisturbed.</p>
    <p>Our purpose is not rebellion for its own sake, but discernment. To understand the world without being deceived by it. To navigate Babylon with the wisdom of Daniel, neither retreating from its affairs nor surrendering to its ways.</p>
    <p>To govern ourselves before others govern us.</p>
    <p class="aclose">Our ultimate authority is Jesus Christ and Scripture.</p>` : `<p>Kingdom Code is an independent, investigative publication for the Body of Christ. Its sole authority is Jesus Christ and Scripture. The index is a growing body of work, regularly updated with new features and improvements.</p>`}
    ${PROFILE.id === 'app' ? `<p>This app is called ${esc(PROFILE.name)}. It is an independent Kingdom Code publication, not an official edition of any Church. It follows the 81-book canon of the Ethiopian and Eritrean Orthodox Tewahedo Churches.</p>
    <p>The app is built with Capacitor and its Share and Filesystem plugins, open-source software under the MIT license.</p>
    ${PROFILE.appUpdates ? `<p><span id="about-version"></span><a href="#/updates" style="color:var(--accent)">Check for updates</a></p>` : ''}` : ''}
  </div>`;
}
// ---------- the Android app's download page ----------
// The release workflow (.github/workflows/android.yml) publishes every version under this fixed name, so the link
// always gives the newest.
const APP_DOWNLOAD = 'https://github.com/RockaKC/source-index/releases/latest/download/KC-Tewahedo-Bible.apk';
// The same file is also kept on this site (download/KC-Tewahedo-Bible.apk, put there by .github/workflows/pages.yml after each release),
// so the button can save it from here without sending the reader to GitHub. Until that copy exists the button keeps the GitHub address.
const SITE_DOWNLOAD = 'download/KC-Tewahedo-Bible.apk';
onPage(async p => {
  if (p[0] !== 'app' || PROFILE.id !== 'site') return;
  try {
    const r = await fetch(SITE_DOWNLOAD, {method: 'HEAD', cache: 'no-store'});
    const a = document.querySelector('[data-app-download]');
    if (r.ok && a && a.isConnected) { a.setAttribute('href', SITE_DOWNLOAD); a.setAttribute('download', 'KC-Tewahedo-Bible.apk'); a.removeAttribute('target'); }
  } catch (e) { /* offline or no copy: the GitHub address stays */ }
});
function viewApp() {
  const withText = D.entries.filter(e => e.books.some(b => D.CC[b])).length;
  return `
  ${backLink('#/about')}
  <img class="appicon" src="img/app-icon.webp" width="96" height="96" alt="KC Tewahedo Bible app icon">
  <h1>KC Tewahedo Bible for Android</h1>
  <p class="lede">All 81 books of the Ethiopian canon on your phone, ${withText} with their text so far, every one readable without a connection. Free, with no account and no ads.</p>
  <p class="act" style="margin-top:24px"><a class="btn primary" href="${APP_DOWNLOAD}" data-app-download>Download for Android</a></p>
  <p class="cap" style="margin-top:8px">Android 7 or newer. About 6 MB.</p>
  <div class="about">
    <h2>Installing it</h2>
    <ol>
      <li>Tap <strong>Download for Android</strong>, then open the file when it finishes.</li>
      <li>Android warns that the app comes from an unknown source and asks you to allow your browser to install apps. Allow it.</li>
      <li>Tap <strong>Install</strong>. KC Tewahedo Bible appears with your other apps.</li>
    </ol>
    <h2>Why Android warns you</h2>
    <p>Android shows that warning for every app that does not come through the Google Play Store. It says nothing about this app. Kingdom Code publishes the app itself, outside Google's store and its approval process, so no gatekeeper stands between this work and its readers. The warning is the cost of that independence.</p>
    <p>The app is safe and free, and it collects nothing: no account, no ads, no analytics, no tracking. It asks Android for two permissions. Internet access is used only when you open a link out of the app, such as Patreon or Ko-fi, or when you tap Check for updates or Update now. Permission to install apps is used only to put a newer version of this same app over the old one, when you tap Update now; Android asks you once, and shows its own install screen each time. The whole Bible is stored inside the app, so it reads without a connection.</p>
    <h2>Updates</h2>
    <p>When a new version is out, download it again from this page and install it over the old one. Your place and your settings stay. Once the app is installed, it can update itself: open the menu, tap Updates, then Check for updates, and tap Update now when a newer version is found. The new version downloads inside the app, and Android asks you to confirm the install.</p>
    <h2>iPhone</h2>
    <p>There is no iPhone app yet. On iPhone, open this site in Safari, tap Share, then Add to Home Screen. It opens like an app and keeps the chapters you read for offline use.</p>
  </div>`;
}
function viewCredits() {
  return `
  ${backLink(`#/`)}
  <h1>Sources and credits</h1>
  <p class="lede">Every Scripture text in this index is in the public domain.</p>
  <div class="card" style="margin-top:24px"><ul class="list">${D.credits.map(c => `<li class="piece"><div class="t">${esc(c.what)}</div><p style="margin:2px 0 0">${esc(c.text)}</p></li>`).join('')}${analyticsOn ? `<li class="piece"><div class="t">Visit counts</div><p style="margin:2px 0 0">This site counts visits and clicks without cookies or personal data. Searches that find nothing are logged so the index can grow.</p></li>` : ''}</ul></div>`;
}
function viewMissing() { return `${backLink(`#/`)}<h1>Not found</h1><p class="lede">That page is not in the index yet.</p>`; }

addRoute('', () => viewHome());
onPage(p => { if (PROFILE.archiveHome) document.documentElement.toggleAttribute('data-archive', p[0] === ''); });   // the front page alone uses the wide layout
addRoute('about', () => viewAbout());
addRoute('app', () => viewApp());
if (PROFILE.readerTools) {          // the app's search page, opened from the reading bar and the menu
  addRoute('find', () => `
  ${backLink('#/')}
  <h1>Search</h1>
  <p class="lede">A verse such as Genesis 6:4, a book, or a word.</p>
  ${searchForm()}`);
  onPage(p => { if (p[0] === 'find') { const q = document.getElementById('q'); if (q) q.focus(); } });
}
addRoute('credits', () => viewCredits());

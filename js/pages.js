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
function viewReaderHome() {         // the app's home: the Bible first, the Guide and the essays after
  const withText = D.entries.filter(e => e.books.some(b => D.CC[b])).length;
  return `
  <h1>Read the Bible.</h1>
  <p class="lede">All 81 books of the Ethiopian canon, as the Ethiopian and Eritrean Orthodox Tewahedo Churches list them. ${withText} have their text here so far.</p>
  ${continueCard()}
  <form class="search" role="search" id="sf">
    <label class="sr" for="q">Search by verse or word</label>
    <input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="sug" aria-haspopup="listbox" placeholder="A verse or a word" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search">
    <button class="btn primary" type="submit">Search</button>
    <ul class="sug" id="sug" role="listbox" aria-label="Suggestions" hidden></ul>
    <div class="sr" id="sugstat" role="status" aria-live="polite"></div>
  </form>
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
function viewHome() {
  if (PROFILE.home === 'reader') return viewReaderHome();
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
    <p>Kingdom Code is an independent, investigative publication for the Body of Christ. Its sole authority is Jesus Christ and Scripture. The index is a growing body of work, regularly updated with new features and improvements.</p>
    <p>Everything here is free to read and share. If it serves you, support the work.</p>
    ${PROFILE.id === 'app' ? `<p>This app is called ${esc(PROFILE.name)}. It is an independent Kingdom Code publication, not an official edition of any Church. It follows the 81-book canon of the Ethiopian and Eritrean Orthodox Tewahedo Churches.</p>` : ''}
  </div>
  <p class="act"><button class="btn secondary" type="button" data-support aria-haspopup="dialog"><svg class="fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298"/></svg>Support Rocka</button></p>
  ${PROFILE.id === 'site' ? `<h2>Get the app</h2>
  <p class="lede" style="margin-top:8px">KC Tewahedo Bible puts the books of the Ethiopian canon on your Android phone, every one readable without a connection. Free, with no account and no ads.</p>
  <p class="act" style="margin-top:16px"><a class="btn primary" href="#/app">Download the app</a></p>` : ''}`;
}
// ---------- the Android app's download page ----------
// The release workflow (.github/workflows/android.yml) publishes every version under this fixed name, so the link
// always gives the newest.
const APP_DOWNLOAD = 'https://github.com/RockaKC/source-index/releases/latest/download/KC-Tewahedo-Bible.apk';
function viewApp() {
  const withText = D.entries.filter(e => e.books.some(b => D.CC[b])).length;
  return `
  ${backLink('#/about')}
  <h1>KC Tewahedo Bible for Android</h1>
  <p class="lede">All 81 books of the Ethiopian canon on your phone, ${withText} with their text so far, every one readable without a connection. Free, with no account and no ads.</p>
  <p class="act" style="margin-top:24px"><a class="btn primary" href="${APP_DOWNLOAD}" data-app-download>Download for Android</a></p>
  <p class="cap" style="margin-top:8px">Android 7 or newer. About 7 MB.</p>
  <div class="about">
    <h2>Installing it</h2>
    <ol>
      <li>Tap <strong>Download for Android</strong>, then open the file when it finishes.</li>
      <li>Android warns that the app comes from an unknown source and asks you to allow your browser to install apps. Allow it.</li>
      <li>Tap <strong>Install</strong>. KC Tewahedo Bible appears with your other apps.</li>
    </ol>
    <h2>Why Android warns you</h2>
    <p>Android shows that warning for every app that does not come through the Google Play Store. It says nothing about this app. Kingdom Code publishes the app itself, outside Google's store and its approval process, so no gatekeeper stands between this work and its readers. The warning is the cost of that independence.</p>
    <p>The app is safe and free, and it collects nothing: no account, no ads, no analytics, no tracking. It asks Android for one permission, internet access, and uses it only when you open a link out of the app, such as Patreon or Ko-fi. The whole Bible is stored inside the app, so it reads without a connection.</p>
    <h2>Updates</h2>
    <p>When a new version is out, download it again from this page and install it over the old one. Your place and your settings stay.</p>
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
addRoute('about', () => viewAbout());
addRoute('app', () => viewApp());
addRoute('credits', () => viewCredits());

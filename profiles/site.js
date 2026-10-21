// The Kingdom Code Source Index (index.html): the essays sit beside the Bible text.
// Every product loads one profile before js/core.js. See tools/README.md, "Product profiles".
const PROFILE = {
  id: 'site',
  name: 'Kingdom Code Source Index',   // the product's name: page titles and the About page
  home: 'site',            // 'site': search, popular verses, question paths; 'reader': continue reading and the books first
  essaysInBible: true,     // highlight cited verses and list essays on book, chapter, verse and passage pages
  analytics: true,         // cookieless visit counts (live domain only; see js/analytics.js)
  verseTools: false,       // the app's verse panel, favorites and highlights (js/marks.js)
  appUpdates: false,       // the app's version and update check (js/updates.js)
  readerTools: false,      // the app's chapter bar, reading toolbar and reading history (js/readerbar.js)
  essayText: true,         // essays with their text in essay-text/ open and read here (js/essays.js)
  archiveHome: true,       // the front page as the Kingdom Code archive, and the Essays page (js/pages.js)
  cleanUrls: true,         // permanent addresses like /bible/john/3/16/ instead of #/verse/… (js/urls.js), with a page title, description and structured data for each (js/seo.js)
  witness: true,           // The Daily Witness: one passage a day, each a step in a study (js/witness.js, D.W, data/witness/)
  accounts: null,          // Berean reader accounts (js/account.js): {url, key, public[, turnstileKey, codeLength, codeMinutes]} from Supabase; null keeps the whole feature off, public: false makes it a private preview (?berean-preview=1)
  origin: 'https://kingdomcodearchive.com',   // the one place the site's public address is written: canonical links, the sitemap, share cards
  library: true,             // the Essays library: search, subjects, topics, collections (js/library.js, D.LIB)
  connections: true,          // essays and subjects (Early Church, Names) link to each other (js/connections.js)
  earlyChurch: true,       // the Early Church section of the Guides page: a short overview of each figure (D.EC, js/guide.js)
  kcGuides: true,          // the Guides page lists Kingdom Code's downloadable PDF guides (D.KG, js/guide.js)
};

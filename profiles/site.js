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
  origin: 'https://sources.kingdomcodearchive.com',   // the one place the site's public address is written: canonical links, the sitemap, share cards
  connections: true,          // essays and subjects (Early Church, Names) link to each other (js/connections.js)
  earlyChurch: true,       // the Early Church section of the Guides page: a short overview of each figure (D.EC, js/guide.js)
  kcGuides: true,          // the Guides page lists Kingdom Code's downloadable PDF guides (D.KG, js/guide.js)
};

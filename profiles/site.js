// The Kingdom Code Source Index (index.html): the essays sit beside the Bible text.
// Every product loads one profile before js/core.js. See tools/README.md, "Product profiles".
const PROFILE = {
  id: 'site',
  name: 'Kingdom Code Source Index',   // the product's name: page titles and the About page
  home: 'site',            // 'site': search, popular verses, question paths; 'reader': continue reading and the books first
  essaysInBible: true,     // highlight cited verses and list essays on book, chapter, verse and passage pages
  seasonal: true,          // list the seasonal reading guides on book and verse pages
  analytics: true,         // cookieless visit counts (live domain only; see js/analytics.js)
  verseTools: false,       // the app's verse panel, favorites and highlights (js/marks.js)
  appUpdates: false,       // the app's version and update check (js/updates.js)
  readerTools: false,      // the app's chapter bar, reading toolbar and reading history (js/readerbar.js)
  kcGuides: true,          // the Guides page lists Kingdom Code's downloadable PDF guides (D.KG, js/guide.js)
};

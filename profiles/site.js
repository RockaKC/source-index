// The Kingdom Code Source Index (index.html): the essays sit beside the Bible text.
// Every product loads one profile before js/core.js. See tools/README.md, "Product profiles".
const PROFILE = {
  id: 'site',
  name: 'Kingdom Code Source Index',   // the product's name: page titles and the About page
  home: 'site',            // 'site': search, popular verses, question paths; 'reader': continue reading and the books first
  essaysInBible: true,     // highlight cited verses and list essays on book, chapter, verse and passage pages
  seasonal: true,          // list the seasonal reading guides on book and verse pages
  analytics: true,         // cookieless visit counts (live domain only; see js/analytics.js)
  readerTools: false,      // the app's chapter bar, reading toolbar and reading history (js/readerbar.js)
};

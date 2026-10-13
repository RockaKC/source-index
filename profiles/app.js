// KC Tewahedo Bible (app.html, and the Android app): the Bible first. The essays have their own
// section ("From Kingdom Code", #/kc) and never appear inside the Bible text.
// Every product loads one profile before js/core.js. See tools/README.md, "Product profiles".
const PROFILE = {
  id: 'app',
  name: 'KC Tewahedo Bible',
  home: 'reader',
  essaysInBible: false,
  seasonal: false,
  analytics: false,
  verseTools: true,        // tap a verse for the verse panel: favorite, highlight, copy, share; the Favorites and Highlights pages (js/marks.js)
  readerTools: true,       // the chapter bar in the header, the reading toolbar, reading history, and the search page (js/readerbar.js)
};

// KC Tewahedo Bible (app.html, and the Android app): the Bible first. The essays have their own
// section ("From Kingdom Code", #/kc) and never appear inside the Bible text.
// Every product loads one profile before js/core.js. See tools/README.md, "Product profiles".
const PROFILE = {
  id: 'app',
  name: 'KC Tewahedo Bible',
  home: 'reader',
  essaysInBible: false,
  analytics: false,
  verseTools: true,        // tap a verse for the verse panel: favorite, highlight, copy, share; the Favorites and Highlights pages (js/marks.js)
  appUpdates: true,        // the app's version, and a check for a newer one (js/updates.js)
  readerTools: true,       // the chapter bar in the header, the reading toolbar, reading history, and the search page (js/readerbar.js)
  essayText: false,        // essays open on the publication, not in the app
  archiveHome: false,      // the website's archive front page
  library: false,            // the Essays library: search, subjects, topics, collections (js/library.js, D.LIB)
  connections: false,         // essays and subjects (Early Church, Names) link to each other (js/connections.js)
  earlyChurch: true,       // the Early Church section of the Guide page, as on the website (its pictures are in img/, so they load offline)
  kcGuides: true,          // Kingdom Code's guides; the PDFs are not in the app, so a guide's button opens the PDF on the website, in the browser
};

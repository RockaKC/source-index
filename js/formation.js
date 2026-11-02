// formation.js: Daily Scripture Formation: three readings a day, Morning, Afternoon and Evening, in a weekly order (the website only)
// Loaded as a plain script after js/witness.js; see index.html for the order. Shared names live in the page's global scope.
// The readings are edited by hand in tools/curated.json ("formation"); tools/formation.py checks each one against the stored text and writes
// data/formation.js (FMD). Only references and links reach the page, never the text: each reading opens the archive's own chapter.
// The day is the visitor's own local day of the week, Sunday first and Saturday the seventh. Nothing is counted or kept: no streaks, no scores.

const FM = typeof FMD !== 'undefined' ? FMD : null;
const FM_ON = !!(PROFILE.formation && FM);
const FM_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmCycle = () => FM.cy.find(c => c.id === FM.cur);
const fmToday = (now = new Date()) => now.getDay();          // 0 is Sunday, the first day; 6 is Saturday, the seventh day, the Sabbath
const fmDayName = i => i === 6 ? 'Saturday, the seventh day' : i === 0 ? 'Sunday, the first day' : FM_DAYS[i];
const fmHref = r => r.r[2] ? scriptureHash(r.r) : `#/read/${r.r[0]}/${r.r[1]}`;   // a whole chapter opens at its start
const fmRef = r => `<li><a class="fmref" href="${fmHref(r)}">${esc(r.l)}</a><span class="cap">${esc(r.tr)}${r.en ? ` · ${esc(r.en)}` : ''}</span></li>`;

function fmDay(i) {                 // one day: its theme and its three sessions
  const d = fmCycle().days[i], today = i === fmToday();
  return `
  <h2 class="fmtheme" id="fm-theme">${esc(d.t)}</h2>
  <p class="cap fmwhen">${esc(fmDayName(i))}${today ? ' · Today' : ''}</p>
  <div class="fmcards">${FM.ses.map((s, k) => `
    <section class="fmcard" aria-labelledby="fm-s-${s.id}">
      <p class="eyebrow"><span>${esc(s.label)}</span><span>${esc(s.minutes)}</span></p>
      <h3 id="fm-s-${s.id}">${esc(s.name)}</h3>
      <ul class="fmrefs">${d.s[k].refs.map(fmRef).join('')}</ul>
      <p class="fmwhy">${esc(s.purpose)}</p>
      <p class="fmdo"><b>Reflect and act.</b> ${esc(d.s[k].do)}</p>
    </section>`).join('')}
  </div>`;
}
function fmDayButtons(sel) {
  const t = fmToday();
  return `<div class="fmdays" role="group" aria-label="Day of the week">${FM_DAYS.map((n, i) => `<button type="button" class="fmtab${i === t ? ' fmnow' : ''}" data-fmday="${i}" aria-pressed="${i === sel}"${i === t ? ' aria-current="date"' : ''}>${esc(n.slice(0, 3))}<span class="sr">${esc(n.slice(3))}${i === t ? ', today' : ''}</span></button>`).join('')}</div>`;
}
function viewFormation() {
  const t = fmToday();
  return `
  ${backLink('#/')}
  <h1>${esc(FM.title)}</h1>
  <p class="lede">${esc(FM.lead)}</p>
  <p class="fmintro">${esc(FM.intro)}</p>
  <p class="fmmotto">${esc(FM.motto)}</p>
  ${fmDayButtons(t)}
  <div id="fmday" aria-live="polite">${fmDay(t)}</div>
  <h2>The biblical foundation</h2>
  <ul class="chips fmfound">${FM.found.map(r => `<li><a class="chip" href="${fmHref(r)}">${esc(r.l)}</a></li>`).join('')}</ul>
  <p class="cap" style="margin-top:16px">The Old Testament readings are the Septuagint, numbered as it numbers them; the New Testament readings are the Berean Literal Bible. The week begins on Sunday, and the readings follow your own day.</p>`;
}
document.addEventListener('click', e => {           // switch days on the page; the address and the reader's day stay as they are
  const btn = e.target.closest('[data-fmday]'), box = document.getElementById('fmday');
  if (!btn || !box) return;
  const i = +btn.dataset.fmday;
  document.querySelectorAll('[data-fmday]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.fmday === i)));
  box.innerHTML = fmDay(i);
});

// ---------- the front-page card: today's theme and its three readings ----------
function fmCard() {
  if (!FM_ON) return '';
  const i = fmToday(), d = fmCycle().days[i];
  return `<section class="fmhome" aria-labelledby="fmh-t">
    <p class="eyebrow"><span>${esc(FM.title)}</span><span>${esc(FM_DAYS[i])}</span></p>
    <h2 class="fmht" id="fmh-t"><a href="#/formation">${esc(d.t)}</a></h2>
    <ul class="fmhlist">${FM.ses.map((s, k) => `<li><b>${esc(s.label)}</b> ${d.s[k].refs.map(r => `<a href="${fmHref(r)}">${esc(r.l)}</a>`).join(', ')}</li>`).join('')}</ul>
    <p class="fmhact"><a class="btn primary" href="#/formation">Today’s readings</a></p></section>`;
}

if (FM_ON) addRoute('formation', () => viewFormation());

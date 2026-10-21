// daily.js: the daily study verse on the website's front page
// Loaded as a plain script after js/account.js; see index.html for the order. Shared names live in the page's global scope.
// The plan is tools/daily.json (four seasons, each of three movements of four weeks and a closing week; six verse days and a day of rest in a
// week), written by the exporter to data/daily/<week>.json. Today's day follows from the date alone: no account, no stored streak, nothing to
// catch up on. A reader who was away resumes where the calendar is, and can look back over the week from the card.

const DAILY_START = [12, 21];        // month, day: the first day of the cycle (the winter solstice); tools/daily.py fixes the same start
const DAILY_DAYS = 364;              // 52 weeks of 7 days; the year's last day (two in a leap year) is the turn

// Which day of the plan is this date? {kind: 'verse'|'rest'|'turn', idx, week, dow}. The calendar date is the reader's own, so the day changes at their midnight.
function dailyDay(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const start = y => Date.UTC(y, DAILY_START[0] - 1, DAILY_START[1]);
  const idx = Math.round((today - start(today < start(date.getFullYear()) ? date.getFullYear() - 1 : date.getFullYear())) / 864e5);
  if (idx >= DAILY_DAYS) return {kind: 'turn', idx, turn: Math.min(idx - DAILY_DAYS, 1)};
  return {kind: idx % 7 === 6 ? 'rest' : 'verse', idx, week: Math.floor(idx / 7), dow: idx % 7};
}

const DAILY_CACHE = {};
const dailyFile = name => DAILY_CACHE[name] || (DAILY_CACHE[name] = fetch(`data/daily/${name}.json`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .catch(e => { delete DAILY_CACHE[name]; throw e; }));

const dailyRef = d => `${bname(d.b)} ${d.c}:${d.a}${d.z > d.a ? '–' + d.z : ''}`;
const dailyHash = d => d.z > d.a ? `#/range/${d.b}/${d.c}/${d.a}/${d.z}` : `#/verse/${d.b}/${d.c}/${d.a}`;

function dailyVerse(d) {             // the verse's own words, as the verse pages set them
  const many = d.z > d.a;
  return `<figure class="dvverse">${d.x.map(([v, t]) => `<p>${many ? `<sup class="vn">${v}</sup> ` : ''}${fmtText(d.b, t)}</p>`).join('')}
    <figcaption>${esc(dailyRef(d))}, ${esc(TR[d.b])}${engLabel(d.b, d.c, d.a) ? `<br>${esc(engLabel(d.b, d.c, d.a))}` : ''}</figcaption></figure>`;
}
function dailyWeekList(wk, upto, open) {   // the week's verses, as far as today (all of them on the day of rest)
  const rows = wk.days.slice(0, upto + 1).map((d, i) => `<li${i === upto && !open ? ' aria-current="date"' : ''}><a href="${esc(dailyHash(d))}">
    <span class="dn" aria-hidden="true">${i + 1}</span><span class="dt">${esc(d.t)}<span class="cap">${esc(dailyRef(d))}</span></span></a></li>`).join('');
  return `<details class="dvweek"${open ? ' open' : ''}><summary>${open ? 'The week’s verses' : 'This week so far'}</summary>
    <p class="cap dvline">${esc(wk.movement.name)}: ${esc(wk.movement.line)}</p><ol>${rows}</ol></details>`;
}
const dailyWhere = wk => wk.n === 13 ? `${esc(wk.season.name)} · ${esc(wk.name)}` : `${esc(wk.season.name)} · ${esc(wk.movement.name)} · Week ${wk.n}: ${esc(wk.name)}`;

function dailyCard(day, wk) {        // the card's HTML for a verse day, a day of rest, or the turn of the year
  if (day.kind === 'turn') {
    const d = wk.days[day.turn];
    return `<p class="eyebrow">Today’s study verse</p><h2 class="dvt" id="dv-t">${esc(d.t)}</h2>${dailyVerse(d)}
      <p class="cap dvwhere">The turn of the year</p>${dailyActions(d)}`;
  }
  if (day.kind === 'rest') {
    return `<p class="eyebrow">Today</p><h2 class="dvt" id="dv-t">A day of rest</h2>
      <p class="dvlede">Look back over the week, or leave it. If you fell behind, do not race to catch up: resume where you stopped.</p>
      <p class="cap dvwhere">${dailyWhere(wk)}</p>${dailyWeekList(wk, 5, true)}`;
  }
  const d = wk.days[day.dow];
  return `<p class="eyebrow">Today’s study verse</p><h2 class="dvt" id="dv-t">${esc(d.t)}</h2>${dailyVerse(d)}
    <p class="cap dvwhere">${dailyWhere(wk)}</p>${dailyActions(d)}${day.dow ? dailyWeekList(wk, day.dow, false) : ''}`;
}
const dailyActions = d => `<p class="dvact"><a class="btn primary" href="${esc(dailyHash(d))}" data-dv-study="${esc(dailyRef(d))}">Study this verse</a>
  <a class="btn secondary" href="#/read/${d.b}/${d.c}/${d.a}">Read the chapter</a></p>`;

async function dailyFill() {         // draw today's card into the front page's #dv
  const host = document.getElementById('dv'); if (!host) return;
  const day = dailyDay();
  host.dataset.day = day.idx;
  try {
    const wk = await dailyFile(day.kind === 'turn' ? 'turn' : day.week);
    if (!document.body.contains(host) || +host.dataset.day !== day.idx) return;   // the reader moved on, or the day changed
    host.setAttribute('aria-labelledby', 'dv-t');
    host.innerHTML = `<div class="dvin">${dailyCard(day, wk)}</div>`;
    cleanLinks(host);
    host.classList.add('ready');
  } catch (e) { host.remove(); }     // offline and never saved: the front page simply has no card
}

if (PROFILE.dailyVerse) {
  onPage(p => { if (p[0] === '') dailyFill(); });
  document.addEventListener('visibilitychange', () => {       // a page left open past midnight shows the new day when it is looked at again
    const host = document.getElementById('dv');
    if (!document.hidden && host && host.classList.contains('ready') && +host.dataset.day !== dailyDay().idx) { host.classList.remove('ready'); dailyFill(); }
  });
  document.addEventListener('click', e => { const a = e.target.closest('[data-dv-study]'); if (a) track('daily/study', a.dataset.dvStudy); });
}

// The daily study verse (js/daily.js, tools/daily.py, data/daily/): the plan, which day a date is, and the card on the front page.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, ROOT, settle } = require('./helpers');

const week = i => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'daily', i + '.json'), 'utf8'));
const turn = () => week('turn');
const utc = (y, m, d) => Date.UTC(y, m - 1, d);
// What day of the plan a date is, worked out here on its own: days since the most recent December 21.
const expectDay = (y, m, d) => {
  const start = utc(m === 12 && d >= 21 ? y : y - 1, 12, 21), idx = Math.round((utc(y, m, d) - start) / 864e5);
  return idx >= 364 ? {kind: 'turn', idx, turn: Math.min(idx - 364, 1)} : {kind: idx % 7 === 6 ? 'rest' : 'verse', idx, week: Math.floor(idx / 7), dow: idx % 7};
};
const check = mode => execFileSync('python3', [path.join(ROOT, 'tests', 'daily_check.py'), mode], {encoding: 'utf8', maxBuffer: 1 << 26}).trim();
const onDate = async (page, y, m, d, h = 12) => { await page.clock.setFixedTime(new Date(y, m - 1, d, h, 0, 0)); };

test('the plan: 52 weeks of six verse days, two turn days, every verse once, with its text', () => {
  const seen = new Set(), titles = [];
  for (let i = 0; i < 52; i++) {
    const w = week(i);
    expect(w.i).toBe(i);
    expect(w.season.name).toBe(['Winter', 'Spring', 'Summer', 'Fall'][Math.floor(i / 13)]);
    expect(w.n, 'week number within its season').toBe(i % 13 + 1);
    expect(w.movement.name).toBe(i % 13 === 12 ? 'The Eighth Day' : w.movement.name);
    expect(w.days, `week ${i}`).toHaveLength(6);
    for (const d of w.days) {
      expect(d.t.length).toBeGreaterThan(3);
      expect(d.z - d.a).toBeLessThan(4);
      expect(d.x.length).toBe(d.z - d.a + 1);
      for (const [v, t] of d.x) { expect(t.length).toBeGreaterThan(10); const k = `${d.b}:${d.c}:${v}`; expect(seen.has(k), 'a verse is used twice: ' + k).toBe(false); seen.add(k); }
      titles.push(d.t);
    }
  }
  expect(turn().days).toHaveLength(2);
  expect(seen.size).toBeGreaterThan(312);
  expect(new Set(titles).size, 'two days share a title').toBe(titles.length);
});

test('the exporter\'s files are the plan\'s: nothing stale, and a plan with a mistake is refused', () => {
  const out = JSON.parse(check('ok'));
  expect(Object.keys(out).sort()).toEqual([...Array.from({length: 52}, (_, i) => i + '.json'), 'turn.json'].sort());
  for (const [name, obj] of Object.entries(out)) expect(obj, name + ' differs from data/daily/' + name + ': run tools/export_site.py').toEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'daily', name), 'utf8')));
  expect(fs.readdirSync(path.join(ROOT, 'data', 'daily')).sort()).toEqual(Object.keys(out).sort());
  for (const [mode, say] of [['short-week', 'needs 6 days'], ['repeated-verse', 'repeats a verse'], ['long-range', 'one to four verses'], ['missing-verse', 'no stored text'],
    ['unknown-book', 'cannot read the reference'], ['no-title', 'has no title'], ['wrong-start', 'fix the start']]) {
    expect(check(mode), mode).toMatch(new RegExp('^REFUSED: daily: .*' + say));
  }
});

test('which day a date is: season starts, rest days, the turn of the year, a leap year', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const day = (y, m, d) => page.evaluate(([y, m, d]) => dailyDay(new Date(y, m - 1, d, 15)), [y, m, d]);
  expect(await day(2026, 12, 21)).toMatchObject({kind: 'verse', idx: 0, week: 0, dow: 0});
  expect(await day(2026, 12, 26)).toMatchObject({kind: 'verse', idx: 5, dow: 5});
  expect(await day(2026, 12, 27)).toMatchObject({kind: 'rest', idx: 6, week: 0});
  expect(await day(2027, 3, 22)).toMatchObject({idx: 91, week: 13, dow: 0});     // spring begins ninety-one days after the solstice
  expect(await day(2027, 6, 21)).toMatchObject({idx: 182, week: 26});
  expect(await day(2027, 9, 20)).toMatchObject({idx: 273, week: 39});
  expect(await day(2026, 12, 20)).toMatchObject({kind: 'turn', idx: 364, turn: 0});
  expect(await day(2028, 12, 19)).toMatchObject({kind: 'turn', idx: 364, turn: 0});
  expect(await day(2028, 12, 20)).toMatchObject({kind: 'turn', idx: 365, turn: 1});   // 2028 has a 29th of February
  expect(await day(2028, 12, 21)).toMatchObject({kind: 'verse', idx: 0});
  expect(await day(2028, 2, 29)).toMatchObject({kind: expectDay(2028, 2, 29).kind, idx: expectDay(2028, 2, 29).idx});
});

test('every day of seven years is the next day of the plan, wherever the reader is', async ({ browser }) => {
  for (const timezoneId of ['UTC', 'America/New_York', 'Australia/Sydney', 'Pacific/Auckland']) {
    const ctx = await browser.newContext({timezoneId}), page = await ctx.newPage();
    await page.goto('/'); await settle(page);
    const bad = await page.evaluate(() => {
      const out = []; let prev = null;
      for (let t = new Date(2026, 0, 1, 9); t < new Date(2033, 0, 1); t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 9)) {
        const d = dailyDay(t), reset = t.getMonth() === 11 && t.getDate() === 21;
        if (prev !== null && !(reset ? d.idx === 0 : d.idx === prev + 1)) out.push([t.toDateString(), d.idx, prev]);
        if (d.kind === 'turn' ? d.idx < 364 || d.idx > 365 : (d.kind === 'rest') !== (d.idx % 7 === 6)) out.push([t.toDateString(), 'kind', d.kind, d.idx]);
        prev = d.idx;
      }
      return out;
    });
    expect(bad, timezoneId).toEqual([]);
    await ctx.close();
  }
});

test('the front page shows today\'s verse, its title, where it sits in the year, and links to study it', async ({ page }) => {
  await onDate(page, 2026, 10, 21);
  await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
  const e = expectDay(2026, 10, 21), w = week(e.week), d = w.days[e.dow];
  expect(w.season.name).toBe('Fall');
  const card = page.locator('#dv');
  await expect(card.locator('.eyebrow')).toHaveText('Today’s study verse');
  await expect(card.locator('h2')).toHaveText(d.t);
  await expect(card.locator('.dvverse')).toContainText(d.x[0][1].split(' ').slice(0, 3).join(' '));
  await expect(card.locator('.dvverse figcaption')).toContainText('Berean Literal Bible');
  await expect(card.locator('.dvwhere')).toHaveText(`Fall · ${w.movement.name} · Week ${w.n}: ${w.name}`);
  const more = card.locator('details.dvweek');
  await expect(more).not.toHaveAttribute('open', '');
  await expect(more.locator('li')).toHaveCount(e.dow + 1);
  await expect(more.locator('li[aria-current="date"]')).toHaveCount(1);
  await more.locator('summary').click();
  await expect(more.locator('li').nth(0)).toBeVisible();
  await card.locator('a[data-dv-study]').click();
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText(/^\w[\w ]* \d+:\d+/);
  expect(page.url()).toMatch(/\/bible\/[a-z0-9-]+\/\d+\/\d+\/$/);
});

test('the study link and the chapter link of a passage day open the passage and its chapter', async ({ page }) => {
  await onDate(page, 2026, 12, 21);                    // day 1 of the year: Genesis 1:1-2
  await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
  await expect(page.locator('#dv h2')).toHaveText(week(0).days[0].t);
  await expect(page.locator('#dv .dvverse sup.vn')).toHaveCount(2);
  await expect(page.locator('#dv details.dvweek')).toHaveCount(0);     // nothing earlier in the week yet
  await page.locator('#dv a[data-dv-study]').click(); await settle(page);
  expect(page.url()).toMatch(/\/bible\/genesis\/1\/1-2\/$/);
  await page.goBack(); await settle(page); await page.waitForSelector('#dv.ready');
  await page.locator('#dv a', {hasText: 'Read the chapter'}).click(); await settle(page);
  expect(page.url()).toMatch(/\/bible\/genesis\/1\/\?v=1$/);
});

test('a day of rest looks back over the week and tells the reader not to race to catch up', async ({ page }) => {
  await onDate(page, 2026, 10, 24);
  await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
  const e = expectDay(2026, 10, 24); expect(e.kind).toBe('rest');
  await expect(page.locator('#dv h2')).toHaveText('A day of rest');
  await expect(page.locator('#dv')).toContainText('do not race to catch up');
  await expect(page.locator('#dv a[data-dv-study]')).toHaveCount(0);
  await expect(page.locator('#dv details.dvweek')).toHaveAttribute('open', '');
  await expect(page.locator('#dv details.dvweek li')).toHaveCount(6);
  await expect(page.locator('#dv li[aria-current]')).toHaveCount(0);
});

test('the turn of the year has its own verse; a leap year has a second', async ({ page }) => {
  await onDate(page, 2026, 12, 20);
  await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
  await expect(page.locator('#dv h2')).toHaveText(turn().days[0].t);
  await expect(page.locator('#dv .dvwhere')).toHaveText('The turn of the year');
  await onDate(page, 2028, 12, 20);
  await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
  await expect(page.locator('#dv h2')).toHaveText(turn().days[1].t);
});

test('each day brings a different verse, the same day brings the same verse, and a page left open past midnight changes', async ({ page }) => {
  const title = async () => { await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready'); return page.locator('#dv h2').textContent(); };
  await onDate(page, 2026, 10, 20); const a = await title(); expect(await title()).toBe(a);
  await onDate(page, 2026, 10, 21); const b = await title();
  expect(b).not.toBe(a);
  await onDate(page, 2026, 10, 22);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#dv h2')).not.toHaveText(b);
  await expect(page.locator('#dv h2')).toHaveText(week(expectDay(2026, 10, 22).week).days[expectDay(2026, 10, 22).dow].t);
});

test('if the day cannot be fetched the front page simply has no card', async ({ page }) => {
  await page.route('**/data/daily/**', r => r.fulfill({status: 404, body: ''}));
  await page.goto('/'); await settle(page);
  await expect(page.locator('#dv')).toHaveCount(0);
  await expect(page.locator('#app h1')).toHaveText(/Kingdom\s*Code/);
  await expect(page.locator('.ahero .search')).toBeVisible();
});

test('the app has no daily card, and the card fits a phone in both themes', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  await expect(page.locator('#dv')).toHaveCount(0);
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => { try { localStorage.setItem('kc-theme', t); } catch (e) {} }, theme);
    await page.setViewportSize({width: 360, height: 740});
    await onDate(page, 2026, 10, 22);
    await page.goto('/'); await settle(page); await page.waitForSelector('#dv.ready');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), theme).toBe(true);
    const box = await page.locator('#dv').boundingBox();
    expect(box.width).toBeLessThanOrEqual(360);
  }
});

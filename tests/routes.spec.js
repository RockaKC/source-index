// Every kind of page renders: a heading, real content, and no page errors.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const firstCited = b => {
  const ch = Object.keys(D.verses[b])[0];
  return [ch, Object.keys(D.verses[b][ch])[0]];
};

const groups = {
  'main pages': ['#/', '#/books', '#/guide', '#/guides', '#/guides/the-ungovernable-mind', '#/words', '#/names', '#/translations', '#/english', '#/about', '#/app', '#/credits',
    '#/search/nephilim'],
  'every book page': D.entries.map(e => `#/book/${e.id}`),
  'the first chapter of every book with text': D.order.map(b => `#/read/${b}/${D.CC[b][0]}`),
  'the last chapter of every book with text': D.order.map(b => `#/read/${b}/${D.CC[b][D.CC[b].length - 1]}`),
  'a cited verse in every cited book': Object.keys(D.verses).map(b => `#/verse/${b}/${firstCited(b).join('/')}`),
  'every question path': D.paths.map(p => `#/path/${p.id}`),
  'every word': D.words.map(w => `#/word/${w.slug}`),
  'every name': (D.PP || []).map(p => `#/person/${p.slug}`),
  'essay pages': Object.keys(D.pieces).slice(0, 10).map(id => `#/essay/${id}`),
};

for (const [name, routes] of Object.entries(groups)) {
  test(name, async ({ page }) => {
    test.setTimeout(30000 + routes.length * 1500);
    await page.goto('/');
    for (const hash of routes) {
      await page.evaluate(h => { location.hash = h; }, hash);
      await settle(page);
      const h1 = (await page.locator('#app h1').first().textContent() || '').trim();
      expect(h1, `${hash} heading`).not.toBe('');
      expect(h1, `${hash} is a real page`).not.toBe('Not found');
      if (hash.startsWith('#/read/'))
        expect(await page.locator('#rtext p').count(), `${hash} shows verses`).toBeGreaterThan(0);
    }
  });
}

test('a range of verses renders', async ({ page }) => {
  await page.goto('/#/range/28/22/1/5');
  await settle(page);
  await expect(page.locator('#app h1')).not.toHaveText('Not found');
});

test('deep links open directly', async ({ page }) => {
  for (const hash of ['#/read/87/22', '#/book/81', '#/person/enoch', '#/english']) {
    await page.goto('/' + hash);
    await settle(page);
    await expect(page.locator('#app h1'), hash).not.toHaveText('Not found');
  }
});

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/#/no-such-page');
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
});

test('the site: About has no support line or button, and the menu offers Get the app after Contact', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.evaluate(() => { location.hash = '#/about'; });
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('About');
  await expect(page.locator('#app')).not.toContainText('free to read and share');
  await expect(page.locator('#app [data-support]')).toHaveCount(0);
  await expect(page.locator('#menu [data-support]')).toHaveCount(1);        // the menu keeps Support
  const labels = await page.locator('#menu li').evaluateAll(l => l.map(x => x.textContent.trim()));
  expect(labels.at(-1)).toBe('Get the app');
  expect(labels.at(-2)).toBe('Contact');
  await page.locator('#menubtn').click();
  await page.locator('#menu a[href="#/app"]').click();
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('KC Tewahedo Bible for Android');
});

test('the translation tier list shows its picture, which loads, before the written tiers', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.evaluate(() => { location.hash = '#/translations'; });
  await settle(page);
  const img = page.locator('#app .tierfig img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth)).toBe(1672);
  expect(await img.getAttribute('alt')).toContain('S: BLB, NASB 1995, LSB');
  const order = await page.evaluate(() => { const f = document.querySelector('#app .tierfig'), t = document.querySelector('#app .tier'); return f.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING; });
  expect(order).toBeTruthy();
});

test('a word page shows the verse text for the verses it names, each linked to its own page', async ({ page }) => {
  for (const w of D.words) {
    if (!w.verses.length) continue;
    await page.goto(`/#/word/${w.slug}`); await settle(page);
    const hrefs = await page.$$eval('.chips a.chip', as => as.map(a => a.getAttribute('href')));
    const have = w.verses.filter(([b, ch]) => D.CC[b] && D.CC[b].includes(ch));
    expect(hrefs.length, w.slug).toBeGreaterThanOrEqual(have.length);
    expect(await page.locator('figure.verse').count(), w.slug).toBe(Math.min(3, w.verses.length));
  }
});

test('Pharmakeia names Revelation 18:23 and shows its words', async ({ page }) => {
  await page.goto('/#/word/sorcery'); await settle(page);
  await expect(page.locator('a.chip[href="#/verse/79/18/23"]')).toBeVisible();
  await expect(page.locator('figure.verse').first()).toContainText('in your sorcery all the nations were deceived');
});

test('the download page shows the app icon, and the icon loads', async ({ page }) => {
  await page.goto('/#/app'); await settle(page);
  const img = page.locator('img.appicon');
  await expect(img).toBeVisible();
  expect(await img.evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(100);
});

test('the Download button saves the app from this site once the site holds the file, and keeps the GitHub address until then', async ({ page }) => {
  const GH = 'https://github.com/RockaKC/source-index/releases/latest/download/KC-Tewahedo-Bible.apk';
  await page.goto('/#/app'); await settle(page);
  await page.waitForTimeout(300);
  await expect(page.locator('[data-app-download]')).toHaveAttribute('href', GH);          // no copy on this site: GitHub

  await page.route('**/download/KC-Tewahedo-Bible.apk', r => r.fulfill({ status: 200, contentType: 'application/vnd.android.package-archive', body: 'x' }));
  await page.goto('/'); await page.goto('/#/app'); await settle(page);
  const a = page.locator('[data-app-download]');
  await expect(a).toHaveAttribute('href', 'download/KC-Tewahedo-Bible.apk');
  await expect(a).toHaveAttribute('download', 'KC-Tewahedo-Bible.apk');
  await expect(a).not.toHaveAttribute('target', /.+/);
});

test('the site: Guides is in the header where Words was, and Names and Translations left the menu for the Guides page', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const nav = await page.locator('header .tools a.nav').evaluateAll(a => a.map(x => [x.textContent.trim(), x.getAttribute('href')]));
  expect(nav).toEqual([['Bible', '#/books'], ['Guides', '#/guide']]);
  for (const r of ['#/names', '#/translations', '#/words']) await expect(page.locator(`#menu a[href="${r}"]`)).toHaveCount(0);
  await page.locator('header a.nav[href="#/guide"]').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Guides');
  for (const r of ['#/guides', '#/names', '#/words', '#/translations', '#/english']) await expect(page.locator(`#app a[href="${r}"]`)).toHaveCount(1);
});

test('the Guides page is a short menu: Kingdom Code Guides first, then the reading help', async ({ page }) => {
  await page.goto('/#/guide'); await settle(page);
  const hrefs = await page.locator('#app .wl').evaluateAll(a => a.map(x => x.getAttribute('href')));
  expect(hrefs).toEqual(['#/guides', '#/names', '#/words', '#/translations', '#/english']);
  await expect(page.locator('#app .gcard')).toHaveCount(0);          // the guides themselves are one page deeper
  await expect(page.locator('#app .wl').first()).toContainText('1 guide');
});

test('Kingdom Code Guides lists each guide, its cover and title open the guide, and Download saves a real PDF', async ({ page, request }) => {
  await page.goto('/#/guides'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Kingdom Code Guides');
  const card = page.locator('.gcard').first();
  await expect(card.locator('h3')).toHaveText('The Ungovernable Mind');
  await expect(card).toContainText('PDF \u00b7 48 pages');
  await expect(card).toContainText('and exercise independent judgment, with a Discernment Field Sheet.');
  await expect(card).not.toContainText('six-step');
  expect(await card.locator('.gcover').getAttribute('href')).toBe('#/guides/the-ungovernable-mind');
  expect(await card.locator('h3 a').getAttribute('href')).toBe('#/guides/the-ungovernable-mind');
  const dl = card.locator('a[data-guide]');
  await expect(dl).toHaveText('Download PDF');
  expect(await dl.getAttribute('href')).toBe('guides/the-ungovernable-mind.pdf');
  expect(await dl.getAttribute('download')).toBe('the-ungovernable-mind.pdf');
  expect(await card.locator('.gcover img').evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(100);
  const res = await request.get('/guides/the-ungovernable-mind.pdf');
  expect(res.ok()).toBe(true);
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(body.length).toBe(await page.evaluate(() => D.KG[0].bytes));   // the size shown is the file's own
  await card.locator('h3 a').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('The Ungovernable Mind');
});

test('each guide has its own page: the cover, the description, the buttons, and what is inside with page numbers', async ({ page }) => {
  await page.goto('/#/guides/the-ungovernable-mind'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('The Ungovernable Mind');
  await expect(page.locator('.gsub')).toContainText('Discernment, Power, and Independent Judgment');
  expect(await page.locator('img.gcoverimg').evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(100);
  expect(await page.locator('img.gcoverimg').getAttribute('alt')).toContain('The Ungovernable Mind');
  await expect(page.locator('a[data-guide]')).toHaveAttribute('href', 'guides/the-ungovernable-mind.pdf');
  await expect(page.locator('a[data-guide-read]')).toHaveAttribute('target', '_blank');
  const toc = await page.locator('.gtoc li').evaluateAll(l => l.map(x => [x.querySelector('.gpg').textContent, x.querySelector('b').textContent]));
  expect(toc).toHaveLength(10);
  expect(toc[0]).toEqual(['3', 'The Ungovernable Mind']);
  expect(toc.at(-1)).toEqual(['48', 'About Kingdom Code']);
  await expect(page.locator('#app')).not.toContainText('six-step');
  expect(await page.locator('.back').getAttribute('href')).toBe('#/guides');
});

test('an unknown guide shows the not-found page', async ({ page }) => {
  await page.goto('/#/guides/no-such-guide'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
});

test('the app keeps its own Guide page, without the PDF guides', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  await page.evaluate(() => { location.hash = '#/guide'; }); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Guide');
  await expect(page.locator('.gcard')).toHaveCount(0);
});

test('the website front page is the Kingdom Code archive: the mission, search, the featured guide, the newest essays and the collections', async ({ page }) => {
  await page.goto('/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Kingdom Code Archive');
  await expect(page.locator('.alede')).toContainText('investigating the questions others have forgotten');
  await expect(page.locator('#q')).toBeVisible();                                    // search is still first at hand
  await expect(page.locator('.afeat')).toHaveAttribute('href', '#/guides/the-ungovernable-mind');
  const ids = await page.evaluate(() => essayIds().slice(0, 5));
  const shown = await page.locator('.acols .piece .t a').evaluateAll(a => a.map(x => x.dataset.pid));
  expect(shown).toEqual(ids.map(String));                                           // the five newest, in order
  const hrefs = await page.locator('.coll a.cc').evaluateAll(a => a.map(x => x.getAttribute('href')));
  expect(hrefs).toEqual(['#/books', '#/essays', '#/guides', '#/names', '#/words', '#/translations', '#/english']);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(true);   // the front page alone is wide
  await page.locator('.coll a[href="#/words"]').click(); await settle(page);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(false);
});

test('every collection on the front page opens a real page, and Essays lists every cited essay newest first by year', async ({ page }) => {
  await page.goto('/'); await settle(page);
  for (const h of ['#/books', '#/essays', '#/guides', '#/names', '#/words', '#/translations', '#/english']) {
    await page.evaluate(x => { location.hash = x; }, h); await settle(page);
    await expect(page.locator('#app h1')).not.toHaveText('Not found');
  }
  await page.evaluate(() => { location.hash = '#/essays'; }); await settle(page);
  const n = await page.evaluate(() => essayIds().length);
  expect(await page.locator('#app .piece').count()).toBe(n);
  const years = await page.locator('#app h2').allTextContents();
  expect(years).toEqual([...years].sort().reverse());
  const dates = await page.locator('#app .piece .cap').evaluateAll(c => c.length);
  expect(dates).toBeGreaterThan(100);
});

test('the app keeps its own home, not the archive', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Read the Bible.');
  await expect(page.locator('.ahero')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(false);
});

// ---- essays read on the website ----
const fs = require('fs');
const path = require('path');

test('essay text is only ever Substack posts open to everyone, as plain safe markup, for essays on the page', () => {
  const ids = Object.keys(D.ET || {});
  expect(ids.length).toBeGreaterThan(100);
  for (const id of ids) {
    expect(D.pieces[id], `essay ${id} is on the page`).toBeTruthy();
    expect(D.pieces[id][2], `essay ${id} is a Substack post`).toBe('substack');   // no Patreon text: patron-only posts must not appear
    const f = path.join(__dirname, '..', 'essay-text', id + '.json');
    const h = JSON.parse(fs.readFileSync(f, 'utf8')).h;
    expect(h.length, `essay ${id} has text`).toBeGreaterThan(100);
    expect(h, `essay ${id} carries no script, frame or event handler`).not.toMatch(/<\s*(script|iframe|object|embed|style)|\son\w+\s*=|javascript:/i);
    expect(h, `essay ${id} shows no raw Markdown marks`).not.toMatch(/(^|>)\s*#{2,}\s|\*\*\w/);
  }
  const files = fs.readdirSync(path.join(__dirname, '..', 'essay-text')).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  expect(files.sort()).toEqual(ids.slice().sort());           // no stray essay file
});

test('an essay is read on the site: its title, the line under it, the text, where it came from, and the verses it cites', async ({ page }) => {
  const pid = Object.keys(D.ET).find(id => D.pieces[id][0].startsWith('5 Lies About Torah'));
  await page.goto('/#/essay/' + pid); await settle(page);
  await expect(page.locator('#app h1')).toHaveText(D.pieces[pid][0]);
  await expect(page.locator('.essaymeta')).toContainText('min read');
  const text = page.locator('.essaytext');
  await expect(text).toContainText('The Law Was Just for Israel');
  expect(await text.locator('h3').count()).toBeGreaterThan(3);
  expect(await text.locator('blockquote').count()).toBeGreaterThan(3);
  await expect(text).not.toContainText('###');
  await expect(page.locator('.essayfoot a')).toHaveAttribute('href', D.pieces[pid][1]);
  await expect(page.locator('#app')).toContainText('Scripture cited in this essay');
});

test('titles in the lists open the essay on the site, not on Substack', async ({ page }) => {
  await page.goto('/#/essays'); await settle(page);
  const first = page.locator('#app .piece .t a[href^="#/essay/"]').first();      // Patreon posts have no text here and still open on Patreon
  const pid = await first.getAttribute('data-pid');
  expect(D.pieces[pid][2]).toBe('substack');
  expect(await first.getAttribute('target')).toBeNull();
  const patreon = page.locator('#app .piece .t a[target="_blank"]').first();
  expect(await patreon.getAttribute('href')).toMatch(/^https:\/\//);
  await first.click(); await settle(page);
  await expect(page.locator('.essaytext')).toBeVisible();
  await page.goBack(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Essays');
});

test('an essay that cannot load says so, with a way to try again', async ({ page }) => {
  const pid = Object.keys(D.ET)[0];
  await page.route('**/essay-text/*.json', r => r.abort());
  await page.goto('/#/essay/' + pid);
  await expect(page.locator('#loadmsg')).toContainText('could not load');
  expect(await page.locator('#loadmsg a').getAttribute('href')).toBe('#/essay/' + pid);
});

test('the app does not carry essay text: its essay links still open the publication', async ({ page }) => {
  const asked = [];
  page.on('request', r => { if (r.url().includes('essay-text')) asked.push(r.url()); });
  await page.goto('/app.html'); await settle(page);
  await page.evaluate(() => { location.hash = '#/kc'; }); await settle(page);
  await page.evaluate(() => { location.hash = '#/path/canon'; }); await settle(page);
  const a = page.locator('#app .piece .t a, #app .feature a').first();
  expect(await a.getAttribute('target')).toBe('_blank');
  expect(await a.getAttribute('href')).toMatch(/^https:\/\//);
  expect(asked).toEqual([]);
});

test('links between essays, and to this site, stay on the site; the held-back posts never appear', async ({ page }) => {
  const byTitle = t => Object.keys(D.ET).find(id => D.pieces[id][0].startsWith(t));
  const pid = byTitle('The Christian Code Inside Your Phone');
  expect(pid, 'the post promoted from a draft is on the site').toBeTruthy();
  await page.goto('/#/essay/' + pid); await settle(page);
  const inner = page.locator('.essaytext a[href^="#/"]');
  expect(await inner.count()).toBeGreaterThan(0);
  expect(await inner.first().getAttribute('target')).toBeNull();
  await expect(page.locator('.essaytext a[href*="sources.kingdomcodearchive.com"]')).toHaveCount(0);
  await expect(page.locator('#app')).toContainText('Scripture cited in this essay');          // its citations came with the draft
  const titles = Object.values(D.pieces).map(p => p[0]);
  expect(titles.some(t => t.startsWith('Act Like Men'))).toBe(false);                          // members-only on Substack
  expect(titles.some(t => t.startsWith('Start Here: The Door Into'))).toBe(false);             // a start page, not an essay
  expect(byTitle('Who Were the Sons of God'), 'a new essay without citations is read as text').toBeTruthy();
  await page.goto('/#/essay/' + byTitle('Who Were the Sons of God')); await settle(page);
  await expect(page.locator('.essaytext')).toBeVisible();
});

test('the newest essays lead the front page and the Essays page, whether or not their citations are in yet', async ({ page }) => {
  const newestReadable = Object.keys(D.ET).map(id => D.pieces[id][3]).sort().reverse()[0];
  await page.goto('/'); await settle(page);
  const ids = await page.locator('.acols .piece .t a').evaluateAll(a => a.map(x => x.dataset.pid));
  const dates = ids.map(id => D.pieces[id][3]);
  expect(dates[0], 'the newest readable essay leads the front page').toBe(newestReadable);
  expect(dates).toEqual([...dates].sort().reverse());                  // newest first
  await page.evaluate(() => { location.hash = '#/essays'; }); await settle(page);
  const first = await page.locator('#app .piece .t a').first().getAttribute('data-pid');
  expect(D.pieces[first][3]).toBe(newestReadable);
});

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
  await page.locator('#menu a[href="/app/"]').click();
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
  await expect(page.locator('a.chip[href="/bible/revelation/18/23/"]')).toBeVisible();
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
  expect(nav).toEqual([['Bible', '/bible/'], ['Guides', '/guides/']]);
  for (const r of ['/names/', '/translations/', '/words/']) await expect(page.locator(`#menu a[href="${r}"]`)).toHaveCount(0);
  await page.locator('header a.nav[href="/guides/"]').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Guides');
  for (const r of ['/guides/kingdom-code/', '/guides/early-church/', '/names/', '/words/', '/translations/', '/english/']) await expect(page.locator(`#app a[href="${r}"]`)).toHaveCount(1);
});

test('the Guides page is a short menu: Kingdom Code Guides first, then the reading help', async ({ page }) => {
  await page.goto('/#/guide'); await settle(page);
  const hrefs = await page.locator('#app .wl').evaluateAll(a => a.map(x => x.getAttribute('href')));
  expect(hrefs).toEqual(['/guides/kingdom-code/', '/guides/early-church/', '/names/', '/words/', '/translations/', '/english/']);
  await expect(page.locator('#app .gcard')).toHaveCount(0);          // the guides themselves are one page deeper
  await expect(page.locator('#app .wl').first()).toContainText('3 guides');
});

test('Kingdom Code Guides lists each guide, its cover and title open the guide, and Download saves a real PDF', async ({ page, request }) => {
  await page.goto('/#/guides'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Kingdom Code Guides');
  const card = page.locator('.gcard').first();
  await expect(card.locator('h3')).toHaveText('The Ungovernable Mind');
  await expect(card).toContainText('PDF \u00b7 48 pages');
  await expect(card).toContainText('and exercise independent judgment, with a Discernment Field Sheet.');
  await expect(card).not.toContainText('six-step');
  expect(await card.locator('.gcover').getAttribute('href')).toBe('/guides/kingdom-code/the-ungovernable-mind/');
  expect(await card.locator('h3 a').getAttribute('href')).toBe('/guides/kingdom-code/the-ungovernable-mind/');
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
  expect(await page.locator('.back').getAttribute('href')).toBe('/guides/kingdom-code/');
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
  await expect(page.locator('#app h1')).toHaveText('Kingdom Code');
  await expect(page.locator('.ahead')).toHaveText('Knowledge worth recovering. Questions worth investigating.');
  await expect(page.locator('.alede')).toContainText('An independent exploration of Scripture, ancient history, Christianity, and the civilizations that shaped our world.');
  await expect(page.locator('#q')).toBeVisible();                                    // search is still first at hand
  await expect(page.locator('.afeat')).toHaveAttribute('href', '/guides/kingdom-code/the-ungovernable-mind/');
  const ids = await page.evaluate(() => essayIds().slice(0, 5));
  const shown = await page.locator('.acols .piece .t a').evaluateAll(a => a.map(x => x.dataset.pid));
  expect(shown).toEqual(ids.map(String));                                           // the five newest, in order
  const hrefs = await page.locator('.coll a.cc').evaluateAll(a => a.map(x => x.getAttribute('href')));
  expect(hrefs).toEqual(['/bible/', '/essays/', '/guides/kingdom-code/', '/names/', '/words/', '/translations/', '/english/']);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(true);   // the front page alone is wide
  await page.locator('.coll a[href="/words/"]').click(); await settle(page);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(false);
});

test('every collection on the front page opens a real page, and Essays lists every cited essay newest first by year', async ({ page }) => {
  await page.goto('/'); await settle(page);
  for (const h of ['#/books', '#/essays', '#/guides', '#/names', '#/words', '#/translations', '#/english']) {
    await page.evaluate(x => { location.hash = x; }, h); await settle(page);
    await expect(page.locator('#app h1')).not.toHaveText('Not found');
  }
  await page.evaluate(() => { location.hash = '#/essays'; }); await settle(page);
  expect(await page.locator('#app .piece'), 'the Essays page asks for a year first').toHaveCount(0);
  const n = await page.evaluate(() => essayIds().length);
  const years = await page.locator('#app .wl b').allTextContents();
  expect(years).toEqual([...years].sort().reverse());
  const counts = await page.locator('#app .wl .lang').allTextContents();
  expect(counts.reduce((t, c) => t + parseInt(c, 10), 0), 'the year counts add up to every essay').toBe(n);
  await page.locator('#app .wl').first().click(); await settle(page);
  expect(new URL(page.url()).pathname).toBe(`/essays/${years[0]}/`);
  await expect(page.locator('#app h1')).toHaveText(`Essays, ${years[0]}`);
  expect(await page.locator('#app .piece').count()).toBe(parseInt(counts[0], 10));
  const dates = await page.locator('#app .piece .cap').evaluateAll(c => c.length);
  expect(dates).toBeGreaterThan(5);
  await page.evaluate(() => { location.hash = '#/essays/1999'; }); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
});

test('the app keeps its own home, not the archive', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Read the Bible.');
  await expect(page.locator('.ahero')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-archive'))).toBe(false);
});

// ---- essays open on the platform where they were published; the site is the source index ----
const fs = require('fs');
const path = require('path');

test('essay text is switched off: no text in the data, no essay-text folder, and the font and cache rules stay harmless', () => {
  expect(Object.keys(D.ET || {})).toEqual([]);
  expect(fs.existsSync(path.join(__dirname, '..', 'essay-text'))).toBe(false);
});

test('titles in the lists open the essay where it was published, in a new tab, never an essay page on the site', async ({ page }) => {
  const year = (await page.goto('/') && (await page.evaluate(() => P[essayIds()[0]][3].slice(0, 4))));
  for (const hash of ['#/essays/' + year, '#/']) {
    await page.goto('/' + hash); await settle(page);
    const links = await page.locator('#app .piece .t a').evaluateAll(a => a.map(x => [x.getAttribute('href'), x.getAttribute('target')]));
    expect(links.length).toBeGreaterThan(3);
    for (const [href, target] of links) {
      expect(href).toMatch(/^https:\/\/(kingdomcode\.substack\.com|www\.patreon\.com)\//);
      expect(target).toBe('_blank');
    }
  }
});

test('the Essays page and the front page list the newest public Substack essays first, cited or not, each with Sources only when it cites verses', async ({ page }) => {
  const newest = D.PUB.map(id => D.pieces[id][3]).sort().reverse()[0];
  await page.goto('/'); await settle(page);
  const ids = await page.locator('.acols .piece .t a').evaluateAll(a => a.map(x => x.dataset.pid));
  const dates = ids.map(id => D.pieces[id][3]);
  expect(dates[0], 'the newest public essay leads the front page').toBe(newest);
  expect(dates).toEqual([...dates].sort().reverse());
  const year = newest.slice(0, 4);
  await page.evaluate(y => { location.hash = '#/essays/' + y; }, year); await settle(page);
  const first = page.locator('#app .piece').first();
  expect(D.pieces[await first.locator('.t a').getAttribute('data-pid')][3]).toBe(newest);
  // a public essay with no citations yet is listed, and offers no Sources link; one that cites verses does
  const uncited = await page.evaluate(() => D.PUB.find(id => !hasRefs(id)));
  const withRefs = await page.evaluate(() => Object.keys(P).find(id => hasRefs(id)));
  for (const [id, links] of [[uncited, 0], [withRefs, 1]]) {
    await page.evaluate(y => { location.hash = '#/essays/' + y; }, D.pieces[id][3].slice(0, 4)); await settle(page);
    await expect(page.locator(`#app .piece:has(a[data-pid="${id}"]) a[href^="/essays/"]`)).toHaveCount(links);
  }
});

test('the essay page still lists the verses an essay cites, and offers the essay on its platform', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const pid = await page.evaluate(() => Object.keys(P).find(id => hasRefs(id)));
  await page.evaluate(h => { location.hash = h; }, '#/essay/' + pid); await settle(page);
  await expect(page.locator('#app h1')).toHaveText(D.pieces[pid][0]);
  await expect(page.locator('#app')).toContainText('Scripture cited');
  const read = page.locator('#app a.btn.primary').first();
  expect(await read.getAttribute('target')).toBe('_blank');
  expect(await read.getAttribute('href')).toBe(D.pieces[pid][1]);
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

test('a verse stands on its own, with one separate section listing the essays that cite it', async ({ page }) => {
  const cited = (() => { for (const bk of Object.keys(D.verses)) for (const c of Object.keys(D.verses[bk])) for (const vs of Object.keys(D.verses[bk][c])) if (D.verses[bk][c][vs].length > 1 && D.CC[bk]) return [bk, c, vs]; })();
  await page.goto(`/#/verse/${cited[0]}/${cited[1]}/${cited[2]}`); await settle(page);
  for (const t of ['Start here', 'Read in season', 'Also quotes', 'Elsewhere in', 'More from']) await expect(page.locator('#app')).not.toContainText(t);
  await expect(page.locator('#app .cited')).toHaveCount(1);
  await expect(page.locator('#app .cited h2')).toHaveText('Cited in Kingdom Code essays');
  expect(await page.locator('#app .cited .piece').count()).toBe(D.verses[cited[0]][cited[1]][cited[2]].length);
  expect(await page.evaluate(() => document.querySelector('#app .cited').previousElementSibling !== null)).toBe(true);
  await page.goto(`/#/book/${D.bookEntry[cited[0]]}`); await settle(page);
  for (const t of ['From the essays', 'Most cited verses', 'Read in season']) await expect(page.locator('#app')).not.toContainText(t);
});

test('Early Church: a list of figures, and Ignatius of Antioch with his image and a short overview', async ({ page }) => {
  await page.goto('/guides/'); await settle(page);
  await page.locator('#app a.wl', { hasText: 'Early Church' }).click(); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/guides/early-church/');
  await expect(page.locator('#app h1')).toHaveText('Early Church');
  await page.locator('#app a.efig', { hasText: 'Ignatius of Antioch' }).click(); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/guides/early-church/ignatius-of-antioch/');
  await expect(page.locator('#app h1')).toHaveText('Ignatius of Antioch');
  const img = page.locator('#app .efigure img');
  await expect(img).toBeVisible();
  expect(await img.evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await page.locator('#app .eover p').count()).toBeGreaterThanOrEqual(2);
  await page.goto('/guides/early-church/nobody/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
});

test('the app has no Early Church section', async ({ page }) => {
  await page.goto('/app.html#/guide'); await settle(page);
  await expect(page.locator('#app')).not.toContainText('Early Church');
});

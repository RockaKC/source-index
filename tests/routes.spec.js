// Every kind of page renders: a heading, real content, and no page errors.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const firstCited = b => {
  const ch = Object.keys(D.verses[b])[0];
  return [ch, Object.keys(D.verses[b][ch])[0]];
};

const groups = {
  'main pages': ['#/', '#/books', '#/words', '#/names', '#/translations', '#/english', '#/about', '#/app', '#/credits',
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
  await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth)).toBe(1536);
  expect(await img.getAttribute('alt')).toContain('S: BLB, NASB, LSB');
  const order = await page.evaluate(() => { const f = document.querySelector('#app .tierfig'), t = document.querySelector('#app .tier'); return f.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING; });
  expect(order).toBeTruthy();
});

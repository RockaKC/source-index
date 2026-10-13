// KC Tewahedo Bible (app.html, profile profiles/app.js): the Bible first, and no essays inside the Bible text.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const cited = Object.keys(D.verses).map(Number).find(b => D.order.includes(b));
const [cch, cv] = (() => { const ch = Object.keys(D.verses[cited])[0]; return [ch, Object.keys(D.verses[cited][ch])[0]]; })();

async function open(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await settle(page);
}

test('the app opens on the reader home, with the books, the guide and the essays kept apart', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  await expect(page).toHaveTitle('KC Tewahedo Bible');
  await expect(page.locator('#app h1')).toHaveText('Read the Bible.');
  await expect(page.locator('#shelf a').first()).toBeVisible();
  await expect(page.locator('#app a[href="#/guide"], #app a[href="#/names"]').first()).toBeVisible();
  await expect(page.locator('#app a[href="#/kc"]')).toBeVisible();
  await expect(page.locator('#app')).not.toContainText('essay');
});

test('the Bible pages carry no essays', async ({ page }) => {
  await page.goto('/app.html');
  await open(page, `#/book/${D.bookEntry[cited]}`);
  await expect(page.locator('#app')).not.toContainText('From the essays');
  await open(page, `#/read/${cited}/${cch}`);
  await expect(page.locator('#app a.vv')).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText('Highlighted verses');
  await open(page, `#/verse/${cited}/${cch}/${cv}`);
  await expect(page.locator('#app')).not.toContainText('Start here');
  await expect(page.locator('#app')).not.toContainText('essay');
});

test('a chapter nobody cites is still offered by the search box', async ({ page }) => {
  const b = D.order.find(x => !D.verses[x]), ch = D.CC[b][0];
  await page.goto('/app.html');
  await settle(page);
  await page.fill('#q', `${D.books[b][0]} ${ch}:1`);
  const opts = page.locator('#sug li');
  await expect(opts.first()).toBeVisible();
  const metas = await page.locator('#sug li .m').allTextContents();
  expect(metas).toContain('Verse');
  expect(metas).toContain('Chapter');
  expect(metas.join(' ')).not.toMatch(/essay|cited/i);
});

test('the essays live in From Kingdom Code, and the guide lists its parts', async ({ page }) => {
  await page.goto('/app.html#/kc');
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('From Kingdom Code');
  await expect(page.locator(`#app a[href="#/path/${D.paths[0].id}"]`)).toBeVisible();
  await open(page, '#/guide');
  for (const r of ['#/names', '#/words', '#/translations', '#/english'])
    await expect(page.locator(`#app a[href="${r}"]`)).toBeVisible();
});

test('About names the app on the app only', async ({ page }) => {
  await page.goto('/app.html#/about');
  await settle(page);
  await expect(page.locator('#app')).toContainText('This app is called KC Tewahedo Bible.');
  await page.goto('/#/about');
  await settle(page);
  await expect(page.locator('#app')).not.toContainText('Tewahedo Bible');
});

test('the app loads no analytics', async ({ page }) => {
  const outside = [];
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) outside.push(r.url()); });
  await page.goto('/app.html');
  await settle(page);
  expect(await page.evaluate(() => PROFILE.analytics)).toBe(false);
  expect(outside).toEqual([]);
});

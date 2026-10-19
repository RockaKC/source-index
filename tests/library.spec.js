// The Essays library (js/library.js, tools/library.py, tools/library.json): subjects, topics, search, the year archive, collections.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();

test('every essay the site lists has one subject and at least one topic, all known, and nothing is filed that is not listed', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const problems = await page.evaluate(() => {
    const out = [], listed = new Set(essayIds().map(String)), cats = new Set(LIB.cats.map(c => c.id)), tags = new Set(LIB.tags.map(t => t.id));
    for (const pid of listed) {
      const e = LIB.ess[pid];
      if (!e) { out.push('essay ' + pid + ' is not filed'); continue; }
      if (!cats.has(e[0])) out.push(pid + ': unknown subject ' + e[0]);
      if (!e[1].length) out.push(pid + ': no topics');
      for (const t of e[1]) if (!tags.has(t)) out.push(pid + ': unknown topic ' + t);
      if (new Set(e[1]).size !== e[1].length) out.push(pid + ': a topic twice');
    }
    for (const pid of Object.keys(LIB.ess)) if (!listed.has(pid)) out.push('filed but not listed: ' + pid);
    for (const t of LIB.tags) if (t.n < 3) out.push('topic with fewer than 3 essays: ' + t.id);
    for (const l of [...LIB.cats, ...LIB.tags].flatMap(x => x.links)) if (!pathOf(l.h)) out.push('link without an address: ' + l.h);
    return out;
  });
  expect(problems).toEqual([]);
});

test('the Essays home: search, subjects that add up, latest essays, topics and the year archive', async ({ page }) => {
  await page.goto('/essays/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Essays');
  await expect(page.locator('#esq')).toBeVisible();
  const total = await page.evaluate(() => essayIds().length);
  const counts = await page.locator('#esb .coll .cn').allTextContents();
  expect(counts.reduce((t, c) => t + +c, 0), 'the subjects hold every essay once').toBe(total);
  expect(await page.locator('#esb .coll .cc').count()).toBe(await page.evaluate(() => LIB.cats.length));
  expect(await page.locator('#esb .piece').count(), 'five latest essays').toBe(5);
  expect(await page.locator('#esb .chips .chip').count()).toBeGreaterThan(8);
  await expect(page.locator('#esb .card .wl').first()).toBeVisible();     // the year archive is still here
});

test('search finds essays by title, subject and topic, and clears back to the browse view', async ({ page }) => {
  await page.goto('/essays/'); await settle(page);
  await page.fill('#esq', 'enoch');
  const n = await page.evaluate(() => libSearch('enoch').ids.length);
  expect(n).toBeGreaterThan(20);
  await expect(page.locator('#esr h2')).toContainText('essays for “enoch”');
  await expect(page.locator('#esb')).toBeHidden();
  expect(await page.locator('#esr .piece').count()).toBe(Math.min(n, 40));
  // an essay whose title does not say Enoch is found because it is filed under the topic
  const filedOnly = await page.evaluate(() => libSearch('enoch').ids.filter(pid => !/enoch/i.test(P[pid][0])).length);
  expect(filedOnly).toBeGreaterThan(0);
  await expect(page.locator('#esr .chips a[href="/essays/topics/enoch/"]')).toBeVisible();
  await page.fill('#esq', 'qzxv nonsense');
  await expect(page.locator('#esr')).toContainText('No essays');
  await page.fill('#esq', '');
  await expect(page.locator('#esb')).toBeVisible();
  await expect(page.locator('#esr')).toBeHidden();
});

test('a subject page lists its essays, its topics and its Source Index links; a topic page does the same', async ({ page }) => {
  const cat = await page.goto('/').then(() => page.evaluate(() => LIB.cats.find(c => c.links.length).id));
  await page.goto(`/essays/subjects/${cat}/`); await settle(page);
  const expected = await page.evaluate(id => essayIds().filter(p => LIB.ess[p][0] === id).length, cat);
  await expect(page.locator('#app .lede')).toBeVisible();
  expect(await page.locator('#app .piece').count()).toBe(expected);
  await expect(page.locator('#app h2', { hasText: 'In the Source Index' })).toBeVisible();
  const tag = await page.evaluate(() => LIB.tags.find(t => t.links.length && t.n >= 5).id);
  await page.goto(`/essays/topics/${tag}/`); await settle(page);
  const n = await page.evaluate(id => essayIds().filter(p => LIB.ess[p][1].includes(id)).length, tag);
  expect(await page.locator('#app .piece').count()).toBe(n);
  await expect(page.locator('#app h2', { hasText: 'In the Source Index' })).toBeVisible();
  await page.goto('/essays/topics/'); await settle(page);
  expect(await page.locator('#app .chips .chip').count()).toBe(await page.evaluate(() => LIB.tags.length));
  await page.goto('/essays/subjects/nothing/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
});

test('an essay\'s Sources page names its subject and topics, and those pages list the essay back', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const pid = await page.evaluate(() => essayIds().find(p => LIB.ess[p][1].length >= 3));
  const [cat, tags] = await page.evaluate(p => LIB.ess[p], pid);
  await page.goto(`/#/essay/${pid}`); await settle(page);
  await expect(page.locator('#app h2', { hasText: 'Subject and topics' })).toBeVisible();
  const subjectLink = page.locator(`#app a[href="/essays/subjects/${cat}/"]`);
  await expect(subjectLink).toHaveCount(1);
  expect(await page.locator('#app a[href^="/essays/topics/"]').count()).toBe(tags.length);
  await subjectLink.click(); await settle(page);
  await expect(page.locator(`#app .piece a[data-pid="${pid}"]`)).toHaveCount(1);
});

test('reading collections: the page is ready, and none are shown until one exists', async ({ page }) => {
  await page.goto('/essays/'); await settle(page);
  expect(await page.evaluate(() => LIB.cols.length)).toBe(0);
  await expect(page.locator('#esb h2', { hasText: 'Reading collections' })).toHaveCount(0);
  await page.evaluate(() => {          // a collection added in the data appears on the home page and has a page of its own
    const ids = essayIds().slice(0, 3).map(String);
    LIB.cols.push({ id: 'start-here', title: 'Start here', line: 'Three essays to begin with.', items: ids });
    route();
  });
  await expect(page.locator('#esb h2', { hasText: 'Reading collections' })).toBeVisible();
  await page.evaluate(() => navigate('#/essays/collection/start-here')); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/essays/collections/start-here/');
  await expect(page.locator('#app h1')).toHaveText('Start here');
  expect(await page.locator('#app .gtoc li').count()).toBe(3);
});

test('the app has no Essays library', async ({ page }) => {
  await page.goto('/app.html#/guide'); await settle(page);
  expect(await page.evaluate(() => typeof LIB !== 'undefined' && !!LIB)).toBe(false);
});

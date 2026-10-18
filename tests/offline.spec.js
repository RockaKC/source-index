// The installed site keeps working without a connection.
// The server is really stopped mid-test: Playwright's own "offline" switch does not stop a
// service worker's requests, so it cannot prove anything here.
const { test, expect, settle } = require('./helpers');
const { start } = require('./serve');

test('a chapter read online opens again with the server gone', async ({ browser }) => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`${base}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                                   // now controlled by the service worker
  await page.evaluate(() => { location.hash = '#/read/7/1'; });
  await settle(page);
  const online = await page.locator('#rtext p').count();
  expect(online).toBeGreaterThan(0);

  await new Promise(r => server.close(r));
  server.closeAllConnections && server.closeAllConnections();

  await page.reload();                                   // the page itself now comes from the cache
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Judges 1');
  expect(await page.locator('#rtext p').count()).toBe(online);
  expect(errors).toEqual([]);
  await context.close();
});

test('after a single visit, the site opens with the server gone', async ({ browser }) => {
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`${base}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);   // installed: page and data saved, nothing else read

  await new Promise(r => server.close(r));
  server.closeAllConnections && server.closeAllConnections();

  await page.reload();
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Kingdom Code Archive');
  await page.evaluate(() => { location.hash = '#/books'; });
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('The 81 books');
  expect(errors).toEqual([]);
  await context.close();
});

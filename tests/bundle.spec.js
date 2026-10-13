// The Android app's files (www/, from tools/build_app.py), opened the way the app opens them:
// from the phone itself, with no connection and no offline worker.
const { execFileSync } = require('child_process');
const path = require('path');
const { test, expect, loadData, settle, ROOT } = require('./helpers');
const { start } = require('./serve');

const D = loadData();
let server, base;

test.beforeAll(async () => {
  execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py')], { cwd: ROOT, stdio: 'pipe' });
  server = await start(0, path.join(ROOT, 'www'));
  base = `http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(() => server && server.close());

// Capacitor's bridge announces the app before the page's own scripts run; this stands in for it.
const asApp = page => page.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }; });

test('the app opens from its own files, reads any book, and asks nothing of the network', async ({ page }) => {
  const outside = [], missing = [];
  page.on('request', r => { if (!r.url().startsWith(base)) outside.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400) missing.push(r.url()); });
  await asApp(page);
  await page.goto(base);
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Read the Bible.');
  for (const b of [D.order[0], D.order[D.order.length - 1], D.order.find(x => !D.verses[x])]) {
    await page.evaluate(h => { location.hash = h; }, `#/read/${b}/${D.CC[b][0]}`);
    await settle(page);
    expect(await page.locator('#rtext p').count(), `chapter text for book ${b}`).toBeGreaterThan(0);
  }
  expect(missing, 'files the app asked for but does not have').toEqual([]);
  expect(outside, 'requests that left the phone').toEqual([]);
});

test('the app registers no offline worker and offers no install or save buttons', async ({ page }) => {
  await asApp(page);
  await page.goto(base + '#/about');
  await settle(page);
  await expect(page.locator('#app')).toContainText('This app is called KC Tewahedo Bible.');
  await expect(page.locator('#offline, #install')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBe(0);
});

test('the tier list picture is in the app and loads from the phone', async ({ page }) => {
  await asApp(page);
  await page.goto(base + '#/translations');
  await settle(page);
  const img = page.locator('#app .tierfig img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(e => e.complete && e.naturalWidth)).toBe(1536);
});

test('the build stamps the app with the version it is publishing, and the app reads it', async ({ page }) => {
  execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py')], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, KC_APP_VERSION: '2.3.4' } });
  try {
    await asApp(page);
    await page.goto(base + '#/updates');
    await settle(page);
    await expect(page.locator('#up-version')).toHaveText('You have version 2.3.4.');
  } finally {
    execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py')], { cwd: ROOT, stdio: 'pipe' });      // back to the preview stamp
  }
  expect(() => execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py')], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, KC_APP_VERSION: 'x' } })).toThrow();
  execFileSync('python3', [path.join(ROOT, 'tools', 'build_app.py')], { cwd: ROOT, stdio: 'pipe' });
});

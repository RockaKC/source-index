// The app's version and its update check (js/updates.js, profile appUpdates): what it shows, when it asks GitHub, and what it says
// for an up-to-date app, a newer release, a preview build and every way the check can fail.
const { test, expect, settle } = require('./helpers');

const API = '**/api.github.com/repos/RockaKC/source-index/releases/latest';
const release = (tag, extra = {}) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag_name: tag, published_at: '2026-10-13T15:54:46Z', ...extra }) });
const withVersion = (page, v) => page.route('**/app-version.json', r => v === null ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: v }) }));
async function open(page, hash, version = '1.1.4') {
  await withVersion(page, version);
  await page.goto('/app.html');
  await settle(page);
  await page.evaluate(h => { location.hash = h; }, hash);
  await settle(page);
}
const check = async page => { await page.click('#up-check'); await expect(page.locator('#up-result')).toBeVisible(); return page.locator('#up-result'); };

test('the Updates page and About say which version this is', async ({ page }) => {
  await open(page, '#/updates');
  await expect(page.locator('#up-version')).toHaveText('You have version 1.1.4.');
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect(page.locator('#about-version')).toHaveText('Version 1.1.4. ');
  await expect(page.locator('#app a[href="#/updates"]')).toHaveText('Check for updates');
});

test('the app asks nothing of GitHub until the button is tapped', async ({ page }) => {
  const asked = [];
  page.on('request', r => { if (r.url().includes('api.github.com')) asked.push(r.url()); });
  await page.route(API, r => r.fulfill(release('app-v1.1.4')));
  await open(page, '#/updates');
  await page.evaluate(() => { location.hash = '#/about'; });
  await page.waitForTimeout(500);
  expect(asked).toEqual([]);
  await page.evaluate(() => { location.hash = '#/updates'; });
  await settle(page);
  await check(page);
  expect(asked).toHaveLength(1);
});

test('up to date: it says so, and offers nothing to download', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.1.4')));
  await open(page, '#/updates');
  const box = await check(page);
  await expect(box).toContainText('You are up to date.');
  await expect(box).toContainText('Version 1.1.4 is the newest.');
  await expect(box.locator('a')).toHaveCount(0);
  await expect(page.locator('#up-check')).toHaveText('Check again');
});

test('a newer release: it names it, links the download, and suggests a backup first', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.2.0')));
  await open(page, '#/updates');
  const box = await check(page);
  await expect(box).toContainText('Version 1.2.0 is available.');
  await expect(box).toContainText('You have 1.1.4.');
  await expect(box).toContainText('13 October 2026');
  const dl = box.locator('a.btn');
  await expect(dl).toHaveText('Download 1.2.0');
  expect(await dl.getAttribute('href')).toBe(await page.evaluate(() => APP_DOWNLOAD));
  expect(await dl.getAttribute('target')).toBe('_blank');
  expect(await dl.getAttribute('rel')).toContain('noopener');
  await expect(box.locator('a[href="#/backup"]')).toBeVisible();
});

test('versions compare as numbers: 1.10.0 is newer than 1.9.9', async ({ page }) => {
  await open(page, '#/updates');
  const r = await page.evaluate(() => [compareVersions(versionParts('1.10.0'), versionParts('1.9.9')), compareVersions(versionParts('1.1.4'), versionParts('1.1.4')), compareVersions(versionParts('1.1.3'), versionParts('1.1.4')), versionParts('1.1'), versionParts('v1.1.4'), versionParts('1.1.4-beta')]);
  expect(r).toEqual([1, 0, -1, null, null, null]);
  await page.route(API, x => x.fulfill(release('app-v1.10.0')));
  await withVersion(page, '1.9.9');
  await page.reload(); await settle(page);
  await page.evaluate(() => { location.hash = '#/updates'; });
  await settle(page);
  await expect(await check(page)).toContainText('Version 1.10.0 is available.');
});

test('a version newer than the newest release is not told to update', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.1.4')));
  await open(page, '#/updates', '1.2.0');
  const box = await check(page);
  await expect(box).toContainText('You are up to date.');
  await expect(box).toContainText('newer than the newest release, 1.1.4');
});

test('a preview build says so, and still shows the newest release', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.1.4')));
  await open(page, '#/updates', '0.0.0');
  await expect(page.locator('#up-version')).toHaveText('This is a preview build, not a released version.');
  const box = await check(page);
  await expect(box).toContainText('The newest released version is 1.1.4.');
  await expect(box.locator('a.btn')).toHaveText('Download 1.1.4');
  await page.evaluate(() => { location.hash = '#/about'; });
  await expect(page.locator('#about-version')).toHaveText('');
});

test('an app that cannot tell its version still checks, and offers the download', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.1.4')));
  await open(page, '#/updates', null);
  await expect(page.locator('#up-version')).toHaveText('This app could not tell which version it is.');
  const box = await check(page);
  await expect(box).toContainText('The newest released version is 1.1.4.');
});

for (const [name, handler, text] of [
  ['no connection', r => r.abort('internetdisconnected'), 'Could not reach GitHub.'],
  ['GitHub limiting requests', r => r.fulfill({ status: 403, body: '{}' }), 'GitHub is limiting requests'],
  ['no release found', r => r.fulfill({ status: 404, body: '{}' }), 'could not be found'],
  ['a tag that is not a version', r => r.fulfill(release('nightly')), 'could not be read'],
  ['an answer that is not JSON', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>' }), 'Could not reach GitHub.'],
]) {
  test(`the check says what went wrong, kindly: ${name}`, async ({ page }) => {
    await page.route(API, handler);
    await open(page, '#/updates');
    const box = await check(page);
    await expect(box).toContainText(text);
    await expect(box.locator('a.btn')).toHaveCount(0);
    await expect(page.locator('#up-check')).toBeEnabled();
    await expect(page.locator('#up-check')).toHaveText('Check again');
  });
}

test('the menu offers Updates; the website has no such page and never asks GitHub', async ({ page }) => {
  await open(page, '#/');
  await page.click('#menubtn');
  await expect(page.locator('#drawer a[href="#/updates"]')).toHaveText('Updates');
  await page.goto('/');
  await settle(page);
  const asked = [];
  page.on('request', r => { if (r.url().includes('api.github.com')) asked.push(r.url()); });
  await page.evaluate(() => { location.hash = '#/updates'; });
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  expect(asked).toEqual([]);
});

// ---- Update now, inside the Android app: the native Updater plugin is stood in for by a script ----
const SHA = 'a'.repeat(64);
const asset = (v, digest = 'sha256:' + SHA) => ({ assets: [{ name: `KC-Tewahedo-Bible-${v}.apk`, browser_download_url: `https://github.com/RockaKC/source-index/releases/download/app-v${v}/KC-Tewahedo-Bible-${v}.apk`, digest }] });
async function withUpdater(page, script) {   // script runs in the page before it loads and fills window.__up (the calls) and the plugin
  await page.addInitScript(`(() => {
    const calls = window.__up = {download: [], install: 0, listeners: [], removed: 0};
    const state = window.__upState = {installAnswers: ['started'], downloadFails: 0, steps: [[10, 100], [100, 100]]};
    window.Capacitor = window.Capacitor || {}; Capacitor.Plugins = Capacitor.Plugins || {};
    Capacitor.Plugins.Updater = {
      async addListener(name, cb) { calls.listeners.push(cb); return {remove() { calls.removed++; }}; },
      async download(o) { calls.download.push(o); if (state.downloadFails > 0) { state.downloadFails--; throw new Error('The download did not finish. Check your connection and try again.'); }
        for (const [r, t] of state.steps) calls.listeners.forEach(cb => cb({received: r, total: t})); await new Promise(res => setTimeout(res, 50)); return {bytes: 100}; },
      async install() { calls.install++; return {state: state.installAnswers.shift() || 'started'}; } };
    ${script || ''}
  })();`);
}

test('inside the app, a newer release offers Update now, and the update runs in the page with a filling bar', async ({ page }) => {
  await withUpdater(page);
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0'))));
  await open(page, '#/updates');
  const box = await check(page);
  await expect(box.locator('#up-now')).toHaveText('Update now');
  await expect(box.locator('a.btn')).toHaveCount(0);               // no browser link in the way
  await page.evaluate(() => { __upState.steps = [[40, 100], [100, 100]]; });
  await box.locator('#up-now').click();
  await expect(box.locator('.upprog')).toBeVisible();
  await expect(box).toContainText('Ready.');
  await expect(box.locator('.upprog')).toHaveCount(0);
  const calls = await page.evaluate(() => ({download: __up.download, install: __up.install, removed: __up.removed}));
  expect(calls.download).toEqual([{ url: 'https://github.com/RockaKC/source-index/releases/download/app-v1.2.0/KC-Tewahedo-Bible-1.2.0.apk', sha256: SHA }]);
  expect(calls.install).toBe(1);
  expect(calls.removed).toBe(1);                                    // the progress listener is let go
});

test('the bar follows the progress the phone reports', async ({ page }) => {
  await withUpdater(page);
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0'))));
  await open(page, '#/updates');
  await check(page);
  await page.evaluate(() => { __upState.steps = [[50, 100]]; const d = Capacitor.Plugins.Updater.download; Capacitor.Plugins.Updater.download = async o => { await d(o); await new Promise(r => setTimeout(r, 3000)); return {bytes: 1}; }; });
  await page.click('#up-now');
  await expect(page.locator('#up-status')).toHaveText('Downloading… 50%');
  await expect(page.locator('.upprog')).toHaveAttribute('aria-valuenow', '50');
  expect(await page.$eval('.upprog', e => e.style.getPropertyValue('--p'))).toBe('0.5');
});

test('Android has to be told once to allow the install: the page explains, and Continue asks again', async ({ page }) => {
  await withUpdater(page);
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0'))));
  await open(page, '#/updates');
  await check(page);
  await page.evaluate(() => { __upState.installAnswers = ['permission', 'started']; });
  await page.click('#up-now');
  await expect(page.locator('#up-result')).toContainText('One step first.');
  await expect(page.locator('#up-now')).toBeEnabled();
  await page.click('#up-retry');
  await expect(page.locator('#up-result')).toContainText('Ready.');
  const c = await page.evaluate(() => ({download: __up.download.length, install: __up.install}));
  expect(c).toEqual({ download: 1, install: 2 });                   // the file was not fetched twice
});

test('a failed download says so and Try again starts over; the browser download stays as a last resort', async ({ page }) => {
  await withUpdater(page);
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0'))));
  await open(page, '#/updates');
  await check(page);
  await page.evaluate(() => { __upState.downloadFails = 1; });
  await page.click('#up-now');
  await expect(page.locator('#up-result')).toContainText('The download did not finish.');
  const link = page.locator('#up-result a[target="_blank"]');
  expect(await link.getAttribute('href')).toBe(await page.evaluate(() => APP_DOWNLOAD));
  await page.click('#up-retry');
  await expect(page.locator('#up-result')).toContainText('Ready.');
  expect(await page.evaluate(() => __up.download.length)).toBe(2);
});

test('a release without a listed checksum falls back to the browser download, never an unchecked file', async ({ page }) => {
  await withUpdater(page);
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0', ''))));
  await open(page, '#/updates');
  const box = await check(page);
  await expect(box.locator('#up-now')).toHaveCount(0);
  await expect(box.locator('a.btn')).toHaveText('Download 1.2.0');
});

test('without the app (a browser or a preview), the download link is all there is', async ({ page }) => {
  await page.route(API, r => r.fulfill(release('app-v1.2.0', asset('1.2.0'))));
  await open(page, '#/updates');
  const box = await check(page);
  await expect(box.locator('#up-now')).toHaveCount(0);
  await expect(box.locator('a.btn')).toHaveText('Download 1.2.0');
});

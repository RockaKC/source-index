// Opening the app in one smooth movement: the colours behind the page agree everywhere, the first page takes no entrance of its own,
// and the native launch code holds the launch screen only until the page has drawn.
const fs = require('fs');
const path = require('path');
const { test, expect, settle, ROOT } = require('./helpers');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const cssBg = scheme => {
  const css = read('css/site.css');
  if (scheme === 'light') return /:root\{[^}]*?--bg:(#[0-9a-f]{6});/i.exec(css)[1].toLowerCase();
  return /:root\[data-theme=dark\]\{[^}]*?--bg:(#[0-9a-f]{6});/i.exec(css)[1].toLowerCase();
};
const xmlColor = f => new RegExp('<color name="splash_background">(#[0-9A-Fa-f]{6})</color>').exec(read(f))[1].toLowerCase();

test('the launch screen, the window and the page are the same two colours', () => {
  const light = cssBg('light'), dark = cssBg('dark');
  expect(xmlColor('android/app/src/main/res/values/ic_launcher_background.xml')).toBe(light);
  expect(xmlColor('android/app/src/main/res/values-night/colors.xml')).toBe(dark);
  const html = read('app.html');
  expect(html).toContain(`html{background:${light}}`);
  expect(html).toContain(`@media (prefers-color-scheme:dark){html{background:${dark}}}`);
  expect(html).toContain(`html[data-theme=dark]{background:${dark}}`);
});

test('the window behind the page is the page colour, never the theme grey', () => {
  const styles = read('android/app/src/main/res/values/styles.xml');
  const theme = /<style name="AppTheme.NoActionBar"[\s\S]*?<\/style>/.exec(styles)[0];
  expect(theme).toContain('<item name="android:windowBackground">@color/splash_background</item>');
});

test('the native code holds the launch screen until the page has drawn, then fades it, and never for long', () => {
  const java = read('android/app/src/main/java/com/kingdomcodearchive/tewahedo/MainActivity.java');
  expect(java).toContain('SplashScreen.installSplashScreen(this)');
  expect(java).toContain('setKeepOnScreenCondition(() -> !pageReady)');
  expect(java).toContain('onPageLoaded');
  expect(java).toContain('setOnExitAnimationListener');
  expect(java).toContain('web.setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background))');
  const max = +/MAX_WAIT_MS = (\d+)/.exec(java)[1];
  expect(max).toBeGreaterThanOrEqual(1500);
  expect(max).toBeLessThanOrEqual(4000);                         // a stuck page can never keep the reader out
});

test('before any stylesheet has arrived, the page is already its own colour', async ({ browser }) => {
  for (const [scheme, rgb] of [['dark', 'rgb(17, 21, 19)'], ['light', 'rgb(255, 255, 255)']]) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const page = await ctx.newPage();
    await page.route('**/css/site.css*', async r => { await new Promise(res => setTimeout(res, 1500)); r.continue(); });
    page.goto('/app.html', { waitUntil: 'commit' }).catch(() => {});
    await page.waitForFunction(() => document.head && document.head.querySelector('style'), null, { timeout: 5000 });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), scheme).toBe(rgb);
    await ctx.close();
  }
});

test('the first page of the app takes no entrance; every later page rises in, and the website keeps its fade', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  expect(await page.locator('#app > div').first().getAttribute('class')).toBe('');
  await page.evaluate(() => { location.hash = '#/about'; });
  await settle(page);
  expect(await page.locator('#app > div').first().getAttribute('class')).toBe('fadein');
  await page.goto('/');
  await settle(page);
  expect(await page.locator('#app > div').first().getAttribute('class')).toBe('fadein');
});

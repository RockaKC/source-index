// Opening the app in one smooth movement: the colours behind the page agree (launch screen, window, WebView and --bg), the first page takes no entrance of its own,
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

test('the launch screen, the window and the page are the same two colours (native resources and --bg)', () => {
  const light = cssBg('light'), dark = cssBg('dark');
  expect(xmlColor('android/app/src/main/res/values/ic_launcher_background.xml')).toBe(light);
  expect(xmlColor('android/app/src/main/res/values-night/colors.xml')).toBe(dark);
});

test('the launch screen is the icon\'s own green with the book on it, and the book\'s plate fades into that green', async ({ page }) => {
  const res = 'android/app/src/main/res/';
  const bg = read(res + 'values/ic_launcher_background.xml');
  expect(bg).toContain('<color name="launch_background">@color/ic_launcher_background</color>');          // one green, from the icon
  const launch = /<style name="AppTheme.NoActionBarLaunch"[\s\S]*?<\/style>/.exec(read(res + 'values/styles.xml'))[0];
  expect(launch).toContain('<item name="windowSplashScreenBackground">@color/launch_background</item>');
  expect(launch).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/splash_mark</item>');
  expect(read(res + 'drawable/splash.xml')).toContain('@color/launch_background');
  // splash_mark.png: transparent where the tile's rim and corners were, opaque at the book (decoded by the browser, so no extra tools)
  const b64 = fs.readFileSync(path.join(ROOT, res, 'drawable/splash_mark.png')).toString('base64');
  const probe = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const a = (fx, fy) => x.getImageData(Math.floor(img.width * fx), Math.floor(img.height * fy), 1, 1).data[3];
    return { size: [img.width, img.height], edges: [a(.5, .205), a(.205, .5), a(.795, .5), a(.5, .795), a(.22, .22), a(.78, .78)], book: a(.5, .5), corner: a(.07, .07) };
  }, b64);
  expect(probe.size).toEqual([576, 576]);
  for (const v of probe.edges) expect(v, "the plate's edge and corners are gone").toBeLessThanOrEqual(8);
  expect(probe.book, 'the book is whole').toBeGreaterThanOrEqual(250);
  expect(probe.corner, "nothing at the square's corner").toBe(0);
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

// The app's verse panel (js/marks.js, profile verseTools): favorite, highlight, copy, share, and the lists they feed.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], ch = D.CC[b1][0], bn = D.books[b1][0];
const TR = (D.TR || {})[b1];
const verse = n => `#rtext p#v${n}`;
const marks = page => page.evaluate(() => JSON.parse(localStorage.getItem('kc-marks') || '{}'));
// Closing the panel steps the browser back one entry, which finishes a moment later; a person cannot navigate that fast.
const panelGone = page => page.waitForFunction(() => !(history.state && history.state.kcSheet));
const plain = (page, n) => page.evaluate(sel => { const c = document.querySelector(sel).cloneNode(true); c.querySelectorAll('sup').forEach(s => s.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }, verse(n));

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });
test.beforeEach(async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${ch}`);
  await settle(page);
});

test('tapping a verse opens the panel; Escape, the close button and Back all close it', async ({ page }) => {
  await page.click(verse(3));
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheet-t')).toHaveText(`${bn} ${ch}:3`);
  await expect(page.locator('#sheet-v')).toHaveText(await plain(page, 3));
  await expect(page.locator(verse(3))).toHaveClass(/sel/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator(verse(3))).not.toHaveClass(/sel/);
  await page.click(verse(3));
  await page.click('#sheetx');
  await expect(page.locator('#sheet')).toBeHidden();
  const h = await page.evaluate(() => location.hash);
  await page.click(verse(3));
  await page.goBack();
  await expect(page.locator('#sheet')).toBeHidden();
  expect(await page.evaluate(() => location.hash), 'Back closes the panel and stays on the chapter').toBe(h);
});

test('selecting text does not open the panel, and the page behind stays still', async ({ page }) => {
  await page.evaluate(sel => { const p = document.querySelector(sel); getSelection().selectAllChildren(p); p.click(); }, verse(2));
  await expect(page.locator('#sheet')).toBeHidden();
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.click(verse(2));
  const before = await page.evaluate(() => scrollY);
  await page.mouse.move(200, 300);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('favorite marks the verse, is remembered, and toggles off', async ({ page }) => {
  await page.click(verse(3));
  await page.click('#sheet [data-act="fav"]');
  await expect(page.locator('#sheet')).toBeHidden();
  await expect(page.locator('#toast')).toHaveText('Added to favorites');
  await expect(page.locator(verse(3))).toHaveClass(/fav/);
  expect(Object.keys(await marks(page))).toEqual([`${b1}:${ch}:3`]);
  await page.reload();                                             // still there after the app is reopened
  await settle(page);
  await expect(page.locator(verse(3))).toHaveClass(/fav/);
  await page.click(verse(3));
  await expect(page.locator('#sheet [data-act="fav"] span')).toHaveText('Unfavorite');
  await page.click('#sheet [data-act="fav"]');
  await expect(page.locator(verse(3))).not.toHaveClass(/fav/);
  expect(await marks(page), 'nothing left once the last mark is gone').toEqual({});
});

test('highlights: six colors, underline, double underline; the same one again, or Remove, takes it off', async ({ page }) => {
  await page.click(verse(1));
  await expect(page.locator('#sheet [data-act="unhl"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  for (const [i, code] of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'u1', 'u2'].entries()) {
    await page.click(verse(1));
    await expect(page.locator(`#sheet [data-hl="${code}"]`)).toHaveAttribute('aria-pressed', 'false');
    await page.click(`#sheet [data-hl="${code}"]`);
    await expect(page.locator(verse(1))).toHaveClass(new RegExp(`m-${code}`));
    expect((await marks(page))[`${b1}:${ch}:1`].h).toBe(code);
    if (i) await expect(page.locator(verse(1)), 'one highlight at a time').not.toHaveClass(new RegExp(`m-${['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'u1', 'u2'][i - 1]}\\b`));
  }
  await page.click(verse(1));
  await expect(page.locator('#sheet [data-hl="u2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#sheet [data-hl="u2"]');                       // the same again
  await expect(page.locator('#toast')).toHaveText('Highlight removed');
  expect(await marks(page)).toEqual({});
  await page.click(verse(1));
  await page.click('#sheet [data-hl="c3"]');
  await page.click(verse(1));
  await page.click('#sheet [data-act="unhl"]');                    // Remove
  await expect(page.locator(verse(1))).not.toHaveClass(/m-c3/);
  expect(await marks(page)).toEqual({});
});

test('a verse tapped right after a panel closes still gets its panel, with one history entry', async ({ page }) => {
  const entries = await page.evaluate(() => history.length);
  await page.click(verse(2));
  await page.evaluate(sel => {                    // one task: the panel's close event cannot have run when the next tap lands
    document.querySelector('#sheet [data-act="fav"]').click();
    document.querySelector(sel).click();
  }, verse(5));
  await page.waitForTimeout(700);
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#sheet-t')).toHaveText(`${bn} ${ch}:5`);
  expect(await page.evaluate(() => history.length), 'the panel adds one entry, not a stray extra one').toBe(entries + 1);
  await page.goBack();                                                          // and Back still closes it, once
  await expect(page.locator('#sheet')).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe(`#/read/${b1}/${ch}`);
});

test('copy puts the verse and its source on the clipboard', async ({ page }) => {
  await page.click(verse(3));
  await page.click('#sheet [data-act="copy"]');
  await expect(page.locator('#toast')).toHaveText('Copied');
  const text = await plain(page, 3);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`“${text}”\n— ${bn} ${ch}:3 (${TR})`);
});

test('copy names the English number where a book is numbered differently', async ({ page }) => {
  const b = +Object.keys(D.PE).find(k => Object.keys(D.PE[k]).length);
  const [key, e] = Object.entries(D.PE[b])[0], [c, v] = key.split(':');
  await page.goto(`/app.html#/read/${b}/${c}`);
  await settle(page);
  await page.click(verse(v));
  await page.click('#sheet [data-act="copy"]');
  const name = D.books[b][0] === 'Psalms' ? 'Psalm' : D.books[b][0];
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`, ${name} ${e[0]}:${e[1]} in English Bibles`);
});

test('share uses the phone\'s share sheet, or the browser\'s, or copies', async ({ page }) => {
  await page.evaluate(() => { window.Capacitor = { Plugins: { Share: { share: async o => { window.__shared = ['plugin', o]; } } } }; navigator.share = async o => { window.__shared = ['web', o]; }; });
  await page.click(verse(3));
  await page.click('#sheet [data-act="share"]');
  const text = `“${await plain(page, 3)}”\n— ${bn} ${ch}:3 (${TR})`;
  expect(await page.evaluate(() => window.__shared)).toEqual(['plugin', { text, dialogTitle: 'Share this verse' }]);
  await page.evaluate(() => { delete window.Capacitor; });
  await page.click(verse(3));
  await page.click('#sheet [data-act="share"]');
  expect(await page.evaluate(() => window.__shared)).toEqual(['web', { text }]);
  await page.evaluate(() => { navigator.share = undefined; });
  await page.click(verse(3));
  await page.click('#sheet [data-act="share"]');
  await expect(page.locator('#toast')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test('the Favorites and Highlights pages list them newest first, with the verse, and open it', async ({ page }) => {
  await page.click(verse(2)); await page.click('#sheet [data-hl="c2"]');
  await page.waitForTimeout(20);
  await page.click(verse(5)); await page.click('#sheet [data-act="fav"]');
  await page.waitForTimeout(20);
  await page.click(verse(2)); await page.click('#sheet [data-act="fav"]');
  await panelGone(page);
  await page.evaluate(() => { location.hash = '#/favorites'; });
  await settle(page);
  await expect(page.locator('#app .mrow .t')).toHaveText([`${bn} ${ch}:2`, `${bn} ${ch}:5`]);
  await expect(page.locator('#app .mrow .vp').first()).toContainText(await page.evaluate(() => 'But'), { timeout: 5000 });
  await page.evaluate(() => { location.hash = '#/highlights'; });
  await settle(page);
  await expect(page.locator('#app .mrow')).toHaveCount(1);
  await expect(page.locator('#app .mrow .t')).toContainText('Green');
  await page.click('#app .mrow');
  await settle(page);
  expect(await page.evaluate(() => location.hash)).toBe(`#/read/${b1}/${ch}/2`);
  await page.evaluate(() => localStorage.setItem('kc-marks', '{}'));
  await page.evaluate(() => { location.hash = '#/favorites'; });
  await page.reload();
  await settle(page);
  await expect(page.locator('#app')).toContainText('No favorites yet');
});

test('the website has no verse panel, and keeps nothing', async ({ page }) => {
  await page.goto(`/#/read/${b1}/${ch}`);
  await settle(page);
  await expect(page.locator('#sheet')).toHaveCount(0);
  await page.click(verse(3));
  await expect(page.locator('.sel')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kc-marks'))).toBeNull();
});

// The app's reading bar, reading toolbar, reading history and search page (js/readerbar.js, profile readerTools).
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], c1 = D.CC[b1];                       // the first book with text, and its chapters

async function go(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await settle(page);
}
const hash = page => page.evaluate(() => location.hash);

test('a chapter shows the bar in the header and drops the in-page chapter bar', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${c1[1]}`);
  await settle(page);
  await expect(page.locator('#readbar')).toBeVisible();
  await expect(page.locator('#rb-title b')).toHaveText(`${D.books[b1][0]} ${c1[1]}`);
  await expect(page.locator('#rb-next')).toHaveAttribute('href', `#/read/${b1}/${c1[2]}`);
  await expect(page.locator('#rb-prev')).toHaveAttribute('href', `#/read/${b1}/${c1[0]}`);
  await expect(page.locator('header .wordmark')).toBeHidden();
  await expect(page.locator('#app .rbar'), 'no second chapter bar in the page').toHaveCount(0);
  await expect(page.locator('#app a.back'), 'no Back link above the chapter').toHaveCount(0);
  await expect(page.locator('#readtools')).toBeVisible();
  await go(page, `#/read/${b1}/${c1[0]}`);
  await expect(page.locator('#rb-prev'), 'nothing before the first chapter of the Bible').toHaveAttribute('aria-disabled', 'true');
  await go(page, '#/books');
  await expect(page.locator('#readbar')).toBeHidden();
  await expect(page.locator('#readtools')).toBeHidden();
  await expect(page.locator('header .wordmark')).toBeVisible();
});

test('the title opens the book, and the search icon opens search', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${c1[0]}`);
  await settle(page);
  await page.click('#rb-title');
  await settle(page);
  expect(await hash(page)).toBe(`#/book/${D.bookEntry[b1]}`);
  await page.goto(`/app.html#/read/${b1}/${c1[0]}`);
  await settle(page);
  await page.click('#rb-find');
  await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Search');
  await page.fill('#q', `${D.books[b1][0]} ${c1[0]}`);
  await expect(page.locator('#sug li').first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await settle(page);
  expect(await hash(page)).toMatch(/^#\/(read|verse|book)\//);
});

test('the toolbar goes back and forward through this visit\'s chapters', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${c1[0]}`);
  await settle(page);
  await expect(page.locator('#rt-back')).toBeDisabled();
  await expect(page.locator('#rt-fwd')).toBeDisabled();
  await page.click('#rb-next'); await settle(page);
  await page.click('#rb-next'); await settle(page);
  expect(await hash(page)).toBe(`#/read/${b1}/${c1[2]}`);
  await page.click('#rt-back'); await settle(page);
  expect(await hash(page)).toBe(`#/read/${b1}/${c1[1]}`);
  await expect(page.locator('#rt-fwd')).toBeEnabled();
  await page.click('#rt-back'); await settle(page);
  expect(await hash(page)).toBe(`#/read/${b1}/${c1[0]}`);
  await expect(page.locator('#rt-back')).toBeDisabled();
  await page.click('#rt-fwd'); await settle(page);
  expect(await hash(page)).toBe(`#/read/${b1}/${c1[1]}`);
  await go(page, `#/read/${b1}/${c1[0]}`);                     // a new chapter after going back drops what was ahead
  await expect(page.locator('#rt-fwd')).toBeDisabled();
  await page.click('#rt-back'); await settle(page);
  expect(await hash(page), 'back returns to the chapter left behind, not the one dropped').toBe(`#/read/${b1}/${c1[1]}`);
});

test('the toolbar slips away scrolling down, returns scrolling up, and the top button goes to the top', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${c1[0]}`);
  await settle(page);
  const tools = page.locator('#readtools');
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(tools).toHaveClass(/away/);
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(tools).not.toHaveClass(/away/);
  await page.click('#rt-top');
  await page.waitForFunction(() => window.scrollY === 0);
});

test('the history lists chapters read, newest first, and clears on a second tap', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${c1[0]}`);
  await settle(page);
  await go(page, `#/read/${b1}/${c1[1]}`);
  await go(page, `#/read/${b1}/${c1[0]}`);                     // read again: it moves to the front, not listed twice
  await go(page, '#/history');
  const rows = page.locator('#app .hrow .t');
  await expect(rows).toHaveText([`${D.books[b1][0]} ${c1[0]}`, `${D.books[b1][0]} ${c1[1]}`]);
  await expect(page.locator('#app .dayhead')).toHaveText('Today');
  await page.click('#clearhist');
  await expect(page.locator('#clearhist')).toHaveText('Tap again to clear');
  await expect(rows).toHaveCount(2);
  await page.click('#clearhist');
  await expect(page.locator('#app .hrow')).toHaveCount(0);
  await expect(page.locator('#app')).toContainText('Chapters you read will be listed here');
});

test('the menu groups my collections, the Bible tools and the Kingdom Code items', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  await page.click('#menubtn');
  const drawer = page.locator('#drawer');
  for (const r of ['#/favorites', '#/highlights', '#/history', '#/books', '#/find', '#/guide', '#/kc']) await expect(drawer.locator(`a[href="${r}"]`)).toBeVisible();
  await expect(drawer.locator('.drawerhead')).toHaveText(['My collections', 'Bible', 'Kingdom Code']);
});

test('the website has none of it', async ({ page }) => {
  await page.goto(`/#/read/${b1}/${c1[0]}`);
  await settle(page);
  await expect(page.locator('#readbar')).toHaveCount(0);
  await expect(page.locator('#readtools')).toHaveCount(0);
  await expect(page.locator('#app .rbar')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('kc-history')), 'the site keeps no reading history').toBeNull();
  await go(page, '#/history');
  await expect(page.locator('#app h1')).not.toHaveText('History');
});

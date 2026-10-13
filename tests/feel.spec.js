// How the app feels under a finger (css/site.css, "App feel"): a press answers at once, hover never sticks on a touch screen,
// and the drawer and the verse panel glide in by keyframes, which every WebView plays (the older transition-only way did not).
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], ch = D.CC[b1][0];
const transform = (page, sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).transform);
const background = (page, sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor);
const openDrawer = async page => { await page.click('#menubtn'); await expect(page.locator('#drawer')).toBeVisible(); await page.waitForTimeout(400); };

test('in the app, a pressed button, row and icon shrink at once and come back on release', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  await openDrawer(page);
  for (const [sel, scale] of [['#drawer .menu a', .985], ['#drawer .drawerbar .ibtn', .88]]) {
    const el = page.locator(sel).first(), box = await el.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(async () => +(/matrix\(([\d.]+)/.exec(await transform(page, sel)) || [])[1]).toBeCloseTo(scale, 2);
    await page.mouse.move(0, 0);                              // let go off the target, so nothing is tapped
    await page.mouse.up();
    await expect.poll(() => transform(page, sel)).toBe('none');
  }
});

test('in the app, a pressed secondary button shrinks too', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  const btn = page.locator('#app .btn.secondary, #app .chip').first();
  await btn.scrollIntoViewIfNeeded();
  const box = await btn.boundingBox(), before = await btn.evaluate(e => getComputedStyle(e).transform);
  expect(before).toBe('none');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => btn.evaluate(e => getComputedStyle(e).transform)).not.toBe('none');
  await page.mouse.up();
});

test('the website does not shrink under a press', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  const btn = page.locator('#app .btn, #app .chip').first();
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await btn.evaluate(e => getComputedStyle(e).transform)).toBe('none');
  await page.mouse.up();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  test('hover does not stay on a row after it is touched', async ({ page }) => {
    await page.goto('/app.html');
    await settle(page);
    expect(await page.evaluate(() => matchMedia('(hover:hover)').matches)).toBe(false);
    await openDrawer(page);
    const row = page.locator('#drawer .menu a').first(), box = await row.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    expect(await background(page, '#drawer .menu a')).toBe('rgba(0, 0, 0, 0)');
  });
});

test('with a mouse, hover still tints a drawer row', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  await openDrawer(page);
  const row = page.locator('#drawer .menu a').first(), box = await row.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => background(page, '#drawer .menu a')).not.toBe('rgba(0, 0, 0, 0)');
});

test('the drawer and the verse panel enter by keyframes, with a fading scrim', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${ch}`);
  await settle(page);
  const names = (id, pseudo) => page.evaluate(([i, p]) => document.getElementById(i).getAnimations({ subtree: true }).filter(a => !p === !a.effect.pseudoElement).map(a => a.animationName), [id, pseudo]);
  const running = (id, pseudo) => page.evaluate(([i, p]) => document.getAnimations().filter(a => a.effect.target === document.getElementById(i) && (a.effect.pseudoElement || null) === p).map(a => a.animationName), [id, pseudo]);
  await page.click('#menubtn');
  expect(await running('drawer', null)).toContain('drawer-in');
  expect(await running('drawer', '::backdrop')).toContain('scrim-in');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.locator('#drawer')).toBeHidden();
  await page.click('#rtext p#v3');
  expect(await running('sheet', null)).toContain('sheet-in');
  expect(await running('sheet', '::backdrop')).toContain('scrim-in');
});

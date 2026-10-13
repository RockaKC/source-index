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

// Swiping the drawer shut (js/chrome.js). Real touch, through the browser's own input: start, move, wait, end.
test.describe('swiping the drawer', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  async function swipe(page, { from = 250, dx = 0, dy = 0, steps = 6, pause = 0, gap = 8, sample = false }) {
    const c = await page.context().newCDPSession(page), send = (type, x, y) => c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await send('touchStart', from, 400);
    const seen = [];
    for (let i = 1; i <= steps; i++) { await send('touchMove', from + dx * i / steps, 400 + dy * i / steps); await page.waitForTimeout(gap); if (sample) seen.push(await page.evaluate(() => getComputedStyle(document.getElementById('drawer')).transform)); }
    if (pause) await page.waitForTimeout(pause);
    await send('touchEnd');
    return seen;
  }
  const isOpen = page => page.evaluate(() => document.getElementById('drawer').open);
  const entries = page => page.evaluate(() => history.length);
  async function opened(page) {
    await page.goto('/app.html'); await settle(page);
    await page.click('#menubtn'); await expect(page.locator('#drawer')).toBeVisible(); await page.waitForTimeout(500);
  }

  test('a drag past a third of its width follows the finger, then closes it, and Back is not left stranded', async ({ page }) => {
    await opened(page);
    const before = await entries(page);
    const seen = await swipe(page, { dx: -200, pause: 300, sample: true });
    const tx = seen.map(t => +(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)/.exec(t) || [])[1]);
    expect(tx[tx.length - 1]).toBeLessThan(-100);                    // it moved with the finger, not by a fixed jump
    expect(tx[0]).toBeGreaterThan(tx[tx.length - 1]);
    await expect.poll(() => isOpen(page)).toBe(false);
    await expect.poll(() => page.evaluate(() => !!(history.state && history.state.kcDrawer))).toBe(false);
    expect(await entries(page)).toBeLessThanOrEqual(before);
    expect(await page.evaluate(() => location.hash)).toBe('');
    await page.click('#menubtn');                                    // and it opens cleanly again, full size
    await expect(page.locator('#drawer')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await page.locator('#drawer').evaluate(e => getComputedStyle(e).transform)).toBe('none');
  });

  test('a short, slow drag springs back and the drawer stays open', async ({ page }) => {
    await opened(page);
    await swipe(page, { dx: -60, pause: 250, gap: 20 });
    await page.waitForTimeout(400);
    expect(await isOpen(page)).toBe(true);
    expect(await page.locator('#drawer').evaluate(e => getComputedStyle(e).transform.replace('matrix(1, 0, 0, 1, 0, 0)', 'none'))).toBe('none');   // at rest, in place
    expect(await page.locator('#drawer').evaluate(e => e.style.transform + e.style.transition)).toBe('');      // nothing left behind
  });

  test('a quick flick closes it even when short', async ({ page }) => {
    await opened(page);
    await swipe(page, { dx: -70, steps: 4, gap: 4 });
    await expect.poll(() => isOpen(page)).toBe(false);
  });

  test('a vertical drag and a drag to the right leave it alone', async ({ page }) => {
    await opened(page);
    await swipe(page, { dy: -200 });
    await swipe(page, { from: 100, dx: 120 });
    await page.waitForTimeout(400);
    expect(await isOpen(page)).toBe(true);
    expect(await page.locator('#drawer').evaluate(e => getComputedStyle(e).transform)).toBe('none');
  });

  test('a drag that ends on a link does not follow the link', async ({ page }) => {
    await opened(page);
    const hash = await page.evaluate(() => location.hash);
    const row = await page.locator('#drawer .menu a').first().boundingBox();
    await swipe(page, { from: row.x + 200, dx: -40, pause: 300, gap: 20 });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => location.hash)).toBe(hash);
    expect(await isOpen(page)).toBe(true);
  });
});

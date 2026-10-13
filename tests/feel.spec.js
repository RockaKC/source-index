// How the app feels under a finger (css/site.css, "App feel"): a press answers at once, hover never sticks on a touch screen,
// and the drawer and the verse panel glide in by keyframes, which every WebView plays (the older transition-only way did not).
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], ch = D.CC[b1][0];
const transform = (page, sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).transform);
const background = (page, sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor);
const openDrawer = async page => { await page.click('#menubtn'); await expect(page.locator('#drawer')).toBeVisible(); await page.waitForTimeout(400); };

const press = async (page, sel, hold) => {                       // finger down on the first match; `hold` runs while it is down
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try { await hold(el); } finally { await page.mouse.move(0, 0); await page.mouse.up(); }   // let go off the target, so nothing is tapped
};
const shadow = (el) => el.evaluate(e => getComputedStyle(e).boxShadow);
const scaleOf = async el => +(/matrix\(([\d.]+)/.exec(await el.evaluate(e => getComputedStyle(e).transform)) || [, 1])[1];

test('in the app, a pressed icon shrinks at once, a pressed row takes the green, and both let go on release', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  await openDrawer(page);
  await press(page, '#drawer .drawerbar .ibtn', async el => { await expect.poll(() => scaleOf(el)).toBeCloseTo(.88, 2); });
  await press(page, '#drawer .menu a', async el => { await expect.poll(() => shadow(el)).not.toBe('none'); });
  await expect.poll(() => page.locator('#drawer .menu a').first().evaluate(e => getComputedStyle(e).boxShadow)).toBe('none');
});

test('in the app, home tiles and buttons, list rows and verses all take the green when pressed', async ({ page }) => {
  await page.goto('/app.html');
  await settle(page);
  for (const sel of ['#shelf .bk, #shelf a', '#app .btn.secondary', '#app .tab']) await press(page, sel, async el => { await expect.poll(() => shadow(el)).not.toBe('none'); });
  await page.evaluate(() => { location.hash = '#/names'; });
  await settle(page);
  await press(page, '#app .wl', async el => {                      // a flush row: the green reaches past the words, rounded
    await expect.poll(() => shadow(el)).not.toBe('none');
    expect(await el.evaluate(e => getComputedStyle(e).borderRadius)).toBe('10px');
    expect(await scaleOf(el)).toBe(1);                              // and nothing moves
  });
  await page.goto(`/app.html#/read/${b1}/${ch}`);
  await settle(page);
  await press(page, '#rtext p#v3', async el => { await expect.poll(() => shadow(el)).not.toBe('none'); });
});

test('a long press on a button or link raises no menu; the Bible text keeps its own', async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${ch}`);
  await settle(page);
  const prevented = sel => page.locator(sel).first().evaluate(e => { const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); e.dispatchEvent(ev); return ev.defaultPrevented; });
  expect(await prevented('#menubtn')).toBe(true);
  expect(await prevented('#rtext p#v3')).toBe(false);
});

test('a new page arrives with a rise in the app, and the website keeps its plain fade', async ({ page }) => {
  const arriving = () => page.evaluate(() => document.getAnimations().map(a => a.animationName).filter(Boolean));
  await page.goto('/app.html');
  await settle(page);
  await page.evaluate(() => { location.hash = '#/about'; });
  expect(await arriving()).toContain('page-in');
  await page.goto('/');
  await settle(page);
  await page.evaluate(() => { location.hash = '#/about'; });
  expect(await arriving()).toContain('fade');
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
  // Events carry their own timestamps, so a flick is as fast as written however busy the machine is.
  async function swipe(page, { from = 250, dx = 0, dy = 0, steps = 6, pause = 0, gap = 8, sample = false }) {
    const c = await page.context().newCDPSession(page), t0 = Date.now() / 1000; let clock = 0;
    const send = (type, x, y) => c.send('Input.dispatchTouchEvent', { type, timestamp: t0 + clock / 1000, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await send('touchStart', from, 400);
    const seen = [];
    for (let i = 1; i <= steps; i++) {
      clock += gap;
      await send('touchMove', from + dx * i / steps, 400 + dy * i / steps);
      await page.waitForTimeout(gap);
      if (sample) seen.push(await page.evaluate(() => getComputedStyle(document.getElementById('drawer')).transform));
    }
    clock += pause;
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

  test('closing by swipe glides on from where the finger let go, easing out, and the dimmed page keeps pace', async ({ page }) => {
    await opened(page);
    await swipe(page, { dx: -200, pause: 0, gap: 6 });
    await expect.poll(() => isOpen(page)).toBe(false);
    const st = await page.locator('#drawer').evaluate(e => ({ d: parseFloat(e.style.transitionDuration) / (e.style.transitionDuration.endsWith('ms') ? 1000 : 1), f: e.style.transitionTimingFunction, g: e.style.getPropertyValue('--glide') }));
    expect(st.d).toBeGreaterThanOrEqual(.15);                       // never a snap
    expect(st.f).toContain('cubic-bezier(0.2, 0.8, 0.2, 1)');       // decelerating
    expect(st.g).toBe(Math.round(st.d * 1000) + 'ms');              // the scrim takes as long as the drawer
  });

  // From the screen's left edge, a drag to the right pulls the drawer out under the finger.
  const drawerX = page => page.evaluate(() => { const m = /matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)/.exec(getComputedStyle(document.getElementById('drawer')).transform); return m ? +m[1] : 0; });
  test('a drag from the left edge opens the drawer, following the finger', async ({ page }) => {
    await page.goto('/app.html'); await settle(page);
    const before = await entries(page);
    const c = await page.context().newCDPSession(page), send = (type, x) => c.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 400, id: 1 }] });
    await send('touchStart', 4);
    for (const x of [30, 70, 110]) { await send('touchMove', x); await page.waitForTimeout(30); }
    expect(await isOpen(page)).toBe(true);
    const mid = await drawerX(page);                                // part-way out, not jumped to full width
    expect(mid).toBeLessThan(-100); expect(mid).toBeGreaterThan(-320);
    for (const x of [200, 300]) { await send('touchMove', x); await page.waitForTimeout(30); }
    await send('touchEnd');
    await page.waitForTimeout(600);
    expect(await isOpen(page)).toBe(true);
    expect(await drawerX(page)).toBe(0);
    expect(await page.locator('#drawer').evaluate(e => e.style.transform)).toBe('');           // it settles, nothing left behind
    expect(await entries(page)).toBe(before + 1);                    // and Back closes it, as with a tap
    await page.goBack();
    await expect.poll(() => isOpen(page)).toBe(false);
  });

  test('a short pull from the edge goes back; a flick opens; a drag that starts elsewhere does nothing', async ({ page }) => {
    await page.goto('/app.html'); await settle(page);
    const before = await entries(page);
    await swipe(page, { from: 4, dx: 60, pause: 250, gap: 20 });
    await page.waitForTimeout(500);
    expect(await isOpen(page)).toBe(false);
    await expect.poll(() => page.evaluate(() => !!(history.state && history.state.kcDrawer))).toBe(false);   // no stray history entry left
    expect(await page.evaluate(() => location.hash)).toBe('');
    await swipe(page, { from: 120, dx: 150 });                       // not the edge
    await page.waitForTimeout(300);
    expect(await isOpen(page)).toBe(false);
    await swipe(page, { from: 4, dx: 90, steps: 4, gap: 4 });         // quick
    await expect.poll(() => isOpen(page)).toBe(true);
    await page.waitForTimeout(500);
    expect(await drawerX(page)).toBe(0);
    await page.click('#drawerx');
    await expect.poll(() => isOpen(page)).toBe(false);
    await page.click('#menubtn');                                    // a plain tap opening is clean after all that
    await page.waitForTimeout(500);
    expect(await isOpen(page)).toBe(true);
    expect(await page.locator('#drawer').evaluate(e => e.getAttribute('style') || '')).toBe('');
  });
});

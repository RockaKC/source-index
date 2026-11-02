// Daily Scripture Formation: three readings a day in a weekly order that begins on Sunday, following the visitor's own day.
const { execFileSync } = require('child_process');
const path = require('path');
const { test, expect, settle, ROOT } = require('./helpers');

const at = (page, iso) => page.clock.setFixedTime(new Date(iso));          // the visitor's local date and time
const THEMES = ['Renewing the Mind', 'Guarding Attention', 'Self-Control', 'Wisdom and Discernment', 'Courage and Faithfulness',
  'Humility and Correction', 'Love, Obedience, and Sabbath Reflection'];

test('the readings in data/formation.js are what curated.json gives, each checked against the stored text', () => {
  const out = execFileSync('python3', [path.join(ROOT, 'tools', 'formation.py'), '--check'], { cwd: ROOT, encoding: 'utf-8' });
  expect(out).toContain('data/formation.js is current');
});

test('the page shows the visitor\'s own day: its theme, and Morning, Afternoon and Evening with readings, purpose and a reflection', async ({ page }) => {
  await at(page, '2026-11-03T08:00:00');                                     // a Tuesday
  await page.goto('/daily-scripture/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Daily Scripture Formation');
  await expect(page.locator('.fmmotto')).toHaveText('Read. Meditate. Examine. Obey.');
  await expect(page.locator('.fmtheme')).toHaveText('Self-Control');
  await expect(page.locator('.fmwhen')).toContainText('Today');
  await expect(page.locator('[data-fmday][aria-current="date"]')).toHaveAttribute('data-fmday', '2');
  await expect(page.locator('[data-fmday="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.fmcard h3')).toHaveText(['Establish', 'Correct', 'Examine']);
  await expect(page.locator('.fmcard .eyebrow span:first-child')).toHaveText(['Morning', 'Afternoon', 'Evening']);
  for (const card of await page.locator('.fmcard').all()) {
    expect(await card.locator('.fmref').count()).toBeGreaterThan(0);
    await expect(card.locator('.fmwhy')).not.toBeEmpty();
    await expect(card.locator('.fmdo')).toContainText('Reflect and act.');
  }
  const ev = page.locator('.fmcard').nth(2);                                 // Psalm 51 is the Septuagint's Psalm 50, and the page says so
  await expect(ev.locator('.fmref')).toHaveText('Psalm 50');
  await expect(ev).toContainText('Psalm 51 in English Bibles');
  await expect(ev).toContainText('Septuagint');
  await expect(page.locator('.fmcard').first()).toContainText('Berean Literal Bible');
});

test('each day can be opened by hand, in the biblical order, and its readings open the archive\'s own chapters', async ({ page }) => {
  await at(page, '2026-11-03T08:00:00');
  await page.goto('/daily-scripture/'); await settle(page);
  await expect(page.locator('[data-fmday]')).toHaveText(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => new RegExp('^' + d)));
  for (let i = 0; i < 7; i++) {
    await page.locator(`[data-fmday="${i}"]`).click();
    await expect(page.locator('.fmtheme')).toHaveText(THEMES[i]);
    await expect(page.locator(`[data-fmday="${i}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('.fmwhen')).toHaveText('Saturday, the seventh day');
  await page.locator('[data-fmday="4"]').click();
  await expect(page.locator('.fmcard').first().locator('.fmref')).toHaveText('Daniel 3');
  await page.locator('.fmcard').first().locator('.fmref').click(); await settle(page);
  await expect(page.locator('#app h1')).toContainText('Daniel 3');
  expect(new URL(page.url()).pathname).toBe('/bible/daniel/3/');
});

test('Sunday is the first day: a Sunday visitor sees Renewing the Mind, and Saturday is the Sabbath', async ({ page }) => {
  await at(page, '2026-11-08T21:00:00');                                     // a Sunday evening
  await page.goto('/daily-scripture/'); await settle(page);
  await expect(page.locator('.fmtheme')).toHaveText('Renewing the Mind');
  await at(page, '2026-11-07T07:00:00');                                     // a Saturday morning
  await page.goto('/daily-scripture/'); await settle(page);
  await expect(page.locator('.fmtheme')).toHaveText('Love, Obedience, and Sabbath Reflection');
});

test('the front page carries today\'s theme and readings, and opens the page; nothing is counted or kept', async ({ page }) => {
  await at(page, '2026-11-04T12:00:00');                                     // a Wednesday
  await page.goto('/'); await settle(page);
  const card = page.locator('.fmhome');
  await expect(card.locator('h2')).toHaveText('Wisdom and Discernment');
  await expect(card.locator('.fmhlist li b')).toHaveText(['Morning', 'Afternoon', 'Evening']);
  await card.locator('a.btn').click(); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/daily-scripture/');
  await expect(page.locator('#app')).not.toContainText(/streak|score|points|badge/i);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /fm|formation/i.test(k)))).toEqual([]);
});

test('the page fits a phone in light and dark, with no sideways scroll', async ({ page }) => {
  await at(page, '2026-11-05T08:00:00');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/daily-scripture/'); await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test('the app has Daily Scripture Formation too: today on its home screen, and the page at its own #/ address', async ({ page }) => {
  await at(page, '2026-11-05T08:00:00');                                     // a Thursday
  await page.goto('/app.html'); await settle(page);
  await expect(page.locator('.fmhome h2')).toHaveText('Courage and Faithfulness');
  await page.locator('.fmhome a.btn').click(); await settle(page);
  expect(await page.evaluate(() => location.hash)).toBe('#/formation');
  await expect(page.locator('.fmtheme')).toHaveText('Courage and Faithfulness');
  await page.locator('.fmcard').first().locator('.fmref').click(); await settle(page);
  expect(await page.evaluate(() => location.hash)).toBe('#/read/38/3');
  await page.goBack(); await settle(page);
  await page.locator('[data-fmday="2"]').click();
  await page.locator('.fmcard').first().locator('.fmref').first().click(); await settle(page);
  expect(await page.evaluate(() => location.hash)).toBe('#/read/29/25/28');           // a passage opens its whole chapter at its first verse
});

// Back up and restore (js/backup.js): what is saved, what restoring may do, and what it must never do.
const fs = require('fs');
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], ch = D.CC[b1][0];
const key = n => `${b1}:${ch}:${n}`;
const stored = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const put = (page, k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
const backupJson = (over = {}) => JSON.stringify({ app: 'kc-tewahedo-bible', version: 1, saved: '2026-10-12T09:00:00.000Z', marks: {}, history: [], ...over });
const choose = (page, text, name = 'backup.json') => page.setInputFiles('#bk-file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
const msg = page => page.locator('#bk-msg');

test.beforeEach(async ({ page }) => {
  await page.goto('/app.html#/backup');
  await settle(page);
});

test('the page says what is kept, and is in the menu', async ({ page }) => {
  await put(page, 'kc-marks', { [key(1)]: { f: 1, t: 1 }, [key(2)]: { h: 'c1', t: 2 }, [key(3)]: { n: 'x', f: 1, t: 3 } });
  await put(page, 'kc-history', [[b1, ch, 5]]);
  await page.reload();
  await settle(page);
  await expect(page.locator('#bk-counts')).toHaveText('On this phone now: 2 favorites, 1 highlight, 1 note and 1 chapter of history.');
  await page.click('#menubtn');
  await expect(page.locator('#drawer a[href="#/backup"]')).toBeVisible();
});

test('saving in a browser downloads one file with everything in it', async ({ page }) => {
  const marks = { [key(1)]: { f: 1, h: 'c2', n: 'a note', t: 1700000000000 } };
  await put(page, 'kc-marks', marks);
  await put(page, 'kc-history', [[b1, ch, 1700000001000]]);
  await page.reload();
  await settle(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-save')]);
  expect(dl.suggestedFilename()).toMatch(/^kc-tewahedo-bible-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  expect(file).toMatchObject({ app: 'kc-tewahedo-bible', version: 1, marks, history: [[b1, ch, 1700000001000]] });
  await expect(msg(page)).toHaveText('Backup saved to your downloads.');
});

test.describe('on the phone', () => {
  const phone = (fail) => page => page.addInitScript(fail => {
    window.__calls = [];
    window.Capacitor = { isNativePlatform: () => true, Plugins: {
      Filesystem: { writeFile: async o => { window.__calls.push(['write', o]); if (fail === 'fs') throw new Error('no'); return { uri: 'file:///cache/' + o.path }; } },
      Share: { share: async o => { window.__calls.push(['share', o]); } },
    } };
  }, fail);

  test('saving writes a file to the private cache and opens the share sheet', async ({ page }) => {
    await phone()(page);
    await page.reload();
    await settle(page);
    await put(page, 'kc-marks', { [key(1)]: { f: 1, t: 1 } });
    await page.click('#bk-save');
    await expect(msg(page)).toHaveText('Choose where to keep the backup file.');
    const calls = await page.evaluate(() => window.__calls);
    expect(calls[0][0]).toBe('write');
    expect(calls[0][1]).toMatchObject({ directory: 'CACHE', encoding: 'utf8' });
    expect(calls[0][1].path).toMatch(/^kc-tewahedo-bible-backup-.*\.json$/);
    expect(JSON.parse(calls[0][1].data).marks).toEqual({ [key(1)]: { f: 1, t: 1 } });
    expect(calls[1]).toEqual(['share', { title: 'KC Tewahedo Bible backup', files: ['file:///cache/' + calls[0][1].path], dialogTitle: 'Save your backup' }]);
  });

  test('if the file cannot be written, the backup is shared as text, which can be restored', async ({ page }) => {
    await phone('fs')(page);
    await page.reload();
    await settle(page);
    await put(page, 'kc-marks', { [key(2)]: { h: 'c3', t: 9 } });
    await page.click('#bk-save');
    await expect(msg(page)).toHaveText('Shared as text. To restore it, paste it under Restore.');
    const text = (await page.evaluate(() => window.__calls)).find(c => c[0] === 'share')[1].text;
    await put(page, 'kc-marks', {});
    await page.locator('.bkpaste summary').click();
    await page.fill('#bk-text', text);
    await page.click('#bk-check');
    await page.click('#bk-apply');
    expect(await stored(page, 'kc-marks')).toEqual({ [key(2)]: { h: 'c3', t: 9 } });
  });
});

test('restoring from a file shows what it would do, and changes nothing until confirmed', async ({ page }) => {
  await put(page, 'kc-marks', { [key(1)]: { f: 1, t: 100 } });
  const mine = await stored(page, 'kc-marks');
  await choose(page, backupJson({ marks: { [key(2)]: { h: 'c4', t: 200 }, [key(3)]: { n: 'from the backup', t: 300 } }, history: [[b1, ch, 5]] }));
  await expect(page.locator('#bk-preview')).toBeVisible();
  await expect(page.locator('#bk-preview')).toContainText('This backup from 12 October 2026 holds 0 favorites, 1 highlight, 1 note and 1 chapter of history.');
  await expect(page.locator('#bk-preview')).toContainText('adds 2 new verses and updates 0 verses');
  await expect(page.locator('#bk-preview')).toContainText('Nothing on this phone is removed.');
  expect(await stored(page, 'kc-marks'), 'nothing is written before Restore').toEqual(mine);
  await page.click('#bk-cancel');
  await expect(page.locator('#bk-preview')).toBeHidden();
  expect(await stored(page, 'kc-marks')).toEqual(mine);
  await choose(page, backupJson({ marks: { [key(2)]: { h: 'c4', t: 200 }, [key(3)]: { n: 'from the backup', t: 300 } }, history: [[b1, ch, 5]] }));
  await page.click('#bk-apply');
  await expect(msg(page)).toHaveText('Restored: 2 verses and 1 chapter of history.');
  expect(await stored(page, 'kc-marks')).toEqual({ [key(1)]: { f: 1, t: 100 }, [key(2)]: { h: 'c4', t: 200 }, [key(3)]: { n: 'from the backup', t: 300 } });
  expect(await stored(page, 'kc-history')).toEqual([[b1, ch, 5]]);
  await expect(page.locator('#bk-counts')).toHaveText('On this phone now: 1 favorite, 1 highlight, 1 note and 1 chapter of history.');
});

test('for a verse on both, the newer record wins; nothing is ever removed', async ({ page }) => {
  await put(page, 'kc-marks', { [key(1)]: { n: 'mine, newer', t: 2000 }, [key(2)]: { n: 'mine, older', t: 1000 }, [key(9)]: { f: 1, t: 50 } });
  await put(page, 'kc-history', [[b1, ch, 4000]]);
  await choose(page, backupJson({ marks: { [key(1)]: { n: 'theirs, older', t: 1500 }, [key(2)]: { n: 'theirs, newer', t: 1500 } }, history: [[b1, ch, 3000], [b1, D.CC[b1][1], 2000]] }));
  await expect(page.locator('#bk-preview')).toContainText('updates 1 verse');
  await expect(page.locator('#bk-preview')).toContainText('1 verse is already here');
  await page.click('#bk-apply');
  const m = await stored(page, 'kc-marks');
  expect(m[key(1)].n, 'this phone\'s newer note stays').toBe('mine, newer');
  expect(m[key(2)].n, 'the backup\'s newer note replaces the older one').toBe('theirs, newer');
  expect(m[key(9)], 'a verse only on this phone is untouched').toEqual({ f: 1, t: 50 });
  expect(await stored(page, 'kc-history'), 'history: the union, newest time per chapter, newest first').toEqual([[b1, ch, 4000], [b1, D.CC[b1][1], 2000]]);
});

test('restoring the same backup again says it is already here', async ({ page }) => {
  const text = backupJson({ marks: { [key(1)]: { f: 1, t: 10 } } });
  await choose(page, text);
  await page.click('#bk-apply');
  await choose(page, text);
  await expect(msg(page)).toHaveText('Everything in that backup is already on this phone.');
  await expect(page.locator('#bk-preview')).toBeHidden();
});

test('a backup saved here restores here: the round trip keeps every field', async ({ page }) => {
  const marks = { [key(1)]: { f: 1, h: 'u2', n: 'line one\nline two', t: 1700000000123 }, [key(4)]: { h: 'c6', t: 1700000000456 } };
  await put(page, 'kc-marks', marks);
  await put(page, 'kc-history', [[b1, ch, 1700000009999]]);
  await page.reload();
  await settle(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bk-save')]);
  const file = fs.readFileSync(await dl.path());
  await page.evaluate(() => localStorage.clear());               // a new phone
  await page.reload();
  await settle(page);
  await page.setInputFiles('#bk-file', { name: 'saved.json', mimeType: 'application/json', buffer: file });
  await page.click('#bk-apply');
  expect(await stored(page, 'kc-marks')).toEqual(marks);
  expect(await stored(page, 'kc-history')).toEqual([[b1, ch, 1700000009999]]);
  expect(await page.evaluate(() => localStorage.getItem('kc-last'))).toBe(`${b1}/${ch}`);
});

test.describe('what is refused, and what is cleaned', () => {
  const refused = async (page, text, why) => {
    await choose(page, text);
    await expect(msg(page)).toHaveText(why);
    await expect(page.locator('#bk-preview')).toBeHidden();
    expect(await stored(page, 'kc-marks'), 'nothing was written').toBeNull();
  };
  test('not JSON', async ({ page }) => refused(page, 'hello there', 'That could not be read as a backup.'));
  test('another app\'s file', async ({ page }) => refused(page, JSON.stringify({ app: 'other', version: 1, marks: {} }), 'That is not a KC Tewahedo Bible backup.'));
  test('no marks', async ({ page }) => refused(page, JSON.stringify({ app: 'kc-tewahedo-bible', version: 1 }), 'That is not a KC Tewahedo Bible backup.'));
  test('a newer version', async ({ page }) => refused(page, backupJson({ version: 2 }), 'That backup comes from a newer version of the app. Update the app, then try again.'));

  test('entries the app could not have written are skipped; text is cut to size; unknown highlights are dropped', async ({ page }) => {
    await choose(page, backupJson({ marks: {
      [key(1)]: { n: 'y'.repeat(5000), t: 5 },
      [key(2)]: { h: 'rainbow', t: 6 },                          // an unknown highlight: nothing left, so skipped
      [key(3)]: { f: 1, h: 'nonsense', t: 'soon' },              // keeps the favorite; a bad time becomes 0
      '999:1:1': { f: 1, t: 7 },                                 // a book that does not exist
      [`${b1}:9999:1`]: { f: 1, t: 8 },                          // a chapter that does not exist
      '__proto__:1:1': { f: 1, t: 9 },
      'not a key': { f: 1, t: 10 },
    } }));
    await expect(page.locator('#bk-preview')).toContainText('5 entries could not be used and were skipped.');
    await page.click('#bk-apply');
    const m = await stored(page, 'kc-marks');
    expect(Object.keys(m).sort()).toEqual([key(1), key(3)].sort());
    expect(m[key(1)].n.length).toBe(2000);
    expect(m[key(3)]).toEqual({ f: 1, t: 0 });
    expect(await page.evaluate(() => ({}).polluted), 'no prototype pollution').toBeUndefined();
  });
});

test('pasted text can be checked and restored, and a bad paste is refused', async ({ page }) => {
  await page.locator('.bkpaste summary').click();
  await page.fill('#bk-text', 'nonsense');
  await page.click('#bk-check');
  await expect(msg(page)).toHaveText('That could not be read as a backup.');
  await page.fill('#bk-text', backupJson({ marks: { [key(6)]: { f: 1, t: 4 } } }));
  await page.click('#bk-check');
  await page.click('#bk-apply');
  expect(await stored(page, 'kc-marks')).toEqual({ [key(6)]: { f: 1, t: 4 } });
});

test('the website has no backup page', async ({ page }) => {
  await page.goto('/#/backup');
  await settle(page);
  await expect(page.locator('#bk-save')).toHaveCount(0);
  await expect(page.locator('#app h1')).not.toHaveText('Back up and restore');
});

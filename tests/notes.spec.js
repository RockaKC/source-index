// Notes in the app's verse panel (js/marks.js): write, edit, delete, keep on leaving, and the Notes page.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const b1 = D.order[0], ch = D.CC[b1][0], bn = D.books[b1][0];
const verse = n => `#rtext p#v${n}`;
const marks = page => page.evaluate(() => JSON.parse(localStorage.getItem('kc-marks') || '{}'));
const key = n => `${b1}:${ch}:${n}`;
const panelGone = page => page.waitForFunction(() => !(history.state && history.state.kcSheet));

test.beforeEach(async ({ page }) => {
  await page.goto(`/app.html#/read/${b1}/${ch}`);
  await settle(page);
});
const openNote = async (page, n = 3) => { await page.click(verse(n)); await page.click('#sheet [data-act="note"]'); };

test('a note is written in the panel, shown on the verse, and remembered', async ({ page }) => {
  await page.click(verse(3));
  await expect(page.locator('#note-label')).toHaveText('Write a note');
  await page.click('#sheet [data-act="note"]');
  await expect(page.locator('#sheet-note')).toBeVisible();
  await expect(page.locator('#sheet-main')).toBeHidden();
  await expect(page.locator('#note-text')).toBeFocused();
  await expect(page.locator('#note-del'), 'nothing to delete yet').toBeHidden();
  await page.fill('#note-text', '  The light obeys.\nCompare John 1:5.  ');
  await page.click('#sheet [data-act="notedone"]');
  await expect(page.locator('#sheet-msg')).toHaveText('Note saved');
  await expect(page.locator('#sheet-main')).toBeVisible();
  await expect(page.locator('#note-label')).toHaveText('Edit note');
  await expect(page.locator('#note-preview')).toContainText('The light obeys.');
  await expect(page.locator(verse(3))).toHaveClass(/noted/);
  expect((await marks(page))[key(3)].n, 'trimmed, line break kept').toBe('The light obeys.\nCompare John 1:5.');
  await page.keyboard.press('Escape');
  await panelGone(page);
  await page.reload();
  await settle(page);
  await expect(page.locator(verse(3))).toHaveClass(/noted/);
});

test('leaving the note box any way at all keeps what was typed', async ({ page }) => {
  await openNote(page, 1);
  await page.fill('#note-text', 'kept by Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet')).toBeHidden();
  await panelGone(page);
  expect((await marks(page))[key(1)].n).toBe('kept by Escape');
  await openNote(page, 2);
  await page.fill('#note-text', 'kept by the close button');
  await page.click('#sheetx');
  await panelGone(page);
  expect((await marks(page))[key(2)].n).toBe('kept by the close button');
  await openNote(page, 4);
  await page.fill('#note-text', 'kept by Back');
  await page.goBack();
  await expect(page.locator('#sheet')).toBeHidden();
  expect((await marks(page))[key(4)].n).toBe('kept by Back');
  expect(await page.evaluate(() => location.hash)).toBe(`#/read/${b1}/${ch}`);
});

test('editing keeps one note; deleting asks twice; an empty note is no note', async ({ page }) => {
  await openNote(page, 3);
  await page.fill('#note-text', 'first');
  await page.click('#sheet [data-act="notedone"]');
  await page.click('#sheet [data-act="note"]');
  await expect(page.locator('#note-text')).toHaveValue('first');
  await page.fill('#note-text', 'second');
  await page.click('#sheet [data-act="notedone"]');
  expect((await marks(page))[key(3)].n).toBe('second');
  await page.click('#sheet [data-act="note"]');
  await page.click('#note-del');
  await expect(page.locator('#note-del')).toHaveText('Tap again to delete');
  expect((await marks(page))[key(3)].n, 'one tap deletes nothing').toBe('second');
  await page.click('#note-del');
  await expect(page.locator('#sheet-msg')).toHaveText('Note removed');
  await expect(page.locator(verse(3))).not.toHaveClass(/noted/);
  expect(await marks(page)).toEqual({});
  await page.click('#sheet [data-act="note"]');
  await page.fill('#note-text', '   \n  ');
  await page.click('#sheet [data-act="notedone"]');
  expect(await marks(page), 'blank text makes no record').toEqual({});
});

test('a note is limited to 2000 characters', async ({ page }) => {
  await openNote(page, 3);
  await page.fill('#note-text', 'x'.repeat(2500));
  expect(await page.evaluate(() => document.getElementById('note-text').value.length)).toBe(2000);
});

test('a note shares one record with the favorite and the highlight', async ({ page }) => {
  await page.click(verse(5));
  await page.click('#sheet [data-act="fav"]');
  await page.click('#sheet [data-hl="c5"]');
  await page.click('#sheet [data-act="note"]');
  await page.fill('#note-text', 'all three');
  await page.click('#sheet [data-act="notedone"]');
  expect(await marks(page)).toEqual({ [key(5)]: expect.objectContaining({ f: 1, h: 'c5', n: 'all three' }) });
  await page.click('#sheet [data-act="fav"]');                      // taking the favorite off keeps the rest
  expect((await marks(page))[key(5)]).toEqual(expect.objectContaining({ h: 'c5', n: 'all three' }));
});

test('the Notes page lists notes newest first with the verse, shows them as plain text, and opens the verse', async ({ page }) => {
  await openNote(page, 2);
  await page.fill('#note-text', 'older note');
  await page.click('#sheet [data-act="notedone"]');
  await page.keyboard.press('Escape'); await panelGone(page);
  await page.waitForTimeout(20);
  await openNote(page, 5);
  await page.fill('#note-text', '<b>newer</b> & <i>bold</i>');
  await page.click('#sheet [data-act="notedone"]');
  await page.keyboard.press('Escape'); await panelGone(page);
  await page.evaluate(() => { location.hash = '#/notes'; });
  await settle(page);
  await expect(page.locator('#app .mrow .t')).toHaveText([`${bn} ${ch}:5`, `${bn} ${ch}:2`]);
  await expect(page.locator('#app .mrow .np').first()).toHaveText('<b>newer</b> & <i>bold</i>');
  await expect(page.locator('#app .mrow .np b'), 'a note is text, never markup').toHaveCount(0);
  await expect(page.locator('#app .mrow .vp').last()).toContainText('But the earth', { timeout: 5000 });
  await page.click('#app .mrow >> nth=1');
  await settle(page);
  expect(await page.evaluate(() => location.hash)).toBe(`#/read/${b1}/${ch}/2`);
});

// Figures inside essays (js/essays.js figureLinks, js/guide.js viewPerson, tools/knowledge.py): a name links to its profile on its first mention, a profile
// shows the figures it connects to with the basis and the verses behind each, and the reader can go and come back. The essay text is made up for the test.
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();
const ID = Object.keys(D.pieces).find(id => D.PUB.map(String).includes(id) && !D.ET[id]);        // an essay that is not one of the approved three
const ID2 = Object.keys(D.pieces).find(id => D.PUB.map(String).includes(id) && !D.ET[id] && id !== ID);
const BODY = '<p>The opening words, about Enoch and his walk with God.</p><h3>Enoch in a heading</h3>' +
  '<blockquote><p>“Enoch is quoted here, and Noah too.”</p></blockquote>' +
  '<p>Later Enoch appears again, beside Noah and Noe in one sentence.</p><p>Already a link: <a href="https://example.com/x" target="_blank" rel="noopener">Enoch</a>.</p>';
const BODY2 = '<p>Enoch is named here, but nothing connects this essay to him.</p>';
const plain = h => h.replace(/<[^>]+>/g, '');

async function withFigures(page) {
  const patch = `
D.PP.find(x => x.slug === 'enoch').al = ['Enoch']; D.PP.find(x => x.slug === 'enoch').essays.push(${ID});
D.PP.find(x => x.slug === 'noah').al = ['Noah', 'Noe']; D.PP.find(x => x.slug === 'noah').essays.push(${ID});
D.NX = Object.assign({}, D.NX, {
  'person/enoch': [{to: 'person/noah', as: 'ancestor_of', why: 'Enoch fathers Mathusala, Mathusala fathers Lamech, and Lamech fathers Noah.', basis: 'scripture',
    ev: [{l: 'Genesis 5:21', r: [1, 5, 21, 21]}, {l: 'Genesis 5:28-29', r: [1, 5, 28, 29]}]}],
  'person/noah': [{to: 'person/enoch', as: 'descendant_of', why: 'Enoch fathers Mathusala, Mathusala fathers Lamech, and Lamech fathers Noah.', basis: 'scripture',
    ev: [{l: 'Genesis 5:21', r: [1, 5, 21, 21]}, {l: 'Genesis 5:28-29', r: [1, 5, 28, 29]}]}]});
`;
  await page.route('**/data/site.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({response: res, body: (await res.text()).replace(/"ET":\{/, `"ET":{"${ID}":40,"${ID2}":9,`).replace(/,\}/, '}') + patch});
  });
  await page.route(`**/essay-text/${ID}.json`, route => route.fulfill({contentType: 'application/json', body: JSON.stringify({h: BODY})}));
  await page.route(`**/essay-text/${ID2}.json`, route => route.fulfill({contentType: 'application/json', body: JSON.stringify({h: BODY2})}));
}

test('the database side: relationships carry a basis and evidence, proposals stay hidden, names stay unique', () => {
  expect(execFileSync('python3', [path.join(__dirname, 'knowledge_check.py')], {encoding: 'utf8'}).trim()).toBe('OK');
});

test('a connected essay links each figure on its first mention in its own words, and its words are unchanged', async ({ page }) => {
  await withFigures(page);
  await page.goto('/#/essay/' + ID); await settle(page);
  const links = page.locator('.essaytext a.fref');
  await expect(links).toHaveText(['Enoch', 'Noah']);
  const want = await page.evaluate(() => [pathOf('#/person/enoch'), pathOf('#/person/noah')]);
  expect(await links.evaluateAll(a => a.map(x => x.getAttribute('href')))).toEqual(want);
  await expect(page.locator('.essaytext p').first().locator('a.fref')).toHaveText('Enoch');                     // the first mention, in the opening paragraph
  await expect(page.locator('.essaytext blockquote a, .essaytext h3 a')).toHaveCount(0);                         // never in a quotation or a heading
  await expect(page.locator('.essaytext a[href="https://example.com/x"]')).toHaveCount(1);                       // an existing link is left alone
  expect(await page.locator('.essaytext').evaluate(e => e.textContent), 'not one word changes').toBe(plain(BODY));
});

test('an essay that is not connected to the figure is not linked, even when it names him', async ({ page }) => {
  await withFigures(page);
  await page.goto('/#/essay/' + ID2); await settle(page);
  await expect(page.locator('.essaytext')).toContainText('Enoch is named here');
  await expect(page.locator('.essaytext a.fref')).toHaveCount(0);
});

test('from the essay to the profile and on to a related figure, and back again', async ({ page }) => {
  await withFigures(page);
  await page.goto('/#/essay/' + ID); await settle(page);
  await page.locator('.essaytext a.fref').first().click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Enoch');
  await expect(page.locator('#app h2').filter({hasText: 'Connections'})).toBeVisible();
  const row = page.locator('#app .pp li', {hasText: 'Noah'}).first();
  await expect(row.locator('.relas')).toHaveText('Ancestor of');
  await expect(row).toContainText('Enoch fathers Mathusala');
  await expect(row.locator('.cap')).toContainText('Scripture');
  await expect(row.locator('.cap a').first()).toHaveAttribute('href', /^\/bible\/genesis\/5\//);                  // the verse behind it is a link
  await expect(page.locator('#app')).toContainText(D.pieces[ID][0]);                                              // the essay is listed on his page
  await row.locator('a[href*="/names/noah"]').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Noah');
  await expect(page.locator('#app .pp li', {hasText: 'Enoch'}).first().locator('.relas')).toHaveText('Descendant of');   // the same row read from the other side
  await page.goBack(); await settle(page);
  await page.goBack(); await settle(page);
  await expect(page.locator('.essaytext')).toBeVisible();
});

test('a profile with no confirmed connections shows no Connections, and every connection in the real data stands on a basis, evidence and a page that exists', async ({ page }) => {
  await page.goto('/#/person/jeremiah'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Jeremiah');
  await expect(page.locator('#app h2').filter({hasText: 'Connections'})).toHaveCount(0);
  const basis = ['scripture', 'church_tradition', 'ancient_source', 'scholarly_inference', 'editorial'], inverse = {ancestor_of: 'descendant_of', descendant_of: 'ancestor_of', teacher_of: 'student_of', student_of: 'teacher_of', attested_by: 'attests', attests: 'attested_by', associated_with: 'associated_with', contemporary_of: 'contemporary_of', related_manuscript: 'related_manuscript'};
  const exists = key => { const [k, s] = key.split('/'); return (k === 'person' ? D.PP : k === 'church' ? D.EC : D.words).some(x => x.slug === s); };
  for (const [from, rows] of Object.entries(D.NX || {})) for (const r of rows) {
    expect(exists(from) && exists(r.to), `${from} and ${r.to} are pages of the site`).toBe(true);
    expect(basis.includes(r.basis) && r.ev.length && r.why, `${from} -> ${r.to} carries a basis, a reason and evidence`).toBeTruthy();
    expect((D.NX[r.to] || []).some(x => x.to === from && x.as === inverse[r.as]), `${r.to} reads ${from} the other way`).toBe(true);
  }
  expect(D.PP.every(p => !p.rel), 'person connections are in NX, not on the profile').toBe(true);
});

test('a profile with related figures fits a phone in light and dark', async ({ page }) => {
  await withFigures(page);
  await page.setViewportSize({width: 375, height: 800});
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme: scheme});
    await page.goto('/#/person/enoch'); await settle(page);
    await expect(page.locator('#app .pp .relas').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), scheme + ': no sideways scroll').toBe(true);
  }
});

// ---- the real data: Early Church, words, Scripture and essays reached through one another
const plainOf = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const essayText = id => JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'essay-text', id + '.json'), 'utf8')).h;

test('an Early Church page carries the Scripture it is tied to, its connections with their sources, and the essays; and the way back', async ({ page }) => {
  await page.goto('/#/church/tertullian'); await settle(page);
  await expect(page.locator('#app h2')).toHaveText(['In Scripture', 'Connections', 'Featured in Kingdom Code']);
  const groups = page.locator('#app h3.pg');
  await expect(groups).toHaveText(['Genesis 6: the sons of God', 'Jude and Enoch']);
  await expect(page.locator('#app', {has: page.locator('h3.pg')})).toContainText('Enoch possesses a testimony in the Apostle Jude.');
  await expect(page.locator('#app a.chip', {hasText: 'Jude 1:14\u201315'})).toBeVisible();
  const row = page.locator('#app .pp li', {hasText: 'Enoch'}).first();
  await expect(row.locator('.relas')).toHaveText('Attests');
  await expect(row.locator('.cap')).toContainText('Ancient source');
  await expect(row.locator('.cap a', {hasText: D.pieces['181'][0]})).toBeVisible();             // the essay that quotes the source
  await row.locator('a[href*="/names/enoch"]').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Enoch');
  await expect(page.locator('#app .pp li', {hasText: 'Tertullian'}).first().locator('.relas')).toHaveText('Attested by');
  await page.goBack(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Tertullian');
});

test('a word study and an Early Church figure point to each other, with what they rest on', async ({ page }) => {
  await page.goto('/#/word/cush'); await settle(page);
  const row = page.locator('#app .pp li', {hasText: 'Moses the Black'});
  await expect(row.locator('.cap')).toContainText('Kingdom Code');
  await expect(row.locator('.cap a').first()).toHaveAttribute('href', /^\/bible\/zephaniah\/3\//);
  await row.locator('a[href*="moses-the-black"]').click(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Moses the Black');
  await expect(page.locator('#app .pp li', {hasText: 'Cush'}).first()).toBeVisible();
});

test('a Bible page links to the figures and witnesses tied to it, and says nothing about them', async ({ page }) => {
  await page.goto('/#/verse/1/6/2'); await settle(page);
  const figs = page.locator('.figs');
  await expect(figs.locator('a.chip')).toHaveText(['Justin Martyr', 'Irenaeus of Lyons', 'Tertullian']);
  await expect(figs.locator('p')).toHaveText(['Early Christian witnesses']);                         // labels and links only; the reason is on the figure's page
  await figs.locator('a.chip', {hasText: 'Irenaeus'}).click(); await settle(page);
  await expect(page.locator('#app h3.pg')).toHaveText(['Genesis 6: the sons of God']);
  await page.goto('/#/read/1/6'); await settle(page);
  await expect(page.locator('.figs h2')).toHaveText('Figures in this chapter');
  await expect(page.locator('.figs')).toContainText('Noah (verses');
  await expect(page.locator('.figs')).toContainText('Justin Martyr (verses 1\u20134)');
  await page.goto('/#/read/57/11'); await settle(page);
  await expect(page.locator('.figs a.chip')).toHaveText(['Ignatius of Antioch (verse 26)']);
  await page.goto('/#/read/1/1'); await settle(page);
  await expect(page.locator('.figs')).toHaveCount(0);                                                 // nothing tied here, nothing shown
});

test('the three published essays link their figures, Church Fathers included, and not one word of them changes', async ({ page }) => {
  const want = {1349: ['enoch', 'noah'], 181: ['tertullian'], 37: ['sheba', 'jeremiah']};      // in the order they first appear
  for (const id of Object.keys(want)) {
    await page.goto('/#/essay/' + id); await settle(page);
    const links = page.locator('.essaytext a.fref');
    expect(await links.evaluateAll(a => a.map(x => x.dataset.fig)), `figures linked in ${id}`).toEqual(want[id]);
    expect(await page.locator('.essaytext').evaluate(e => e.textContent), `the words of essay ${id}`).toBe(plainOf(essayText(id)));
  }
  await page.goto('/#/essay/181'); await settle(page);
  await expect(page.locator('.essaytext a.fref')).toHaveAttribute('href', '/guides/early-church/tertullian/');
});

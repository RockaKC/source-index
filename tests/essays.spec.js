// Essays read on the website (js/essays.js, tools/essay_text.py): the text exactly as written, references as links, article data, saving, and the rule that nothing
// is published until an essay is approved. The essay text here is made up for the test and served by page.route; no manuscript is in the repository.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, loadData, settle } = require('./helpers');
const { CODE, fakeSupabase } = require('./fake_supabase');

const D = loadData(), ROOT = path.resolve(__dirname, '..');

// an essay that is filed under a subject and cites a verse, a verse with no page of its own in the same chapter, and the page's pieces
function pick() {
  for (const pid of D.PUB) {
    if (!D.LIB || !D.LIB.ess[pid] || D.ET[pid]) continue;                  // not one of the real, approved essays
    for (const b in D.verses) for (const ch in D.verses[b]) for (const v in D.verses[b][ch]) {
      if (!D.verses[b][ch][v].map(String).includes(String(pid)) || !(D.CC[b] || []).includes(+ch)) continue;
      let u = 1; while (D.verses[b][ch][u]) u++;
      const score = {};                                       // the essay the page lists first as related: most shared verses, then the better ranked
      for (const b2 in D.verses) for (const c2 in D.verses[b2]) for (const v2 in D.verses[b2][c2]) {
        const ids = D.verses[b2][c2][v2].map(String); if (!ids.includes(String(pid))) continue;
        ids.forEach(x => { if (x !== String(pid)) score[x] = (score[x] || 0) + 1; });
      }
      const top = Object.keys(score).sort((a, c) => score[c] - score[a] || D.pieces[c][5] - D.pieces[a][5]);
      const free = top.filter(x => !D.ET[x]);
      if (!free.length) continue;
      return {pid: String(pid), b: +b, ch: +ch, v: +v, u, pid2: free[0], rest: free.slice(1, 3)};
    }
  }
  throw new Error('no essay to test with');
}
const X = pick(), WORDS = 61;
const BODY = `<p>The opening words of a made-up essay, written for the test.</p><h3>1. The Union</h3>` +
  `<blockquote><p>“<em>Quoted words</em>.” - <a class="sref" data-ref="${X.b}:${X.ch}:${X.v}" href="#/read/${X.b}/${X.ch}/${X.v}">A cited verse</a></p></blockquote>` +
  `<p>Then <a class="sref" data-ref="${X.b}:${X.ch}:${X.u}-${X.u + 2}" href="#/read/${X.b}/${X.ch}/${X.u}">a passage</a> and a <a href="https://example.com/x" target="_blank" rel="noopener">link out</a>.</p>` +
  `<ul><li>One</li><li>Two</li></ul><hr><p>Last words.</p>`;

const BODY2 = '<p>The second made-up essay, which the first one is related to.</p>';
async function withEssay(page) {                            // two essays are "approved": their word counts are in the data and their files are served
  await page.route('**/data/site.js*', async route => {
    const res = await route.fetch();
    await route.fulfill({response: res, body: (await res.text()).replace(/"ET":\{/, `"ET":{"${X.pid}":${WORDS},"${X.pid2}":9,`).replace(/,\}/, '}')});
  });
  await page.route(`**/essay-text/${X.pid}.json`, route => route.fulfill({contentType: 'application/json', body: JSON.stringify({h: BODY})}));
  await page.route(`**/essay-text/${X.pid2}.json`, route => route.fulfill({contentType: 'application/json', body: JSON.stringify({h: BODY2})}));
}

test('the renderer keeps every word, links only what is safe, and refuses a page that differs', () => {
  const out = execFileSync('python3', [path.join(__dirname, 'essay_check.py')], {encoding: 'utf8'});
  expect(out.trim()).toBe('OK');
});

test('an approved essay opens on the site with its text as written, its references as links, and its article data', async ({ page }) => {
  await withEssay(page);
  await fakeSupabase(page);                                 // accounts on, so Save is there
  await page.goto('/#/essay/' + X.pid); await settle(page);
  await expect(page.locator('#app h1')).toHaveText(D.pieces[X.pid][0]);
  await expect(page.locator('.essaymeta')).toContainText('min read');
  await expect(page.locator('.essaytext p').first()).toHaveText('The opening words of a made-up essay, written for the test.');
  await expect(page.locator('.essaytext h3')).toHaveText('1. The Union');
  await expect(page.locator('.essaytext blockquote em')).toHaveText('Quoted words');
  await expect(page.locator('.essaytext li')).toHaveText(['One', 'Two']);
  await expect(page.locator('.essayfoot')).toContainText('Originally published on');
  await expect(page.locator('.essayfoot a')).toHaveAttribute('href', D.pieces[X.pid][1]);               // the original link is kept
  const hrefs = await page.locator('.essaytext a.sref').evaluateAll(a => a.map(x => x.getAttribute('href')));
  const want = await page.evaluate(x => [pathOf(`#/verse/${x.b}/${x.ch}/${x.v}`), pathOf(`#/read/${x.b}/${x.ch}/${x.u}`)], X);
  expect(hrefs, 'a cited verse has its page; a passage opens its chapter at the first verse').toEqual(want);
  await expect(page.locator('.essaytext a[target=_blank]')).toHaveText('link out');
  // article data
  const meta = await page.evaluate(() => ({
    desc: document.querySelector('meta[name=description]').content, canon: document.querySelector('link[rel=canonical]').href,
    pub: document.querySelector('meta[property="article:published_time"]').content, ld: JSON.parse(document.getElementById('ld').textContent)[0], robots: document.querySelector('meta[name=robots]').content}));
  expect(meta.desc).toBe('The opening words of a made-up essay, written for the test.');
  expect(meta.pub).toBe(D.pieces[X.pid][3]);
  expect(meta.ld).toMatchObject({'@type': 'Article', wordCount: WORDS, datePublished: D.pieces[X.pid][3], isBasedOn: D.pieces[X.pid][1], isAccessibleForFree: true});
  expect(meta.ld.articleSection).toBe(D.LIB.cats.find(c => c.id === D.LIB.ess[X.pid][0]).name);
  expect(meta.ld.citation.length).toBeGreaterThan(0);
  expect(meta.canon).toMatch(new RegExp(`/essays/${X.pid}-[^/]+/$`));
  expect(meta.robots).toMatch(/^index/);
  // the header: a title, then the date and a quiet Save beside it
  await expect(page.locator('.essayhead h1')).toHaveText(D.pieces[X.pid][0]);
  await expect(page.locator('.essayhead .essayline .essaymeta')).toContainText('min read');
  await expect(page.locator('.essayhead .essayline [data-save]')).toHaveClass(/quiet/);
  expect(await page.locator('.essayhead .essayline [data-save]').evaluate(b => b.getBoundingClientRect().height), 'a touch-sized control').toBeGreaterThan(39.5);
  // Sources & Scripture: compact, folded away, everything inside; the related investigations stand apart
  await expect(page.locator('.srcs h2')).toHaveText('Sources & Scripture');
  await expect(page.locator('.srcs details.disc')).toHaveCount(3);
  await expect(page.locator('.srcs details[open]')).toHaveCount(0);
  const cited = page.locator('.srcs details.disc').nth(0);
  await expect(cited.locator('a.chip').first()).toBeHidden();
  await cited.locator('summary').click();
  await expect(cited.locator('a.chip').first()).toBeVisible();
  expect(await cited.locator('a.chip').evaluateAll(a => a.every(x => /^\/bible\//.test(x.getAttribute('href'))))).toBe(true);
  await expect(page.locator('.srcs details.disc').nth(1).locator('summary')).toContainText('The verses');
  await expect(page.locator('.srcs details.disc').nth(2).locator('summary')).toContainText('In the Source Index');
  await expect(page.locator('.srcs .relinv, .srcs [id=relinv-t]')).toHaveCount(0);
  await expect(page.locator('.relinv h2')).toHaveText('Related investigations');
  // a related essay with its text here opens here; any other keeps its Substack address
  const own = page.locator(`.relinv a[data-pid="${X.pid2}"]`);
  await expect(own).toHaveAttribute('href', await page.evaluate(id => pathOf('#/essay/' + id), X.pid2));
  await expect(own).not.toHaveAttribute('target', '_blank');
  for (const id of X.rest) {
    const a = page.locator(`.relinv a[data-pid="${id}"]`);
    if (await a.count()) { await expect(a).toHaveAttribute('href', D.pieces[id][1]); await expect(a).toHaveAttribute('target', '_blank'); }
  }
  // a reference goes where it says
  await page.locator('.essaytext a.sref').first().click();
  await expect(page.locator('#app h1')).toContainText(`${D.books[X.b][0]} ${X.ch}:${X.v}`);
  await page.goBack(); await settle(page);
  await expect(page.locator('.essaytext')).toBeVisible();
});

test('an essay that is not approved has no text on the site, and no article data that says otherwise', async ({ page }) => {
  await page.goto('/#/essay/' + X.pid); await settle(page);
  await expect(page.locator('.essaytext')).toHaveCount(0);
  const ld = await page.evaluate(() => JSON.parse(document.getElementById('ld').textContent)[0]);
  expect(ld.wordCount).toBeUndefined();
  expect(await page.evaluate(() => !!document.querySelector('meta[property="article:published_time"]')), 'the published date is still given').toBe(true);
});

test('an essay read on the site can be saved, and My Library keeps it under Saved Investigations after a refresh', async ({ page }) => {
  await withEssay(page);
  const st = await fakeSupabase(page);
  await page.goto('/become-a-berean/'); await settle(page);
  await page.fill('#acctmail', 'reader@example.com'); await page.click('#acctgo');
  await page.waitForSelector('#acctnum'); await page.fill('#acctnum', CODE);
  await page.waitForURL('**/my-library/'); await page.waitForSelector('.libhead');
  await page.goto('/#/essay/' + X.pid); await settle(page);
  const btn = page.locator(`[data-save="essay|${X.pid}"]`);
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click(); await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => st.saved.map(r => r.item_key)).toEqual([X.pid]);
  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#libsaved .libh')).toHaveText(['Saved Investigations 1']);
  await expect(page.locator('#libsaved')).toContainText(D.pieces[X.pid][0]);
  await page.reload(); await settle(page);
  await expect(page.locator('#libsaved .libitem')).toHaveCount(1);
});

test('the prerendered page of an approved essay holds its whole text, its links and its article data, and the sitemap dates it by when it was published', async () => {
  test.setTimeout(240000);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-essay-'));
  for (const f of fs.readdirSync(ROOT)) {
    if (['node_modules', 'android', 'www', 'test-results', 'playwright-report', '.git', '.github'].includes(f)) continue;
    fs.cpSync(path.join(ROOT, f), path.join(out, f), {recursive: true});
  }
  const file = path.join(out, 'data', 'site.js');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/"ET":\{/, `"ET":{"${X.pid}":${WORDS},`));
  fs.mkdirSync(path.join(out, 'essay-text'), {recursive: true}); fs.writeFileSync(path.join(out, 'essay-text', X.pid + '.json'), JSON.stringify({h: BODY}));
  execFileSync('node', [path.join(ROOT, 'tools', 'prerender.js'), out], {stdio: 'pipe', timeout: 230000});
  const dir = fs.readdirSync(path.join(out, 'essays')).find(d => d.startsWith(X.pid + '-'));
  const html = fs.readFileSync(path.join(out, 'essays', dir, 'index.html'), 'utf8');
  expect(html).toContain('The opening words of a made-up essay, written for the test.');
  expect(html).toContain('Last words.');
  expect(html).toContain('class="sref"');
  expect(html).toContain(`<meta property="article:published_time" content="${D.pieces[X.pid][3]}">`);
  expect(html).toContain('"wordCount":' + WORDS);
  expect(html).toContain(`<link rel="canonical" href="https://kingdomcodearchive.com/essays/${dir}/">`);
  expect(fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8')).toContain(`/essays/${dir}/</loc><lastmod>${D.pieces[X.pid][3].slice(0, 10)}</lastmod>`);
  expect(JSON.parse(fs.readFileSync(path.join(out, 'prerender-report.json'), 'utf8')).problems).toEqual([]);
  fs.rmSync(out, {recursive: true, force: true});
});

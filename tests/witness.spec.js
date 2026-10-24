// The Daily Witness (js/witness.js, tools/witness.py, tools/witness.json, data/witness/): the schedule, what is public, the study page, the archive.
// The committed studies are all drafts, so the tests that need public studies approve them in the page's copy of data/site.js (page.route).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, ROOT, loadData, settle } = require('./helpers');

const D = loadData();
const E = D.W.e;
const study = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'witness', n + '.json'), 'utf8'));
const check = mode => execFileSync('python3', [path.join(ROOT, 'tests', 'witness_check.py'), mode], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const NOV = (d, h = 17) => new Date(Date.UTC(2026, 10, d, h, 0, 0));      // 17:00 UTC is noon in New York: the same calendar date there as in UTC

// Serve data/site.js with the first `upto` studies approved and the schedule starting on `start` (null leaves the committed drafts as they are).
const approve = (page, { upto = 7, start = '2026-11-02' } = {}) => page.route('**/data/site.js*', async route => {
  const res = await route.fetch();
  let body = await res.text();
  body = body.replace('"ws":null', `"ws":${JSON.stringify(start)}`)
    .replace(/("n":(\d+),"slug":"[^"]+","t":"(?:[^"\\]|\\.)*","ref":"(?:[^"\\]|\\.)*","obs":"(?:[^"\\]|\\.)*","th":"[^"]*","st":")draft/g, (m, pre, n) => +n <= upto ? pre + 'approved' : m);
  await route.fulfill({ response: res, body });
});
const at = (page, date) => page.clock.setFixedTime(date);

test('the committed schedule: seven interlocking studies, all drafts, none scheduled, every book of the canon filed', () => {
  expect(E).toHaveLength(7);
  expect(E.map(e => e.st)).toEqual(Array(7).fill('draft'));
  expect(D.W.ws, 'no start date until Boss approves').toBeNull();
  expect(D.W.tz).toBe('America/New_York');
  expect(E.every(e => e.up.every(u => u < e.n))).toBe(true);
  expect(E.slice(1).filter(e => e.up.length).length, 'later studies build on earlier ones').toBeGreaterThanOrEqual(5);
  expect(new Set(E.map(e => e.slug)).size).toBe(7);
  expect(E.some(e => e.xb.includes(16)), 'the Ethiopian canon is among the cross-references (Enoch)').toBe(true);
  for (let i = 1; i < 7; i++) expect(E[i].bk, 'a book is never the passage two days running').not.toBe(E[i - 1].bk);
  for (const e of E) { const f = study(e.n); expect(f.x.length).toBeGreaterThanOrEqual(3); expect(f.inv.length).toBeGreaterThanOrEqual(3); expect(f.ps.length).toBeGreaterThan(0); }
});

test('the exporter: the committed files are the plan\'s, and every kind of unchecked word or broken schedule is refused', () => {
  const out = JSON.parse(check('ok'));
  expect(out.W, 'D.W in data/site.js differs from the plan: run tools/export_site.py').toEqual(D.W);
  expect(Object.keys(out.files).sort()).toEqual(fs.readdirSync(path.join(ROOT, 'data', 'witness')).sort());
  for (const [name, obj] of Object.entries(out.files)) expect(obj, name).toEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'witness', name), 'utf8')));
  expect(fs.readFileSync(path.join(ROOT, 'tools', 'witness_review.md'), 'utf8')).toContain('## 4. The Witness Jude Called');
  for (const [mode, say] of [['stray-quote', 'quotation mark outside'], ['curly-quote', 'quotation mark outside'], ['false-quote', 'is not in the stored text'],
    ['quote-wrong-verse', 'is not in the stored text'], ['missing-verse', 'has no stored text'], ['repeated-verse', 'already the passage of study 1'],
    ['same-book-twice-running', 'two days running'], ['same-book-thrice', 'more than two of the seven'], ['builds-on-future', 'earlier studies'],
    ['bad-essay', 'not one of the listed essays'], ['bad-guide', 'does not exist'], ['bad-status', 'draft or approved'], ['short-observation', 'front-page line'],
    ['bad-zone', 'time zone'], ['bad-start', 'schedule.start'], ['unfiled-book', 'no group lists'], ['gap-in-numbers', 'numbered 1, 2, 3'], ['two-books', 'within one book'],
    ['too-long', 'at most']]) expect(check(mode), mode).toMatch(new RegExp('^REFUSED: witness: .*' + say));
});

test('every quotation in the prose is the stored words of its reference', () => {
  const words = ([b, ch, a, z]) => {
    const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'bible', D.HT[b], b + '.json'), 'utf8'))[ch] || [], out = [];
    for (const [v, t] of rows) if (+v >= a && +v <= z) out.push(t);
    return out.join(' ');
  };
  const norm = s => s.replace(/[\[\]⁺]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').toLowerCase().trim();
  let n = 0;
  for (const e of E) {
    const f = study(e.n);
    const segs = [...f.ctx.flat(), ...f.inv.flat(), ...f.take, ...f.x.flatMap(x => x.w)].filter(s => s.q);
    for (const s of segs) { n++; expect(norm(words(s.r)), `${e.n}: ${s.q}`).toContain(norm(s.q)); }
    for (const x of f.x.filter(x => x.q)) { n++; expect(norm(words(x.r)), `${e.n}: ${x.q}`).toContain(norm(x.q)); }
  }
  expect(n).toBeGreaterThan(60);
});

test('which study is today\'s: one calendar date in one time zone, whatever the reader\'s clock', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const seq = iso => page.evaluate(iso => { D.W.ws = '2026-11-02'; return witSeq(new Date(iso)); }, iso);
  expect(await seq('2026-11-02T04:59:00Z'), 'still 1 November in New York').toBe(0);
  expect(await seq('2026-11-02T05:00:00Z'), 'midnight in New York').toBe(1);
  expect(await seq('2026-11-03T04:59:00Z')).toBe(1);
  expect(await seq('2026-11-03T05:00:00Z')).toBe(2);
  // across the clock changes of two years, every calendar day is exactly one study on
  const bad = await page.evaluate(() => {
    D.W.ws = '2026-11-02'; const out = [];
    for (let k = 0; k < 800; k++) { const s = witSeq(new Date(Date.UTC(2026, 10, 2 + k, 12))); if (s !== k + 1) out.push([k, s]); }
    return out;
  });
  expect(bad).toEqual([]);
  expect(await page.evaluate(() => { D.W.ws = null; return witSeq(); })).toBeNull();
});

test('every reader sees the same study at the same moment, in any time zone', async ({ browser }) => {
  const seen = [];
  for (const timezoneId of ['UTC', 'Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles', 'Africa/Addis_Ababa']) {
    const ctx = await browser.newContext({ timezoneId }), page = await ctx.newPage();
    await approve(page); await page.clock.setFixedTime(NOV(5, 3));      // 03:00 UTC on 5 November: still the 4th in New York
    await page.goto('/'); await settle(page);
    seen.push(await page.locator('.dw .dwt').textContent());
    await ctx.close();
  }
  expect(new Set(seen).size).toBe(1);
  expect(seen[0]).toBe(E[2].t);      // 4 November is the third day from 2 November
});

test('nothing is public while every study is a draft, and a preview switch shows the drafts to one browser', async ({ page }) => {
  await page.goto('/'); await settle(page);
  await expect(page.locator('.dw')).toHaveCount(0);
  await expect(page.locator('#witli')).toHaveCount(0);
  for (const p of ['/witness/', '/witness/1-nothing-stands-on-one-voice/']) { await page.goto(p); await settle(page); await expect(page.locator('#app h1')).toHaveText('Not found'); }
  expect(await page.evaluate(() => seoRoutes().some(r => r.path.startsWith('/witness'))), 'a draft is never in the sitemap').toBe(false);
  await page.goto('/?witness-preview=1'); await settle(page);
  await expect(page.locator('.dw .eyebrow')).toContainText('Preview');
  await expect(page.locator('.dw .eyebrow')).toContainText('draft');
  await expect(page.locator('.dw h2')).toHaveText(E[0].t);
  await page.goto('/witness/'); await settle(page);
  await expect(page.locator('.witrow')).toHaveCount(7);
  await expect(page.locator('#app')).toContainText('no study is approved yet');
  await page.goto('/witness/1-nothing-stands-on-one-voice/'); await settle(page);
  await expect(page.locator('.witdraft')).toContainText('not public yet');
  expect(await page.evaluate(() => seoRoutes().some(r => r.path.startsWith('/witness'))), 'preview does not put drafts in the sitemap').toBe(false);
  await page.goto('/?witness-preview=0'); await settle(page);
  await expect(page.locator('.dw')).toHaveCount(0);
});

test('an approved study appears on its date: the card, the archive, and what comes before and after', async ({ page }) => {
  await approve(page); await at(page, NOV(4));
  await page.goto('/'); await settle(page);
  const card = page.locator('.dw');
  await expect(card.locator('.eyebrow')).toContainText('The Daily Witness');
  await expect(card.locator('.eyebrow')).toContainText('No. 3 · Wed 4 Nov');
  await expect(card.locator('h2')).toHaveText(E[2].t);
  await expect(card.locator('.dwref')).toHaveText(`${E[2].ref} · Berean Literal Bible`);
  await expect(card.locator('.dwobs')).toHaveText(E[2].obs);
  await expect(card.locator('.dwthread')).toHaveText('Part of The Law of Witness');
  await expect(page.locator('#witli a')).toHaveText('The Daily Witness');
  await card.locator('a.btn.primary').click(); await settle(page);
  expect(page.url()).toMatch(/\/witness\/3-noble-enough-to-check-the-apostle\/$/);
  // the archive lists what has come, and not what has not
  await page.goto('/witness/'); await settle(page);
  await expect(page.locator('.witrow')).toHaveCount(3);
  await expect(page.locator('.witrow').nth(2)).toContainText('Wed 4 Nov');
  await expect(page.locator('.witthread h2')).toHaveText('The Law of Witness');
  // a study's neighbours: before is shown, after is not, until its date
  await page.goto('/witness/3-noble-enough-to-check-the-apostle/'); await settle(page);
  await expect(page.locator('.witnav a')).toHaveCount(1);
  await expect(page.locator('.witnav a')).toContainText(E[1].t);
  await expect(page.locator('.witbuilds')).toContainText('No. 1');
  await expect(page.locator('.witbuilds')).toContainText('No. 2');
  // a later approved study can still be opened by its address (it is public, only not yet announced)
  await page.goto('/witness/4-the-witness-jude-called/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText(E[3].t);
  await expect(page.locator('.witnav a')).toHaveCount(1);
});

test('before the start, and after the last study', async ({ page }) => {
  await approve(page); await at(page, NOV(1));
  await page.goto('/'); await settle(page);
  await expect(page.locator('.dw')).toHaveCount(0);
  await page.goto('/witness/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('The Daily Witness');
  await expect(page.locator('.witsoon')).toHaveText('The first study opens on Mon 2 Nov.');
  await expect(page.locator('.witrow')).toHaveCount(0);
  await at(page, NOV(20));
  await page.goto('/'); await settle(page);
  await expect(page.locator('.dw .eyebrow')).toContainText('Latest · No. 7');
  await expect(page.locator('.dw h2')).toHaveText(E[6].t);
  await expect(page.locator('.dw a.btn.primary')).toHaveText('Read the study');
  await page.goto('/witness/'); await settle(page);
  await expect(page.locator('.witrow')).toHaveCount(7);
});

test('only approved studies are public: a gap in approval leaves the latest approved study on the card', async ({ page }) => {
  await approve(page, { upto: 3 }); await at(page, NOV(6));
  await page.goto('/'); await settle(page);
  await expect(page.locator('.dw .eyebrow')).toContainText('Latest · No. 3');
  await page.goto('/witness/4-the-witness-jude-called/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  await page.goto('/witness/'); await settle(page);
  await expect(page.locator('.witrow')).toHaveCount(3);
});

test('a page left open past the schedule\'s midnight shows the next study', async ({ page }) => {
  await approve(page); await at(page, new Date(Date.UTC(2026, 10, 4, 4, 59)));      // 23:59 in New York on 3 November: study 2
  await page.goto('/'); await settle(page);
  await expect(page.locator('.dw h2')).toHaveText(E[1].t);
  await at(page, new Date(Date.UTC(2026, 10, 4, 5, 1)));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.dw h2')).toHaveText(E[2].t);
});

test('a study: passage and translation, context, investigation, cross-references with reasons, links to read and explore', async ({ page }) => {
  await approve(page); await at(page, NOV(8));
  await page.goto('/witness/4-the-witness-jude-called/'); await settle(page);
  const f = study(4);
  await expect(page.locator('#app h1')).toHaveText(E[3].t);
  await expect(page.locator('.witrefline')).toHaveText('Jude 1:14–15 · Berean Literal Bible');
  await expect(page.locator('.wit .lede')).toHaveText(E[3].obs);
  expect(await page.locator('.wit h2').allTextContents()).toEqual(['The passage', 'Where this sits', 'The investigation', 'Cross-references', 'Read further',
    'Cited in Kingdom Code essays', 'Related Kingdom Code investigations', 'In this sequence']);
  await expect(page.locator('.witpass')).toContainText('Enoch, the seventh from Adam');            // the stored text, read from the archive's own book file
  await expect(page.locator('.witpass figcaption')).toContainText('Berean Literal Bible');
  await expect(page.locator('.witplace')).toHaveText('Jude · chapter 1 of 1 · Berean Literal Bible');
  await expect(page.locator('.wittext .wq').first()).toBeVisible();
  await expect(page.locator('.witx li')).toHaveCount(f.x.length);
  for (const [i, x] of f.x.entries()) {
    await expect(page.locator('.witx li').nth(i).locator('p')).not.toBeEmpty();
    if (x.q) await expect(page.locator('.witx li').nth(i).locator('q')).toHaveText(x.q);
  }
  await expect(page.locator('.wittake')).toContainText('Jude introduces words found in 1 Enoch');
  await expect(page.locator('.wit .act a.btn.primary')).toHaveAttribute('href', /\/bible\/jude\/1\/\?v=14$/);
  const essays = await page.locator('.wit .cited .piece .t a, .wit section[aria-labelledby="wit-rel"] .piece .t a').allTextContents();
  expect(new Set(essays).size, 'no essay listed twice').toBe(essays.length);
  await expect(page.locator('.wit section[aria-labelledby="wit-rel"]')).toContainText('Enoch');
  await page.locator('.witx li a').first().click(); await settle(page);
  expect(page.url()).toMatch(/\/bible\/enoch\/1\/9\/$/);
});

test('a passage in two stretches shows both, and its label says so', async ({ page }) => {
  await approve(page);
  await page.goto('/witness/5-a-courtroom-with-five-witnesses/'); await settle(page);
  await expect(page.locator('.witrefline')).toHaveText('John 5:31–40, 45–47 · Berean Literal Bible');
  await expect(page.locator('.witpass')).toHaveCount(2);
  await expect(page.locator('.witpass').first()).toContainText('If I testify concerning Myself');
  await expect(page.locator('.witpass').nth(1)).toContainText('Moses');
});

test('the studies have clean addresses, appear in the sitemap only when approved, and are described for search', async ({ page }) => {
  await approve(page);
  await page.goto('/'); await settle(page);
  const g = await page.evaluate(() => ({ p: pathOf('#/witness/3'), h: hashOf('/witness/3-noble-enough-to-check-the-apostle/', ''), a: pathOf('#/witness'), routes: seoRoutes().map(r => r.path).filter(p => p.startsWith('/witness')) }));
  expect(g.p).toBe('/witness/3-noble-enough-to-check-the-apostle/');
  expect(g.h).toBe('#/witness/3');
  expect(g.a).toBe('/witness/');
  expect(g.routes).toHaveLength(8);
  await page.goto('/witness/3-noble-enough-to-check-the-apostle/'); await settle(page);
  expect(await page.evaluate(() => document.querySelector('link[rel="canonical"]').href)).toBe('https://kingdomcodearchive.com/witness/3-noble-enough-to-check-the-apostle/');
  expect(await page.evaluate(() => document.querySelector('meta[name="description"]').content.length)).toBeGreaterThan(60);
  expect(await page.title()).toContain(E[2].t);
});

test('the archive shows which books of the canon the studies have covered', async ({ page }) => {
  await approve(page); await at(page, NOV(20));
  await page.goto('/witness/'); await settle(page);
  const cov = page.locator('.witcov');
  await expect(cov).toContainText('6 of the 73 books with text');
  await expect(cov.locator('.chip.cv.t')).toHaveCount(6);                 // Deuteronomy, John, Acts, Jude, Revelation, Galatians
  await expect(cov.locator('.chip.cv.t', { hasText: 'Galatians' })).toHaveCount(1);
  await expect(cov.locator('.chip.cv.x', { hasText: 'Enoch' })).toHaveCount(1);       // cross-referenced, not yet studied
  await expect(cov).toContainText('no stored text yet');
  await expect(cov.locator('h3')).toHaveCount(8);
});

test('the app has no Daily Witness, and the card and a study fit a phone in both themes', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  await expect(page.locator('.dw')).toHaveCount(0);
  await page.goto('/app.html#/witness'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  await approve(page); await at(page, NOV(8));
  await page.setViewportSize({ width: 360, height: 740 });
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => { try { localStorage.setItem('kc-theme', t); } catch (e) {} }, theme);
    for (const p of ['/', '/witness/', '/witness/5-a-courtroom-with-five-witnesses/', '/witness/6-babylons-appetite-for-witnesses/']) {
      await page.goto(p); await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${p} ${theme}`).toBe(true);
    }
  }
});

test('the prerendered site writes every approved study as a real page and lists it in the sitemap', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-wit-')), out = path.join(root, 'site');
  fs.mkdirSync(out);
  for (const f of fs.readdirSync(ROOT)) {
    if (['node_modules', 'android', 'www', 'test-results', 'playwright-report', '.git', '.github'].includes(f)) continue;
    fs.cpSync(path.join(ROOT, f), path.join(out, f), { recursive: true });
  }
  const file = path.join(out, 'data', 'site.js');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"ws":null', '"ws":"2026-11-02"').replace(/"st":"draft"/g, '"st":"approved"'));
  execFileSync('node', [path.join(ROOT, 'tools', 'prerender.js'), out], { stdio: 'pipe', timeout: 240000 });
  const read = f => fs.readFileSync(path.join(out, f), 'utf8');
  const page = read('witness/4-the-witness-jude-called/index.html');
  expect(page).toContain('<link rel="canonical" href="https://kingdomcodearchive.com/witness/4-the-witness-jude-called/">');
  expect(page).toContain('Enoch, the seventh from Adam');
  expect(page).toContain('The investigation');
  expect(read('witness/index.html')).toContain('The Daily Witness');
  const map = read('sitemap.xml');
  expect(map).toContain('<loc>https://kingdomcodearchive.com/witness/</loc>');
  for (const e of E) expect(map).toContain(`<loc>https://kingdomcodearchive.com/witness/${e.n}-${e.slug}/</loc>`);
  expect(JSON.parse(read('prerender-report.json')).problems).toEqual([]);
  fs.rmSync(root, { recursive: true, force: true });
});

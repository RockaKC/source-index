// The website's clean addresses and the search layer (js/urls.js, js/seo.js, tools/prerender.js). The app keeps '#/…'.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();

test('every indexable page has a clean address that maps back to the same page', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const bad = await page.evaluate(() => seoRoutes().filter(r => {
    const back = hashOf(r.path, '');
    return back !== r.hash;
  }).map(r => r.hash));
  expect(bad, 'addresses that do not map back').toEqual([]);
  const all = await page.evaluate(() => seoRoutes().map(r => r.path));
  expect(new Set(all).size, 'two pages share an address').toBe(all.length);
  expect(all.length).toBeGreaterThan(2000);
});

test('addresses read well', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const got = await page.evaluate(() => [pathOf('#/verse/1/3/16'), pathOf('#/read/1/1'), pathOf('#/range/1/3/15/17'), pathOf('#/book/9'), pathOf('#/guides/the-ungovernable-mind'), pathOf('#/words'), pathOf('#/backup')]);
  expect(got[0]).toMatch(/^\/bible\/genesis\/3\/16\/$/);
  expect(got[1]).toBe('/bible/genesis/1/');
  expect(got[2]).toBe('/bible/genesis/3/15-17/');
  expect(got[3]).toBe('/bible/1-samuel-and-2-samuel/');
  expect(got[4]).toBe('/guides/kingdom-code/the-ungovernable-mind/');
  expect(got[5]).toBe('/words/');
  expect(got[6], 'a page with no clean address stays #/…').toBeNull();
});

test('a clean address opens its page directly, and an old #/ address is tidied to it', async ({ page }) => {
  await page.goto('/bible/genesis/1/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Genesis 1');
  await page.goto('/#/words'); await settle(page);
  await expect(page.locator('#app h1')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/words/');
  expect(new URL(page.url()).hash).toBe('');
  await page.goto('/#/read/1/2'); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/bible/genesis/2/');
});

test('links move between pages without a page load, and Back and Forward follow', async ({ page }) => {
  await page.goto('/bible/genesis/1/'); await settle(page);
  await page.evaluate(() => { window.__same = true; });
  await page.locator('#app a[href="/bible/genesis/2/"]').first().click(); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/bible/genesis/2/');
  expect(await page.evaluate(() => window.__same), 'the page was reloaded').toBe(true);
  await page.goBack(); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/bible/genesis/1/');
  await expect(page.locator('#app h1')).toHaveText('Genesis 1');
  await page.goForward(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Genesis 2');
});

test('each page names itself: title, description, canonical address, share card and structured data', async ({ page }) => {
  const meta = () => page.evaluate(() => ({
    title: document.title,
    desc: document.querySelector('meta[name="description"]').content,
    canon: document.querySelector('link[rel="canonical"]').href,
    robots: document.querySelector('meta[name="robots"]').content,
    ogImage: document.querySelector('meta[property="og:image"]').content,
    ld: JSON.parse(document.getElementById('ld').textContent),
  }));
  await page.goto('/bible/genesis/1/'); await settle(page);
  let m = await meta();
  expect(m.title).toBe('Genesis 1 | Kingdom Code Source Index');
  expect(m.canon).toBe('https://kingdomcodearchive.com/bible/genesis/1/');
  expect(m.desc.length).toBeGreaterThan(60); expect(m.desc.length).toBeLessThanOrEqual(160);
  expect(m.robots).toMatch(/^index/);
  expect(m.ld.map(x => x['@type'])).toContain('BreadcrumbList');
  await page.goto('/guides/kingdom-code/the-ungovernable-mind/'); await settle(page);
  m = await meta();
  expect(m.ld.map(x => x['@type'])).toContain('Book');
  expect(m.ogImage).toContain('/img/guides/the-ungovernable-mind.webp');
  await page.goto('/'); await settle(page);
  m = await meta();
  expect(m.title).toMatch(/^Kingdom Code Source Index/);
  expect(m.ld[0]['@type']).toBe('WebSite');
  expect(m.ld[0].potentialAction['@type']).toBe('SearchAction');
  await page.goto('/search/anything/'); await settle(page);
  expect((await meta()).robots).toMatch(/^noindex/);
  await page.goto('/no/such/page/'); await settle(page);
  expect((await meta()).robots).toMatch(/^noindex/);
});

test('an essay\'s Sources page is found by its number, whatever the words after it', async ({ page }) => {
  const pid = await (async () => { await page.goto('/'); return page.evaluate(() => essayIds()[0]); })();
  await page.goto(`/essays/${pid}-an-older-title/`); await settle(page);
  await expect(page.locator('#app h1')).not.toHaveText('Not found');
  expect(await page.evaluate(() => document.querySelector('link[rel="canonical"]').href)).toMatch(new RegExp(`/essays/${pid}-`));
});

test('the app keeps #/ addresses', async ({ page }) => {
  await page.goto('/app.html#/about'); await settle(page);
  expect(new URL(page.url()).pathname).toBe('/app.html');
  expect(await page.evaluate(() => curHash())).toBe('#/about');
});

test('the prerendered site: real files at clean addresses, a sitemap, robots.txt and llms.txt', async () => {
  test.setTimeout(240000);
  const root = path.resolve(__dirname, '..'), out = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-site-'));
  for (const f of fs.readdirSync(root)) {
    if (['node_modules', 'android', 'www', 'test-results', 'playwright-report', '.git', '.github'].includes(f)) continue;
    fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
  }
  execFileSync('node', [path.join(root, 'tools', 'prerender.js'), out], { stdio: 'pipe', timeout: 200000 });
  const read = f => fs.readFileSync(path.join(out, f), 'utf8');
  const chapter = read('bible/genesis/1/index.html');
  expect(chapter, 'the chapter text is in the file itself').toContain('In the beginning');
  expect(chapter).toContain('<link rel="canonical" href="https://kingdomcodearchive.com/bible/genesis/1/">');
  expect(chapter).toContain('application/ld+json');
  expect(chapter).toContain('<base href="/">');
  expect(read('index.html')).toMatch(/<h1[ >]/);
  const map = read('sitemap.xml'), urls = map.match(/<loc>/g).length;
  expect(urls).toBeGreaterThan(2000);
  expect(map).toContain('<loc>https://kingdomcodearchive.com/bible/genesis/1/</loc>');
  const robots = read('robots.txt');
  expect(robots).toContain('Sitemap: https://kingdomcodearchive.com/sitemap.xml');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) expect(robots).toContain('User-agent: ' + bot);
  expect(read('llms.txt')).toMatch(/^# Kingdom Code Source Index/);
  expect(read('llms.txt')).toContain('/guides/kingdom-code/the-ungovernable-mind/');
  expect(read('404.html')).toContain('noindex');
  const essay = D.PUB && D.PUB.length ? fs.readdirSync(path.join(out, 'essays')).find(d => /^\d+-/.test(d)) : null;
  expect(essay, 'essay pages are written').toBeTruthy();
  expect(JSON.parse(read('prerender-report.json')).problems).toEqual([]);

  // every link between pages leads to a file that was saved (a crawler never meets a 404 from inside the site)
  const exists = h => { const f = path.join(out, h.replace(/^\//, '')); return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html'))); };
  const loose = [];
  for (const m of map.matchAll(/<loc>https:\/\/kingdomcodearchive\.com([^<]*)<\/loc>/g)) {
    const html = read(m[1].replace(/^\//, '') + 'index.html'), body = html.slice(html.indexOf('<main id="app"'));
    for (const a of body.matchAll(/<a [^>]*href="(\/[^"#?]*)/g)) if (!exists(a[1])) loose.push(m[1] + ' -> ' + a[1]);
  }
  expect(loose.slice(0, 10), `${loose.length} links lead to an address with no saved page`).toEqual([]);

  // the sitemap says a page changed only when the data knows it did: never the day of the build
  const today = new Date().toISOString().slice(0, 10);
  expect(map).not.toContain(`<lastmod>${today}</lastmod>`);
  expect(map).toContain('<loc>https://kingdomcodearchive.com/bible/genesis/1/</loc><priority>');
  for (const m of map.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const id = Object.keys(D.pieces)[0], when = D.pieces[id][3].slice(0, 10);
  expect(map).toMatch(new RegExp(`<loc>https://kingdomcodearchive\\.com/essays/${id}-[^<]*</loc><lastmod>${when}</lastmod>`));
  fs.rmSync(out, { recursive: true, force: true });
});

test('a link to Scripture goes to a saved page: a cited verse, otherwise its chapter at that verse', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const r = await page.evaluate(() => {
    let cited = null, plain = null;
    for (const b in D.verses) for (const ch in D.verses[b]) for (const v of Object.keys(D.verses[b][ch])) {
      if (!cited) cited = [+b, +ch, +v];
      if (!plain && hasChapter(+b, +ch) && !hasVerse(+b, +ch, +v + 1) && verseText(+b, +ch, +v + 1)) plain = [+b, +ch, +v + 1];
    }
    return {cited, plain, a: scriptureHash(cited), b: scriptureHash(plain), c: scriptureHash([plain[0], plain[1], plain[2], plain[2] + 2]), d: scriptureHash([cited[0], cited[1], cited[2], cited[2]])};
  });
  expect(r.a).toBe(`#/verse/${r.cited.join('/')}`);
  expect(r.b).toBe(`#/read/${r.plain.join('/')}`);
  expect(r.c, 'a passage has no saved page of its own').toBe(`#/read/${r.plain.join('/')}`);
  expect(r.d).toBe(r.a);
});

test('the verse page, the names and the word studies never link to a page that is not saved', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const bad = await page.evaluate(async () => {
    const out = [], check = (where, href) => { const h = hashOf(href.split('?')[0]), q = href.includes('?v=') ? href : '';
      const p = h.replace(/^#\/?/, '').split('/');
      if (p[0] === 'range') out.push(where + ' ' + href);
      else if (p[0] === 'verse' && !hasVerse(+p[1], +p[2], +p[3])) out.push(where + ' ' + href); };
    const pages = [];
    for (const b in D.verses) for (const ch in D.verses[b]) for (const v in D.verses[b][ch]) { pages.push(`#/verse/${b}/${ch}/${v}`); if (pages.length > 60) break; }
    D.PP.forEach(x => pages.push('#/person/' + x.slug)); D.words.forEach(w => pages.push('#/word/' + w.slug));
    for (const h of pages) {
      history.pushState({}, '', pathOf(h)); route();
      for (let i = 0; i < 60 && document.getElementById('loadmsg'); i++) await new Promise(ok => setTimeout(ok, 50));
      document.querySelectorAll('#app a[href^="/bible/"]').forEach(a => check(h, a.getAttribute('href')));
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('the app keeps its verse and passage pages for every link', async ({ page }) => {
  await page.goto('/app.html'); await settle(page);
  const r = await page.evaluate(() => [scriptureHash([1, 1, 2]), scriptureHash([1, 1, 2, 4])]);
  expect(r).toEqual(['#/verse/1/1/2', '#/range/1/1/2/4']);
});

test('the essay call-to-action link names the essay it came from, and the page still opens with it', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const [pid, url] = await page.evaluate(() => { const id = essayIds()[0]; return [id, ctaFor(id).text]; });
  expect(url).toContain(`https://kingdomcodearchive.com/essays/${pid}-`);
  expect(url).toContain(`?utm_source=substack&utm_campaign=essay-${pid}`);
  const path = url.slice(url.indexOf('/essays/')).replace(/[\s.]+$/, '');
  await page.goto(path); await settle(page);
  await expect(page.locator('#app h1')).not.toHaveText('Not found');
  expect(await page.evaluate(() => document.querySelector('link[rel="canonical"]').href), 'the canonical address carries no tracking').not.toContain('utm_');
});

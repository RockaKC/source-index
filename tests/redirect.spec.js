// The redirect site for the old address (tools/redirect_site.js): every old address opens the same page on the new one.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawnSync } = require('child_process');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
const NEW = 'https://kingdomcodearchive.com';
const OLD = 'https://sources.kingdomcodearchive.com';

let site, out, server, base;

test.beforeAll(async () => {
  site = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-site-'));
  out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kc-redirect-')), 'out');
  const locs = ['/', '/bible/genesis/1/', '/bible/genesis/3/16/', '/essays/322-on-fasting/'];
  fs.writeFileSync(path.join(site, 'sitemap.xml'), '<urlset>' + locs.map(p => `<url><loc>${NEW}${p}</loc></url>`).join('') + '</urlset>');
  execFileSync('node', [path.join(root, 'tools', 'redirect_site.js'), site, out], { stdio: 'pipe' });
  // Serve it the way GitHub Pages does: a folder's index.html at its address, 404.html (status 404) for anything else.
  server = http.createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0]);
    if (url.endsWith('/')) url += 'index.html';
    const file = path.join(out, url);
    if (file.startsWith(out) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(file));
    } else { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(out, '404.html'))); }
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(() => { server.close(); for (const d of [site, path.dirname(out)]) fs.rmSync(d, { recursive: true, force: true }); });

test('each old page is a real file with the new address as canonical, and the support files are written', () => {
  const read = f => fs.readFileSync(path.join(out, f), 'utf8');
  const page = read('bible/genesis/3/16/index.html');
  expect(page).toContain(`<link rel="canonical" href="${NEW}/bible/genesis/3/16/">`);
  expect(page).toContain(`<meta http-equiv="refresh" content="0; url=${NEW}/bible/genesis/3/16/">`);
  expect(page).not.toContain('noindex');
  expect(read('index.html')).toContain(`<link rel="canonical" href="${NEW}/">`);
  expect(read('404.html')).toContain('noindex');
  expect(read('CNAME').trim()).toBe('sources.kingdomcodearchive.com');
  expect(read('robots.txt')).toContain(`Sitemap: ${OLD}/sitemap.xml`);
  const map = read('sitemap.xml');
  expect(map).toContain(`<loc>${OLD}/essays/322-on-fasting/</loc>`);
  expect(map).not.toContain(NEW);
  expect(read('sw.js')).toContain('unregister');
});

test('it refuses to run before the site has moved', () => {
  const r = spawnSync('node', [path.join(root, 'tools', 'redirect_site.js'), site, path.join(os.tmpdir(), 'kc-never'), '--old', NEW], { encoding: 'utf8' });
  expect(r.status).not.toBe(0);
  expect(r.stderr).toContain('still names the old address');
});

for (const [from, to] of [
  ['/bible/genesis/3/16/', '/bible/genesis/3/16/'],
  ['/bible/genesis/1/?v=3#top', '/bible/genesis/1/?v=3#top'],
  ['/#/verse/1/3/16', '/#/verse/1/3/16'],
  ['/essays/9999-an-essay-written-after-the-move/', '/essays/9999-an-essay-written-after-the-move/'],
]) {
  test(`${from} opens ${to} on the new address`, async ({ page }) => {
    await page.route(NEW + '/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>moved</title>' }));
    await page.goto(base + from, { waitUntil: 'commit' }).catch(() => {});
    await page.waitForURL(u => u.href.startsWith(NEW), { timeout: 10000 });
    expect(page.url()).toBe(NEW + to);
  });
}

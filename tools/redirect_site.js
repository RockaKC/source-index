#!/usr/bin/env node
// Writes the small site that keeps the old address (sources.kingdomcodearchive.com) working after the move to kingdomcodearchive.com.
//
//   node tools/redirect_site.js SITE_DIR OUT_DIR [--old https://sources.kingdomcodearchive.com]
//
// SITE_DIR is the assembled, prerendered website (the folder tools/prerender.js wrote; it holds sitemap.xml). OUT_DIR is a new folder: publish
// it from a second GitHub Pages repository whose custom domain is the old address. GitHub Pages serves one custom domain per site and
// cannot send a 301, so each old page gets a real file at its old address (status 200) that names the new address as canonical, redirects
// at once (meta refresh, and a script that also carries ?query and #fragment), and says where the page went. An address that was not in the
// sitemap is caught by 404.html, which redirects the same way. Old '#/…' addresses land on the home page, whose script passes the
// fragment on. sw.js removes the service worker the old site installed in readers' browsers. sitemap.xml lists the old addresses so search
// engines find the redirects quickly.
// Run it once, at the move, from the same build that goes live on the new address; the redirect site never changes after that.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = args.indexOf('--old');
const OLD = (flag >= 0 ? args.splice(flag, 2)[1] : 'https://sources.kingdomcodearchive.com').replace(/\/+$/, '');
const [siteDir, outDir] = args.map(a => a && path.resolve(a));
if (!siteDir || !outDir || !fs.existsSync(path.join(siteDir, 'sitemap.xml'))) {
  console.error('usage: node tools/redirect_site.js SITE_DIR OUT_DIR   (SITE_DIR holds sitemap.xml, from tools/prerender.js)'); process.exit(2);
}
if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) { console.error('OUT_DIR must be new or empty: ' + outDir); process.exit(2); }

const profile = fs.readFileSync(path.join(__dirname, '..', 'profiles', 'site.js'), 'utf8');
const NEW = ((profile.match(/origin:\s*'(https:\/\/[^']+)'/) || [])[1] || '').replace(/\/+$/, '');
if (!NEW) { console.error('profiles/site.js has no origin'); process.exit(2); }
if (NEW === OLD) { console.error('profiles/site.js still names the old address (' + OLD + '). Move the site first, then build this.'); process.exit(2); }

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const js = s => JSON.stringify(s).replace(/</g, '\\u003c');
const note = p => `<p>The Kingdom Code Source Index has moved to <a href="${esc(p)}">${esc(NEW.replace('https://', ''))}</a>.</p>`;
const FRAME = (head, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kingdom Code has moved</title>
${head}
</head>
<body style="font:16px/1.5 system-ui,sans-serif;background:#0d1511;color:#e8efe9;margin:2rem">
${body}
</body>
</html>
`;

const paths = [...fs.readFileSync(path.join(siteDir, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => new URL(m[1].replace(/&amp;/g, '&')).pathname)
  .filter(p => p.startsWith('/') && !p.split('/').includes('..'));
if (!paths.length) { console.error('sitemap.xml lists no pages'); process.exit(1); }

const write = (rel, text) => { const f = path.join(outDir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

for (const p of paths) {
  const to = NEW + p;
  write(path.join(p.replace(/^\//, ''), 'index.html'), FRAME(
    `<link rel="canonical" href="${esc(to)}">\n<script>location.replace(${js(to)} + location.search + location.hash)</script>\n<meta http-equiv="refresh" content="0; url=${esc(to)}">`,
    note(to)));
}

write('404.html', FRAME(
  `<meta name="robots" content="noindex">\n<script>location.replace(${js(NEW)} + location.pathname + location.search + location.hash)</script>`,
  note(NEW + '/')));

write('sw.js', `// The old site installed a service worker on this address. This one replaces it, clears what it saved, and removes itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(clients => clients.forEach(c => c.navigate(c.url).catch(() => {})))
    .catch(() => {})));
`);

const today = new Date().toISOString().slice(0, 10);
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  paths.map(p => `<url><loc>${esc(OLD + p)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${OLD}/sitemap.xml\n`);
write('CNAME', OLD.replace('https://', '') + '\n');

console.log('wrote %d redirect pages for %s to %s (+ 404.html, sw.js, sitemap.xml, robots.txt, CNAME)', paths.length, OLD, NEW);

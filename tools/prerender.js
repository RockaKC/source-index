#!/usr/bin/env node
// Saves every page of the website as a real file at its clean address, and writes the files search engines and AI assistants look for.
//
//   node tools/prerender.js SITE_DIR
//
// SITE_DIR is the assembled website (the repository's files, as tools/../.github/workflows/pages.yml copies them). A browser opens the
// site once; for each address in seoRoutes() (js/seo.js) it draws the page with the site's own code and saves the result as
// SITE_DIR/<address>/index.html: the page's text, links, title, description, canonical address, share card and structured data are in
// the file itself, so a crawler that never runs a script sees the finished page. The script still starts and takes over.
// Also written: sitemap.xml, robots.txt, llms.txt, llms-full.txt and 404.html. Nothing here is committed; it runs on every deploy.
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { start } = require('../tests/serve');

const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot',
  'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Amazonbot', 'cohere-ai', 'MistralAI-User', 'DuckAssistBot'];

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const dir = path.resolve(process.argv[2] || '');
  if (!process.argv[2] || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('usage: node tools/prerender.js SITE_DIR (a folder holding index.html)'); process.exit(2); }
  const template = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  if (!template.includes('<main id="app"></main>')) throw new Error('index.html has no empty <main id="app"></main> to fill');
  const htmlOpen = template.match(/<html[^>]*>/)[0];

  const server = await start(0, dir);
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1000, height: 800 } })).newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('page error: ' + e.message));
  await page.goto(origin + '/');
  await page.waitForFunction(() => typeof seoRoutes === 'function' && document.querySelector('#app h1'));

  const site = await page.evaluate(() => ({ origin: SITE_ORIGIN, name: PROFILE.name, desc: SEO_DESC }));
  const routes = await page.evaluate(() => seoRoutes());
  console.log('prerendering %d pages', routes.length);

  const seen = { title: new Map(), desc: new Map() }, done = [];
  for (const r of routes) {
    const out = await page.evaluate(async path => {
      history.pushState({}, '', path);
      route();
      for (let i = 0; i < 100 && document.getElementById('loadmsg'); i++) await new Promise(ok => setTimeout(ok, 50));
      const get = sel => { const e = document.head.querySelector(sel); return e ? e.outerHTML : ''; };
      return {
        loading: !!document.getElementById('loadmsg'),
        h1: ((document.querySelector('#app h1') || {}).textContent || '').trim(),
        title: document.title,
        desc: (document.head.querySelector('meta[name="description"]') || {}).content || '',
        body: document.getElementById('app').firstElementChild.innerHTML,
        head: document.head.innerHTML,
      };
    }, r.path);
    if (out.loading) problems.push(r.path + ': still loading');
    if (!out.h1) problems.push(r.path + ': no heading');
    (seen.title.get(out.title) || seen.title.set(out.title, []).get(out.title)).push(r.path);
    (seen.desc.get(out.desc) || seen.desc.set(out.desc, []).get(out.desc)).push(r.path);
    const html = template.replace(/<html[^>]*>[\s\S]*?<\/head>/, htmlOpen + '\n<head>' + out.head + '\n</head>')
      .replace('<main id="app"></main>', '<main id="app" data-pre="1"><div>' + out.body + '</div></main>');
    const file = path.join(dir, r.path.replace(/^\//, ''), 'index.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    done.push({ ...r, title: out.title, desc: out.desc, h1: out.h1 });
  }

  const dup = m => [...m].filter(([k, v]) => v.length > 1);
  const dupTitles = dup(seen.title), dupDescs = dup(seen.desc);
  if (dupTitles.length) console.log('note: %d titles are used by more than one page (e.g. %s)', dupTitles.length, JSON.stringify(dupTitles[0]));
  if (dupDescs.length) console.log('note: %d descriptions are used by more than one page', dupDescs.length);

  // 404.html: GitHub Pages sends it for any address with no saved page; the site opens and draws that address itself.
  fs.writeFileSync(path.join(dir, '404.html'), template.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">'));

  const today = new Date().toISOString().slice(0, 10), root = site.origin;
  fs.writeFileSync(path.join(dir, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    done.map(r => `<url><loc>${xml(root + r.path)}</loc><lastmod>${(r.lastmod || today).slice(0, 10)}</lastmod><priority>${r.priority.toFixed(1)}</priority></url>`).join('\n') + '\n</urlset>\n');

  fs.writeFileSync(path.join(dir, 'robots.txt'),
    '# Kingdom Code is free to read, and the Source Index is open to search engines and AI assistants alike.\n' +
    'User-agent: *\nAllow: /\nDisallow: /search/\nDisallow: /cta/\nDisallow: /become-a-berean/\nDisallow: /my-library/\n\n' +
    AI_CRAWLERS.map(a => `User-agent: ${a}\nAllow: /\nDisallow: /search/\nDisallow: /cta/\nDisallow: /become-a-berean/\nDisallow: /my-library/\n`).join('\n') +
    `\nSitemap: ${root}/sitemap.xml\n`);

  const D = await page.evaluate(() => ({
    guides: (PROFILE.kcGuides && D.KG || []).map(g => ({ t: g.title, sub: g.sub, about: g.about, p: pathOf('#/guides/' + g.slug), file: g.file })),
    church: (PROFILE.earlyChurch && D.EC || []).map(f => ({ t: f.name, line: f.line, p: pathOf('#/church/' + f.slug) })),
    words: D.words.map(w => ({ t: w.title, en: w.en, p: pathOf('#/word/' + w.slug) })),
    names: D.PP.map(x => ({ t: x.name, line: x.line, p: pathOf('#/person/' + x.slug) })),
    paths: D.paths.map(x => ({ t: x.q, intro: x.intro, p: pathOf('#/path/' + x.id) })),
    entries: D.entries.map(e => ({ t: e.name, p: pathOf('#/book/' + e.id) })),
    subjects: (typeof LIB !== 'undefined' && LIB ? LIB.cats : []).map(c => ({ t: c.name, line: c.line, p: pathOf('#/essays/subject/' + c.id) })),
    topics: (typeof LIB !== 'undefined' && LIB ? LIB.tags : []).map(t => ({ t: t.name, line: t.line, p: pathOf('#/essays/topic/' + t.id) })),
    essays: essayIds().map(pid => ({ t: P[pid][0], date: P[pid][3], url: P[pid][1], p: pathOf('#/essay/' + pid) })),
  }));
  const link = (t, p, d) => `- [${t}](${root}${p})${d ? ': ' + String(d).replace(/\s+/g, ' ') : ''}`;
  const head = `# Kingdom Code Source Index\n\n> ${site.desc} Kingdom Code is an independent Christian publication built on Jesus Christ and Holy Scripture, in the heritage of the Ethiopian canon. Everything here is free to read, quote and cite.\n\n` +
    `Every Kingdom Code essay cites Scripture. This index maps each cited verse to the essays that cite it, and each essay to the verses it cites. The Bible text covers the books of the Ethiopian canon that are published here.\n\n`;
  const sections = [
    ['Start here', [link('Home', '/'), link('The books of the Bible', '/bible/'), link('Essays and the Scripture each one cites', '/essays/'), link('Questions, with a reading path for each', '/questions/'), link('Words: the Hebrew and Greek behind the text', '/words/'), link('Names', '/names/'), link('Guides', '/guides/'), link('Which Bible translation to read', '/translations/'), link('About', '/about/'), link('Sources and credits', '/credits/')]],
    ['Guides (free PDF downloads)', D.guides.map(g => link(g.t + (g.sub ? ': ' + g.sub : ''), g.p, g.about))],
    ['Essay subjects', D.subjects.map(s => link(s.t, s.p, s.line))],
    ['Essay topics', D.topics.map(s => link(s.t, s.p, s.line))],
    ['Early Church (in time order)', D.church.map(f => link(f.t, f.p, f.line))],
    ['Questions', D.paths.map(x => link(x.t, x.p, x.intro))],
    ['Word studies', D.words.map(w => link(w.t, w.p, w.en))],
    ['Names', D.names.map(x => link(x.t, x.p, x.line))],
  ];
  fs.writeFileSync(path.join(dir, 'llms.txt'), head + sections.filter(s => s[1].length).map(([h, l]) => `## ${h}\n\n${l.join('\n')}\n`).join('\n') +
    `\n## Optional\n\n- [Full list of pages](${root}/llms-full.txt): every book, essay and page of the site, one line each\n- [Sitemap](${root}/sitemap.xml)\n`);
  fs.writeFileSync(path.join(dir, 'llms-full.txt'), head + sections.filter(s => s[1].length).map(([h, l]) => `## ${h}\n\n${l.join('\n')}\n`).join('\n') +
    `\n## Books and groups of books\n\n${D.entries.map(e => link(e.t, e.p)).join('\n')}\n` +
    `\n## Essays\n\nEach link is the essay's Sources page: the Scripture it cites and the essays that cite the same verses. The essay itself is on the publication's own page.\n\n` +
    D.essays.map(e => `${link(e.t + (e.date ? ' (' + e.date + ')' : ''), e.p)}${e.url ? ' | essay: ' + e.url : ''}`).join('\n') + '\n');

  await browser.close(); server.close();
  fs.writeFileSync(path.join(dir, 'prerender-report.json'), JSON.stringify({ pages: done.length, problems }, null, 1));
  console.log('wrote %d pages, sitemap.xml, robots.txt, llms.txt, llms-full.txt, 404.html', done.length);
  if (problems.length) { console.error('%d problems:\n  %s', problems.length, problems.slice(0, 20).join('\n  ')); process.exit(1); }
}

main().catch(e => { console.error(e); process.exit(1); });

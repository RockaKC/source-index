// Checks on the exported data and files, without a browser.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { ROOT, loadData } = require('./helpers');

const D = loadData();
const books = D.order.map(String);

test('every book with text has its file, with the chapters the index lists', () => {
  expect(Object.keys(D.CC).sort()).toEqual([...books].sort());
  const expected = [];
  for (const b of books) {
    expect(D.HT[b], `house translation of book ${b}`).toMatch(/^[a-z]+$/);
    const rel = `bible/${D.HT[b]}/${b}.json`;
    expected.push(rel);
    expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true);
    const text = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    expect(Object.keys(text).map(Number).sort((x, y) => x - y), `chapters of ${rel}`).toEqual(D.CC[b]);
    const empty = [];
    for (const [ch, verses] of Object.entries(text)) {
      if (!verses.length) empty.push(`${ch} (no verses)`);
      for (const [v, t] of verses) if (!String(t).trim()) empty.push(`${ch}:${v}`);
    }
    expect(empty, `empty chapters or verses in ${rel}`).toEqual([]);
  }
  const found = fs.readdirSync(path.join(ROOT, 'bible'), { recursive: true })
    .map(f => String(f).split(path.sep).join('/')).filter(f => f.endsWith('.json')).map(f => `bible/${f}`);
  expect(found.sort(), 'no stray or misplaced book files').toEqual(expected.sort());
});

const precacheList = () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  return JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"'));
};
const pageAssets = (name = 'index.html') => {
  const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
  return [...html.matchAll(/(?:src|href)="([\w./-]+\.(?:js|css))\?v=([0-9a-f]+)"/g)].map(m => ({ file: m[1], v: m[2] }));
};

for (const name of ['index.html', 'app.html']) {
  test(`${name} loads each of its files under a current version stamp`, () => {
    const html = fs.readFileSync(path.join(ROOT, name), 'utf8');
    expect(html, 'no page data left inline').not.toMatch(/^const D = /m);
    expect(html, 'no styles left inline').not.toMatch(/<style>/);
    const assets = pageAssets(name);
    expect(assets.map(a => a.file)).toContain('data/site.js');
    expect(assets.map(a => a.file)).toContain('js/router.js');
    for (const { file, v } of assets) {
      const want = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex').slice(0, 10);
      expect(v, `${file} stamp (run python3 tools/stamp_assets.py after editing it)`).toBe(want);
    }
    const local = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
    expect(local.length, 'every script tag carries a stamp').toBe(assets.filter(a => a.file.endsWith('.js')).length);
  });
}

test('each page loads one profile first, then the same files in the same order', () => {
  const files = name => pageAssets(name).map(a => a.file).filter(f => f.endsWith('.js'));
  const site = files('index.html'), app = files('app.html');
  expect(site[0]).toBe('profiles/site.js');
  expect(app[0]).toBe('profiles/app.js');
  expect(app.slice(1), 'app.html loads what index.html loads').toEqual(site.slice(1));
});

test('every file the page loads is saved for offline use', () => {
  const precache = precacheList();
  for (const { file } of pageAssets()) expect(precache, `${file} in the PRECACHE list in sw.js`).toContain(file);
});

test('every book with text names its translation and source language', () => {
  for (const b of books) {
    expect(D.TR[b], `translation label for book ${b}`).toBeTruthy();
    expect(D.TS[b], `source language for book ${b}`).toBeTruthy();
  }
});

test('every published essay has a title and a link', () => {
  for (const [id, p] of Object.entries(D.pieces)) {
    expect(p[0], `essay ${id} title`).toBeTruthy();
    expect(p[1], `essay ${id} link`).toMatch(/^https:\/\//);
  }
});

test('every cited verse points at a book in the canon and a published essay', () => {
  for (const [b, chs] of Object.entries(D.verses))
    for (const [ch, vs] of Object.entries(chs))
      for (const [v, ids] of Object.entries(vs)) {
        expect(D.books[b], `book ${b}`).toBeTruthy();
        for (const id of ids) expect(D.pieces[id], `essay ${id} cited at ${b} ${ch}:${v}`).toBeTruthy();
      }
});

test('the app manifest and offline files exist', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  expect(manifest.name).toBeTruthy();
  for (const icon of manifest.icons) expect(fs.existsSync(path.join(ROOT, icon.src)), icon.src).toBe(true);
  const precache = precacheList();
  for (const f of precache) if (f !== './') expect(fs.existsSync(path.join(ROOT, f)), `precached ${f}`).toBe(true);
});

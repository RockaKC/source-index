// Checks on the exported data and files, without a browser.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { ROOT, loadData } = require('./helpers');

const D = loadData();
const books = D.order.map(String);

test('every book with text has its file, with the chapters the index lists', () => {
  expect(Object.keys(D.CC).sort()).toEqual([...books].sort());
  for (const b of books) {
    const file = path.join(ROOT, 'bible', `${b}.json`);
    expect(fs.existsSync(file), `bible/${b}.json`).toBe(true);
    const text = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(Object.keys(text).map(Number).sort((x, y) => x - y), `chapters of book ${b}`).toEqual(D.CC[b]);
    const empty = [];
    for (const [ch, verses] of Object.entries(text)) {
      if (!verses.length) empty.push(`${ch} (no verses)`);
      for (const [v, t] of verses) if (!String(t).trim()) empty.push(`${ch}:${v}`);
    }
    expect(empty, `empty chapters or verses in book ${b}`).toEqual([]);
  }
  const files = fs.readdirSync(path.join(ROOT, 'bible')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  expect(files.sort(), 'no stray book files').toEqual([...books].sort());
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
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const precache = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1].replace(/'/g, '"'));
  for (const f of precache) if (f !== './') expect(fs.existsSync(path.join(ROOT, f)), `precached ${f}`).toBe(true);
});

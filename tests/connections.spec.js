// The archive's cross-links (js/connections.js, tools/connections.py): subjects list their essays, essays list their subjects, from the same pairs.
const { test, expect, loadData, settle } = require('./helpers');

const D = loadData();

test('the connection pairs are clean: each essay once per subject, only essays the site lists, and only known subjects', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const bad = await page.evaluate(() => {
    const listed = new Set(essayIds().map(String)), slugs = new Set(D.EC.map(f => 'church/' + f.slug)), problems = [];
    for (const [key, rows] of Object.entries(D.EL)) {
      if (!slugs.has(key)) problems.push('unknown subject ' + key);
      const ids = rows.map(r => r[0]);
      if (new Set(ids).size !== ids.length) problems.push('duplicate essay under ' + key);
      for (const [pid, how] of rows) { if (!listed.has(String(pid))) problems.push(`${key}: essay ${pid} is not on the site`); if (!['c', 'd'].includes(how)) problems.push(key + ' has kind ' + how); }
    }
    return problems;
  });
  expect(bad).toEqual([]);
  expect(Object.keys(D.EL).length).toBe(D.EC.length);
});

test('a figure lists the essays that cite or discuss them, cited first, each marked; the essay links back', async ({ page }) => {
  const key = Object.keys(D.EL).find(k => D.EL[k].length >= 2), slug = key.split('/')[1];
  await page.goto(`/guides/early-church/${slug}/`); await settle(page);
  const sec = page.locator('#app .cited');
  await expect(sec).toHaveCount(1);
  await expect(sec.locator('h2')).toHaveText('Featured in Kingdom Code');
  const rows = await sec.locator('.piece').evaluateAll(r => r.map(x => ({ pid: x.querySelector('.t a').dataset.pid, cap: [...x.querySelectorAll('.cap')].pop().textContent })));
  expect(rows.map(r => r.pid).sort()).toEqual(D.EL[key].map(r => String(r[0])).sort());      // the same pairs, nothing added, nothing missing
  for (const r of rows) expect(r.cap).toMatch(/^(Cited|Discussed)/);
  const marks = rows.map(r => r.cap.split(' ')[0]);
  expect(marks, 'cited essays come before discussed ones').toEqual([...marks].sort((a, b) => (a === 'Cited' ? 0 : 1) - (b === 'Cited' ? 0 : 1)));
  // the way back: that essay's Sources page names the figure and links to the profile
  const name = D.EC.find(f => f.slug === slug).name;
  await page.goto(`/#/essay/${rows[0].pid}`); await settle(page);
  const chip = page.locator('#app .chips a.chip', { hasText: name });
  await expect(chip).toHaveCount(1);
  expect(await chip.getAttribute('href')).toBe(`/guides/early-church/${slug}/`);
});

test('every pair shows in both directions', async ({ page }) => {
  await page.goto('/'); await settle(page);
  const result = await page.evaluate(() => {
    const c = connections(), misses = [];
    for (const [key, rows] of c.bySubject) for (const r of rows) {
      const back = (c.byEssay.get(r.pid) || []).some(x => x.key === key);
      if (!back) misses.push(`${key} -> ${r.pid} has no way back`);
    }
    for (const [pid, list] of c.byEssay) for (const x of list) if (!(c.bySubject.get(x.key) || []).some(r => r.pid === pid)) misses.push(`${pid} -> ${x.key} has no way back`);
    return { misses, subjects: c.bySubject.size };
  });
  expect(result.misses).toEqual([]);
  expect(result.subjects).toBeGreaterThan(4);
});

test('a figure no essay features says so plainly; passing mentions are not listed', async ({ page }) => {
  const empty = Object.keys(D.EL).find(k => D.EL[k].length === 0);
  test.skip(!empty, 'every figure has an essay');
  await page.goto(`/guides/early-church/${empty.split('/')[1]}/`); await settle(page);
  await expect(page.locator('#app .cited')).toContainText('No Kingdom Code essay features');
  await expect(page.locator('#app .cited .piece')).toHaveCount(0);
});

test('the app has no connections section', async ({ page }) => {
  const pid = D.PUB[0];
  await page.goto(`/app.html#/essay/${pid}`); await settle(page);
  await expect(page.locator('#app')).not.toContainText('Connected in the archive');
});

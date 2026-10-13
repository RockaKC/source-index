// Shared test helpers.
const fs = require('fs');
const path = require('path');
const { test: base, expect } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');

// The site's data, read from the `const D = {...};` line of index.html (the exporter writes that line).
function loadData() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/^const D = (\{.*\});$/m);
  if (!m) throw new Error('no `const D = {...};` line in index.html');
  return JSON.parse(m[1]);
}

// A page fixture that fails the test on any uncaught page error.
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(page);
    expect(errors, 'page errors').toEqual([]);
  },
});

// Wait until a route has rendered, including chapters that load their text on demand.
async function settle(page) {
  await page.waitForFunction(() => !document.getElementById('loadmsg'), null, { timeout: 10000 });
  await page.waitForTimeout(100);
}

module.exports = { ROOT, loadData, test, expect, settle };

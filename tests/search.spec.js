// Search behaves exactly as recorded: for each query, the suggestions offered, the page it opens,
// that page's heading and notes, and the reading links shown.
//
// When a change is MEANT to alter search results or page wording (a database rebuild, new essays,
// new wording), re-record and review the difference in tests/golden/search.json before committing:
//   npm run test:update
const fs = require('fs');
const path = require('path');
const { test, expect, settle } = require('./helpers');

const GOLDEN = path.join(__dirname, 'golden', 'search.json');
const UPDATE = !!process.env.UPDATE_GOLDEN;
const QUERIES = [
  'Psalm 23', 'Psalm 23:1', 'Psalm 22:1', 'Psalm 22:1-5', 'psalm 23:1-3', 'Psalm 9:1', 'Psalm 9:21', 'Psalm 10:1',
  'Psalm 10:15', 'Psalm 51:1', 'Psalm 51:3', 'Psalm 51:19', 'Psalm 119:1-5', 'Psalm 119:176', 'Psalm 150:6',
  'Psalm 1:1', 'Psalm 1:1-3', 'Psalm 3:1', 'Psalm 18:1', 'Psalm 18:50', 'Psalm 88:1', 'Psalm 88', 'Psalm 147',
  'Psalm 148:1', 'Psalms 116:10', 'ps 22', 'ps 22:16', 'psalm 21:17', 'psalm 56:1', 'psalm 144:1', 'psalm 100',
  'Genesis 1:1', 'Genesis 1:1-3', 'Genesis 6:4', 'Exodus 12:49', 'Isaiah 7:14', 'Isaiah 9:6', 'Isaiah 9:7',
  'John 3:16', 'John 3:16-17', 'Romans 6:14', 'Matthew 5:17', 'Jeremiah 31:33', 'Jeremiah 38:33', 'Jeremiah 38',
  'Daniel 3:92', 'Daniel 3:25', 'Enoch 1:9', 'Enoch 8:3', 'Jubilees 1:26', 'Job 41:31', 'Acts 8:37',
  'Deuteronomy 32:8', 'Ecclesiastes 5:4', 'Proverbs 24:61', 'Esther 4:16', 'Isaiah', 'Psalms', 'nephilim',
  'virgin', 'strange flesh',
];

test('search results match the recorded baseline', async ({ page }) => {
  test.setTimeout(QUERIES.length * 4000);
  const got = {};
  for (const q of QUERIES) {
    await page.goto('/');
    await page.fill('#q', q);
    await page.waitForTimeout(80);
    const sug = await page.$$eval('#sug li', l => l.map(x => x.textContent));
    await page.press('#q', 'Enter');
    await page.waitForTimeout(300);
    await settle(page);
    got[q] = {
      sug,
      ...(await page.evaluate(() => ({
        hash: curHash(),
        h1: (document.querySelector('h1') || {}).textContent,
        caps: [...document.querySelectorAll('.verse .cap, .lede')].map(x => x.textContent.trim()).slice(0, 4),
        reads: [...document.querySelectorAll('.row .r')].map(x => x.textContent),
      }))),
    };
  }
  if (UPDATE) {
    fs.writeFileSync(GOLDEN, JSON.stringify(got, null, 1) + '\n');
    return;
  }
  const want = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  for (const q of QUERIES) expect(got[q], `search for "${q}"`).toEqual(want[q]);
});

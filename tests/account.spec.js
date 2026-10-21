// Berean reader accounts (js/account.js): Become a Berean, My Library, Save buttons, account controls, privacy.
// Supabase is simulated in the browser (page.route): nothing here reaches a real project, and the site ships no test hook.
const { test, expect, loadData, settle } = require('./helpers');
const { SB, CODE, sessionFor, fakeSupabase } = require('./fake_supabase');

const D = loadData();
const ESSAY = Object.keys(D.pieces)[0];

async function signIn(page, st, email = 'reader@example.com') {
  await page.goto('/become-a-berean/'); await settle(page);
  await page.fill('#acctmail', email);
  await page.click('#acctgo');
  await page.waitForSelector('#acctnum');
  await page.fill('#acctnum', CODE);
  await page.waitForURL('**/my-library/');
  await page.waitForSelector('.libhead');
}

test('with no Supabase settings the website shows nothing of accounts', async ({ page }) => {
  const libs = []; page.on('request', r => { if (/vendor\/supabase/.test(r.url())) libs.push(r.url()); });
  await page.goto('/'); await settle(page);
  await expect(page.locator('#acctli')).toHaveCount(0);
  await page.goto('/essays/'); await settle(page);
  await expect(page.locator('[data-save]')).toHaveCount(0);
  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  await page.goto('/privacy/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  expect(libs, 'the sign-in library is never fetched').toEqual([]);
});

test('the menu and footer invite a signed-out reader to become a Berean, and the page loads no library until needed', async ({ page }) => {
  await fakeSupabase(page);
  const libs = []; page.on('request', r => { if (/vendor\/supabase/.test(r.url())) libs.push(r.url()); });
  await page.goto('/'); await settle(page);
  await expect(page.locator('#acctli a')).toHaveText('Become a Berean');
  await expect(page.locator('#acctfoot')).toHaveText('Become a Berean');
  await expect(page.locator('#acctli a')).toHaveAttribute('href', '/become-a-berean/');
  expect(libs, 'no session, so no library yet').toEqual([]);
  await page.goto('/become-a-berean/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Become a Berean.');
  await expect(page.locator('#app')).toContainText('A place for those who seek.');
  await expect(page.locator('#app')).toContainText('The archive and every essay stay open to everyone');
  expect(await page.evaluate(() => document.querySelector('meta[name=robots]').content)).toMatch(/noindex/);
});

test('sign-in: an email, then the 7-digit code, then My Library', async ({ page }) => {
  const st = await fakeSupabase(page);
  await page.goto('/become-a-berean/'); await settle(page);
  await page.fill('#acctmail', 'not an email'); await page.click('#acctgo');
  await expect(page.locator('#accterr')).toContainText('valid email');
  expect(st.otp).toHaveLength(0);
  await page.fill('#acctmail', ' Reader@Example.com '); await page.click('#acctgo');
  await page.waitForSelector('#acctnum');
  expect(st.otp).toHaveLength(1);
  expect(st.otp[0].body.email).toBe('reader@example.com');
  expect(st.otp[0].body.create_user).toBe(true);
  expect(st.otp[0].redirect, 'the emailed link returns to the site\'s own address, whatever it is').toBe('https://kingdomcodearchive.com/my-library/');
  await expect(page.locator('#app')).toContainText('7-digit code');
  await expect(page.locator('#app')).toContainText('reader@example.com');
  const num = page.locator('#acctnum');
  expect(await num.getAttribute('maxlength')).toBe('7');
  expect(await num.getAttribute('autocomplete')).toBe('one-time-code');
  await num.fill('99999999');
  expect(await num.inputValue(), 'an eighth digit is dropped').toBe('9999999');
  await expect(page.locator('#accterr')).toContainText('wrong or has expired');
  expect(st.verify).toHaveLength(1);
  await num.fill('123456'); await page.click('#acctgo');
  await expect(page.locator('#accterr')).toContainText('7 digits');
  expect(st.verify, 'six digits are never sent').toHaveLength(1);
  await num.fill(CODE);
  await page.waitForURL('**/my-library/');
  expect(st.verify[1]).toMatchObject({email: 'reader@example.com', token: CODE, type: 'email'});
  await expect(page.locator('.libhead h1')).toHaveText('My Library');
  await expect(page.locator('.libwelcome')).toContainText('Welcome, Berean');
  await expect(page.locator('#acctli a')).toHaveText('My Library');
});

test('a rate-limited request, and sending a new code, are handled in plain words', async ({ page }) => {
  const st = await fakeSupabase(page);
  st.otpStatus = 429;
  await page.goto('/become-a-berean/'); await settle(page);
  await page.fill('#acctmail', 'reader@example.com'); await page.click('#acctgo');
  await expect(page.locator('#accterr')).toContainText('Too many tries');
  await expect(page.locator('#acctgo')).toBeEnabled();
  st.otpStatus = 200; await page.click('#acctgo'); await page.waitForSelector('#acctnum');
  await page.click('#acctagain');
  await expect(page.locator('#acctmail')).toHaveValue('reader@example.com');
  await page.click('#acctgo'); await page.waitForSelector('#acctnum');
  await page.click('#acctother');
  await expect(page.locator('#acctmail')).toHaveValue('');
});

test('a new account has an empty library with a prompt to explore, and no guide catalog', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  await expect(page.locator('.libempty')).toContainText('Your library is empty');
  await expect(page.locator('.libempty a')).toHaveText(['Essays', 'Scripture', 'Study guides']);
  await expect(page.locator('#libsaved .libh')).toHaveCount(0);
  await expect(page.locator('#libsaved .libitem')).toHaveCount(0);
  await expect(page.locator('#app')).not.toContainText('available');
  await expect(page.locator('.libacct')).toContainText('reader@example.com');
  await page.click('.libempty a:has-text("Study guides")');
  await expect(page).toHaveURL(/\/guides\/kingdom-code\/$/);     // the public guides stay on their own page
  await expect(page.locator('#app a[download]')).toHaveCount(D.KG.length);
});

test('Save and Unsave work on essays, guides, chapters, verses and passages, and My Library lists them', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  const slug = D.KG[D.KG.length - 1].slug;
  // an essay
  await page.goto(`/essays/${ESSAY}-x/`); await settle(page);
  const btn = page.locator('[data-save="essay|' + ESSAY + '"]');
  await expect(btn).toHaveAttribute('aria-pressed', 'false');
  await btn.click(); await expect(btn).toHaveAttribute('aria-pressed', 'true'); await expect(btn).toContainText('Saved');
  await expect.poll(() => st.saved.length).toBe(1);
  // a guide
  await page.goto(`/guides/kingdom-code/${slug}/`); await settle(page);
  await page.locator(`[data-save="guide|${slug}"]`).click();
  // a verse, a passage and a chapter
  await page.goto('/bible/genesis/1/1/'); await settle(page);
  await page.locator('[data-save="verse|1:1:1"]').click();
  await page.goto('/bible/genesis/1/2-3/'); await settle(page);
  await page.locator('[data-save="verse|1:1:2-3"]').click();
  await page.goto('/bible/genesis/1/'); await settle(page);
  await page.locator('[data-save="verse|1:1"]').click();
  await expect.poll(() => st.saved.length).toBe(5);

  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#libsaved .libh')).toHaveText(['Saved Scripture 3', 'Saved Investigations 1', 'Saved Study Guides 1']);
  await expect(page.locator('#libsaved .libitem')).toHaveCount(5);
  await expect(page.locator('#libsaved .libitems').nth(0).locator('.libitem')).toHaveCount(3);
  await expect(page.locator('#libsaved .libitems').nth(1).locator('.libitem')).toHaveCount(1);
  await expect(page.locator('#libsaved .libitems').nth(2)).toContainText(D.KG.find(g => g.slug === slug).title);
  await expect(page.locator('#libsaved')).toContainText('Genesis 1:1');
  await expect(page.locator('#libsaved')).toContainText('Genesis 1:2–3');
  await expect(page.locator('#libsaved')).toContainText('Genesis 1');
  await expect(page.locator('[data-snip="1:1:1"]')).toContainText('beginning');                         // the verse's opening words
  // unsave from the library
  await page.locator('#libsaved [data-save="verse|1:1:1"]').click();
  await expect(page.locator('#libsaved .libitem')).toHaveCount(4);
  await expect.poll(() => st.saved.some(r => r.item_key === '1:1:1')).toBe(false);
  // the essay page remembers it was saved
  await page.goto(`/essays/${ESSAY}-x/`); await settle(page);
  await expect(page.locator('[data-save="essay|' + ESSAY + '"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a Save by a signed-out reader leads to Become a Berean, and is kept once they sign in', async ({ page }) => {
  const st = await fakeSupabase(page);
  await page.goto('/bible/genesis/1/1/'); await settle(page);
  await page.locator('[data-save="verse|1:1:1"]').click();
  await page.waitForURL('**/become-a-berean/');
  await page.fill('#acctmail', 'reader@example.com'); await page.click('#acctgo');
  await page.waitForSelector('#acctnum'); await page.fill('#acctnum', CODE);
  await page.waitForURL('**/bible/genesis/1/1/');
  await expect(page.locator('[data-save="verse|1:1:1"]')).toHaveAttribute('aria-pressed', 'true');
  expect(st.saved.map(r => r.item_key)).toEqual(['1:1:1']);
});

test('a save that fails is undone, with a message', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  st.failInsert = true;
  await page.goto('/bible/genesis/1/1/'); await settle(page);
  const b = page.locator('[data-save="verse|1:1:1"]');
  await b.click();
  await expect(page.locator('#acctsay')).toContainText('library is full');
  await expect(b).toHaveAttribute('aria-pressed', 'false');
});

test('the session survives a reload, signing out clears it, and the menu follows', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  st.saved.push({kind: 'essay', item_key: ESSAY, created_at: new Date().toISOString()});
  await page.reload(); await settle(page);
  await expect(page.locator('.libhead h1')).toHaveText('My Library');
  await expect(page.locator('#libsaved .libitem')).toHaveCount(1);
  await page.click('#libout');
  await page.waitForURL(u => u.pathname === '/');
  await expect(page.locator('#acctli a')).toHaveText('Become a Berean');
  expect(await page.evaluate(() => localStorage.getItem('kc-session'))).toBeNull();
  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Become a Berean.');
});

test('the emailed link also signs a reader in', async ({ page }) => {
  await fakeSupabase(page);
  const s = sessionFor('reader@example.com');
  await page.goto(`/#access_token=${s.access_token}&refresh_token=r&expires_in=3600&expires_at=${s.expires_at}&token_type=bearer&type=magiclink`);
  await page.waitForURL('**/my-library/');
  await expect(page.locator('.libhead h1')).toHaveText('My Library');
  expect(await page.evaluate(() => location.hash), 'the tokens leave the address bar').toBe('');
});

test('Export my data gives the reader a file of their email and saved items', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  st.saved.push({kind: 'verse', item_key: '1:1:1', created_at: new Date().toISOString()});
  await page.reload(); await settle(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#libexport')]);
  expect(dl.suggestedFilename()).toBe('kingdom-code-library.json');
  const data = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  expect(data.email).toBe('reader@example.com');
  expect(data.saved).toEqual([expect.objectContaining({kind: 'verse', key: '1:1:1'})]);
});

test('Delete my account asks twice, can be cancelled, and removes the account and the saved items', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  st.saved.push({kind: 'essay', item_key: ESSAY, created_at: new Date().toISOString()});
  await page.reload(); await settle(page);
  await page.click('#libdelask');
  await expect(page.locator('.libwarn')).toContainText('cannot be undone');
  await page.click('#libdelno');
  await expect(page.locator('#libdelask')).toBeVisible();
  expect(st.rpc, 'cancelling deletes nothing').toHaveLength(0);
  await page.click('#libdelask'); await page.click('#libdelyes');
  await page.waitForURL(u => u.pathname === '/');
  expect(st.rpc).toEqual(['/rest/v1/rpc/delete_my_account']);
  expect(st.saved).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('kc-session'))).toBeNull();
  await expect(page.locator('#acctli a')).toHaveText('Become a Berean');
});

test('the privacy page says what is kept, and Turnstile only when it is used', async ({ page }) => {
  await fakeSupabase(page);
  await page.goto('/privacy/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Privacy');
  await expect(page.locator('#app')).toContainText('We do not add you to a mailing list');
  await expect(page.locator('#app')).toContainText('Supabase');
  await expect(page.locator('#app')).toContainText('Resend');
  await expect(page.locator('#app')).not.toContainText('Turnstile');
  expect(await page.evaluate(() => seoRoutes().some(r => r.path === '/privacy/')), 'the privacy page is in the sitemap').toBe(true);
  expect(await page.evaluate(() => seoRoutes().some(r => /berean|library/.test(r.path))), 'account pages are not').toBe(false);
});

test('with a Turnstile key the check must pass first, and its token goes with the request', async ({ page }) => {
  const st = await fakeSupabase(page, {config: {url: SB, key: 'sb_publishable_test', public: true, turnstileKey: '0x4AAAA-test'}});
  await page.route('https://challenges.cloudflare.com/**', r => r.fulfill({contentType: 'application/javascript',
    body: 'window.turnstile={render:function(el,o){setTimeout(function(){o.callback("tok-123")},900);return "w1"},reset:function(){}};'}));
  await page.goto('/become-a-berean/'); await settle(page);
  await expect(page.locator('#acctgo')).toBeDisabled();
  await page.fill('#acctmail', 'reader@example.com');
  await expect(page.locator('#acctgo')).toBeEnabled();
  await page.click('#acctgo'); await page.waitForSelector('#acctnum');
  expect(st.otp[0].body.gotrue_meta_security).toEqual({captcha_token: 'tok-123'});
  await page.goto('/privacy/'); await settle(page);
  await expect(page.locator('#app')).toContainText('Turnstile');
});

test('the account pages fit a phone, and a configured origin moves the emailed link with it', async ({ page }) => {
  const st = await fakeSupabase(page);
  await page.setViewportSize({width: 360, height: 740});
  await page.goto('/become-a-berean/'); await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await signIn(page, st);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(st.otp[0].redirect).toBe('https://kingdomcodearchive.com/my-library/');
});

test('until accounts are public they are a private preview, switched on and off by ?berean-preview', async ({ page }) => {
  await fakeSupabase(page, {config: {url: SB, key: 'sb_publishable_test', public: false}});
  await page.goto('/'); await settle(page);
  await expect(page.locator('#acctli')).toHaveCount(0);
  await page.goto('/essays/'); await settle(page);
  await expect(page.locator('[data-save]')).toHaveCount(0);
  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Not found');
  await page.goto('/?berean-preview=1'); await settle(page);
  await expect(page.locator('#acctli a')).toHaveText('Become a Berean');
  await page.goto('/become-a-berean/'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Become a Berean.');
  await expect(page.locator('.accpreview')).toContainText('not open to the public yet');
  await page.reload(); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Become a Berean.');
  await page.goto('/?berean-preview=0'); await settle(page);
  await expect(page.locator('#acctli')).toHaveCount(0);
});

test('a public launch ignores the preview switch and shows no preview note', async ({ page }) => {
  await fakeSupabase(page);
  await page.goto('/become-a-berean/?berean-preview=0'); await settle(page);
  await expect(page.locator('#app h1')).toHaveText('Become a Berean.');
  await expect(page.locator('.accpreview')).toHaveCount(0);
});

test('the committed site profile points at the live project but stays a private preview', async () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'profiles', 'site.js'), 'utf8');
  expect(src).toContain("url: 'https://lsgldbagakgrlndqtyhi.supabase.co'");
  expect(src).toMatch(/accounts: \{[^}]*public: false/);
});

test('My Library groups by kind, hides empty groups, drops an unsaved item at once and keeps the rest after a refresh', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  const slug = D.KG[0].slug, title = D.KG[0].title;
  await page.goto(`/guides/kingdom-code/${slug}/`); await settle(page);
  await page.locator(`[data-save="guide|${slug}"]`).click();
  await expect.poll(() => st.saved.length).toBe(1);
  await page.goto('/my-library/'); await settle(page);
  await expect(page.locator('#libsaved .libh')).toHaveText(['Saved Study Guides 1']);   // only the group that has something
  await expect(page.locator('#libsaved')).toContainText(title);
  await expect(page.locator('#libsaved')).not.toContainText('Your library is empty');
  await page.reload(); await settle(page);
  await expect(page.locator('#libsaved .libh')).toHaveText(['Saved Study Guides 1']);   // kept after a refresh (read back from the server)
  await expect(page.locator('#libsaved [data-save]')).toHaveAttribute('aria-pressed', 'true');
  // unsaving removes it from the library, and the empty prompt returns; the public guide is untouched
  await page.locator(`#libsaved [data-save="guide|${slug}"]`).click();
  await expect(page.locator('#libsaved .libitem')).toHaveCount(0);
  await expect(page.locator('#libsaved .libh')).toHaveCount(0);
  await expect(page.locator('.libempty')).toContainText('Your library is empty');
  await expect.poll(() => st.saved.length).toBe(0);
  await page.reload(); await settle(page);
  await expect(page.locator('.libempty')).toBeVisible();
  await page.goto('/guides/kingdom-code/'); await settle(page);
  await expect(page.locator('#app a[download]')).toHaveCount(D.KG.length);
  await expect(page.locator('#app')).toContainText(title);
});

test('the library lays out in a phone width in light and dark', async ({ page }) => {
  const st = await fakeSupabase(page);
  await signIn(page, st);
  await page.goto('/bible/genesis/1/1/'); await settle(page);
  await page.locator('[data-save="verse|1:1:1"]').click();
  await expect.poll(() => st.saved.length).toBe(1);
  await page.setViewportSize({width: 375, height: 800});
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme: scheme});
    await page.goto('/my-library/'); await settle(page);
    await expect(page.locator('#libsaved .libh')).toHaveText(['Saved Scripture 1']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), scheme + ': no sideways scroll').toBe(true);
  }
});

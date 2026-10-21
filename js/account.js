// account.js: Berean reader accounts: Become a Berean, My Library, Save buttons, and the privacy page (the website only)
// Loaded as a plain script after js/guide.js; see index.html for the order. Shared names live in the page's global scope.
// The archive stays open to everyone; an account only gives a reader a private shelf of what they chose to save.
// Sign-in is Supabase Auth (the official supabase-js, vendor/supabase.js, fetched only on account pages or for a reader who already has a session):
// the reader types their email, receives a one-time code, types it back. No password. Saved items live in one table, `saved`
// (supabase/schema.sql), that Postgres row-level security lets each reader see and change only for themselves.
// Off until profiles/site.js sets accounts: {url, key}; with it blank the site shows nothing of this.

const ACC_CFG = PROFILE.accounts || null;
// While accounts.public is not true the feature is a private preview: it appears only in a browser that opted in by opening any page of the
// site with ?berean-preview=1 (and out again with ?berean-preview=0). Everyone else sees no trace of it, and the routes do not exist.
if (ACC_CFG && !ACC_CFG.public) { const m = /[?&]berean-preview=([01])(&|$)/.exec(location.search); if (m) store.set('kc-berean-preview', m[1]); }
const ACC_ON = !!(ACC_CFG && ACC_CFG.url && ACC_CFG.key && (ACC_CFG.public || store.get('kc-berean-preview') === '1'));
const accPreview = () => ACC_CFG.public ? '' : '<p class="cap accpreview">Preview: Berean accounts are not open to the public yet.</p>';
const ACC_CODE = (ACC_CFG && ACC_CFG.codeLength) || 7;              // digits in the emailed code: set in Supabase, Authentication, Email
const ACC_MINUTES = (ACC_CFG && ACC_CFG.codeMinutes) || 10;         // how long a code lasts: the same setting
const acc = {user: null, saved: new Map(), ready: false, wait: null, captcha: null};   // saved: 'kind|key' -> when it was saved
const accHint = () => !!store.get('kc-session');                    // supabase-js keeps the session under this key; its presence means "probably signed in"
const accKey = (kind, key) => kind + '|' + key;
const accEmail = () => (acc.user && acc.user.email) || '';

let accLib = null;
function accClient() {              // the Supabase client, created on first use
  if (!accLib) accLib = new Promise((ok, no) => {
    if (window.supabase) return ok();
    const s = document.createElement('script');
    s.src = 'vendor/supabase.js?v=2.118.0'; s.onload = ok;
    s.onerror = () => { accLib = null; s.remove(); no(new Error('library')); };
    document.head.appendChild(s);
  }).then(() => window.supabase.createClient(ACC_CFG.url, ACC_CFG.key, {
    auth: {storageKey: 'kc-session', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit'}}));
  return accLib;
}
const accWhenReady = () => acc.wait || Promise.resolve();

// ---------- what a reader can save ----------
// A saved item is ['guide'|'essay'|'verse', key]: a guide's slug, an essay's number, or Scripture in the house numbering (as the
// verse pages use it): 'book:chapter' (a chapter), 'book:chapter:verse', 'book:chapter:first-last'.
function accTarget(p) {             // the item this page can be saved as, or null
  const a = p[0];
  if (a === 'essay' && P[p[1]]) return ['essay', String(+p[1])];
  if (a === 'guides' && p[1] && kcGuide(p[1])) return ['guide', p[1]];
  if (!D.books[p[1]]) return null;
  if (a === 'read' && +p[2]) return ['verse', `${+p[1]}:${+p[2]}`];
  if (a === 'verse' && +p[2] && +p[3]) return ['verse', `${+p[1]}:${+p[2]}:${+p[3]}`];
  if (a === 'range' && +p[2] && +p[3] && +p[4]) return ['verse', `${+p[1]}:${+p[2]}:${+p[3]}-${+p[4]}`];
  return null;
}
function accScripture(key) {        // 'b:c', 'b:c:v' or 'b:c:v1-v2' -> {b, ch, vs, ve, label, hash}, or null when it is not in the archive
  const m = /^(\d+):(\d+)(?::(\d+)(?:-(\d+))?)?$/.exec(key); if (!m || !D.books[m[1]]) return null;
  const b = +m[1], ch = +m[2], vs = m[3] ? +m[3] : 0, ve = m[4] ? +m[4] : vs;
  const label = vs ? `${bname(b)} ${ch}:${vs}${ve > vs ? '–' + ve : ''}` : `${bname(b)} ${ch}`;
  return {b, ch, vs, ve, label, hash: !vs ? `#/read/${b}/${ch}` : ve > vs ? `#/range/${b}/${ch}/${vs}/${ve}` : `#/verse/${b}/${ch}/${vs}`};
}
const ACC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>';
function saveButton(kind, key, cls) {
  const on = acc.saved.has(accKey(kind, key));
  return `<button type="button" class="savebtn${cls ? ' ' + cls : ''}" data-save="${esc(accKey(kind, key))}" aria-pressed="${on}">${ACC_ICON}<span>${on ? 'Saved' : 'Save'}</span></button>`;
}
function accSaveBar(p) {            // a Save button on the essay, guide, chapter, verse and passage pages
  const t = accTarget(p); if (!t) return;
  let host, html = saveButton(t[0], t[1], t[0] === 'guide' ? 'btn secondary' : '');
  if (t[0] === 'guide') host = document.querySelector('#app .act');
  if (t[0] === 'essay' && (host = document.querySelector('#app .essayline'))) { host.insertAdjacentHTML('beforeend', saveButton(t[0], t[1], 'quiet')); return; }   // an essay read here: Save sits quietly beside its date
  if (host) { host.insertAdjacentHTML('beforeend', html); return; }
  host = (t[0] === 'essay' && document.querySelector('#app .essaymeta')) || document.querySelector('#app h1');
  if (host) host.insertAdjacentHTML('afterend', `<div class="savebar">${html}</div>`);
}
function accRefreshButtons() {
  document.querySelectorAll('[data-save]').forEach(b => {
    const on = acc.saved.has(b.dataset.save);
    b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'Saved' : 'Save';
  });
  accMarkVerses();
}

// ---------- saving any verse from the chapter page ----------
// Tapping a verse (or its number) opens a small bar under it with Save / Unsave. A cited verse is a link, so its words keep
// going to the verse page; its number, or Space on the focused link, opens the bar instead.
let accPage = [];
const accVerseKey = p => { const m = /^v(\d+)$/.exec(p.id); return m && accPage[0] === 'read' ? `${+accPage[1]}:${+accPage[2]}:${m[1]}` : null; };
function accVerseClose() {
  const open = document.querySelector('#app .text p.vsel'); if (!open) return null;
  open.classList.remove('vsel');
  const sup = open.querySelector('sup[role=button]'); if (sup) sup.setAttribute('aria-expanded', 'false');
  const bar = open.nextElementSibling; if (bar && bar.classList.contains('vbar')) bar.remove();
  return open;
}
function accVerseToggle(p) {
  const key = accVerseKey(p); if (!key) return;
  const wasOpen = p.classList.contains('vsel'); accVerseClose(); if (wasOpen) return;
  p.classList.add('vsel');
  const sup = p.querySelector('sup[role=button]'); if (sup) sup.setAttribute('aria-expanded', 'true');
  const s = accScripture(key);
  p.insertAdjacentHTML('afterend', `<div class="vbar" role="group" aria-label="${esc(s.label)}"><span class="vref">${esc(s.label)}</span>${saveButton('verse', key)}</div>`);
}
function accMarkVerses() {         // a small dot beside the number of each verse the reader has saved
  if (accPage[0] !== 'read') return;
  const have = new Set(), pre = `verse|${+accPage[1]}:${+accPage[2]}:`;
  for (const k of acc.saved.keys()) if (k.startsWith(pre)) { const [a, z] = k.slice(pre.length).split('-').map(Number); for (let v = a; v <= (z || a); v++) have.add(v); }
  document.querySelectorAll('#app .text p[id^=v]').forEach(p => p.classList.toggle('vsaved', have.has(+p.id.slice(1))));
}
function accWireVerses() {
  document.querySelectorAll('#app .text p[id^=v]').forEach(p => {
    if (!accVerseKey(p)) return;
    const sup = p.querySelector('sup'), a = p.querySelector('a.vv'), n = p.id.slice(1);
    if (a) a.setAttribute('aria-label', a.getAttribute('aria-label') + ' Press Space to save it.');
    else { p.classList.add('vp'); if (sup) { sup.setAttribute('tabindex', '0'); sup.setAttribute('role', 'button'); sup.setAttribute('aria-expanded', 'false'); sup.setAttribute('aria-label', `Verse ${n}: save options`); } }
  });
  accMarkVerses();
}
document.addEventListener('click', e => {
  if (!ACC_ON || accPage[0] !== 'read') return;
  const t = e.target; if (t.closest('.vbar')) return;
  const p = t.closest('#app .text p[id^=v]');
  if (!p) { accVerseClose(); return; }
  const link = t.closest('a');
  if (link && !link.classList.contains('vv')) return;                       // any other link keeps its own job
  if (link && !t.closest('sup')) return;                                    // a cited verse's words go to its page
  if (String(window.getSelection()).length) return;                         // the reader is selecting text to copy
  if (link) e.preventDefault();                                            // (captured first, so the page router never sees the click)
  accVerseToggle(p);
}, true);
document.addEventListener('keydown', e => {
  if (!ACC_ON || accPage[0] !== 'read') return;
  if (e.key === 'Escape') { const was = accVerseClose(); if (was) { const sup = was.querySelector('sup[tabindex]') || was.querySelector('a.vv'); if (sup) sup.focus(); } return; }
  const t = e.target, p = t.closest && t.closest('#app .text p[id^=v]'); if (!p) return;
  if ((t.matches('sup[role=button]') && (e.key === 'Enter' || e.key === ' ')) || (t.matches('a.vv') && e.key === ' ')) { e.preventDefault(); accVerseToggle(p); }
});

// ---------- a short message that fades by itself ----------
let sayTimer = 0;
function accSay(text) {
  let el = document.getElementById('acctsay');
  if (!el) { el = document.createElement('div'); el.id = 'acctsay'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text; el.classList.add('show');
  clearTimeout(sayTimer); sayTimer = setTimeout(() => el.classList.remove('show'), 3600);
}
const accOops = e => {              // what to tell a reader about a failure
  const m = String((e && e.message) || ''), s = e && e.status;
  if (s === 429 || /rate limit|too many|security purposes/i.test(m)) return 'Too many tries. Wait a minute, then try again.';
  if (/expired|invalid|incorrect/i.test(m) || s === 403) return 'That code is wrong or has expired. Check the email, or ask for a new code.';
  if (!navigator.onLine || /failed to fetch|network|library/i.test(m)) return 'The connection failed. Check it, then try again.';
  if (/captcha/i.test(m)) return 'The check did not pass. Try it again.';
  if (/limit reached/i.test(m)) return 'Your library is full (2000 saved items). Remove some to save more.';
  return 'Something went wrong. Try again in a moment.';
};

// ---------- the session and the saved list ----------
async function accLoadSaved() {
  const sb = await accClient();
  const r = await sb.from('saved').select('kind,item_key,created_at').order('created_at', {ascending: false}).limit(2000);
  if (r.error) throw r.error;
  acc.saved = new Map((r.data || []).map(x => [accKey(x.kind, x.item_key), x.created_at]));
}
function accSetUser(u) { acc.user = u || null; if (!u) acc.saved = new Map(); }
function accStart() {
  const back = /[#&](access_token|error_description)=/.test(location.hash);      // arriving from the emailed link
  if (!accHint() && !back) { acc.ready = true; return; }
  acc.wait = accClient().then(sb => {
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_OUT') { accSetUser(null); accAfterChange(); }
      else if (ev === 'SIGNED_IN' && !acc.user) setTimeout(() => { accSetUser(session && session.user); accLoadSaved().catch(() => {}).then(accAfterChange); }, 0);
    });
    return sb.auth.getSession();
  }).then(({data}) => { accSetUser(data.session && data.session.user); return acc.user ? accLoadSaved() : null; })
    .catch(() => {})
    .then(() => {
      acc.ready = true; accChrome(); accRefreshButtons();
      if (back && acc.user) accReplace('#/mylibrary');
      else if (back) { history.replaceState(history.state, '', location.pathname); accReplace('#/berean'); }
    });
}
function accAfterChange() {         // the session changed (here or in another tab): the page shows what is now true
  accChrome(); accRefreshButtons();
  if (/^(mylibrary)$/.test(curHash().replace(/^#\/?/, '').split('/')[0])) route();
}
function accReplace(hash) {         // open a page in place of this one, so Back does not return to a page that only forwards
  if (CLEAN && pathOf(hash)) history.replaceState(history.state, '', pathOf(hash)); else location.replace(hash);
  route();
}

// ---------- the menu and footer ----------
function accChrome() {
  if (!ACC_ON) return;
  const mine = !!acc.user || (!acc.ready && accHint()), hash = mine ? '#/mylibrary' : '#/berean', label = mine ? 'My Library' : 'Become a Berean';
  let li = document.getElementById('acctli');
  if (!li) {
    const ul = document.querySelector('#menu ul'); if (!ul) return;
    li = document.createElement('li'); li.id = 'acctli';
    li.innerHTML = `<a href="#/berean">${ACC_ICON.replace('<svg ', '<svg class="line" ')}<span></span></a>`;
    ul.insertBefore(li, ul.firstChild);
    const f = document.querySelector('footer .cap');
    if (f) f.insertAdjacentHTML('beforeend', ' · <a id="acctfoot" href="#/berean"></a> · <a href="#/privacy">Privacy</a>');
  }
  for (const a of [li.querySelector('a'), document.getElementById('acctfoot')]) {
    if (!a) continue;
    a.setAttribute('href', hrefOf(hash));
    (a.querySelector('span') || a).textContent = label;
  }
}

// ---------- Become a Berean ----------
function viewBerean() {
  accWhenReady().then(() => { if (acc.user && curHash() === '#/berean') accReplace('#/mylibrary'); });
  const t = ACC_CFG.turnstileKey;
  return `
  ${backLink('#/')}
  ${accPreview()}
  <section class="acct">
    <p class="eyebrow">Kingdom Code</p>
    <h1>Become a Berean.</h1>
    <p class="lede">A place for those who seek.</p>
    <p class="acctnote">In Acts 17:11 the Bereans received the word eagerly and examined the Scriptures daily to see whether what they heard was so.
      Explore the archive, examine Scripture, and keep what you find in a library of your own.</p>
    <div id="acctstep">${accEmailStep(t, '')}</div>
    <ul class="acctlist">
      <li><b>Your library.</b> A shelf of your own, empty until you save something.</li>
      <li><b>Save what you study.</b> Essays, guides, chapters, and verses, ready when you return.</li>
      <li><b>Free, and yours alone.</b> No password, no payment, no mailing list. Only you can see what you save.</li>
    </ul>
    <p class="cap">The archive and every essay stay open to everyone, with or without an account. <a href="#/privacy">How your data is handled</a>.</p>
  </section>`;
}
function accEmailStep(turnstile, email, note) {
  return `<form id="acctform" class="acctform" novalidate>
    <label for="acctmail">Email</label>
    <input id="acctmail" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(email)}" required>
    ${turnstile ? '<div id="acctcaptcha" class="acctcaptcha"></div>' : ''}
    <p class="accterr" id="accterr" role="alert">${note ? esc(note) : ''}</p>
    <button class="btn primary" type="submit" id="acctgo"${turnstile ? ' disabled' : ''}>Create your free account</button>
    <p class="cap">We email you a one-time code. There is no password to remember or lose.</p>
  </form>`;
}
function accCodeStep(email) {
  return `<form id="acctcode" class="acctform" novalidate>
    <h2>Enter your code</h2>
    <p class="acctnote">We sent a ${ACC_CODE}-digit code to <b>${esc(email)}</b>. It expires in ${ACC_MINUTES} minutes. Check your spam folder if it does not arrive.</p>
    <label for="acctnum">Code</label>
    <input id="acctnum" class="acctnum" name="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${ACC_CODE}" autocomplete="one-time-code" placeholder="${'0'.repeat(ACC_CODE)}" required>
    <p class="accterr" id="accterr" role="alert"></p>
    <button class="btn primary" type="submit" id="acctgo">Sign in</button>
    <p class="acctlinks"><button type="button" class="linkbtn" id="acctagain">Send a new code</button><button type="button" class="linkbtn" id="acctother">Use a different email</button></p>
  </form>`;
}
function accTurnstile() {           // Cloudflare's check, only when a site key is set; the page it loads from is fetched here and nowhere else
  const key = ACC_CFG.turnstileKey, host = document.getElementById('acctcaptcha'); if (!key || !host) return;
  acc.captcha = {token: null, id: null};
  const draw = () => {
    acc.captcha.id = window.turnstile.render(host, {sitekey: key, theme: isDark() ? 'dark' : 'light',
      callback: t => { acc.captcha.token = t; const b = document.getElementById('acctgo'); if (b) b.disabled = false; },
      'expired-callback': () => { acc.captcha.token = null; const b = document.getElementById('acctgo'); if (b) b.disabled = true; }});
  };
  if (window.turnstile) return draw();
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = draw;
  document.head.appendChild(s);
}
const accBusy = (btn, on, text) => { btn.disabled = on; if (text) btn.textContent = text; };
function wireBerean() {
  const step = document.getElementById('acctstep'); if (!step) return;
  let email = '';
  const showEmail = (note) => { step.innerHTML = accEmailStep(ACC_CFG.turnstileKey, email, note); wireEmail(); };
  const showCode = () => { step.innerHTML = accCodeStep(email); wireCode(); document.getElementById('acctnum').focus(); };
  function wireEmail() {
    accTurnstile();
    const form = document.getElementById('acctform'), err = document.getElementById('accterr'), go = document.getElementById('acctgo');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = form.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = 'Enter a valid email address.'; form.email.focus(); return; }
      err.textContent = ''; email = v; accBusy(go, true, 'Sending…');
      try {
        const sb = await accClient();
        const options = {shouldCreateUser: true, emailRedirectTo: SITE_ORIGIN + (pathOf('#/mylibrary') || '/')};
        if (acc.captcha && acc.captcha.token) options.captchaToken = acc.captcha.token;
        const r = await sb.auth.signInWithOtp({email, options});
        if (r.error) throw r.error;
        showCode();
      } catch (x) {
        err.textContent = accOops(x); accBusy(go, false, 'Create your free account');
        if (acc.captcha && window.turnstile) { acc.captcha.token = null; window.turnstile.reset(acc.captcha.id); go.disabled = true; }
      }
    });
  }
  function wireCode() {
    const form = document.getElementById('acctcode'), err = document.getElementById('accterr'), go = document.getElementById('acctgo'), num = form.code;
    let busy = false;
    const submit = async () => {
      const code = num.value.replace(/\D/g, '');
      if (busy) return;
      if (code.length !== ACC_CODE) { err.textContent = `The code has ${ACC_CODE} digits.`; num.focus(); return; }
      err.textContent = ''; busy = true; accBusy(go, true, 'Checking…');
      try {
        const sb = await accClient();
        const r = await sb.auth.verifyOtp({email, token: code, type: 'email'});
        if (r.error) throw r.error;
        accSetUser(r.data.user); await accLoadSaved().catch(() => {});
        try { sessionStorage.setItem('kc-welcome', '1'); } catch (x) {}
        await accAfterSignIn();
      } catch (x) {
        err.textContent = accOops(x); accBusy(go, false, 'Sign in'); busy = false; num.select();
      }
    };
    form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, ACC_CODE); if (num.value.length === ACC_CODE) submit(); });
    document.getElementById('acctagain').addEventListener('click', () => showEmail('Check your email address, then ask for a new code.'));
    document.getElementById('acctother').addEventListener('click', () => { email = ''; showEmail(); });
  }
  wireEmail();
}
async function accAfterSignIn() {   // a Save the reader tried before signing in is applied, and they return to that page
  let intent = null;
  try { intent = JSON.parse(sessionStorage.getItem('kc-save-intent') || 'null'); sessionStorage.removeItem('kc-save-intent'); } catch (e) {}
  accChrome();
  if (intent && accKey(intent.kind, intent.key) && !acc.saved.has(accKey(intent.kind, intent.key))) { await accSet(intent.kind, intent.key, true); }
  accReplace(intent && intent.back ? intent.back : '#/mylibrary');
}

// ---------- saving and removing ----------
async function accSet(kind, key, want) {      // want: true to save, false to remove; the page answers at once and the server follows
  const k = accKey(kind, key), had = acc.saved.has(k);
  if (want === had) return;
  if (want) acc.saved.set(k, new Date().toISOString()); else acc.saved.delete(k);
  accRefreshButtons();
  try {
    const sb = await accClient();
    const r = want ? await sb.from('saved').insert({kind, item_key: key}) : await sb.from('saved').delete().eq('kind', kind).eq('item_key', key);
    if (r.error && r.error.code !== '23505') throw r.error;
  } catch (e) {
    if (had) acc.saved.set(k, new Date().toISOString()); else acc.saved.delete(k);
    accRefreshButtons(); accSay(accOops(e));
    if (document.getElementById('libsaved')) route();
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-save]'); if (!b || !ACC_ON) return;
  e.preventDefault();
  const [kind, ...rest] = b.dataset.save.split('|'), key = rest.join('|');
  if (!acc.user) {                                // not signed in: invite them, and remember what they meant to save
    try { sessionStorage.setItem('kc-save-intent', JSON.stringify({kind, key, back: curHash()})); } catch (x) {}
    navigate('#/berean'); return;
  }
  const inLibrary = !!b.closest('#libsaved');
  accSet(kind, key, !acc.saved.has(b.dataset.save));       // the page changes at once; the server follows (a failure puts it back)
  if (inLibrary) route();                                  // an unsaved item leaves the library straight away
});

// ---------- My Library ----------
function accSavedList(kind) {       // saved items of one kind, newest first
  return [...acc.saved].filter(([k]) => k.startsWith(kind + '|')).map(([k, at]) => [k.slice(kind.length + 1), at]).sort((a, b) => b[1].localeCompare(a[1]));
}
function libEssay([key]) {
  const p = P[key];
  const body = p ? `<a href="#/essay/${esc(key)}">${esc(p[0])}</a><span class="cap">${esc(fmtDate(p[3]))}</span>` : `<span>An essay that is no longer in the archive</span>`;
  return `<li class="libitem"><div class="libtext">${body}</div>${saveButton('essay', key)}</li>`;
}
function libVerse([key]) {
  const s = accScripture(key);
  const body = s ? `<a href="${esc(s.hash)}">${esc(s.label)}</a>${s.vs ? `<span class="libsnip" data-snip="${esc(key)}"></span>` : ''}` : `<span>Scripture that is no longer in the archive</span>`;
  return `<li class="libitem"><div class="libtext">${body}</div>${saveButton('verse', key)}</li>`;
}
function libGuide([key]) {
  const g = kcGuide(key);
  const body = g ? `<a href="#/guides/${esc(key)}">${esc(g.title)}</a><span class="cap">${esc(guideMeta(g))}</span>` : `<span>A guide that is no longer available</span>`;
  return `<li class="libitem"><div class="libtext">${body}</div>${saveButton('guide', key)}</li>`;
}
function libSaved() {             // only what the reader saved, in three groups; a group with nothing in it is not shown
  const groups = [['Saved Scripture', accSavedList('verse'), libVerse], ['Saved Investigations', accSavedList('essay'), libEssay], ['Saved Study Guides', accSavedList('guide'), libGuide]].filter(g => g[1].length);
  if (!groups.length) return `<div class="card libempty"><p><b>Your library is empty.</b></p><p>Explore the archive, then choose <b>Save</b> on an essay, a chapter, a verse, or a study guide to keep it here.</p>
    <p class="libgo"><a class="btn secondary" href="#/essays">Essays</a><a class="btn secondary" href="#/books">Scripture</a>${PROFILE.kcGuides && D.KG && D.KG.length ? '<a class="btn secondary" href="#/guides">Study guides</a>' : ''}</p></div>`;
  return groups.map(([name, items, row]) => `<h2 class="libh">${name} <span class="count">${items.length}</span></h2><ul class="libitems">${items.map(row).join('')}</ul>`).join('');
}
function viewMyLibrary() {
  if (!acc.ready) {
    const want = curHash(); deferTrack = true;
    accWhenReady().then(() => { if (curHash() === want) route(); });
    return `${backLink('#/')}<h1>My Library</h1><p class="lede" id="loadmsg" role="status">Opening your library…</p>`;
  }
  if (!acc.user) { setTimeout(() => accReplace('#/berean'), 0); return ''; }
  let welcome = false;
  try { welcome = sessionStorage.getItem('kc-welcome') === '1'; sessionStorage.removeItem('kc-welcome'); } catch (e) {}
  return `
  ${backLink('#/')}
  ${accPreview()}
  <section class="libhead">
    <p class="eyebrow">Kingdom Code ${ACC_ICON}</p>
    <h1>My Library</h1>
    <p>What you save from the archive: Scripture, investigations, and study guides.</p>
    ${welcome ? '<p class="libwelcome" role="status">Welcome, Berean. Your library is ready.</p>' : ''}
  </section>
  <div id="libsaved">${libSaved()}</div>
  <h2 class="libh">Account</h2>
  <div class="card libacct">
    <p>Signed in as <b>${esc(accEmail())}</b></p>
    <p class="libbtns"><button type="button" class="btn secondary" id="libout">Sign out</button><button type="button" class="btn secondary" id="libexport">Export my data</button></p>
    <div id="libdel"><button type="button" class="linkbtn danger" id="libdelask">Delete my account</button></div>
    <p class="cap">Everything in the archive stays open to you whether or not you have an account. <a href="#/privacy">Privacy</a></p>
  </div>`;
}
function wireLibrary() {
  const out = document.getElementById('libout'); if (!out) return;
  const ensureSnips = () => {                      // the opening words of each saved verse, once its book has loaded
    const els = [...document.querySelectorAll('[data-snip]')], books = [...new Set(els.map(el => (accScripture(el.dataset.snip) || {}).b).filter(Boolean))];
    books.forEach(b => ensureBook(b).then(() => {
      els.forEach(el => {
        const s = accScripture(el.dataset.snip); if (!s || s.b !== b) return;
        const vt = verseText(s.b, s.ch, s.vs); if (vt) el.innerHTML = fmtText(s.b, vt.text) + (s.ve > s.vs ? ' …' : '');
      });
    }).catch(() => {}));
  };
  ensureSnips();
  out.addEventListener('click', async () => {
    try { const sb = await accClient(); await sb.auth.signOut(); } catch (e) { try { localStorage.removeItem('kc-session'); } catch (x) {} }
    accSetUser(null); accChrome(); navigate('#/'); accSay('You are signed out.');
  });
  document.getElementById('libexport').addEventListener('click', () => {
    const data = {exported: new Date().toISOString(), email: accEmail(), saved: [...acc.saved].map(([k, at]) => { const i = k.indexOf('|'); return {kind: k.slice(0, i), key: k.slice(i + 1), saved: at}; })};
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    a.download = 'kingdom-code-library.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  const del = document.getElementById('libdel');
  del.addEventListener('click', async e => {
    if (e.target.id === 'libdelask') {
      del.innerHTML = `<div class="libwarn" role="alert"><p><b>Delete your account?</b> This permanently removes your account and everything you saved. It cannot be undone. You may want to export your data first.</p>
        <p class="libbtns"><button type="button" class="btn danger" id="libdelyes">Yes, delete everything</button><button type="button" class="btn secondary" id="libdelno">Cancel</button></p></div>`;
      document.getElementById('libdelyes').focus();
    } else if (e.target.id === 'libdelno') {
      del.innerHTML = '<button type="button" class="linkbtn danger" id="libdelask">Delete my account</button>';
    } else if (e.target.id === 'libdelyes') {
      e.target.disabled = true; e.target.textContent = 'Deleting…';
      try {
        const sb = await accClient(), r = await sb.rpc('delete_my_account');
        if (r.error) throw r.error;
        await sb.auth.signOut({scope: 'local'}).catch(() => {});
        try { localStorage.removeItem('kc-session'); } catch (x) {}
        accSetUser(null); accChrome(); navigate('#/'); accSay('Your account and saved items are deleted.');
      } catch (x) { e.target.disabled = false; e.target.textContent = 'Yes, delete everything'; accSay(accOops(x)); }
    }
  });
}

// ---------- the privacy page ----------
const PRIVACY_UPDATED = '21 October 2026';
function viewPrivacy() {
  const t = ACC_CFG.turnstileKey;
  return `
  ${backLink('#/')}
  <h1>Privacy</h1>
  <p class="lede">How Kingdom Code handles your information. You never need an account to read the archive.</p>
  <p class="cap">Last updated ${PRIVACY_UPDATED}</p>
  <div class="about">
    <h2>Reading the archive</h2>
    <p>Everything in the archive is open to you without an account. We count visits with GoatCounter, a cookieless analytics service, to learn which pages are read. Those counts are not linked to any account, and nothing is counted if your browser sends Do Not Track or Global Privacy Control.</p>
    <h2>If you become a Berean</h2>
    <p>An account holds two things: your <b>email address</b>, and the <b>items you choose to save</b> (a study guide, an essay, a chapter, a verse or a passage) with the date you saved each one. We do not ask for your name, we do not use a password, and we do not build a profile of you.</p>
    <h2>How we use it</h2>
    <p>Your email is used to send the one-time code you ask for, so you can sign in. Your saved items are used to show you your own library. That is all. We do not add you to a mailing list, we send no newsletters from your account, we do not use your information for advertising, and we do not sell or rent it. Following Kingdom Code on Substack is separate from your account.</p>
    <h2>Signing in on your device</h2>
    <p>After you sign in, your browser keeps you signed in on that device until you sign out. This uses your browser\u2019s storage rather than cookies. Reading settings such as text size, theme and your place in a book also stay in your browser, on your device, and are not sent to us.</p>
    <h2>Service providers</h2>
    <p>We rely on a few providers to run accounts. <b>Supabase</b> stores your email address and saved items. <b>Resend</b> delivers the sign-in email.${t ? ' <b>Cloudflare Turnstile</b> checks that a visitor is a person when you ask for a code.' : ''} <b>GoatCounter</b> provides the visit counts described above. Each handles information only to provide its service to us, and each may keep its own limited technical records under its own policies.</p>
    <h2>How long we keep it</h2>
    <p>We keep your email and saved items for as long as your account exists. Removing a saved item deletes it. Deleting your account removes your email address and every saved item from our records.</p>
    <h2>Your choices</h2>
    <p>In <a href="#/mylibrary">My Library</a> you can <b>export</b> your email and saved items as a file, <b>sign out</b>, and <b>delete your account</b>. Deleting is permanent and cannot be undone, so export first if you want a copy. If you want to change the email on your account, or have a question about your information, write to us.</p>
    <h2>Changes to this page</h2>
    <p>If this policy changes, we will update this page and the date at the top.</p>
    ${CONTACT_EMAIL ? `<p class="privcontact">For privacy inquiries, contact Rocka at <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>` : ''}
  </div>`;
}

if (ACC_ON) {
  addRoute('berean', () => viewBerean());
  addRoute('mylibrary', () => viewMyLibrary());
  addRoute('privacy', () => viewPrivacy());
  onPage(p => {
    accPage = p; accChrome(); accSaveBar(p);
    if (p[0] === 'read') accWireVerses();
    if (p[0] === 'berean') wireBerean();
    if (p[0] === 'mylibrary') wireLibrary();
  });
  accStart();
}

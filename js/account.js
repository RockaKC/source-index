// account.js: Berean reader accounts: Become a Berean, My Library, Save buttons, and the privacy page (the website only)
// Loaded as a plain script after js/guide.js; see index.html for the order. Shared names live in the page's global scope.
// The archive stays open to everyone; an account only gives a reader a private shelf: the guides, and what they chose to save.
// Sign-in is Supabase Auth (the official supabase-js, vendor/supabase.js, fetched only on account pages or for a reader who already has a session):
// the reader types their email, receives a one-time code, types it back. No password. Saved items live in one table, `saved`
// (supabase/schema.sql), that Postgres row-level security lets each reader see and change only for themselves.
// Off until profiles/site.js sets accounts: {url, key}; with it blank the site shows nothing of this.

const ACC_CFG = PROFILE.accounts || null;
const ACC_ON = !!(ACC_CFG && ACC_CFG.url && ACC_CFG.key);
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
  if (host) { host.insertAdjacentHTML('beforeend', html); return; }
  host = (t[0] === 'essay' && document.querySelector('#app .essaymeta')) || document.querySelector('#app h1');
  if (host) host.insertAdjacentHTML('afterend', `<div class="savebar">${html}</div>`);
}
function accRefreshButtons() {
  document.querySelectorAll('[data-save]').forEach(b => {
    const on = acc.saved.has(b.dataset.save);
    b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'Saved' : 'Save';
  });
}

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
  <section class="acct">
    <p class="eyebrow">Kingdom Code</p>
    <h1>Become a Berean.</h1>
    <p class="lede">A place for those who seek.</p>
    <p class="acctnote">In Acts 17:11 the Bereans received the word eagerly and examined the Scriptures daily to see whether what they heard was so.
      Explore the archive, examine Scripture, and keep what you find in a library of your own.</p>
    <div id="acctstep">${accEmailStep(t, '')}</div>
    <ul class="acctlist">
      <li><b>Your library.</b> Every Kingdom Code study guide, on one shelf.</li>
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
  accSet(kind, key, !acc.saved.has(b.dataset.save)).then(() => { if (b.closest('#libsaved')) route(); });
});

// ---------- My Library ----------
function accSavedList(kind) {       // saved items of one kind, newest first
  return [...acc.saved].filter(([k]) => k.startsWith(kind + '|')).map(([k, at]) => [k.slice(kind.length + 1), at]).sort((a, b) => b[1].localeCompare(a[1]));
}
function libGuides() {
  const gs = (PROFILE.kcGuides && D.KG) || [];
  const saved = new Set(accSavedList('guide').map(x => x[0]));
  const order = gs.slice().sort((a, b) => (saved.has(b.slug) ? 1 : 0) - (saved.has(a.slug) ? 1 : 0));
  return `<ul class="libguides">${order.map(g => `<li class="libguide">
    <a class="libcover" href="#/guides/${esc(g.slug)}" aria-hidden="true" tabindex="-1"><img src="${esc(g.cover)}" width="1200" height="675" alt="" loading="lazy"></a>
    <div class="libbody">
      <h3><a href="#/guides/${esc(g.slug)}">${esc(g.title)}</a></h3>
      <p class="gsub">${esc(g.sub)}</p>
      <p class="cap">${esc(guideMeta(g))}</p>
      <p class="libact"><a class="btn secondary" href="${esc(g.file)}" target="_blank" rel="noopener" download="${esc(g.slug)}.pdf" data-guide="${esc(g.slug)}">Read or download</a>${saveButton('guide', g.slug, 'btn secondary')}</p>
    </div></li>`).join('')}</ul>`;
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
function libSaved() {
  const es = accSavedList('essay'), vs = accSavedList('verse');
  if (!es.length && !vs.length) return `<div class="card libempty"><p>Your saved essays and Scripture references will appear here.</p><p class="cap">Look for <b>Save</b> on any essay, chapter, or verse.</p></div>`;
  return `${es.length ? `<h3>Essays <span class="count">${es.length}</span></h3><ul class="libitems">${es.map(libEssay).join('')}</ul>` : ''}
    ${vs.length ? `<h3>Scripture <span class="count">${vs.length}</span></h3><ul class="libitems">${vs.map(libVerse).join('')}</ul>` : ''}`;
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
  const guides = (PROFILE.kcGuides && D.KG) || [];
  return `
  ${backLink('#/')}
  <section class="libhead">
    <p class="eyebrow">Kingdom Code ${ACC_ICON}</p>
    <h1>My Library</h1>
    <p>Your investigations, Scripture references, and study guides. All in one place.</p>
    ${welcome ? '<p class="libwelcome" role="status">Welcome, Berean. Your library is ready.</p>' : ''}
  </section>
  ${guides.length ? `<h2 class="libh">Study Guides <span class="count">${plural(guides.length, 'guide')} available</span></h2>${libGuides()}` : ''}
  <h2 class="libh">Saved Investigations</h2>
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
function viewPrivacy() {
  const t = ACC_CFG.turnstileKey;
  return `
  ${backLink('#/')}
  <h1>Privacy</h1>
  <p class="lede">What Kingdom Code keeps about you, why, and how to remove it.</p>
  <div class="about">
    <h2>Reading is private</h2>
    <p>You do not need an account to read anything here. The archive counts visits with cookieless analytics (GoatCounter) that do not identify you, and it is silent if your browser sends Do Not Track or Global Privacy Control.</p>
    <h2>If you become a Berean</h2>
    <p>We keep your <b>email address</b> and the <b>list of items you save</b> (a guide, an essay, a chapter or a verse, and when you saved it). Nothing else: no name, no password, no profile.</p>
    <p>We use your email only to send you the one-time code you ask for. We do not add you to a mailing list, we do not send newsletters from your account, and we do not sell, rent, or share your data. Following Kingdom Code on Substack is separate.</p>
    <h2>Who handles it</h2>
    <p>Your account and saved items are stored by <b>Supabase</b>. The sign-in code is delivered by <b>Resend</b>.${t ? ' <b>Cloudflare Turnstile</b> checks that a visitor is a person when you ask for a code.' : ''} They process your data only to provide these services.</p>
    <h2>Your control</h2>
    <p>In <a href="#/mylibrary">My Library</a> you can <b>export</b> everything we hold about you as a file, <b>sign out</b>, and <b>delete your account</b>. Deleting removes your email and every saved item. It cannot be undone.</p>
    ${CONTACT_EMAIL ? `<p>Questions about your data: <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a>.</p>` : ''}
  </div>`;
}

if (ACC_ON) {
  addRoute('berean', () => viewBerean());
  addRoute('mylibrary', () => viewMyLibrary());
  addRoute('privacy', () => viewPrivacy());
  onPage(p => {
    accChrome(); accSaveBar(p);
    if (p[0] === 'berean') wireBerean();
    if (p[0] === 'mylibrary') wireLibrary();
  });
  accStart();
}

// updates.js: the app's version, and a check for a newer one
// Loaded as a plain script after pages.js; see index.html for the order. Shared names live in the page's global scope.
// Switched on by PROFILE.appUpdates (profiles/app.js). The app knows its own version from app-version.json, which the build
// (tools/build_app.py) writes into the app's files. The newest version is asked of GitHub, where the app is published, and only
// when the reader taps "Check for updates": the app never asks on its own, and sends nothing but the request itself.
// "Update now" (inside the Android app) downloads the new file through the native Updater plugin (android/.../UpdaterPlugin.java),
// shows the progress, and opens Android's installer, so the reader never leaves the app for a browser.

const UPDATE_API = 'https://api.github.com/repos/RockaKC/source-index/releases/latest';
const versionParts = v => { const m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/.exec(String(v || '').trim()); return m ? m.slice(1).map(Number) : null; };
const compareVersions = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; return 0; };
const PREVIEW_VERSION = '0.0.0';                       // what a build that is not a release is stamped with

async function appVersion() {                          // '1.1.4', '0.0.0' for a preview build, or null if the app cannot say
  try {
    const r = await fetch('app-version.json', {cache: 'no-store'});
    if (!r.ok) return null;
    const j = await r.json();
    return versionParts(j.version) ? String(j.version).trim() : null;
  } catch (e) { return null; }
}
const versionLine = v => v === null ? 'This app could not tell which version it is.'
  : v === PREVIEW_VERSION ? 'This is a preview build, not a released version.' : `You have version ${v}.`;

async function latestRelease() {                       // {version, date} or {error}
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(UPDATE_API, {headers: {Accept: 'application/vnd.github+json'}, signal: ctl.signal});
    if (r.status === 403 || r.status === 429) return {error: 'GitHub is limiting requests from this connection right now. Try again in a few minutes.'};
    if (!r.ok) return {error: 'The newest version could not be found. Try again later.'};
    const j = await r.json(), m = /^app-v(\d{1,2}\.\d{1,2}\.\d{1,2})$/.exec(String(j.tag_name || ''));
    if (!m) return {error: 'The newest version could not be read. Try again later.'};
    const file = (j.assets || []).find(a => a.name === `KC-Tewahedo-Bible-${m[1]}.apk`), sum = /^sha256:([0-9a-f]{64})$/.exec(file && file.digest || '');
    return {version: m[1], date: j.published_at || '', apk: file && sum ? file.browser_download_url : '', sha256: sum ? sum[1] : ''};
  } catch (e) {
    return {error: 'Could not reach GitHub. Check your connection and try again.'};
  } finally { clearTimeout(timer); }
}

const nativeUpdater = () => (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Updater) || null;   // only inside the Android app
const downloadLink = v => `<p class="act"><a class="btn primary" href="${APP_DOWNLOAD}" target="_blank" rel="noopener">Download ${esc(v)}</a></p>`;
const upPercent = (got, total) => total > 0 ? Math.min(100, Math.floor(got * 100 / total)) : null;

function viewUpdates() {
  return `
  ${backLink('#/about')}
  <h1>App updates</h1>
  <p class="lede" id="up-version">&nbsp;</p>
  <p class="act"><button class="btn primary" type="button" id="up-check">Check for updates</button></p>
  <div class="bkcard" id="up-result" hidden role="status" aria-live="polite"></div>
  <p class="cap" style="margin-top:var(--s3)">Checking asks GitHub, where the app is published, for the newest version. The app checks only when you tap the button, and sends nothing else. Update now downloads the new version from the same place, checks the file against the checksum GitHub lists for it, and hands it to Android to install over this app.</p>`;
}
function showUpdateResult(cur, res) {
  const box = document.getElementById('up-result'); if (!box) return;
  let html;
  if (res.error) html = `<p>${esc(res.error)}</p>`;
  else {
    const have = versionParts(cur), want = versionParts(res.version), cmp = have ? compareVersions(have, want) : -1;
    const day = res.date && !isNaN(new Date(res.date)) ? ` It came out on ${new Date(res.date).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}.` : '';
    if (cur === PREVIEW_VERSION || !have) html = `<p><b>The newest released version is ${esc(res.version)}.</b>${esc(day)}</p>
      <p class="act"><a class="btn primary" href="${APP_DOWNLOAD}" target="_blank" rel="noopener">Download ${esc(res.version)}</a></p>`;
    else if (cmp >= 0) html = `<p><b>You are up to date.</b> ${cmp === 0 ? `Version ${esc(cur)} is the newest.` : `Version ${esc(cur)} is newer than the newest release, ${esc(res.version)}.`}</p>`;
    else if (nativeUpdater() && res.apk) html = `<p><b>Version ${esc(res.version)} is available.</b> You have ${esc(cur)}.${esc(day)}</p>
      <p class="act"><button class="btn primary" type="button" id="up-now" data-version="${esc(res.version)}" data-apk="${esc(res.apk)}" data-sha="${esc(res.sha256)}">Update now</button></p>
      <div id="up-run" hidden></div>
      <p class="cap" style="margin-top:var(--s2)">Your notes, favorites, highlights and history stay. To be safe, <a href="#/backup" style="color:var(--accent)">save a backup</a> first.</p>`;
    else html = `<p><b>Version ${esc(res.version)} is available.</b> You have ${esc(cur)}.${esc(day)}</p>
      ${downloadLink(res.version)}
      <p style="margin-top:var(--s2)">When the download finishes, open the file and tap Install. It installs over this app, and your notes, favorites, highlights and history stay. To be safe, <a href="#/backup" style="color:var(--accent)">save a backup</a> first.</p>`;
  }
  box.innerHTML = html; box.hidden = false;
}

// The update, start to finish, in the box under the button: a bar that fills as the file arrives, then Android's own installer.
// Every outcome leaves the reader something to tap: Continue after allowing installs, Try again after a failure.
async function runUpdate(btn) {
  const U = nativeUpdater(), run = document.getElementById('up-run'); if (!U || !run) return;
  const {version, apk, sha} = btn.dataset;
  const paint = (text, pct) => {
    run.hidden = false;
    run.innerHTML = `<div class="upprog${pct === null ? ' wait' : ''}" role="progressbar" aria-label="Downloading version ${esc(version)}" aria-valuemin="0" aria-valuemax="100"${pct === null ? '' : ` aria-valuenow="${pct}"`}><i></i></div><p class="cap" id="up-status" role="status" aria-live="polite">${esc(text)}</p>`;
    if (pct !== null) run.querySelector('.upprog').style.setProperty('--p', String(pct / 100));
  };
  const fail = (msg, label) => {
    run.hidden = false;
    run.innerHTML = `<p>${esc(msg)}</p><p class="act"><button class="btn primary" type="button" id="up-retry">${esc(label || 'Try again')}</button></p>
      <p class="cap">Or <a href="${APP_DOWNLOAD}" target="_blank" rel="noopener" style="color:var(--accent)">download it in your browser</a>.</p>`;
    btn.disabled = false;
  };
  btn.disabled = true; btn.textContent = 'Updating…';
  paint('Starting the download…', 0);
  let sub;
  try {
    sub = await U.addListener('progress', e => {
      const pct = upPercent(e.received, e.total), st = document.getElementById('up-status'), bar = run.querySelector('.upprog');
      if (!st || !bar) return;
      if (pct === null) { st.textContent = `Downloading… ${(e.received / 1048576).toFixed(1)} MB`; return; }
      bar.style.setProperty('--p', String(pct / 100)); bar.setAttribute('aria-valuenow', String(pct)); st.textContent = `Downloading… ${pct}%`;
    });
    await U.download({url: apk, sha256: sha});
  } catch (e) {
    if (sub) sub.remove();
    return fail((e && e.message) || 'The download did not finish. Check your connection and try again.');
  }
  if (sub) sub.remove();
  paint('Opening the installer…', null);
  try {
    const r = await U.install();
    if (r && r.state === 'permission') {
      run.innerHTML = `<p><b>One step first.</b> Android needs you to allow this app to install updates. Turn on <b>Allow from this source</b>, come back here, and tap Continue.</p>
        <p class="act"><button class="btn primary" type="button" id="up-retry" data-install="1">Continue</button></p>`;
      btn.disabled = false; btn.textContent = 'Update now';
    } else {
      run.innerHTML = `<p><b>Ready.</b> Tap <b>Install</b> in the window Android just opened. The app restarts on the new version.</p>
        <p class="act"><button class="btn secondary" type="button" id="up-retry" data-install="1">Open the installer again</button></p>`;
      btn.disabled = false; btn.textContent = 'Update now';
    }
  } catch (e) { fail((e && e.message) || 'The installer could not be opened.'); }
}
async function reinstall(btn) {                         // the file is already saved: only the installer is asked for again
  const U = nativeUpdater(), run = document.getElementById('up-run'), now = document.getElementById('up-now'); if (!U || !run || !now) return;
  try {
    const r = await U.install();
    if (r && r.state === 'permission') return;          // still not allowed: the settings page is open again
    run.innerHTML = `<p><b>Ready.</b> Tap <b>Install</b> in the window Android just opened. The app restarts on the new version.</p>
      <p class="act"><button class="btn secondary" type="button" id="up-retry" data-install="1">Open the installer again</button></p>`;
  } catch (e) { btn.dataset.install = ''; runUpdate(now); }   // the saved file is gone: start over
}

if (PROFILE.appUpdates) {
  addRoute('updates', () => viewUpdates());
  onPage(async p => {
    if (p[0] === 'updates') { const v = await appVersion(), el = document.getElementById('up-version'); if (el) el.textContent = versionLine(v); }
    if (p[0] === 'about') { const v = await appVersion(), el = document.getElementById('about-version'); if (el && v && v !== PREVIEW_VERSION) el.textContent = `Version ${v}. `; }
  });
  document.addEventListener('click', e => {
    const now = e.target.closest('#up-now'), retry = e.target.closest('#up-retry');
    if (now && !now.disabled) runUpdate(now);
    else if (retry) { if (retry.dataset.install) reinstall(retry); else { const n = document.getElementById('up-now'); if (n) runUpdate(n); } }
  });
  document.addEventListener('click', async e => {
    const btn = e.target.closest('#up-check'); if (!btn || btn.disabled) return;
    const box = document.getElementById('up-result');
    btn.disabled = true; btn.textContent = 'Checking…'; box.hidden = true;
    const [cur, res] = await Promise.all([appVersion(), latestRelease()]);
    if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Check again'; showUpdateResult(cur, res); }
  });
}

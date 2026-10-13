// backup.js: back up and restore what a reader keeps on the phone
// Loaded as a plain script after data/site.js; see index.html for the order. Shared names live in the page's global scope.
// Switched on by PROFILE.verseTools (profiles/app.js). Uses the marks (js/marks.js) and the reading history (js/readerbar.js).

// A backup is one JSON file: {app, version, saved, marks, history}. Restoring ADDS it to the phone and never removes anything:
// for a verse on both, the newer record wins; history is the union, newest first. Nothing is applied until the reader has seen
// what it would do and confirmed.
const BACKUP_APP = 'kc-tewahedo-bible', BACKUP_VERSION = 1, BACKUP_MAX_CHARS = 5e6, BACKUP_MAX_VERSES = 20000;

const backupObject = () => ({app: BACKUP_APP, version: BACKUP_VERSION, saved: new Date().toISOString(), marks: freshMarks(), history: readHistory()});
const backupName = () => `kc-tewahedo-bible-backup-${new Date().toISOString().slice(0, 10)}.json`;
function countMarks(m) {
  const c = {f: 0, h: 0, n: 0};
  for (const k in m) { if (m[k].f) c.f++; if (m[k].h) c.h++; if (m[k].n) c.n++; }
  return c;
}
const keptLine = (c, chapters) => `${plural(c.f, 'favorite')}, ${plural(c.h, 'highlight')}, ${plural(c.n, 'note')} and ${plural(chapters, 'chapter')} of history`;

// ---------- reading a backup ----------
function parseBackup(text) {
  if (text.length > BACKUP_MAX_CHARS) return {error: 'That file is too large to be a backup.'};
  let j;
  try { j = JSON.parse(text); } catch (e) { return {error: 'That could not be read as a backup.'}; }
  if (!j || j.app !== BACKUP_APP || !j.marks || typeof j.marks !== 'object' || Array.isArray(j.marks)) return {error: 'That is not a KC Tewahedo Bible backup.'};
  if (typeof j.version !== 'number' || j.version > BACKUP_VERSION) return {error: 'That backup comes from a newer version of the app. Update the app, then try again.'};
  const keys = Object.keys(j.marks);
  if (keys.length > BACKUP_MAX_VERSES) return {error: 'That backup has too many entries.'};
  const marks = {}; let skipped = 0;
  for (const k of keys) {                                      // keep only what the app itself could have written
    const r = j.marks[k], m = /^(\d+):(\d+):(\w+)$/.exec(k);
    if (!m || !r || typeof r !== 'object' || !hasChapter(+m[1], +m[2])) { skipped++; continue; }
    const rec = {t: Number.isFinite(r.t) ? r.t : 0};
    if (r.f) rec.f = 1;
    if (HL_NAME[r.h]) rec.h = r.h;
    if (typeof r.n === 'string' && r.n.trim()) rec.n = r.n.trim().slice(0, NOTE_MAX);
    if (!rec.f && !rec.h && !rec.n) { skipped++; continue; }
    marks[k] = rec;
  }
  const history = [];
  if (Array.isArray(j.history)) for (const x of j.history.slice(0, 500)) if (Array.isArray(x) && hasChapter(+x[0], +x[1]) && Number.isFinite(x[2])) history.push([+x[0], +x[1], x[2]]);
  return {marks, history, skipped, saved: j.saved};
}
function planMerge(p) {                                         // what restoring would do, without doing it
  const mine = freshMarks(), plan = {added: 0, updated: 0, same: 0, keys: []};
  for (const k of Object.keys(p.marks)) {
    const cur = mine[k];
    if (!cur) { plan.added++; plan.keys.push(k); }
    else if (p.marks[k].t > (cur.t || 0)) { plan.updated++; plan.keys.push(k); }
    else plan.same++;
  }
  const have = new Set(readHistory().map(x => x[0] + ':' + x[1]));
  plan.chapters = p.history.filter(x => !have.has(x[0] + ':' + x[1])).length;
  return plan;
}
function applyMerge(p, plan) {
  const m = freshMarks();
  for (const k of plan.keys) m[k] = p.marks[k];
  store.set(MARKS_KEY, JSON.stringify(m));
  const best = new Map();
  for (const x of readHistory().concat(p.history)) { const id = x[0] + ':' + x[1]; if (!best.has(id) || best.get(id)[2] < x[2]) best.set(id, x); }
  const merged = [...best.values()].sort((a, c) => c[2] - a[2]).slice(0, HISTORY_MAX);
  store.set('kc-history', JSON.stringify(merged));
  if (merged.length) store.set('kc-last', `${merged[0][0]}/${merged[0][1]}`);
}

// ---------- saving a backup ----------
// On the phone: write the file into the app's private cache and open the share sheet, where the reader chooses Drive, Files,
// a message to themselves, and so on. In a browser: a download. If neither works, the backup is shared or copied as text, which
// the page can restore from too.
async function saveBackup() {
  const json = JSON.stringify(backupObject()), name = backupName(), title = 'KC Tewahedo Bible backup';
  const plugins = (window.Capacitor && Capacitor.Plugins) || {}, FS = plugins.Filesystem, SH = plugins.Share;
  if (native) {
    try {
      if (FS && SH) {
        const r = await FS.writeFile({path: name, data: json, directory: 'CACHE', encoding: 'utf8'});
        await SH.share({title, files: [r.uri], dialogTitle: 'Save your backup'});
        return 'Choose where to keep the backup file.';
      }
    } catch (e) {}
    try { if (SH) { await SH.share({title, text: json, dialogTitle: 'Save your backup'}); return 'Shared as text. To restore it, paste it under Restore.'; } } catch (e) {}
  } else {
    try {
      const url = URL.createObjectURL(new Blob([json], {type: 'application/json'})), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return 'Backup saved to your downloads.';
    } catch (e) {}
  }
  return (await copyText(json)) ? 'A file could not be saved, so the backup was copied. Paste it into a note to keep it, and paste it under Restore to use it.' : 'The backup could not be saved.';
}

// ---------- the page ----------
function viewBackup() {
  return `
  ${backLink('#/')}
  <h1>Back up and restore</h1>
  <p class="lede">Your favorites, highlights, notes and reading history live only on this phone. Save a backup to keep a copy, or to move them to another phone, then restore it there.</p>
  <p class="lede" id="bk-counts" style="margin-top:8px"></p>
  <p class="act"><button class="btn primary" type="button" id="bk-save">Save a backup</button></p>
  <h2>Restore</h2>
  <p class="lede" style="margin-top:8px">Choose a backup you saved. It is added to what is on this phone, and nothing here is removed.</p>
  <p class="act"><label class="btn secondary" for="bk-file">Choose a backup file</label><input class="sr" type="file" id="bk-file" accept="application/json,.json,text/plain"></p>
  <details class="bkpaste"><summary>Paste a backup instead</summary>
    <textarea id="bk-text" rows="5" placeholder="Paste the backup text here" spellcheck="false" autocapitalize="none"></textarea>
    <p class="act"><button class="btn secondary" type="button" id="bk-check">Check it</button></p></details>
  <div class="bkcard" id="bk-preview" hidden></div>
  <p class="cap bkmsg" id="bk-msg" role="status" aria-live="polite"></p>`;
}
let pendingRestore = null;
const bkSay = msg => { const el = document.getElementById('bk-msg'); if (el) el.textContent = msg || ''; };
function bkCounts() {
  const el = document.getElementById('bk-counts');
  if (el) el.textContent = `On this phone now: ${keptLine(countMarks(freshMarks()), readHistory().length)}.`;
}
function bkPreview(p) {                                         // show what restoring would do, and wait for a yes
  const box = document.getElementById('bk-preview');
  pendingRestore = null; box.hidden = true; bkSay('');
  if (p.error) { bkSay(p.error); return; }
  const plan = planMerge(p);
  if (!plan.keys.length && !plan.chapters) { bkSay('Everything in that backup is already on this phone.'); return; }
  pendingRestore = {p, plan};
  const d = p.saved && !isNaN(new Date(p.saved)) ? ` from ${new Date(p.saved).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}` : '';
  box.innerHTML = `<p><b>This backup${d} holds ${esc(keptLine(countMarks(p.marks), p.history.length))}.</b></p>
    <p>Restoring adds ${plural(plan.added, 'new verse')} and updates ${plural(plan.updated, 'verse')} with their newer version, and brings back ${plural(plan.chapters, 'chapter')} of history.
    ${plan.same ? `${plural(plan.same, 'verse')} ${plan.same === 1 ? 'is' : 'are'} already here. ` : ''}Nothing on this phone is removed.${p.skipped ? ` ${p.skipped} ${p.skipped === 1 ? 'entry' : 'entries'} could not be used and ${p.skipped === 1 ? 'was' : 'were'} skipped.` : ''}</p>
    <p class="act"><button class="btn primary" type="button" id="bk-apply">Restore</button> <button class="btn secondary" type="button" id="bk-cancel">Cancel</button></p>`;
  box.hidden = false;
}
if (PROFILE.verseTools) {
  addRoute('backup', () => viewBackup());
  onPage(p => { if (p[0] === 'backup') { pendingRestore = null; bkCounts(); } });
  document.addEventListener('click', async e => {
    const id = (e.target.closest('button') || {}).id;
    if (id === 'bk-save') { bkSay(''); bkSay(await saveBackup()); }
    else if (id === 'bk-check') bkPreview(parseBackup(document.getElementById('bk-text').value.trim()));
    else if (id === 'bk-cancel') { pendingRestore = null; document.getElementById('bk-preview').hidden = true; bkSay(''); }
    else if (id === 'bk-apply' && pendingRestore) {
      const {p} = pendingRestore, plan = planMerge(p);       // planned again, against what is on the phone this instant
      applyMerge(p, plan); pendingRestore = null;
      document.getElementById('bk-preview').hidden = true; bkCounts();
      bkSay(`Restored: ${plural(plan.added + plan.updated, 'verse')} and ${plural(plan.chapters, 'chapter')} of history.`);
    }
  });
  document.addEventListener('change', async e => {
    if (e.target.id !== 'bk-file' || !e.target.files[0]) return;
    const file = e.target.files[0];
    e.target.value = '';                                        // so choosing the same file again still fires
    if (file.size > BACKUP_MAX_CHARS) { bkPreview({error: 'That file is too large to be a backup.'}); return; }
    try { bkPreview(parseBackup(await file.text())); } catch (err) { bkPreview({error: 'That file could not be read.'}); }
  });
}

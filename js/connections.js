// connections.js: the archive's cross-links. Essays and historical subjects (Early Church figures, Names) point at each other.
// Loaded as a plain script after js/guide.js; see index.html for the order. Shared names live in the page's global scope.
// One set of pairs drives both directions: D.EL (tools/connections.py: essays that cite or discuss a figure) and each Name's own essay list
// (D.PP). A subject's page lists its essays, and an essay's page lists its subjects, from the same pairs, so they cannot disagree.
// To connect a new kind of subject (manuscripts, biblical books, ancient civilizations): add one entry to SUBJECT_KINDS.

const SUBJECT_KINDS = [
  {id: 'church', label: 'Early Church', list: () => (PROFILE.earlyChurch && D.EC) || [],
    href: s => '#/church/' + s.slug, pairs: s => (D.EL || {})['church/' + s.slug] || []},        // [essay id, 'c' cited | 'd' discussed, sentences]
  {id: 'person', label: 'Names', list: () => D.PP || [],
    href: s => '#/person/' + s.slug, pairs: s => (s.essays || []).map(p => [p, 'p', 0])},          // the editor's own list for the profile
];
const CONN_LABEL = {c: 'Cited', d: 'Discussed', p: 'Featured'};
let connIndex = null;
function connections() {
  if (connIndex) return connIndex;
  const onList = new Set(essayIds().map(String)), bySubject = new Map(), byEssay = new Map(), seen = new Set();
  for (const kind of SUBJECT_KINDS) for (const s of kind.list()) {
    const key = kind.id + '/' + s.slug, rows = [];
    for (const [pid, how, n] of kind.pairs(s)) {
      const id = String(pid), pair = key + '|' + id;
      if (!onList.has(id) || seen.has(pair)) continue;                     // an essay not on the site's lists, or a pair already counted
      seen.add(pair);
      rows.push({pid: id, how, n});
      if (!byEssay.has(id)) byEssay.set(id, []);
      byEssay.get(id).push({key, how, name: s.name, href: kind.href(s), group: kind.label});
    }
    const order = {c: 0, d: 1, p: 2};
    rows.sort((a, b) => order[a.how] - order[b.how] || P[b.pid][3].localeCompare(P[a.pid][3]));      // cited first, then newest
    bySubject.set(key, rows);
  }
  return (connIndex = {bySubject, byEssay});
}

// On a subject's page: the essays that cite or discuss it, each marked Cited or Discussed.
function featuredSection(key, name) {
  if (!PROFILE.connections) return '';
  const rows = connections().bySubject.get(key) || [], how = new Map(rows.map(r => [r.pid, r.how]));
  return citedSection(rows.map(r => r.pid), `No Kingdom Code essay features ${name} yet.`,
    `${plural(rows.length, 'Kingdom Code essay')} ${rows.length === 1 ? 'cites or discusses' : 'cite or discuss'} ${esc(name)}. Cited means the essay uses ${esc(name)}’s own writing.`,
    pid => CONN_LABEL[how.get(String(pid))], 'Featured in Kingdom Code');
}

// On an essay's Sources page: the subjects it is connected to.
function connectionChips(pid) {
  if (!PROFILE.connections) return '';
  const list = connections().byEssay.get(String(pid)) || [];
  if (!list.length) return '';
  return `<h2>Connected in the archive</h2><ul class="chips">${list.map(c =>
    `<li><a class="chip" href="${c.href}" aria-label="${esc(c.name)}, ${esc(c.group)}">${esc(c.name)}</a></li>`).join('')}</ul>`;
}

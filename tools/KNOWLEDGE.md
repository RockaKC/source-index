# Connecting figures: how to add a connection

A figure is a `person` node with a profile (the Names pages). Everything below is plain rows in `kc.db`; the website reads them with `python3 tools/export_site.py <db>`. Write changes as a reviewed SQL patch in `tools/patches/` and apply it to a **new** copy with `python3 tools/patch_db.py <patch.sql> <old.db> <new.db>`, as for any other edit.

**Nothing an AI adds is public until Boss confirms it.** Insert with `origin = 'ai'` and `confirmed = 0`; the site ignores those rows (a preview build in a scratch copy can show them with `KC_SHOW_PROPOSED=1`). Boss confirms with `update links set confirmed = 1 where id = ...`.

## 1. The name an essay uses (so the figure is linked inside essays)
```sql
insert into node_aliases (node_id, alias, note) values ((select id from nodes where slug = 'enoch'), 'Enoch', 'the person, and the books that bear his name');
```
One row per spelling the essays use, including the Septuagint spelling (`Noe`). A name belongs to one figure (the database refuses a duplicate, in any capitalisation). Names of three or more letters.

## 2. An essay discusses a figure (so the name is linked in the essay and the essay is listed on the figure's page)
```sql
insert into links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence)
values (1349, (select id from nodes where slug = 'noah'), 'about', 'Reads Noah as the remnant after the verdict.', 'ai', 0, 'editorial', 'Section 3, "The Remnant"');
```
Only the first mention of the name in the essay's own words is linked (never inside a quotation, a heading or another link), and only in an essay whose text is on the site. The essay's words are never changed.
`python3 tools/knowledge.py kc.db` lists, for each figure, the essays that use the name but are not connected yet. Read each one before connecting it.

## 3. Two figures are connected (shown on both profiles, each with its basis and evidence)
```sql
insert into links (from_node, to_node, link_type, note, origin, confirmed, basis, evidence)
values ((select id from nodes where slug = 'enoch'), (select id from nodes where slug = 'noah'), 'ancestor_of',
        'Why they are connected, in a sentence a reader can check.', 'ai', 0, 'scripture', 'Genesis 5:21; Genesis 5:25; Genesis 5:28-29');
```
Types (each shows from the other side by its inverse, from the same row): `ancestor_of` / `descendant_of`, `teacher_of` / `student_of`, `attests` / `attested_by`, and the two-way `associated_with`, `contemporary_of`, `related_manuscript`.

`basis` says what the connection rests on, and the page shows it, so the kinds are never treated as equal:
`scripture` (a canonical text, including 1 Enoch and Jubilees) · `church_tradition` · `ancient_source` (a writer or manuscript outside the canon) · `scholarly_inference` · `editorial` (Kingdom Code's own reading).
`evidence` names where: verse references in the archive's stored numbering, separated by `;` (each becomes a link), or the work and place for a source. A confirmed relationship without a basis and evidence is refused by the database.

## 4. Anything involving an Early Church figure or a word study
Those pages are kept in `tools/curated.json`, not as nodes in the database, so their connections are hand-kept there too, in two places, and shown from the same Connections section:
- `connections`: one row per connection, written once and shown on both pages with the inverse wording. Keys are `person/<slug>`, `church/<slug>` or `word/<slug>`; two figures with profiles are connected in the database (section 3), never here.
  ```json
  {"a": "person/enoch", "b": "church/tertullian", "as": "attested_by", "why": "…", "basis": "ancient_source",
   "ev": [{"l": "On the Apparel of Women 1.3", "essay": 181}, {"l": "Genesis 5:24", "r": [1, 5, 24, 24]}]}
  ```
  Evidence is a list: words only, `r` for a verse in the stored text (`[book, chapter, first, last]`, a link), or `essay` for the Kingdom Code essay that quotes the source (a link). **Cite a primary source only through an essay that quotes it or a text Boss supplied; never from memory.**
- `scripture` on an Early Church entry: the passages the figure is tied to, `{"t": title, "g": note, "refs": [[book, chapter, first, last]], "basis": …, "ev": […]}`. These also put the figure on that Bible page as a link (never as commentary: the Bible pages stay free of it).
The export refuses anything it cannot stand behind: an unknown page, a missing basis, reason or evidence, a verse not in the stored text, an essay not on the site's lists, or the same connection written twice.

## Which pages show what
A name in an essay links to the figure (people connected to the essay in the database; Early Church figures the essay *cites or discusses*, which `tools/connections.py` decides). A profile, an Early Church page and a word study each list their Connections. A Bible chapter or verse lists, as links only, the figures and witnesses tied to it.

## Rules
- Do not invent: a relationship needs a verse, a source or a reason Boss can check. Do not type primary-source text from memory. Write notes with the site's typography (curly quotes and apostrophes ’ “ ”).
- The figures keep the Christian framework: Scripture first; what Scripture says, what Christian tradition keeps and what historians establish stay separate (that is what `basis` is for). Do not describe Enoch or Jubilees with the word "tradition".
- Christ is the centre, not one figure among others: do not connect him with `contemporary_of` or `associated_with`. Write about him from Scripture on a subject page.

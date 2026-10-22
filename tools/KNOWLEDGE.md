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

## Rules
- Do not invent: a relationship needs a verse, a source or a reason Boss can check. Do not type primary-source text from memory. Write notes with the site's typography (curly quotes and apostrophes ’ “ ”).
- The figures keep the Christian framework: Scripture first; what Scripture says, what Christian tradition keeps and what historians establish stay separate (that is what `basis` is for). Do not describe Enoch or Jubilees with the word "tradition".
- Christ is the centre, not one figure among others: do not connect him with `contemporary_of` or `associated_with`. Write about him from Scripture on a subject page.

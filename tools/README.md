# Source Index export

Rebuilds the site's data from the Kingdom Code SQLite database.

```
python3 tools/export_site.py /path/to/kc_v13.db --check   # show what would change, write nothing
python3 tools/export_site.py /path/to/kc_v13.db           # rebuild index.html data + bible/
```

Needs Python 3 only. No packages.

## What it changes

- `bible/<book id>.json`: every verse of one book, fetched by the page only when a reader opens a verse or chapter in a book no essay cites. Chapters essays cite are inlined in `index.html`. The old single `bible.json` is removed.
- `index.html`: the single `const D = {...};` line. Nothing else in the file is touched.

Running it twice in a row changes nothing the second time.

## Publication rules

- Only articles with status `published` appear. Draft citations never reach the page.
- Quips are left out. `tools/curated.json` lists a few other published articles the page holds back.
- Citations the database marks `review` (unconfirmed numbering) are left out until resolved.
- Jubilees (R. H. Charles, 1902, public domain) is in `kc_v17.db` and is exported like 1 Enoch. Verse numbers are Charles's and can differ from other editions, which the credits page says.
- A citation at a verse missing from the stored text (for example Acts 8:37, which the Berean Literal Bible omits) is still shown as a hit. The verse page lists the essay without verse text, and the report names each one so the database can be checked.
- Raw view counts do not leave the database. The page gets a ranking order only.

## English and Septuagint numbering

The page converts typed English references to the Septuagint numbers the text uses, from `verse_map` in the database. The Psalms have a complete map. Other books have only the verses your published essays cite (dataset `kc_cited_remaps`), so the page marks those books as numbered differently from English Bibles and tells a reader who typed an unmapped number. A book's map is treated as complete only if its English chapters and verses run without gaps.

## Hebrew and Greek lexicon

`tools/import_lexicon.py LEXICON_DIR kc_v15.db kc_v16.db` loads STEPBible's brief Hebrew and Greek lexicons (CC BY 4.0) into a new copy of the database: about 22,700 entries in the `lexicon` table, with the license, credit line and list of changes recorded in `datasets`. The input database is never modified, the output must not already exist, and the source files are not copied into this repository. Each entry is an extended Strong's key such as `H5315G`, so one base number can carry several senses. The site uses it for the word entries in `tools/curated.json`: each form carries a Strong's number in `n` (for example `H5959`). A bare number means the main sense and also lists the other senses; a number with a letter (`H3568A`) names one exact entry, which is how to pick the right sense when a number covers unrelated words. The exporter pulls those entries' text from the database into the page's `LX` data, applies the typographical corrections listed under `lexicon_fixes` in `curated.json`, and adds the "STEP Bible (www.STEPBible.org)" credit to Sources and credits. It stops if any link does not resolve, and it needs a database that has the lexicon loaded (kc_v16 or later). Link by number, not by spelling: matching by transliteration once paired "rib" with a word meaning "to pray".

## Visit counts

The page can count visits without cookies or personal data. It is off until `ANALYTICS` in `index.html` names a provider and a site (`goatcounter` with your GoatCounter code, or `umami` with your website id). While blank it loads nothing and sends nothing.

Counted: page views under readable names (`/verse/Genesis/6/4`); the kind of search made (reference, word, title); searches that find nothing, with the words typed (capped at 60 characters); verses with no essay (`miss/verse`), which is demand for new writing; typed English numbers that could not be converted; clicks out to essays (per essay), Patreon, Substack, Ko-fi and email; and opens of the support window. The Ko-fi form inside the window is Ko-fi's and cannot be counted.

Guards: counts only on the hostnames in `ANALYTICS.hosts` (the live domain, so development is never counted), never when the browser sends Do Not Track or Global Privacy Control, and the internal `#/cta` tool is not counted. When counting is on, Sources and credits tells readers.

## Translation tier list

The page at `#/translations` shows the New Testament translation tier list from `tiers` in `tools/curated.json`: tiers, one line per translation, a how-to-use summary and a link to the full essay. It mirrors the published essay (`essay` is its piece id), so edit the file when the essay changes. The exporter stops if that essay is not a published essay on the page.

## Biographical pages

`people` in `tools/curated.json` holds short profiles shown at `#/person/<slug>` (the first is `enoch`): a few hand-written sentences, the verses where the figure appears in the stored text, and a curated list of essays. They are listed at `#/names` (linked from the menu and the home page); each needs a one-line `line` for that list. The exporter stops if a verse is not fully in the stored text or an essay is not published on the page. Text is written and approved by the editor.

## What stays out of the repo

The database file is never copied here (`.gitignore` blocks `*.db`). The exporter does not read the patron, pledge, income or identity tables. It stops if an email address or an unpublished item turns up in the output.

## Hand-kept content: `tools/curated.json`

Things that live only on the page: question paths, the Hebrew and Greek word entries, canon display names and the "not in a Protestant Bible" flags, translation labels, season-guide links, footnotes, credits text. Edit that file and re-run. Nothing private belongs in it.

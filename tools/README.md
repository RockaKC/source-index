# Source Index export

Rebuilds the site's data from the Kingdom Code SQLite database.

```
python3 tools/export_site.py /path/to/kc_v13.db --check   # show what would change, write nothing
python3 tools/export_site.py /path/to/kc_v13.db           # rebuild index.html data + bible.json
```

Needs Python 3 only. No packages.

## What it changes

- `bible.json`: every verse of every book that has text.
- `index.html`: the single `const D = {...};` line. Nothing else in the file is touched.

Running it twice in a row changes nothing the second time.

## Publication rules

- Only articles with status `published` appear. Draft citations never reach the page.
- Quips are left out. `tools/curated.json` lists a few other published articles the page holds back.
- Citations the database marks `review` (unconfirmed numbering) are left out until resolved.
- A citation at a verse missing from the stored text (for example Acts 8:37, which the Berean Literal Bible omits) is still shown as a hit. The verse page lists the essay without verse text, and the report names each one so the database can be checked.
- Raw view counts do not leave the database. The page gets a ranking order only.

## English and Septuagint numbering

The page converts typed English references to the Septuagint numbers the text uses, from `verse_map` in the database. The Psalms have a complete map. Other books have only the verses your published essays cite (dataset `kc_cited_remaps`), so the page marks those books as numbered differently from English Bibles and tells a reader who typed an unmapped number. A book's map is treated as complete only if its English chapters and verses run without gaps.

## What stays out of the repo

The database file is never copied here (`.gitignore` blocks `*.db`). The exporter does not read the patron, pledge, income or identity tables. It stops if an email address or an unpublished item turns up in the output.

## Hand-kept content: `tools/curated.json`

Things that live only on the page: question paths, the Hebrew and Greek word entries, canon display names and the "not in a Protestant Bible" flags, translation labels, season-guide links, footnotes, credits text. Edit that file and re-run. Nothing private belongs in it.

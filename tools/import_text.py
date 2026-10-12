#!/usr/bin/env python3
"""Load the text of one book into a NEW copy of the Kingdom Code database.

    python3 tools/import_text.py tools/texts/didascalia_platt_1834.json kc_v26.db kc_v27.db

The JSON file holds one book of public-domain text:

    {"book_id": 87,
     "translation": {"code", "name", "language", "notes"},
     "dataset":     {"code", "name", "source_url", "license", "attribution_text", "notes"},
     "canon_note":  "..."                      (optional; replaces books.canon_note),
     "chapters":    {"1": ["verse 1 text", "verse 2 text", ...], "2": [...]}}

Verse numbers are the position in each chapter's list, starting at 1. The input database is opened
read-only and never modified; the output must not already exist. It stops, writing nothing, if the
book already has text, the translation or dataset code is taken, chapters are not numbered 1..N with
no gap, or any verse is empty. The book's house translation is set to the new translation.
"""
import json
import os
import sqlite3
import sys


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src_json, src, out = sys.argv[1:]
    if os.path.exists(out):
        sys.exit("refusing to overwrite an existing file: " + out)
    spec = json.load(open(src_json, encoding="utf-8"))
    tmp = out + ".partial"
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        build(spec, src, tmp, os.path.basename(out), os.path.basename(src_json))
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.rename(tmp, out)
    print("wrote", out)


def check(dst, spec):
    problems = []
    b = spec["book_id"]
    row = dst.execute("select name from books where id = ?", (b,)).fetchone()
    if not row:
        problems.append("no book with id %d" % b)
    if dst.execute("select 1 from verses where book_id = ?", (b,)).fetchone():
        problems.append("book %d already has text" % b)
    if dst.execute("select 1 from translations where code = ?", (spec["translation"]["code"],)).fetchone():
        problems.append("translation code already taken: " + spec["translation"]["code"])
    if dst.execute("select 1 from datasets where code = ?", (spec["dataset"]["code"],)).fetchone():
        problems.append("dataset code already taken: " + spec["dataset"]["code"])
    nums = sorted(int(c) for c in spec["chapters"])
    if nums != list(range(1, len(nums) + 1)):
        problems.append("chapters must be numbered 1..N with no gap; got %s" % nums)
    for c, verses in spec["chapters"].items():
        if not verses:
            problems.append("chapter %s has no verses" % c)
        for i, t in enumerate(verses, 1):
            if not isinstance(t, str) or not t.strip():
                problems.append("chapter %s verse %d is empty" % (c, i))
    if problems:
        raise RuntimeError("stopping, nothing written:\n  " + "\n  ".join(problems))
    return row[0]


def build(spec, src, out, final_name, json_name):
    inp = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(src), uri=True)
    dst = sqlite3.connect(out)
    inp.backup(dst)                                  # consistent copy; the input is never touched
    inp.close()
    name = check(dst, spec)
    t, d, b = spec["translation"], spec["dataset"], spec["book_id"]
    with dst:
        dst.execute("insert into translations(code, name, language, notes) values (?, ?, ?, ?)",
                    (t["code"], t["name"], t.get("language"), t.get("notes")))
        did = dst.execute(
            """insert into datasets(code, name, kind, source_url, license, attribution_text, share_alike,
                                    commercial_ok, status, loaded_at, notes)
               values (?, ?, 'verse_text', ?, ?, ?, 0, 1, 'loaded', strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?)""",
            (d["code"], d["name"], d.get("source_url"), d.get("license"), d.get("attribution_text"), d.get("notes"))).lastrowid
        n = 0
        for c in sorted(spec["chapters"], key=int):
            for v, text in enumerate(spec["chapters"][c], 1):
                dst.execute("insert into verses(translation, book_id, chapter, verse, text, dataset_id) values (?, ?, ?, ?, ?, ?)",
                            (t["code"], b, int(c), v, text.strip(), did))
                n += 1
        dst.execute("update books set house_translation = ? where id = ?", (t["code"], b))
        if spec.get("canon_note"):
            dst.execute("update books set canon_note = ? where id = ?", (spec["canon_note"], b))
        dst.execute("insert into import_log(file_name, source, rows_read, rows_loaded, notes) values (?, ?, ?, ?, ?)",
                    (final_name, d["code"], n, n,
                     "%s: %d chapters, %d verses loaded for %s from %s. Applied to a copy of the previous database."
                     % (name, len(spec["chapters"]), n, name, json_name)))
    ok = dst.execute("pragma integrity_check").fetchone()[0]
    fk = dst.execute("pragma foreign_key_check").fetchall()
    if ok != "ok" or fk:
        raise RuntimeError("integrity check failed: %s %s" % (ok, fk[:3]))
    dst.close()
    print("integrity: %s | foreign-key problems: %d" % (ok, len(fk)))
    print("%s: %d chapters, %d verses" % (name, len(spec["chapters"]), n))


if __name__ == "__main__":
    main()

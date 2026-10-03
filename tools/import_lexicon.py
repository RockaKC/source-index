#!/usr/bin/env python3
"""Load the Hebrew and Greek lexicons into a NEW copy of the Kingdom Code database.

    python3 tools/import_lexicon.py LEXICON_DIR kc_v15.db kc_v16.db

LEXICON_DIR is the "Lexicons" folder of STEPBible-Data, which holds
  TBESH  Translators Brief lexicon of Extended Strongs for Hebrew
  TBESG  Translators Brief lexicon of Extended Strongs for Greek
Source: STEPBible-Data (Tyndale House Cambridge), CC BY 4.0,
https://github.com/STEPBible/STEPBible-Data . Credit "STEP Bible", www.STEPBible.org.
The source files are read here and are not copied into this repository.

What it writes: one `lexicon` row per extended Strong's entry (about 22,700) and two `datasets`
rows that record the license and the changes below. The input database is opened read-only and
is never modified; the output must not already exist.

Changes made to the source data (recorded in datasets.notes, as the license asks):
  * the meaning text is converted from HTML (<br>, <b>, <i>) to plain text with line breaks
  * Strong's numbers lose their zero padding (H0001G becomes H1G); the extended letter is kept
  * the source's relationship notes ("= a Part of ...") and the unified-Strong's column are not kept
The grammar code (for example H:N-M) is stored as supplied, in part_of_speech.
"""
import collections
import glob
import html
import os
import re
import sqlite3
import sys

ATTRIBUTION = "STEP Bible (www.STEPBible.org), based on work at Tyndale House Cambridge. Licensed CC BY 4.0."
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
SOURCE_URL = "https://github.com/STEPBible/STEPBible-Data"
CHANGES = ("Changes: meaning text converted from HTML to plain text; Strong's numbers lose zero padding "
           "(H0001G -> H1G); the source's relationship notes and unified-Strong's column are not kept; "
           "grammar code stored as supplied. Aramaic entries (grammar code starting A:) are marked arc.")
DATASETS = {
    "TBESH": ("tbesh_hebrew_lexicon", "Translators Brief Lexicon of Extended Strongs for Hebrew (STEPBible)"),
    "TBESG": ("tbesg_greek_lexicon", "Translators Brief Lexicon of Extended Strongs for Greek (STEPBible)"),
}
KEY = re.compile(r"^([HG])0*(\d+)([A-Za-z]?)\b")


def plain(text):
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    lines = [re.sub(r"[ \t ]+", " ", ln).strip() for ln in text.split("\n")]
    return "\n".join(ln for ln in lines if ln).strip()


def read_entries(path):
    for ln in open(path, encoding="utf-8-sig").read().split("\n"):
        c = ln.split("\t")
        if len(c) < 8 or not re.match(r"^[HG]\d", c[0]):
            continue
        m = KEY.match(c[1].strip())
        if not m:
            continue
        yield {"strongs": m.group(1) + str(int(m.group(2))) + m.group(3), "lemma": c[3].strip(),
               "translit": c[4].strip() or None, "morph": c[5].strip() or None,
               "gloss": c[6].strip() or None, "definition": plain(c[7]) or None}


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    folder, src, out = sys.argv[1:]
    if os.path.exists(out):
        sys.exit("refusing to overwrite an existing file: " + out)
    tmp = out + ".partial"
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        build(folder, src, tmp, os.path.basename(out))
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.rename(tmp, out)
    print("wrote", out)


def build(folder, src, out, final_name):
    inp = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(src), uri=True)
    dst = sqlite3.connect(out)
    inp.backup(dst)                                  # consistent copy; the input is never touched
    inp.close()
    if dst.execute("select count(*) from lexicon").fetchone()[0]:
        raise RuntimeError("the lexicon table is not empty; stopping so nothing is mixed")
    totals = collections.Counter()
    skipped = collections.Counter()
    with dst:
        for tag, (code, name) in DATASETS.items():
            path = glob.glob(os.path.join(folder, tag + "*"))[0]
            dst.execute("""insert into datasets(code,name,kind,source_url,license,license_url,attribution_text,
                           share_alike,commercial_ok,status,loaded_at,notes)
                           values(?,?,'lexicon',?,'CC BY 4.0',?,?,0,1,'loaded',strftime('%Y-%m-%dT%H:%M:%SZ','now'),?)""",
                        (code, name, SOURCE_URL, LICENSE_URL, ATTRIBUTION, CHANGES))
            ds = dst.execute("select id from datasets where code=?", (code,)).fetchone()[0]
            for e in read_entries(path):
                lang = "grc" if e["strongs"].startswith("G") else ("arc" if (e["morph"] or "").startswith("A:") else "heb")
                try:
                    dst.execute("""insert into lexicon(language,strongs,lemma,transliteration,part_of_speech,gloss,definition,dataset_id)
                                   values(?,?,?,?,?,?,?,?)""",
                                (lang, e["strongs"], e["lemma"], e["translit"], e["morph"], e["gloss"], e["definition"], ds))
                    totals[lang] += 1
                except sqlite3.IntegrityError:
                    skipped[tag] += 1
        n = sum(totals.values())
        dst.execute("insert into import_log(file_name,source,rows_read,rows_loaded,notes) values(?,?,?,?,?)",
                    (final_name, "stepbible_lexicons", n + sum(skipped.values()), n,
                     "TBESH and TBESG (CC BY 4.0). " + CHANGES))
    ok = dst.execute("pragma integrity_check").fetchone()[0]
    fk = dst.execute("pragma foreign_key_check").fetchall()
    if ok != "ok" or fk:
        raise RuntimeError("integrity check failed: %s %s" % (ok, fk[:3]))
    dst.close()
    print("integrity: %s | foreign-key problems: %d" % (ok, len(fk)))
    print("entries loaded:", dict(totals), "| duplicate keys skipped:", dict(skipped) or "none")


if __name__ == "__main__":
    main()

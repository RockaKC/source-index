#!/usr/bin/env python3
"""Find the Bible verses an essay quotes, and record them as citations in a NEW copy of the Kingdom Code database.

    python3 tools/extract_citations.py kc_v33.db --validate
    python3 tools/extract_citations.py kc_v33.db --show 1349 1352            # what it would record, nothing written
    python3 tools/extract_citations.py kc_v33.db kc_v34.db --nodes 79 165 ...

Reads each essay's Markdown (nodes.body_md) for references such as "Genesis 6:4", "Enoch 15:8-12", "Psalm 22:16",
"John 7:53-8:11", turns book names into books.id, and writes rows to `citations` the way the existing ones are written:
eng_start/eng_end as written (book*1000000 + chapter*1000 + verse), house_start/house_end in the house text's numbering,
a resolution, in_text, the reference as written (raw) and where it sits in the body (char_offset).

Resolution follows the rules the existing citations follow (checked by --validate):
  * New Testament, Enoch and Jubilees: the house numbering is the English one -> assumed_same.
  * Old Testament books in the Septuagint (house numbering LXX): a verse listed in verse_map (English -> Septuagint) is
    'mapped' to its Septuagint number (the earlier pipeline held some such verses for review; this one trusts the table). Any other verse is 'assumed_same' only where the database already treats that
    chapter that way (an existing citation in the same book and chapter is assumed_same), or in a book with no numbering
    differences recorded at all; otherwise it is 'review', which the site does not publish until the editor decides.
  * A book with no house text (the Maccabees, the Ethiopic books not loaded) -> not_applicable, no house numbers.
Everything it writes has origin 'ai'. For an essay it is asked to redo, it replaces that essay's citations (their char_offset
values refer to the old text) in one transaction; the input database is opened read-only and the output must not exist.
"""
import argparse
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

EXTRA_ALIASES = {
    "Psalm": "Psalms", "Ps": "Psalms", "Song of Solomon": "Song of Songs", "Canticles": "Song of Songs",
    "Revelation of John": "Revelation", "Apocalypse": "Revelation", "Ecclesiasticus": "Sirach",
    "Wisdom of Solomon": "Wisdom", "1 Enoch": "Enoch", "First Enoch": "Enoch",
    "Isaias": "Isaiah", "Jeremias": "Jeremiah", "Canticle of Canticles": "Song of Songs",
    "Ex": "Exodus", "Exo": "Exodus", "Mk": "Mark", "Mt": "Matthew", "Lk": "Luke", "Jn": "John", "Rom": "Romans", "Gal": "Galatians",
    "Eph": "Ephesians", "Phil": "Philippians", "Col": "Colossians", "Heb": "Hebrews", "Jas": "James", "Rev": "Revelation",
    "Jub": "Jubilees", "Wis": "Wisdom", "Sir": "Sirach", "Prov": "Proverbs", "Eccles": "Ecclesiastes", "Zech": "Zechariah",
    "1 Kgs": "1 Kings", "2 Kgs": "2 Kings", "1 Sam": "1 Samuel", "2 Sam": "2 Samuel", "1 Chron": "1 Chronicles", "2 Chron": "2 Chronicles",
}


def load_books(con):
    books = {}
    for bid, name, abbr, house in con.execute("select id, name, abbreviation, house_translation from books"):
        books[bid] = (name, abbr, house)
    alias = {}
    for bid, (name, abbr, _) in books.items():
        alias[name] = bid
        if abbr:
            alias[abbr] = bid
            spaced = re.sub(r"^(\d)(?=[A-Za-z])", r"\1 ", abbr)         # 1Sam -> 1 Sam
            alias[spaced] = bid
    by_name = {n: i for i, (n, _, _) in books.items()}
    for a, n in EXTRA_ALIASES.items():
        if n in by_name:
            alias[a] = by_name[n]
    return books, alias


def reference_pattern(alias):
    names = sorted(alias, key=len, reverse=True)      # the longest name first, so '1 John' is not read as 'John'
    book = "|".join(re.escape(n) for n in names)
    dash = "[–—-]"
    return re.compile(
        r"(?<![\w.])(?P<book>%s)\.?\s+(?P<ch>\d{1,3})\s*:\s*(?P<v1>\d{1,3})(?:[a-c](?![a-z]))?"
        r"(?:\s*%s\s*(?:(?P<ch2>\d{1,3})\s*:\s*)?(?P<v2>\d{1,3}))?" % (book, dash))


# An essay may give a verse in Septuagint numbering and say so ("Psalm 39:7, Septuagint"), or give the Septuagint number first and the
# English one after it ("Psalm 88:7 (Psalm 89:6 in English Bibles)"). Such a number is already the house number: it is not mapped again.
LXX_LABEL = re.compile(r"^[\s,;*_)\]]{0,6}\(?\s*(?:in\s+(?:the\s+)?)?(?:Septuagint|LXX|Brenton)\b", re.I)
ENG_PAIR = re.compile(r"^\s*\((?:[1-3]\s)?[A-Z][A-Za-z]+(?:\s[A-Za-z]+)?\s+\d+:\d+\s+in\s+(?:many\s+)?English"
                      r"|^[,;]?\s*corresponding to\s+(?:[1-3]\s)?[A-Z][A-Za-z]+\s+\d+:\d+\s+in\s+(?:many\s+)?English")


def extract(body, alias, pattern):
    """[(book_id, eng_start, eng_end, raw, offset, house_numbered)] for each reference in the text."""
    out = []
    for m in pattern.finditer(body):
        bid = alias[m.group("book")]
        ch, v1 = int(m.group("ch")), int(m.group("v1"))
        ch2 = int(m.group("ch2")) if m.group("ch2") else ch
        v2 = int(m.group("v2")) if m.group("v2") else v1
        if ch2 == ch and v2 < v1:                 # "6:4-1" is not a range
            v2 = v1
        start = bid * 1000000 + ch * 1000 + v1
        end = bid * 1000000 + ch2 * 1000 + v2
        after = body[m.end():m.end() + 70]
        out.append((bid, start, end, m.group(0).strip(), m.start(), bool(LXX_LABEL.match(after) or ENG_PAIR.match(after))))
    return out


class Resolver:
    def __init__(self, con, books):
        self.books = books
        self.map = {fr: to for fr, to in con.execute("select from_ref, to_ref from verse_map where from_system = 'ENG' and to_system = 'LXX'")}
        self.mapped_books = {fr // 1000000 for fr in self.map}
        self.house = {r[0] for r in con.execute("select distinct book_id * 1000000 + chapter * 1000 + verse from verses where translation in ('LXX','BLB','CHARLES','PLATT')")}
        self.chapter_status = {}
        names = {n: i for i, (n, _, _) in books.items()}
        # books whose English and Septuagint numbering are known to differ somewhere: nothing is assumed outside chapters the database has settled
        self.risky = self.mapped_books | {names[n] for n in ("Joel", "Micah", "Nahum", "Jonah", "Hosea", "Malachi", "Zechariah", "Habakkuk", "Daniel", "Esther", "Nehemiah", "Ezra",
                                                           "Job", "Lamentations", "Proverbs", "Jeremiah", "Isaiah", "Deuteronomy", "Exodus", "Numbers", "Genesis", "1 Samuel", "2 Samuel",
                                                           "1 Kings", "2 Kings", "Ecclesiastes") if n in names}
        for bid, es, res in con.execute("select book_id, eng_start, resolution from citations where resolution in ('assumed_same','review','mapped')"):
            key = (bid, es // 1000 % 1000)
            self.chapter_status.setdefault(key, set()).add(res)

    def one(self, ref):
        """(house ref or None, resolution) for one verse reference. Only what is certain is resolved; the rest is 'review'."""
        bid = ref // 1000000
        house_trans = self.books[bid][2]
        if house_trans is None:
            return None, "not_applicable"
        if house_trans != "LXX":
            return ref, "assumed_same"
        if ref in self.map:                                          # the English -> Septuagint table lists this verse
            return self.map[ref], "mapped"
        seen = self.chapter_status.get((bid, ref // 1000 % 1000), set())
        if "assumed_same" in seen and "review" not in seen:         # the database already treats this chapter as unchanged
            return ref, "assumed_same"
        if bid in self.risky:
            return ref, "review"
        return ref, "assumed_same"

    def resolve(self, start, end, house_numbered=False):
        if house_numbered and self.books[start // 1000000][2] == "LXX":
            return start, end, "assumed_same", 1 if start in self.house else 0
        hs, rs = self.one(start)
        he, re_ = self.one(end)
        if rs == "not_applicable":
            return None, None, "not_applicable", None
        res = "review" if "review" in (rs, re_) else ("mapped" if "mapped" in (rs, re_) else "assumed_same")
        lo, hi = min(hs, he), max(hs, he)
        in_text = 1 if hs in self.house else 0
        return lo, hi, res, in_text


def validate(con, books, alias, pattern, resolver):
    stored = defaultdict(set)
    res_of = {}
    for nid, bid, es, ee, hs, he, res, raw in con.execute("select node_id, book_id, eng_start, eng_end, house_start, house_end, resolution, raw from citations"):
        stored[nid].add((es, ee))
        res_of[(nid, es, ee)] = (hs, he, res)
    total = {"stored": 0, "found": 0, "both": 0, "missing": [], "extra": [], "res_ok": 0, "res_bad": []}
    for nid, body, status in con.execute("select id, body_md, status from nodes where id in (select node_id from citations) and body_md is not null"):
        found = {}
        for bid, es, ee, raw, off, hn in extract(body, alias, pattern):
            found[(es, ee)] = raw
        s = stored[nid]
        total["stored"] += len(s)
        total["found"] += len(found)
        both = set(found) & s
        total["both"] += len(both)
        total["missing"] += [(nid, k, ) for k in sorted(s - set(found))]
        total["extra"] += [(nid, k, found[k]) for k in sorted(set(found) - s)]
        for k in both:
            hs, he, res = resolver.resolve(*k)[:3]
            old = res_of[(nid,) + k]
            if (hs, he, res) == old:
                total["res_ok"] += 1
            else:
                total["res_bad"].append((nid, found[k], old, (hs, he, res)))
    return total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src_db")
    ap.add_argument("out_db", nargs="?")
    ap.add_argument("--validate", action="store_true")
    ap.add_argument("--show", nargs="*", type=int, default=None)
    ap.add_argument("--nodes", nargs="*", type=int, default=[])
    args = ap.parse_args()

    src = sqlite3.connect("file:%s?mode=ro" % Path(args.src_db).resolve(), uri=True)
    books, alias = load_books(src)
    pattern = reference_pattern(alias)
    resolver = Resolver(src, books)

    if args.validate:
        t = validate(src, books, alias, pattern, resolver)
        print("existing citations: %d | found by this extractor: %d | the same: %d" % (t["stored"], t["found"], t["both"]))
        print("resolution and house numbers agree for %d of %d shared" % (t["res_ok"], t["both"]))
        print("stored but not found (%d), first 15:" % len(t["missing"]))
        for x in t["missing"][:15]:
            print("   ", x)
        print("found but not stored (%d), first 15:" % len(t["extra"]))
        for x in t["extra"][:15]:
            print("   ", x)
        print("resolution differs (%d), first 12:" % len(t["res_bad"]))
        for x in t["res_bad"][:12]:
            print("   ", x)
        return

    ids = args.show if args.show is not None else args.nodes
    rows = {}
    for nid in ids:
        title, body = src.execute("select title, body_md from nodes where id = ?", (nid,)).fetchone()
        seen, recs = set(), []
        for bid, es, ee, raw, off, hn in extract(body, alias, pattern):
            hs, he, res, in_text = resolver.resolve(es, ee, hn)
            if (nid, off) in seen:
                continue
            seen.add((nid, off))
            recs.append((nid, bid, es, ee, hs, he, res, in_text, raw, off))
        rows[nid] = (title, recs)
        if args.show is not None or True:
            counts = defaultdict(int)
            for r in recs:
                counts[r[6]] += 1
            print("%5d  %-60s %3d refs  %s" % (nid, title[:60], len(recs), dict(counts)))
    if args.show is not None:
        for nid, (title, recs) in rows.items():
            print("\n#%d %s" % (nid, title))
            for r in recs:
                print("   %-30s %-13s in_text=%s  house %s-%s" % (r[8], r[6], r[7], r[4], r[5]))
        return
    if not args.out_db:
        sys.exit("give an output database, or use --validate or --show")
    if Path(args.out_db).exists():
        sys.exit("%s already exists; the output must be a new file" % args.out_db)
    out = sqlite3.connect(args.out_db)
    src.backup(out)
    src.close()
    n_old = n_new = 0
    with out:
        for nid, (title, recs) in rows.items():
            n_old += out.execute("delete from citations where node_id = ?", (nid,)).rowcount
            for r in recs:
                out.execute("insert into citations (node_id, book_id, eng_start, eng_end, house_start, house_end, resolution, in_text, raw, char_offset, origin) "
                            "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai')", r)
                n_new += 1
        out.execute("insert into import_log (file_name, source, rows_read, rows_loaded, notes) values (?, 'citations_extract', ?, ?, ?)",
                    (Path(args.out_db).name, len(rows), n_new,
                     "Scripture citations found in the text of %d essays (%s) by tools/extract_citations.py; %d earlier citations of those essays were replaced "
                     "(their offsets referred to older text). Origin ai; verses in books with unrecorded numbering differences are marked review. "
                     "Applied to a copy of %s." % (len(rows), ", ".join(str(i) for i in rows), n_old, Path(args.src_db).name)))
    out.close()
    print("wrote %s: %d citations written, %d replaced" % (args.out_db, n_new, n_old))


if __name__ == "__main__":
    main()

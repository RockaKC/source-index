#!/usr/bin/env python3
"""Analyze how far the STEPBible versification table can vouch for the stored Septuagint numbering.

    python3 tools/import_tvtms.py TVTMS.txt kc_v14.db --analyze

STATUS: analysis only. This does not write any mapping into the database or the site.

Source data: the TVTMS file from STEPBible-Data (Tyndale House Cambridge, CC BY 4.0,
https://github.com/STEPBible/STEPBible-Data). Credit "STEP Bible", www.STEPBible.org.
The source file is read here and is not copied into this repository.

What it does. Each line of the table says "if these tests are true of your Bible, verse X in
your numbering is verse Y in the standard English numbering". It evaluates every test against the
Septuagint text stored in the database (Brenton) and reports, per chapter, whether the table can
vouch for the numbering: verified, identity (no row mentions the chapter), or unresolved (rows
exist but none fit the stored text).

What it found. The table describes other Greek editions than Brenton. Brenton follows the Hebrew
verse divisions in places the table does not model (Numbers 30, 2 Chronicles 14, Deuteronomy 22-23,
Proverbs 24-31), so a map built from the table alone would be wrong or incomplete there. Use the
report to find chapters that need a hand check, not to generate a map. The input database is opened
read-only and never modified.
"""
import argparse
import collections
import re
import shutil
import sqlite3
import sys

# TVTMS book code -> database book id (the 43 Septuagint books)
CODES = {"Gen": 1, "Exo": 2, "Lev": 3, "Num": 4, "Deu": 5, "Jos": 6, "Jdg": 7, "Rut": 8, "1Sa": 9, "2Sa": 10,
         "1Ki": 11, "2Ki": 12, "1Ch": 13, "2Ch": 14, "Ezr": 17, "Neh": 18, "Tob": 21, "Jdt": 22, "Est": 23,
         "Job": 27, "Psa": 28, "Pro": 29, "Wis": 31, "Ecc": 32, "Sng": 33, "Isa": 34, "Jer": 35, "Lam": 36,
         "Ezk": 37, "Dan": 38, "Hos": 39, "Amo": 40, "Mic": 41, "Jol": 42, "Oba": 43, "Jon": 44, "Nam": 45,
         "Hab": 46, "Zep": 47, "Hag": 48, "Zec": 49, "Mal": 50, "Sir": 51}
PSALMS = 28
REF = re.compile(r"^([0-9A-Za-z]{3})\.(\d+):(\d+)(?:\.(\d+)|!(\w+)|([a-z]))?$")


def code(b, ch, v):
    return b * 1_000_000 + ch * 1000 + v


class Text:
    """The stored Septuagint text, as the tests need to see it."""

    def __init__(self, con):
        self.verse = {}
        self.parts = collections.Counter()
        self.last = collections.defaultdict(int)
        for b, ch, v, t in con.execute("select book_id, chapter, verse, text from verses"):
            self.verse[(b, ch, v)] = t
            self.last[(b, ch)] = max(self.last[(b, ch)], v)
        for b, ch, v in con.execute("select book_id, chapter, verse from verse_parts"):
            self.parts[(b, ch, v)] += 1

    def words(self, key):
        t = self.verse.get(key)
        return len(t.split()) if t else 0

    def exists(self, key, sub=None):
        if key not in self.verse:
            return False
        return True if not sub else self.parts[key] >= sub

    def not_exists(self, key, sub=None):
        b, ch, v = key
        if sub:
            return self.parts[key] < sub
        if key in self.verse:
            return False
        return v == 1 or (b, ch, v - 1) in self.verse


def parse_ref(s):
    m = REF.match(s.strip())
    if not m or m.group(1) not in CODES:
        return None
    return CODES[m.group(1)], int(m.group(2)), int(m.group(3)), (int(m.group(4)) if m.group(4) else None)


def operand(s, text):
    """'Gen.1:2*3' or 'Gen.1:2.0' -> (multiplier, word count) or None if it is not a plain verse."""
    mult = 1
    m = re.match(r"^(.*?)\*(\d+)$", s.strip())
    if m:
        s, mult = m.group(1), int(m.group(2))
    r = parse_ref(s.strip())
    if not r:
        return None
    b, ch, v, sub = r
    return mult * text.words((b, ch, v))


def evaluate(test, text):
    """True / False for one test atom; None if it concerns something this text cannot answer."""
    test = test.strip()
    if not test:
        return True
    m = re.match(r"^(\S+?)=(Exist|NotExist|Last)$", test)
    if m:
        if "TextBefore" in m.group(1):
            return m.group(2) == "NotExist"        # Brenton keeps psalm titles as verse 1
        r = parse_ref(m.group(1))
        if not r:
            return None                            # e.g. Esther additions (chapters A-F)
        b, ch, v, sub = r
        if m.group(2) == "Exist":
            return text.exists((b, ch, v), sub)
        if m.group(2) == "NotExist":
            return text.not_exists((b, ch, v), sub)
        return text.last[(b, ch)] == v
    m = re.match(r"^(\S+?)\s*([<>])\s*(\S+)$", test)
    if m:
        a, z = operand(m.group(1), text), operand(m.group(3), text)
        if a is None or z is None:
            return None
        return a < z if m.group(2) == "<" else a > z
    return None


def load_rows(path):
    lines = open(path, encoding="utf-8-sig").read().split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("#DataStart(Expanded)"))
    rows = []
    for n, l in enumerate(lines[start + 3:], start + 4):
        p = l.split("\t")
        if len(p) >= 9 and re.match(r"^[0-9A-Za-z]{3}\.\w+:\d+", p[1]):
            rows.append({"line": n, "type": p[0].strip(), "src": p[1].strip(), "std": p[2].strip(),
                         "action": p[3].strip(), "tests": p[8].strip()})
    return rows


def expand_standard(std, book):
    """'Gen.5:32; 6:1' / 'Gen.2:25-3:1' / 'Jer.31:33' -> list of (chapter, verse) in the standard numbering."""
    out = []
    for part in re.split(r"\s*;\s*", std):
        part = part.strip()
        m = re.match(r"^(?:[0-9A-Za-z]{3}\.)?(\d+):(\d+)(?:[a-z]|!\w+|\.\d+)?(?:\s*-\s*(?:(\d+):)?(\d+)(?:[a-z]|!\w+)?)?$", part)
        if not m:
            return None
        c1, v1 = int(m.group(1)), int(m.group(2))
        c2 = int(m.group(3)) if m.group(3) else c1
        v2 = int(m.group(4)) if m.group(4) else v1
        if c2 != c1:                              # a range across chapters: keep just the two ends
            out += [(c1, v1), (c2, v2)]
        else:
            out += [(c1, v) for v in range(v1, v2 + 1)]
    return out


def greekish(row_type):
    return "Greek" in row_type or "Grk" in row_type


def signature_only(test, book, own_chapters):
    """True if the test is only an edition signature: a chapter-length check on a chapter this verse
    has nothing to do with. The tests on the verse's own chapters are never waived."""
    m = re.match(r"^(\S+?)=Last$", test.strip())
    r = parse_ref(m.group(1)) if m else None
    return bool(r and r[0] == book and r[1] not in own_chapters)


def derive(rows, text, only_books=None, relax=True, include_psalms=False):
    """Return (map, stats). map[book][(engCh, engV)] -> set of (lxxCh, lxxV)."""
    mp = collections.defaultdict(lambda: collections.defaultdict(set))
    stats = collections.defaultdict(collections.Counter)
    for r in rows:
        if not greekish(r["type"]):
            continue
        s = parse_ref(r["src"])
        if not s:
            continue
        b, sch, sv, _ = s
        if b == PSALMS and not include_psalms:
            continue                              # Psalms keep the KC map; cross-checked separately
        if only_books and b not in only_books:
            continue
        own = {sch}                                # tests are in the source (Septuagint) numbering
        results = []
        for t in re.split(r"\s*&\s*", r["tests"]):
            v = evaluate(t, text)
            if v is False and relax and signature_only(t, b, own):
                stats[b]["signature_waived"] += 1
                v = True
            results.append(v)
        if any(x is None for x in results):
            stats[b]["untestable"] += 1
            continue
        if not all(results):
            stats[b]["tests_false"] += 1
            continue
        eng = expand_standard(r["std"], b)
        if not eng:
            stats[b]["unparsed_std"] += 1
            continue
        stats[b]["applied"] += 1
        for e in eng:
            mp[b][e].add((sch, sv, r["type"], r["action"], r["line"]))
    return mp, stats


def classify(rows, mp, text, books):
    """Per stored Septuagint chapter: 'verified' (every verse covered by an applicable row),
    'identity' (no Greek-tradition row mentions the chapter, so nothing says it differs), or
    'unresolved' (rows exist for it but none fit the stored text, so we cannot say)."""
    covered = collections.defaultdict(set)         # (book, ch) -> source verses with an applicable row
    for b, d in mp.items():
        for _, srcs in d.items():
            for x in srcs:
                covered[(b, x[0])].add(x[1])
    mentioned = collections.defaultdict(int)
    for r in rows:
        if greekish(r["type"]):
            s = parse_ref(r["src"])
            if s:
                mentioned[(s[0], s[1])] += 1
    out = collections.defaultdict(dict)
    for (b, ch), last in text.last.items():
        if b not in books:
            continue
        stored = {v for (bb, c, v) in text.verse if bb == b and c == ch}
        if stored and stored <= covered.get((b, ch), set()):
            out[b][ch] = "verified"
        elif mentioned.get((b, ch)):
            out[b][ch] = "unresolved"
        else:
            out[b][ch] = "identity"
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("tvtms")
    ap.add_argument("db")
    ap.add_argument("--analyze", action="store_true", help="accepted for clarity; this tool only analyzes")
    ap.add_argument("--books", help="comma-separated TVTMS codes, e.g. Jer,Isa")
    args = ap.parse_args()
    con = sqlite3.connect("file:%s?mode=ro" % args.db, uri=True)
    text = Text(con)
    rows = load_rows(args.tvtms)
    only = {CODES[c] for c in args.books.split(",")} if args.books else None
    mp, stats = derive(rows, text, only)
    names = dict(con.execute("select id, name from books"))
    cls = classify(rows, mp, text, set(CODES.values()) - {PSALMS})
    print("rows read: %d | books with data: %d" % (len(rows), len(mp)))
    for b in sorted(stats):
        s = stats[b]
        print("  %-14s applied %-4d tests-false %-4d untestable %-3d unparsed %d | english verses mapped: %d"
              % (names[b], s["applied"], s["tests_false"], s["untestable"], s["unparsed_std"], len(mp[b])))
    print("\nStored Septuagint chapters by how far the table can vouch for them:")
    tot = collections.Counter()
    for b in sorted(cls):
        c = collections.Counter(cls[b].values())
        tot.update(c)
        un = sorted(ch for ch, k in cls[b].items() if k == "unresolved")
        print("  %-14s verified %-3d identity %-3d unresolved %-3d %s"
              % (names[b], c["verified"], c["identity"], c["unresolved"],
                 ("-> ch " + ",".join(map(str, un[:14])) + ("..." if len(un) > 14 else "")) if un else ""))
    print("  TOTAL          verified %d | identity %d | unresolved %d" % (tot["verified"], tot["identity"], tot["unresolved"]))
    if args.analyze:
        return


if __name__ == "__main__":
    main()

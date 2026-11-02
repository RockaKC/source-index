#!/usr/bin/env python3
"""Daily Scripture Formation: the weekly readings kept by hand in tools/curated.json ("formation"), checked and written to data/formation.js.

    python3 tools/formation.py            # check every reading against the stored text and write data/formation.js
    python3 tools/formation.py --check    # exit 1 if data/formation.js is not what curated.json gives

It reads only the repo (data/site.js for the books and the verse-number maps, bible/ for the stored text), never the database, so a
change to the readings does not need an export. Each reference is written as English Bibles number it ("Psalm 51", "James 1:5-8"); this
converts it to the stored text's own numbering (the Septuagint numbers many Psalms differently: Psalm 51 is its Psalm 50), checks that the
chapter and the first and last verses exist, and stops with a message for anything it cannot find. Only references reach the page; no
Scripture text is copied. The page (js/formation.js) shows the cycle named by "current"; a new cycle is a new entry in "cycles".
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "formation.js"

DAYS = ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")   # the biblical week: Saturday is the seventh day
SESSIONS = ("morning", "afternoon", "evening")
ALIASES = {"psalm": "Psalms"}
REF = re.compile(r"(.+?)\s+(\d+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?")


def fail(msg):
    sys.exit("formation: " + msg)


def _num(row_id):
    return int(re.match(r"\d+", str(row_id)).group())


def resolve(text, D, bible):
    """'Psalm 51' -> {'l': 'Psalm 50', 'r': [28, 50, 0, 0], 'en': 'Psalm 51 in English Bibles', 'tr': 'Septuagint'}; verses 0 mean the whole chapter."""
    m = REF.fullmatch(text.strip())
    if not m:
        fail("%r is not a reference like 'Romans 12:1-3' or 'Psalm 1'" % text)
    name = ALIASES.get(m.group(1).strip().lower(), m.group(1).strip())
    ids = {v[0].lower(): int(k) for k, v in D["books"].items()}
    b = ids.get(name.lower())
    if not b:
        fail("%r: no book called %s" % (text, name))
    ech, ev1 = int(m.group(2)), int(m.group(3)) if m.group(3) else 0
    ev2 = int(m.group(4) or ev1) if ev1 else 0
    pm = D.get("PM", {}).get(str(b), {})
    def to_stored(ch, v):                         # an English chapter and verse -> the stored text's
        hit = pm.get(str(ch), {}).get(str(v))
        return (hit[0], hit[1]) if hit else (ch, v)
    if ev1:
        (ch, v1), (ch2, v2) = to_stored(ech, ev1), to_stored(ech, ev2)
        if ch2 != ch:
            fail("%r runs across two chapters in the stored text; split it into two references" % text)
    else:                                         # a whole chapter: every English verse of it must land in one stored chapter
        mapped = {hit[0] for hit in pm.get(str(ech), {}).values()}
        if len(mapped) > 1:
            fail("%r is split across chapters %s in the stored text; name the stored chapters instead" % (text, sorted(mapped)))
        ch, v1, v2 = (mapped.pop() if mapped else ech), 0, 0
    rows = bible.get(str(b), {}).get(str(ch))
    if not rows:
        fail("%r: chapter %d is not in the stored text" % (text, ch))
    have = {_num(r[0]) for r in rows}
    if v1 and not (v1 in have and v2 in have and v1 <= v2):
        fail("%r: verses %d-%d of chapter %d are not in the stored text" % (text, v1, v2, ch))
    book = "Psalm" if D["books"][str(b)][0] == "Psalms" else D["books"][str(b)][0]
    label = "%s %d" % (book, ch) + (":%d" % v1 if v1 else "") + ("–%d" % v2 if v2 > v1 else "")
    out = {"l": label, "r": [b, ch, v1, v2], "tr": D["TR"].get(str(b), "")}
    english = "%s %d" % (book, ech) + (":%d" % ev1 if ev1 else "") + ("–%d" % ev2 if ev2 > ev1 else "")
    if english != label:
        out["en"] = english + " in English Bibles"
    return out


def export(plan, D, bible):
    if not plan:
        return None
    for k in ("title", "lead", "intro", "motto", "foundation", "sessions", "current", "cycles"):
        if not plan.get(k):
            fail("needs %r" % k)
    if [s.get("id") for s in plan["sessions"]] != list(SESSIONS):
        fail("sessions must be morning, afternoon and evening, in that order")
    for s in plan["sessions"]:
        if not all(s.get(k) for k in ("label", "name", "minutes", "purpose")):
            fail("session %s needs a label, a name, minutes and a purpose" % s["id"])
    cycles = []
    for c in plan["cycles"]:
        if not (c.get("id") and c.get("title")):
            fail("each cycle needs an id and a title")
        if len(c.get("days", [])) != 7:
            fail("cycle %s needs seven days, Sunday first" % c["id"])
        days = []
        for i, d in enumerate(c["days"]):
            if not d.get("theme"):
                fail("cycle %s, %s: no theme" % (c["id"], DAYS[i]))
            row = {"t": d["theme"], "s": []}
            for s in SESSIONS:
                one = d.get(s) or {}
                if not one.get("refs") or not str(one.get("do", "")).strip():
                    fail("cycle %s, %s %s: needs refs and a reflection ('do')" % (c["id"], DAYS[i], s))
                row["s"].append({"refs": [resolve(r, D, bible) for r in one["refs"]], "do": one["do"].strip()})
            days.append(row)
        cycles.append({"id": c["id"], "title": c["title"], "days": days})
    if len({c["id"] for c in cycles}) != len(cycles):
        fail("a cycle id is used twice")
    if plan["current"] not in {c["id"] for c in cycles}:
        fail("current names no cycle: %r" % plan["current"])
    return {"title": plan["title"], "lead": plan["lead"], "intro": plan["intro"], "motto": plan["motto"],
            "found": [resolve(r, D, bible) for r in plan["foundation"]],
            "ses": [{k: s[k] for k in ("id", "label", "name", "minutes", "purpose")} for s in plan["sessions"]],
            "cur": plan["current"], "cy": cycles}


def build():
    D = json.loads(re.search(r"^const D = (\{.*\});$", (ROOT / "data" / "site.js").read_text(encoding="utf-8"), re.M).group(1))
    cur = json.loads((ROOT / "tools" / "curated.json").read_text(encoding="utf-8"))
    bible = {}
    for b, tr in D["HT"].items():
        f = ROOT / "bible" / tr / ("%s.json" % b)
        if f.is_file():
            bible[b] = json.loads(f.read_text(encoding="utf-8"))
    fm = export(cur.get("formation"), D, bible)
    if not fm:
        fail("tools/curated.json has no formation")
    return fm, ("// Daily Scripture Formation: the weekly readings. Written by tools/formation.py from tools/curated.json: do not edit.\n"
                "const FMD = %s;\n" % json.dumps(fm, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    fm, text = build()
    n = sum(len(x["refs"]) for c in fm["cy"] for d in c["days"] for x in d["s"]) + len(fm["found"])
    if "--check" in sys.argv[1:]:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != text:
            sys.exit("data/formation.js is out of date: run python3 tools/formation.py")
        print("data/formation.js is current: %d readings checked" % n)
    else:
        OUT.write_text(text, encoding="utf-8")
        print("wrote data/formation.js: cycle %s, %d readings checked against the stored text" % (fm["cur"], n))

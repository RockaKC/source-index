#!/usr/bin/env python3
"""The daily study verse: check tools/daily.json against the stored text, and write data/daily.json.

    python3 tools/export_site.py kc_v35.db     # runs this as part of the export

tools/daily.json is the plan: four seasons from the winter solstice, each of three movements of four weeks plus a closing week (13 weeks, 91 days);
each week six verse days (the seventh day is rest); two turn days after week 52. A day is [reference, title]; the reference uses the archive's
stored numbering (the Septuagint's for most of the Old Testament, as the verse pages do). export() resolves every reference against the stored text,
refuses a plan with a missing verse, a repeated verse, a range over four verses or one that crosses a chapter, or a week that is not six days,
and returns what the website reads: one small file per week (data/daily/<n>.json) with the season, movement, week and each verse's text attached, plus turn.json,
so the front page needs one file of a couple of kilobytes and no book.
The logic that chooses today's day from the date lives in js/daily.js.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "tools" / "daily.json"
OUT = ROOT / "data" / "daily"                # data/daily/<week 0-51>.json and turn.json: one small file per week, so the front page fetches only today's
START = [12, 21]                              # the first day of the cycle (month, day); js/daily.js carries the same constant
MOVEMENTS, WEEKS_PER_MOVEMENT, DAYS = 3, 4, 6
REF = re.compile(r"^(?P<book>(?:[123] )?[A-Za-z ]+?) (?P<ch>\d+):(?P<a>\d+)(?:-(?P<z>\d+))?$")


def load():
    return json.loads(PLAN.read_text(encoding="utf-8")) if PLAN.exists() else None


def export(plan, D, bible):
    ids = {v[0]: int(k) for k, v in D["books"].items()}
    SP = D.get("SP", {})
    seen = {}

    def day(ref, title, where):
        m = REF.match(ref)
        if not m or m["book"] not in ids:
            sys.exit("daily: %s: cannot read the reference %r (book names are the archive's, e.g. Psalms 29:6)" % (where, ref))
        if not title or not title.strip():
            sys.exit("daily: %s: %s has no title" % (where, ref))
        b, ch, a = ids[m["book"]], int(m["ch"]), int(m["a"])
        z = int(m["z"] or a)
        if z < a or z - a > 3:
            sys.exit("daily: %s: %s must cover one to four verses" % (where, ref))
        rows = {str(r[0]): r[1] for r in (bible.get(str(b), {}).get(str(ch)) or [])}
        x = []
        for v in range(a, z + 1):
            key = "%d:%d:%d" % (b, ch, v)
            if key in seen:
                sys.exit("daily: %s: %s repeats a verse already used at %s" % (where, ref, seen[key]))
            seen[key] = where
            text = rows.get(str(SP.get(key, v)))
            if text is None:
                sys.exit("daily: %s: %s has no stored text for verse %d" % (where, ref, v))
            x.append([v, text])
        return {"b": b, "c": ch, "a": a, "z": z, "t": title.strip(), "x": x}

    seasons, weeks = [], []
    for s in plan["seasons"]:
        if len(s["movements"]) != MOVEMENTS:
            sys.exit("daily: %s needs %d movements" % (s["name"], MOVEMENTS))
        mvs = [{"name": m["name"], "line": m["line"]} for m in s["movements"]] + [{"name": s["closing"]["name"], "line": s["closing"]["line"]}]
        seasons.append({"id": s["id"], "name": s["name"], "line": s["line"], "movements": mvs})
        for mi, m in enumerate(s["movements"]):
            if len(m["weeks"]) != WEEKS_PER_MOVEMENT:
                sys.exit("daily: %s / %s needs %d weeks" % (s["name"], m["name"], WEEKS_PER_MOVEMENT))
            for w in m["weeks"]:
                weeks.append(week(s, mi, w, day))
        weeks.append(week(s, MOVEMENTS, s["closing"], day))
    if len(weeks) != 52:
        sys.exit("daily: the year needs 52 weeks, not %d" % len(weeks))
    turn = [day(r, t, "turn %d" % (i + 1)) for i, (r, t) in enumerate(plan["turn"])]
    if len(turn) != 2:
        sys.exit("daily: the turn of the year needs 2 days (the second is read only in a leap year)")
    if plan["start"] != START:
        sys.exit("daily: the plan starts on %r, but js/daily.js and tools/daily.py both fix the start at %r" % (plan["start"], START))
    files = {"turn.json": {"days": turn}}
    for i, w in enumerate(weeks):
        sn = seasons[i // 13]
        files["%d.json" % i] = {"i": i, "season": {"id": sn["id"], "name": sn["name"], "line": sn["line"]}, "n": i % 13 + 1,
                                "movement": sn["movements"][w["m"]], "name": w["name"], "days": w["days"]}
    return files


def week(s, mi, w, day):
    if len(w["days"]) != DAYS:
        sys.exit("daily: %s / %s needs %d days, not %d" % (s["name"], w["name"], DAYS, len(w["days"])))
    where = "%s / %s" % (s["name"], w["name"])
    return {"m": mi, "name": w["name"], "days": [day(r, t, "%s day %d" % (where, i + 1)) for i, (r, t) in enumerate(w["days"])]}


def review(files, D):
    """The whole plan as one readable page (tools/daily_plan.md), with each verse's stored words, for reading it through before it goes live."""
    names = {k: v[0] for k, v in D["books"].items()}
    PE = D.get("PE", {})

    def line(d, n):
        ref = "%s %d:%d%s" % (names[str(d["b"])], d["c"], d["a"], "-%d" % d["z"] if d["z"] > d["a"] else "")
        eng = (PE.get(str(d["b"])) or {}).get("%d:%d" % (d["c"], d["a"]))
        extra = " (%s %d:%d in English Bibles)" % ("Psalm" if names[str(d["b"])] == "Psalms" else names[str(d["b"])], eng[0], eng[1]) if eng else ""
        words = " ".join(("%s " % v if d["z"] > d["a"] else "") + re.sub(r"\s+", " ", t) for v, t in d["x"])
        return "%d. **%s**: %s%s\n   > %s" % (n, d["t"], ref, extra, words)

    out = ["# The daily study verse: the whole plan", "",
           "Generated by tools/export_site.py from tools/daily.json: do not edit this file; edit the plan and export again.",
           "A year is four seasons from the winter solstice (December 21). A season is three movements of four weeks, then a closing week (13 weeks, 91 days).",
           "A week is six verse days and a day of rest. The two days after week 52 are the turn of the year (the second only in a leap year).",
           "References use the archive's stored numbering; the English-Bible number is shown where it differs.", ""]
    last = None
    for i in range(52):
        w = files["%d.json" % i]
        if w["season"]["id"] != last:
            last = w["season"]["id"]
            out += ["", "## %s" % w["season"]["name"], "*%s*" % w["season"]["line"], ""]
        if w["n"] == 13 or (w["n"] - 1) % 4 == 0:
            out += ["", "### %s: %s" % (w["movement"]["name"], w["movement"]["line"]), ""]
        out += ["#### Week %d: %s" % (w["n"], w["name"]) if w["n"] < 13 else "#### %s" % w["name"], ""]
        out += [line(d, n + 1) for n, d in enumerate(w["days"])] + ["   *Rest.*", ""]
    out += ["", "## The turn of the year", ""] + [line(d, n + 1) for n, d in enumerate(files["turn.json"]["days"])]
    return "\n".join(out) + "\n"

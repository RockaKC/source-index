#!/usr/bin/env python3
"""Which Kingdom Code essays cite or discuss a historical subject (an Early Church figure now; manuscripts, books, civilizations later).

    python3 tools/connections.py kc_v35.db [--report connections.txt]

Reads the published essays' Markdown (nodes.body_md) from the database, read-only, and decides for each subject in tools/curated.json
(early_church[].link_terms, and any later section that carries link_terms) how each essay relates to it. tools/export_site.py calls
compute() and writes only the result, as D.EL, to data/site.js: no essay text leaves the database.

Three outcomes per essay and subject, from the text alone, with nothing invented:
  cited      the essay names a work by the subject (e.g. "Against Heresies", "On the Apparel of Women"). The essay uses the subject's own writing.
  discussed  no work is named, but the subject is the matter of at least 3 sentences, or of 2 where one gives a direct quotation.
  passing    anything less: a name in a list of Church Fathers, one remark. Never shown on the site; listed in the report so it can be promoted.
Sentences that name three or more known figures together ("Clement, Tertullian, Irenaeus, Origen...") are lists, and do not count toward
"discussed". A name that is also a common word ("Justin") only counts when the strong form ("Justin Martyr") or one of his works also appears in the essay.

Corrections live in tools/curated.json, "connection_overrides": [{"subject": "church/tertullian", "essay": 322, "as": "cited|discussed|hide", "why": "..."}].
Each (subject, essay) pair appears once. The reverse direction (an essay's page listing its subjects) is derived from the same pairs in js/connections.js,
so the two directions can never disagree.
"""
import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "tools" / "curated.json"

# Figures a list of Fathers is likely to name; three of them in one sentence is a list, not a discussion.
FATHERS = ["Ignatius", "Polycarp", "Justin", "Irenaeus", "Irenæus", "Tertullian", "Clement", "Origen", "Cyprian", "Hippolytus", "Athenagoras",
           "Eusebius", "Augustine", "Jerome", "Athanasius", "Ambrose", "Chrysostom", "Lactantius", "Theophilus", "Tatian", "Papias", "Barnabas"]


def sentences(md):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", md) if s.strip()]


def is_list(sentence):
    return sum(1 for f in FATHERS if re.search(r"\b%s\b" % f, sentence)) >= 3


def analyse(subject, title, body):
    """-> (kind, counts) for one essay and one subject; kind is 'cited', 'discussed' or 'passing'; None when the subject is absent."""
    terms = subject["link_terms"]
    strong = [re.compile(r"\b%s\b" % re.escape(n)) for n in terms.get("names", [])]
    works = [(w, re.compile(re.escape(w))) for w in terms.get("works", [])]       # titles are capitalised: "On Fasting" is not "studies on fasting"
    short = [re.compile(r"\b%s\b" % re.escape(n)) for n in terms.get("short", [])]
    strong_hit = any(p.search(body) or p.search(title) for p in strong)
    named_works = [w for w, p in works if strong_hit and (p.search(body) or p.search(title))]    # a work counts only in an essay that also names the person
    names = strong + (short if (strong_hit or named_works) else [])
    ss = sentences(body)
    mine = [s for s in ss if any(p.search(s) for p in names)]
    if not mine and not named_works:
        return None, {}
    counted = [s for s in mine if not is_list(s)]
    quoted = any(re.search(r"[“\"].{12,}[”\"]", s) for s in counted)
    in_title = any(p.search(title) for p in names)
    info = {"works": named_works, "sentences": len(counted), "list_sentences": len(mine) - len(counted), "in_title": in_title, "quoted": quoted}
    if named_works:
        return "cited", info
    if in_title or len(counted) >= 3 or (len(counted) >= 2 and quoted):
        return "discussed", info
    return "passing", info


def subjects_from(cur):
    """Every subject that asks to be connected: key 'section/slug', with its link_terms."""
    out = []
    for f in cur.get("early_church", []):
        if f.get("link_terms"):
            out.append({"key": "church/" + f["slug"], "name": f["name"], "link_terms": f["link_terms"]})
    return out        # later: manuscripts, books, civilizations: add their sections here, same shape


def compute(conn, cur, report=None):
    """-> {subject key: [[essay id, 'c'|'d', sentence count], ...]} for the pairs shown on the site."""
    over = {}
    for o in cur.get("connection_overrides", []):
        if o.get("as") not in ("cited", "discussed", "hide") or not o.get("why"):
            sys.exit("connection_overrides: each needs as = cited, discussed or hide, and a why: %r" % o)
        key = (o["subject"], int(o["essay"]))
        if key in over:
            sys.exit("connection_overrides: %s / %s is listed twice" % key)
        over[key] = o
    rows = conn.execute("""select n.id, n.title, n.body_md, a.published_at from nodes n join articles a on a.node_id = n.id
                           where n.type = 'article' and n.status = 'published' and n.body_md is not null""").fetchall()
    out, lines = {}, []
    for s in subjects_from(cur):
        shown, passing = [], []
        for pid, title, body, date in rows:
            kind, info = analyse(s, title, body)
            o = over.get((s["key"], pid))
            if o:
                kind = None if o["as"] == "hide" else o["as"]
                info = dict(info or {}, override=o["why"])
            if kind in ("cited", "discussed"):
                shown.append((pid, kind, info, title, date))
            elif kind == "passing":
                passing.append((pid, info, title))
        used = {pid for pid, *_ in shown}
        for (subj, pid) in over:
            if subj == s["key"] and pid not in used and over[(subj, pid)]["as"] != "hide":
                title = next((r[1] for r in rows if r[0] == pid), None)
                if title is None:
                    sys.exit("connection_overrides: essay %s is not a published essay with text" % pid)
                shown.append((pid, over[(subj, pid)]["as"], {"sentences": 0, "override": over[(subj, pid)]["why"]}, title, ""))
        order = {"cited": 0, "discussed": 1}
        shown.sort(key=lambda r: r[4] or "", reverse=True)                       # newest first,
        shown.sort(key=lambda r: order[r[1]])                                    # then cited before discussed (a stable sort keeps the dates)
        out[s["key"]] = [[pid, "c" if kind == "cited" else "d", info.get("sentences", 0)] for pid, kind, info, *_ in shown]
        lines.append("\n== %s: %d shown, %d passing" % (s["name"], len(shown), len(passing)))
        for pid, kind, info, title, date in shown:
            why = "names " + ", ".join(info["works"]) if info.get("works") else ("%d sentences%s" % (info.get("sentences", 0), ", with a quotation" if info.get("quoted") else ""))
            lines.append("  SHOWN   %-9s %4d  %s  [%s]%s" % (kind, pid, title[:58], why, "  override: " + info["override"] if info.get("override") else ""))
        for pid, info, title in passing:
            lines.append("  passing           %4d  %s  [%d sentence(s), %d in lists]" % (pid, title[:58], info["sentences"], info["list_sentences"]))
    if report:
        Path(report).write_text("\n".join(lines).lstrip("\n") + "\n", encoding="utf-8")
    return out, "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("db")
    ap.add_argument("--report")
    args = ap.parse_args()
    conn = sqlite3.connect("file:%s?mode=ro" % Path(args.db).resolve(), uri=True)
    cur = json.loads(CURATED.read_text(encoding="utf-8"))
    out, text = compute(conn, cur, args.report)
    print(text.lstrip("\n"))


if __name__ == "__main__":
    main()

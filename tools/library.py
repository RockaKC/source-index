#!/usr/bin/env python3
"""The Essays library: check tools/library.json against the database, and propose a place for essays that have none.

    python3 tools/library.py kc_v35.db            # audit: every listed essay classified; where the text disagrees with a tag
    python3 tools/library.py kc_v35.db --propose  # a first guess (subject and topics) for any essay not yet in library.json

tools/library.json holds the decisions: categories (one per essay, the "subject"), tags (several per essay, the "topics", each with `terms`,
a regular expression for the words that mark it), and reading collections. The exporter (tools/export_site.py) reads it, validates it
(validate()), and writes only D.LIB to data/site.js. The audit reads each essay's full text, not its title: it lists tags an essay
has but never mentions, and topics an essay discusses heavily but does not carry, so a person can correct library.json. Nothing here
changes library.json; a proposal is a starting point to be read and edited.
"""
import argparse
import collections
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIBRARY = ROOT / "tools" / "library.json"
MIN_TOPIC = 3            # a topic with fewer essays than this has no page of its own
GENERIC = {"jesus-gospels", "discernment", "discipleship", "ot-narratives", "modern-church", "rome", "babylon", "politics", "media", "technology", "israel", "martyrs"}


def load():
    return json.loads(LIBRARY.read_text(encoding="utf-8"))


def validate(lib, listed):
    """Exit with a message when library.json is not sound. `listed` = ids (str) of the essays the site lists."""
    cats = {c["id"] for c in lib["categories"]}
    tags = {t["id"] for t in lib["tags"]}
    if len(cats) != len(lib["categories"]) or len(tags) != len(lib["tags"]):
        sys.exit("library.json: a category or tag id is used twice")
    for t in lib["tags"]:
        re.compile(t["terms"])
    missing = sorted(set(listed) - set(lib["essays"]), key=int)
    if missing:
        sys.exit("library.json has no entry for essay(s) %s. Run: python3 tools/library.py <db> --propose" % ", ".join(missing))
    for pid, e in lib["essays"].items():
        if e["cat"] not in cats:
            sys.exit("essay %s: unknown subject %r" % (pid, e["cat"]))
        if not e["tags"] or len(set(e["tags"])) != len(e["tags"]):
            sys.exit("essay %s: needs at least one topic, each once" % pid)
        for t in e["tags"]:
            if t not in tags:
                sys.exit("essay %s: unknown topic %r" % (pid, t))
    ids = set()
    for col in lib.get("collections", []):
        if col["id"] in ids or not col.get("title") or not col.get("items"):
            sys.exit("library.json: a collection needs a unique id, a title and items: %r" % col.get("id"))
        ids.add(col["id"])
        for pid in col["items"]:
            if str(pid) not in lib["essays"]:
                sys.exit("collection %s lists essay %s, which is not in the library" % (col["id"], pid))


PAGES = {"translations": ("Bible translations", "#/translations"), "english": ("The Ethiopian books in English", "#/english"),
         "words": ("Words", "#/words"), "church": ("Early Church", "#/church"), "names": ("Names", "#/names"), "essays": ("Essays", "#/essays")}


def resolve(ref, D):
    """'book:Enoch' -> {'l': label, 'h': '#/book/14'}, from what the site really has. Exits when a reference points at nothing."""
    kind, _, key = ref.partition(":")
    if kind == "book":
        e = next((x for x in D["entries"] if x["name"] == key), None)
        return {"l": "Read " + e["name"], "h": "#/book/%d" % e["id"]} if e else None
    if kind == "person":
        x = next((p for p in D["PP"] if p["slug"] == key), None)
        return {"l": x["name"] + ", profile", "h": "#/person/" + key} if x else None
    if kind == "word":
        x = next((w for w in D["words"] if w["slug"] == key), None)
        return {"l": x["title"], "h": "#/word/" + key} if x else None
    if kind == "figure":
        x = next((f for f in D.get("EC", []) if f["slug"] == key), None)
        return {"l": x["name"], "h": "#/church/" + key} if x else None
    if kind == "guide":
        x = next((g for g in D.get("KG", []) if g["slug"] == key), None)
        return {"l": x["title"], "h": "#/guides/" + key} if x else None
    if kind == "path":
        x = next((p for p in D["paths"] if p["id"] == key), None)
        return {"l": x["q"], "h": "#/path/" + key} if x else None
    if kind == "page" and key in PAGES and (key != "church" or D.get("EC")):
        return {"l": PAGES[key][0], "h": PAGES[key][1]}
    return None


def export(lib, D, listed):
    """The part of library.json the site needs: D.LIB. Topics with fewer than MIN_TOPIC essays are left out; every link must resolve."""
    def links(owner, refs):
        out = []
        for r in refs:
            x = resolve(r, D)
            if not x:
                if r.startswith(("guide:", "figure:")) or r == "page:church":
                    continue                      # a product that this build of the site does not carry (the app has no guides)
                sys.exit("library.json: %s links to %r, which the site does not have" % (owner, r))
            out.append(x)
        return out
    count = collections.Counter(t for p, e in lib["essays"].items() if p in listed for t in e["tags"])
    return {
        "cats": [{"id": c["id"], "name": c["name"], "line": c["line"], "links": links(c["id"], c.get("links", []))} for c in lib["categories"]],
        "tags": [{"id": t["id"], "name": t["name"], "line": t["line"], "links": links(t["id"], t.get("links", [])), "n": count[t["id"]]}
                 for t in lib["tags"] if count[t["id"]] >= MIN_TOPIC],
        "ess": {p: [e["cat"], [t for t in e["tags"] if count[t] >= MIN_TOPIC]] for p, e in sorted(lib["essays"].items(), key=lambda kv: int(kv[0])) if p in listed},
        "cols": [{"id": c["id"], "title": c["title"], "line": c.get("line", ""), "items": [str(i) for i in c["items"]]} for c in lib.get("collections", [])],
    }


def texts(conn, ids):
    q = "select id, title, body_md from nodes where type = 'article' and id in (%s)" % ",".join("?" * len(ids))
    return {str(i): (t or "") + "\n" + (b or "") for i, t, b in conn.execute(q, [int(x) for x in ids])}


def hits(lib, text):
    return {t["id"]: len(re.findall(t["terms"], text)) for t in lib["tags"]}


def audit(lib, conn):
    body = texts(conn, list(lib["essays"]))
    names = {t["id"]: t["name"] for t in lib["tags"]}
    lines, n = [], 0
    for pid, e in sorted(lib["essays"].items(), key=lambda kv: -int(kv[0])):
        h = hits(lib, body.get(pid, ""))
        weak = [t for t in e["tags"] if h[t] == 0]
        strong = [t for t in h if t not in e["tags"] and h[t] >= (12 if t in GENERIC else 6)]
        if weak or strong:
            n += 1
            lines.append("%5s  %-9s %s" % (pid, e["cat"], body[pid].split("\n")[0][:60]))
            if weak:
                lines.append("         carries but never mentions: " + ", ".join(weak))
            if strong:
                lines.append("         discusses but does not carry: " + ", ".join("%s (%d)" % (t, h[t]) for t in sorted(strong, key=lambda x: -h[x])))
    return "\n".join(lines), n


def propose(lib, conn, ids):
    body = texts(conn, ids)
    by_cat = collections.defaultdict(collections.Counter)         # which topics each subject uses most: the link from topics to a subject
    for e in lib["essays"].values():
        for t in e["tags"]:
            by_cat[e["cat"]][t] += 1
    out = {}
    for pid in ids:
        h = hits(lib, body.get(pid, ""))
        picked = [t for t in sorted(h, key=lambda x: -h[x]) if h[t] >= (12 if t in GENERIC else 4)][:5] or [max(h, key=h.get)]
        score = {c: sum(counter[t] / sum(counter.values()) for t in picked) for c, counter in by_cat.items()}
        out[pid] = {"cat": max(score, key=score.get), "tags": picked}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("db")
    ap.add_argument("--propose", action="store_true")
    args = ap.parse_args()
    conn = sqlite3.connect("file:%s?mode=ro" % Path(args.db).resolve(), uri=True)
    lib = load()
    if args.propose:
        data = json.loads(re.search(r"^const D = (\{.*\});$", (ROOT / "data" / "site.js").read_text(encoding="utf-8"), re.M).group(1))
        refs = {str(p) for ch in data["verses"].values() for vs in ch.values() for ps in vs.values() for p in ps}
        listed = (set(map(str, data["PUB"])) | refs) & set(data["pieces"])
        todo = sorted(listed - set(lib["essays"]), key=int)
        if not todo:
            print("every listed essay is in library.json")
            return
        for pid, v in propose(lib, conn, todo).items():
            print('  "%s": %s,   // %s' % (pid, json.dumps(v), data["pieces"][pid][0][:60]))
        return
    text, n = audit(lib, conn)
    print(text or "no disagreements")
    counts = collections.Counter(t for e in lib["essays"].values() for t in e["tags"])
    small = [t for t, c in counts.items() if c < MIN_TOPIC]
    print("\n%d essay(s) to look at. Topics with fewer than %d essays (no page of their own): %s" % (n, MIN_TOPIC, ", ".join(sorted(small)) or "none"))


if __name__ == "__main__":
    main()

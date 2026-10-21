#!/usr/bin/env python3
"""The Daily Witness: check tools/witness.json against the stored text, write what the website reads, and report canon coverage.

    python3 tools/export_site.py kc_v35.db       # runs export() as part of the export
    python3 tools/witness.py coverage             # which books of the canon the studies have touched (reads data/site.js and bible/, no database)

tools/witness.json is the editorial schedule: studies in order, each a passage with its context, investigation, cross-references and links. export() refuses
anything that would put an unchecked word before a reader:
  * every Scripture quotation in the prose is written [[Reference|the words]], and the words must appear in the stored text of that reference
    ([[Reference]] alone is a link); a quotation mark outside that markup is refused;
  * every reference resolves to stored text (the archive's own numbering, as the verse pages use it), within one chapter, in at most four verses
    (a passage may have up to three such stretches);
  * no verse is the primary passage of two studies, the same book is never the passage of two studies in a row, and no book is the passage of
    more than two studies in any seven;
  * titles, observations, takeaways and every cross-reference's reason are present; builds_on points only at earlier studies; links into the archive exist.
It returns the compact index for D.W (data/site.js) and one file per study (data/witness/<n>.json). Prose becomes segments the page can draw without
parsing: a string, {"r": [book, chapter, first, last]} for a link, {"r": [...], "q": "words"} for a checked quotation, {"i": "text"} for italics.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLAN = ROOT / "tools" / "witness.json"
OUT = ROOT / "data" / "witness"
REVIEW = ROOT / "tools" / "witness_review.md"
REF = re.compile(r"^(?P<book>(?:[123] )?[A-Za-z ]+?) (?P<ch>\d+):(?P<a>\d+)(?:-(?P<z>\d+))?$")
MAX_PASSAGE, MAX_CROSS, MAX_STRETCHES = 14, 4, 3
STATUSES = ("draft", "approved")


def load():
    return json.loads(PLAN.read_text(encoding="utf-8")) if PLAN.exists() else None


def norm(s):
    """Quotation matching ignores case, the translation's own brackets and plural markers, curly quotes, and runs of space."""
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"').replace("—", "-").replace("–", "-")
    s = re.sub(r"[\[\]⁺]", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


class Ctx:
    def __init__(self, D, bible):
        self.D, self.bible = D, bible
        self.ids = {v[0]: int(k) for k, v in D["books"].items()}
        self.names = {int(k): v[0] for k, v in D["books"].items()}
        self.SP = D.get("SP", {})

    def ref(self, text, where, limit):
        m = REF.match(text.strip())
        if not m or m["book"] not in self.ids:
            sys.exit("witness: %s: cannot read the reference %r (use the archive's book names and stored numbering, e.g. Psalms 29:6)" % (where, text))
        b, ch, a = self.ids[m["book"]], int(m["ch"]), int(m["a"])
        z = int(m["z"] or a)
        if z < a or z - a + 1 > limit:
            sys.exit("witness: %s: %s must cover at most %d verses" % (where, text, limit))
        return b, ch, a, z

    def words(self, b, ch, a, z, where):
        """The stored words of the verses, in order (a verse carried by another verse reads from its carrier, as the verse pages do)."""
        rows = {str(r[0]): r[1] for r in (self.bible.get(str(b), {}).get(str(ch)) or [])}
        out = []
        for v in range(a, z + 1):
            t = rows.get(str(self.SP.get("%d:%d:%d" % (b, ch, v), v)))
            if t is None:
                sys.exit("witness: %s: %s %d:%d has no stored text" % (where, self.names[b], ch, v))
            out.append(t)
        return out

    def label(self, b, ch, a, z):
        return "%s %d:%d%s" % (self.names[b], ch, a, "–%d" % z if z > a else "")

    def labels(self, stretches):
        """John 5:31-40, 45-47: a later stretch of the same chapter drops the book and the chapter."""
        out = []
        for k, (b, ch, a, z) in enumerate(stretches):
            if k and stretches[k - 1][:2] == (b, ch):
                out.append("%d%s" % (a, "–%d" % z if z > a else ""))
            else:
                out.append(self.label(b, ch, a, z))
        return ", ".join(out)


def quote_ok(ctx, b, ch, a, z, quote, where):
    hay = norm(" ".join(ctx.words(b, ch, a, z, where)))
    pos = 0
    for frag in re.split(r"\s*(?:…|\.\.\.)\s*", quote):
        f = norm(frag)
        if not f:
            continue
        i = hay.find(f, pos)
        if i < 0:
            sys.exit("witness: %s: the quotation %r is not in the stored text of %s" % (where, quote, ctx.label(b, ch, a, z)))
        pos = i + len(f)


TOKEN = re.compile(r"\[\[(.+?)\]\]")


def rich(ctx, text, where):
    """Prose with [[Ref|quote]], [[Ref]] and *italics* -> segments."""
    out, last = [], 0

    def plain(s):
        if re.search(r'["“”]', s):
            sys.exit("witness: %s: a quotation mark outside [[Reference|words]]: %r (Scripture quotations must be written [[Reference|the words]] so they are checked)" % (where, s[:60]))
        for k, part in enumerate(re.split(r"\*([^*]+)\*", s)):
            if part:
                out.append({"i": part} if k % 2 else part)
    for m in TOKEN.finditer(text):
        plain(text[last:m.start()])
        ref, _, quote = m[1].partition("|")
        r = list(ctx.ref(ref, where, MAX_CROSS))
        if quote:
            quote_ok(ctx, *r, quote.strip(), where)
            out.append({"r": r, "q": quote.strip()})
        else:
            ctx.words(*r, where)
            out.append({"r": r})
        last = m.end()
    plain(text[last:])
    return out


def plain_text(segs):
    return "".join(s if isinstance(s, str) else s["i"] if "i" in s else (("“%s”" % s["q"]) if "q" in s else "") for s in segs)


def export(plan, D, bible, listed):
    ctx = Ctx(D, bible)
    sched = plan.get("schedule", {})
    start, tz = sched.get("start"), sched.get("timezone") or "UTC"
    if start is not None and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", start):
        sys.exit("witness: schedule.start must be a date like 2026-11-02, or null while nothing is approved")
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(tz)
    except Exception:
        sys.exit("witness: %r is not a time zone name" % tz)
    threads = {t["id"]: t for t in plan["threads"]}
    group_of = {}
    groups = []
    for g in plan["groups"]:
        ids = []
        for nme in g["books"]:
            if nme not in ctx.ids:
                sys.exit("witness: group %r names %r, which is not a book of the archive" % (g["name"], nme))
            b = ctx.ids[nme]
            if b in group_of:
                sys.exit("witness: %s is in two groups" % nme)
            group_of[b] = g["name"]
            ids.append(b)
        groups.append({"name": g["name"], "books": ids})
    unfiled = sorted(ctx.names[int(b)] for b in D["CC"] if int(b) not in group_of)
    if unfiled:
        sys.exit("witness: books with text that no group lists: %s" % ", ".join(unfiled))

    entries, files, used, primary_books = [], {}, {}, []
    guides = {g["slug"] for g in D.get("KG", [])}
    church = {f["slug"] for f in D.get("EC", [])}
    names = {x["slug"] for x in D.get("PP", [])}
    words = {w["slug"] for w in D.get("words", [])}
    seen_slugs = set()
    for i, e in enumerate(plan["entries"]):
        n = e["n"]
        where = "study %d" % n
        if n != i + 1:
            sys.exit("witness: studies must be numbered 1, 2, 3 ... in order: found %s at position %d" % (n, i + 1))
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", e["slug"]) or e["slug"] in seen_slugs:
            sys.exit("witness: %s: the slug %r is not a unique lower-case address" % (where, e["slug"]))
        seen_slugs.add(e["slug"])
        if e["status"] not in STATUSES:
            sys.exit("witness: %s: status must be draft or approved" % where)
        if e["thread"] not in threads:
            sys.exit("witness: %s: unknown thread %r" % (where, e["thread"]))
        if any(not (1 <= u < n) for u in e["builds_on"]):
            sys.exit("witness: %s: builds_on may name only earlier studies" % where)
        for field in ("title", "observation", "takeaway"):
            if not e[field].strip():
                sys.exit("witness: %s: %s is empty" % (where, field))
        if not 60 <= len(e["observation"]) <= 260:
            sys.exit("witness: %s: the observation is %d characters; it is the front-page line and should be 60 to 260" % (where, len(e["observation"])))
        stretches = [ctx.ref(p, where, MAX_PASSAGE) for p in e["passage"]]
        if not 1 <= len(stretches) <= MAX_STRETCHES or sum(z - a + 1 for _, _, a, z in stretches) > MAX_PASSAGE:
            sys.exit("witness: %s: a passage is one to %d stretches and at most %d verses in all" % (where, MAX_STRETCHES, MAX_PASSAGE))
        for b, ch, a, z in stretches:
            ctx.words(b, ch, a, z, where)
            for v in range(a, z + 1):
                k = "%d:%d:%d" % (b, ch, v)
                if k in used:
                    sys.exit("witness: %s: %s %d:%d is already the passage of study %d" % (where, ctx.names[b], ch, v, used[k]))
                used[k] = n
        books = []
        for b, *_ in stretches:
            if b not in books:
                books.append(b)
        primary_books.append(books)
        if len(books) > 1:
            sys.exit("witness: %s: a passage stays within one book" % where)
        if i and primary_books[i - 1] == books:
            sys.exit("witness: studies %d and %d both take their passage from %s; the same book may not come two days running" % (n - 1, n, ctx.names[books[0]]))
        window = [bk[0] for bk in primary_books[max(0, i - 6): i + 1]]
        if window.count(books[0]) > 2:
            sys.exit("witness: %s appears in more than two of the seven studies ending at study %d" % (ctx.names[books[0]], n))
        if not 1 <= len(e["context"]) <= 3 or not 3 <= len(e["investigation"]) <= 5:
            sys.exit("witness: %s: context is 1 to 3 paragraphs and the investigation 3 to 5" % where)
        if not 3 <= len(e["crossrefs"]) <= 6:
            sys.exit("witness: %s: 3 to 6 cross-references" % where)
        x = []
        for c in e["crossrefs"]:
            r = ctx.ref(c["ref"], where, MAX_CROSS)
            if not c["why"].strip():
                sys.exit("witness: %s: the cross-reference %s has no reason" % (where, c["ref"]))
            item = {"r": list(r), "w": rich(ctx, c["why"], where)}
            if c.get("quote"):
                quote_ok(ctx, *r, c["quote"], where)
                item["q"] = c["quote"]
            x.append(item)
        rel = e["related"]
        for pid in rel["essays"]:
            if str(pid) not in listed:
                sys.exit("witness: %s: essay %s is not one of the listed essays" % (where, pid))
        for key, have in (("guides", guides), ("church", church), ("names", names), ("words", words)):
            for s in rel[key]:
                if s not in have:
                    sys.exit("witness: %s: related %s %r does not exist" % (where, key, s))
        entries.append({"n": n, "slug": e["slug"], "t": e["title"], "ref": ctx.labels(stretches), "obs": e["observation"],
                        "th": e["thread"], "st": e["status"], "up": e["builds_on"], "bk": books[0],
                        "xb": sorted({c["r"][0] for c in x} - {books[0]})})
        files["%d.json" % n] = {"n": n, "ps": [list(s) for s in stretches], "ctx": [rich(ctx, p, where) for p in e["context"]],
                                "inv": [rich(ctx, p, where) for p in e["investigation"]], "x": x, "take": rich(ctx, e["takeaway"], where),
                                "rel": {k: rel[k] for k in ("essays", "guides", "church", "names", "words")}}
    W = {"tz": tz, "ws": start, "th": plan["threads"], "g": groups, "e": entries}
    return W, files


def coverage_report(D, entries, ctx=None):
    names = {int(k): v[0] for k, v in D["books"].items()}
    groups = {}
    for b in D["CC"]:
        pass
    touched, crossed = {}, {}
    for e in entries:
        touched.setdefault(e["bk"], []).append(e["n"])
        for b in e["xb"]:
            crossed.setdefault(b, []).append(e["n"])
    lines = []
    for g in D["W"]["g"]:
        have = [b for b in g["books"] if str(b) in D["CC"]]
        hit = [b for b in have if b in touched]
        also = [b for b in have if b in crossed and b not in touched]
        lines.append("%-30s %2d of %2d studied%s%s" % (g["name"], len(hit), len(have),
                     ("   [" + ", ".join("%s x%d" % (names[b], len(touched[b])) for b in hit) + "]") if hit else "",
                     ("   cross-referenced: " + ", ".join(names[b] for b in also)) if also else ""))
    return "\n".join(lines), len(touched), len(D["CC"])


def review(D, W, files, bible):
    """The whole schedule as one readable page (tools/witness_review.md), with the stored words of each passage and every check made, for reading it before approval."""
    ctx = Ctx(D, bible)
    out = ["# The Daily Witness: the studies, for review", "",
           "Generated by tools/export_site.py from tools/witness.json: do not edit this file; edit the plan and export again.",
           "Every quotation below was checked against the stored text. Nothing is public until a study's status is changed from draft to approved and the schedule has a start date.", ""]
    for e in W["e"]:
        f = files["%d.json" % e["n"]]
        out += ["", "## %d. %s" % (e["n"], e["t"]), "",
                "*%s* · thread: %s · builds on: %s · status: **%s**" % (e["ref"], next(t["name"] for t in W["th"] if t["id"] == e["th"]), ", ".join(map(str, e["up"])) or "none", e["st"]), "",
                "**On the front page:** %s" % e["obs"], "", "### The passage (%s)" % D["TR"][str(f["ps"][0][0])], ""]
        for b, ch, a, z in f["ps"]:
            for v, t in zip(range(a, z + 1), ctx.words(b, ch, a, z, "review")):
                out.append("> **%d** %s" % (v, re.sub(r"\s+", " ", t)))
            out.append("")
        out += ["### Context", ""] + [plain_text(p) + "\n" for p in f["ctx"]]
        out += ["### Investigation", ""] + [plain_text(p) + "\n" for p in f["inv"]]
        out += ["### Cross-references", ""]
        for c in f["x"]:
            b, ch, a, z = c["r"]
            out.append("- **%s**: %s%s" % (ctx.label(b, ch, a, z), plain_text(c["w"]), ("  \n  “%s”" % c["q"]) if c.get("q") else ""))
        out += ["", "### Take with you", "", plain_text(f["take"]), "",
                "*Related:* " + (", ".join("%s: %s" % (k, ", ".join(map(str, v))) for k, v in f["rel"].items() if v) or "none")]
    return "\n".join(out) + "\n"


def main():
    if len(sys.argv) < 2 or sys.argv[1] != "coverage":
        sys.exit(__doc__)
    D = json.loads(re.search(r"^const D = (\{.*\});$", (ROOT / "data" / "site.js").read_text(encoding="utf-8"), re.M).group(1))
    text, touched, total = coverage_report(D, D["W"]["e"])
    print("The Daily Witness: %d studies; %d of the %d books with stored text have been the subject of a study\n" % (len(D["W"]["e"]), touched, total))
    print(text)
    short = [v[0] for k, v in D["books"].items() if str(k) not in D["CC"]]
    print("\nIn the canon but with no stored text yet (%d): %s" % (len(short), ", ".join(short)))


if __name__ == "__main__":
    main()

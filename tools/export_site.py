#!/usr/bin/env python3
"""Rebuild the Source Index data from the Kingdom Code SQLite database.

    python3 tools/export_site.py /path/to/kc_v13.db            # rebuild index.html data + bible.json
    python3 tools/export_site.py /path/to/kc_v13.db --check    # report what would change, write nothing

What it writes:
  * bible.json            every verse of every book that has text
  * index.html            the single `const D = {...};` line (nothing else in the file changes)

What it reads from the database (read-only): scripture, books, canon, citations,
published articles, the Psalm map, verse spans/parts, and guide passages.
It never reads the patron, pledge, income or identity tables. The database file
itself is never copied into the repo (see .gitignore).

Publication rule: only articles with status 'published' appear. Draft citations never
reach the page. Citations the database marks resolution='review' (unconfirmed numbering)
and those with no house reference are left out until they are resolved. A citation at a
verse the stored text does not have is still shown as a hit (the verse page lists the
essay without verse text) and is named in the report.

Hand-kept page content (question paths, word entries, display names, ...) lives in
tools/curated.json.
"""
import argparse
import collections
import json
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "tools" / "curated.json"
HTML = ROOT / "index.html"
BIBLE = ROOT / "bible.json"

EXPECTED_TABLES = {
    "books", "canon_entries", "nodes", "articles", "citations", "verses", "verse_parts",
    "verse_spans", "verse_map", "links", "passages", "translations", "content_metrics",
}
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def dumps(obj):
    return json.dumps(obj, ensure_ascii=True, separators=(",", ":"))


def plain(text):
    """Strip the editorial marks the database keeps (same as its v_verses_plain view)."""
    return text.replace("⌈", "").replace("⌉", "").replace("†", "")


def split_ref(n):
    """book*1000000 + chapter*1000 + verse -> (book, chapter, verse)"""
    book, rest = divmod(n, 1_000_000)
    chapter, verse = divmod(rest, 1000)
    return book, chapter, verse


def connect(path):
    uri = "file:{}?mode=ro".format(Path(path).resolve())
    con = sqlite3.connect(uri, uri=True)
    ok = con.execute("pragma integrity_check").fetchone()[0]
    if ok != "ok":
        sys.exit("database failed its integrity check: " + ok)
    have = {r[0] for r in con.execute("select name from sqlite_master")}
    missing = EXPECTED_TABLES - have
    if missing:
        sys.exit("database is missing expected tables: " + ", ".join(sorted(missing)))
    return con


def dictionary_entries(con, cur, books, warn):
    """Dictionary text for the word entries the page links to a Strong's number (form["n"] in curated.json).

    A key with a letter ("H738A") names one exact entry. A bare number ("H5315") names the main sense (the first
    entry for that number) and also lists the other senses' glosses. Stops if any link does not resolve."""
    keys = []
    for w in cur["words"]:
        for f in w["forms"]:
            if f.get("n") and f["n"] not in keys:
                keys.append(f["n"])
    if not keys:
        return {}, []
    have = con.execute("select count(*) from lexicon").fetchone()[0]
    if not have:
        sys.exit("the word entries link to the dictionary, but this database has no lexicon rows; "
                 "use kc_v16.db or later")
    fixes = cur.get("lexicon_fixes", {}).get("fixes", [])
    out, used, missing = collections.OrderedDict(), set(), []
    for k in keys:
        exact = con.execute("select id,language,strongs,lemma,transliteration,gloss,definition,dataset_id from lexicon "
                            "where strongs = ?", (k,)).fetchall()
        if exact:
            row, others = exact[0], []
        else:
            rows = [r for r in con.execute("select id,language,strongs,lemma,transliteration,gloss,definition,dataset_id "
                                           "from lexicon where strongs glob ? || '*' order by id", (k,))
                    if re.fullmatch(re.escape(k) + r"[A-Za-z]?", r[2])]
            if not rows:
                missing.append(k)
                continue
            row, others = rows[0], rows[1:]
        _, lang, key, lemma, translit, gloss, definition, ds = row
        text = re.sub(r"(?m)^(_+|\u00a7)\s*", "", definition or "")   # the source's indent and etymology markers
        for fk, wrong, right in fixes:
            if fk == key:
                if wrong not in text:
                    warn("lexicon fix for %s no longer applies: %r not found" % (key, wrong))
                text = text.replace(wrong, right)
        seen, more = {gloss}, []
        for r in others:
            g = (r[5] or "")
            g = g.split(": ", 1)[1] if ": " in g else g
            if g and g not in seen:
                seen.add(g)
                more.append(g)
        out[k] = {"k": key, "lang": lang, "l": lemma, "t": (translit or "").replace(".", ""), "g": gloss or "",
                  "d": text, "m": more[:8]}
        used.add(ds)
    if missing:
        sys.exit("these Strong's links do not resolve in the lexicon: " + ", ".join(missing))
    credit = []
    marks = ",".join("?" * len(used))
    attrs = sorted({r[0] for r in con.execute("select attribution_text from datasets where id in (%s)" % marks, tuple(used))
                    if r[0]})
    if attrs:
        credit = [{"what": "Hebrew and Greek dictionary entries",
                   "text": " ".join(attrs) + " Entries are shown as supplied, with plain-text formatting and a small "
                           "number of typographical corrections."}]
    return out, credit


def build(con, cur, warn):
    q = lambda sql, *a: con.execute(sql, a).fetchall()
    D = collections.OrderedDict()

    # ---- books, canon ----
    books = {r[0]: [r[1], r[2]] for r in q("select id, name, testament from books order by id")}
    D["books"] = {str(k): v for k, v in books.items()}
    entry_books = collections.defaultdict(list)
    book_entry = {}
    for bid, eid in q("select id, canon_entry_id from books order by id"):
        entry_books[eid].append(bid)
        book_entry[str(bid)] = eid
    entries = []
    for eid, testament, listed in q("select id, testament, name_as_listed from canon_entries order by id"):
        c = cur["entries"].get(str(eid))
        if c is None:
            warn("canon entry %d (%s) has no display name in curated.json; using the database name" % (eid, listed))
            c = {"name": listed, "extra": False}
        entries.append({"id": eid, "t": testament, "name": c["name"], "books": entry_books[eid], "extra": c["extra"]})
    D["entries"] = entries
    D["bookEntry"] = book_entry

    # ---- scripture text (with lettered parts, editorial marks stripped) ----
    text_rows = collections.defaultdict(lambda: collections.defaultdict(list))
    trans_of = {}
    for b, ch, v, t, tr in q("select book_id, chapter, verse, text, translation from verses"):
        text_rows[b][ch].append((v, "", v, plain(t)))
        trans_of[b] = tr
    for b, ch, v, p, t, tr in q("select book_id, chapter, verse, part, text, translation from verse_parts"):
        text_rows[b][ch].append((v, p, "%d%s" % (v, p), plain(t)))
        trans_of.setdefault(b, tr)
    bible = {}
    for b in sorted(text_rows):
        bible[str(b)] = {str(ch): [[r[2], r[3]] for r in sorted(rows, key=lambda r: (r[0], r[1]))]
                         for ch, rows in sorted(text_rows[b].items())}

    verse_count = collections.defaultdict(int)
    for b, ch, mx in q("select book_id, chapter, max(verse) from verses group by 1, 2"):
        verse_count[(b, ch)] = mx

    # ---- essays (published articles only) ----
    excluded = set(cur["exclude_piece_ids"]["ids"])
    rows = q("""select n.id, n.title, a.url, a.platform, substr(a.published_at, 1, 10), a.post_type
                from nodes n join articles a on a.node_id = n.id
                where n.type = 'article' and n.status = 'published'
                order by n.id""")
    pieces_src = [r for r in rows if r[5] != "quip" and r[0] not in excluded]
    views = {}
    for nid, v in q("""select node_id, max(coalesce(views, 0)) from content_metrics group by node_id"""):
        views[nid] = v
    ranked = sorted({views.get(r[0], 0) for r in pieces_src})
    rank_of = {v: i for i, v in enumerate(ranked)}     # order only; no view counts leave the database
    series = {}
    for label, ids in cur["series"].items():
        for i in ids:
            series[int(i)] = label
    for pid, title in q("""select l.from_node, s.title from links l join nodes s on s.id = l.to_node
                           where l.link_type = 'part_of' and s.type = 'series'"""):
        series.setdefault(pid, title)
    pieces = {}
    for nid, title, url, platform, date, _ in pieces_src:
        pieces[nid] = [title, url, platform, date, series.get(nid, ""), rank_of[views.get(nid, 0)]]
    D["pieces"] = {str(k): v for k, v in pieces.items()}

    # ---- guides and seasonal reads ----
    guides = {}
    for gid, title in q("select id, title from nodes where type = 'guide' order by id"):
        sentence = title[:1].upper() + title[1:].lower()
        guides[gid] = [sentence, cur["guide_urls"].get(str(gid))]
    D["guides"] = {str(k): v for k, v in guides.items()}

    # ---- verse -> essays (citations of published, non-excluded essays only) ----
    verses = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(set)))
    skipped = collections.Counter()
    stored = {(b, ch, v) for b, ch, v in q("select book_id, chapter, verse from verses")}
    phantom = collections.defaultdict(set)      # (essay, citation as written) -> verses with no stored text (still shown as hits)
    for pid, bk, hs, he, res, raw in q("""select c.node_id, c.book_id, c.house_start, c.house_end, c.resolution, c.raw
                                      from citations c where c.house_start is not null"""):
        if pid not in pieces:
            continue
        if res == "review":
            skipped["review"] += 1
            continue
        _, sc, sv = split_ref(hs)
        _, ec, ev = split_ref(he)
        for ch in range(sc, ec + 1):
            first = sv if ch == sc else 1
            last = ev if ch == ec else (verse_count.get((bk, ch)) or ev)
            if ch != ec and not verse_count.get((bk, ch)):
                warn("range %d:%d-%d:%d in book %d crosses a chapter with no stored text" % (sc, sv, ec, ev, bk))
            for v in range(first, last + 1):
                if (bk, ch, v) not in stored:
                    phantom[(pid, raw)].add((bk, ch, v))
                verses[bk][ch][v].add(pid)
    D["verses"] = {str(b): {str(ch): {str(v): sorted(ps) for v, ps in sorted(vs.items())}
                            for ch, vs in sorted(chs.items())} for b, chs in sorted(verses.items())}
    reads = []
    for gid, b, cs, vs, ce, ve, tr, note in q("""
            select l.from_node, p.book_id, p.chapter_start, p.verse_start, p.chapter_end, p.verse_end,
                   p.translation, l.note
            from links l join passages p on p.node_id = l.to_node
            where l.link_type = 'expounds' and l.from_node in (select id from nodes where type = 'guide')"""):
        m = re.match(r"Day (\d+)$", note or "")
        if not m:
            warn("guide %d has a passage link with no 'Day N' note; skipped" % gid)
            continue
        reads.append([gid, int(m.group(1)), b, cs, vs, ce, ve, tr])
    reads.sort(key=lambda r: (r[0], r[1]))
    D["reads"] = reads

    # ---- hand-kept page content ----
    D["conv"] = [i for i in cur["conv"] if i in pieces]
    for i in cur["conv"]:
        if i not in pieces:
            warn("curated 'conv' essay %d is not a published essay; dropped" % i)
    D["paths"] = cur["paths"]
    D["guide"] = cur["guide"]
    cited_pieces = {p for b in verses.values() for ch in b.values() for ps in ch.values() for p in ps}
    cited_chapters = {(b, ch) for b in verses for ch in verses[b]}
    D["stats"] = {"pieces": len(cited_pieces),
                  "verses": sum(len(vs) for b in verses.values() for vs in b.values()),
                  "chapters": len(cited_chapters)}
    D["notes"] = cur["notes"]
    people = cur.get("people")
    if people:
        for pr in people:
            bad = [e for e in pr["essays"] if str(e) not in D["pieces"]]
            if bad:
                sys.exit("the profile of %s lists essays that are not published on the page: %s" % (pr["name"], bad))
            for g in pr["groups"]:
                for b_, ch_, v1, v2 in g["refs"]:
                    have = {int(re.match(r"\d+", str(r[0])).group()) for r in bible.get(str(b_), {}).get(str(ch_), [])}
                    if not set(range(v1, v2 + 1)) <= have:
                        sys.exit("the profile of %s cites %s %d:%d-%d, which is not fully in the stored text"
                                 % (pr["name"], books[b_][0], ch_, v1, v2))
        D["PP"] = people
    tl = cur.get("tiers")
    if tl:
        if str(tl["essay"]) not in D["pieces"]:
            sys.exit("the tier list points at essay %s, which is not a published essay on the page" % tl["essay"])
        D["TL"] = {k: v for k, v in tl.items() if not k.startswith("_")}
    D["words"] = cur["words"]

    # ---- inlined text for cited chapters (first paint), labels, carried verses, Psalm map ----
    cited_by_book = collections.defaultdict(list)
    for b, ch in cited_chapters:
        cited_by_book[b].append(ch)
    D["T"] = {str(b): {str(ch): bible[str(b)][str(ch)] for ch in sorted(chs) if str(ch) in bible.get(str(b), {})}
              for b, chs in sorted(cited_by_book.items())}
    labels = cur["translation_labels"]
    D["TR"] = {str(b): labels[trans_of[b]] for b in sorted(text_rows)}
    D["SP"] = {"%d:%d:%d" % (b, ch, v): cb for b, ch, v, cb in q(
        "select book_id, chapter, verse, carried_by from verse_spans order by 1, 2, 3")}
    # English -> Septuagint verse map, per book: PM[book][engChapter][engVerse] = [lxxChapter, lxxVerse]
    # and the reverse label table PE[book]["lxxChapter:lxxVerse"] = [engChapter, engVerse].
    # Books without rows in verse_map are read as "same numbering".
    PM, PE = collections.OrderedDict(), collections.OrderedDict()
    for fr, to in q("select from_ref, to_ref from verse_map where from_system = 'ENG' and to_system = 'LXX' order by id"):
        fb, fch, fv = split_ref(fr)
        tb, tch, tv = split_ref(to)
        if fb != tb:
            warn("verse_map row maps book %d to book %d; skipped" % (fb, tb))
            continue
        PM.setdefault(str(fb), collections.OrderedDict()).setdefault(str(fch), collections.OrderedDict())[str(fv)] = [tch, tv]
        PE.setdefault(str(fb), collections.OrderedDict()).setdefault("%d:%d" % (tch, tv), [fch, fv])
    # A book's map is either complete or partial.
    #   complete: English chapters run 1..N with none missing and each chapter's verses run 1..M
    #             (the Psalms). Unlisted verses can safely be read as "same number".
    #   partial:  only some verses are mapped (verses the essays cite). Unlisted verses are NOT known
    #             to be the same, so the page marks these books (PD) and tells a reader who typed an
    #             unmapped English number that the numbering may differ.
    partial = []
    for bk in list(PM):
        chs = sorted(int(c) for c in PM[bk])
        gaps = [] if chs == list(range(1, chs[-1] + 1)) else ["chapters"]
        for ch in chs:
            vs = sorted(int(v) for v in PM[bk][str(ch)])
            if vs != list(range(1, vs[-1] + 1)):
                gaps.append("%d:?" % ch)
        if gaps:
            partial.append(int(bk))
            continue
        dangling = sorted(t for t in (tuple(map(int, k.split(":"))) for k in PE[bk]) if (int(bk),) + t not in stored)
        if dangling:
            warn("verse map for %s points at %d verse(s) missing from the stored text, e.g. %s"
                 % (books[int(bk)][0], len(dangling), ", ".join("%d:%d" % t for t in dangling[:3])))
    D["PM"], D["PE"] = PM, PE
    D["PD"] = sorted(partial)
    D["LX"], lex_credit = dictionary_entries(con, cur, books, warn)
    D["credits"] = cur["credits"] + lex_credit
    D["CC"] = {str(b): sorted(int(c) for c in bible[str(b)]) for b in sorted(text_rows)}
    D["order"] = sorted(text_rows)

    # ---- safety: nothing private or unpublished may leave ----
    blob = dumps(D)
    if EMAIL.search(blob):
        sys.exit("refusing to write: an email address appeared in the page data")
    drafts = {r[0] for r in q("select id from nodes where status != 'published'")}
    leaked = (set(pieces) | cited_pieces) & drafts
    if leaked:
        sys.exit("refusing to write: unpublished node ids in the page data: %s" % sorted(leaked)[:10])
    info = {"skipped_review_citations": skipped["review"],
            "phantom": sorted((pid, raw, len(vs)) for (pid, raw), vs in phantom.items()),
            "left_out_published": [(r[0], r[1], r[5]) for r in rows if r[0] not in pieces and r[5] != "quip"],
            "quips_left_out": sum(1 for r in rows if r[5] == "quip")}
    return D, bible, info


def read_current():
    for line in HTML.read_text(encoding="utf-8").splitlines(keepends=True):
        if line.startswith("const D = "):
            body = line.rstrip("\n")
            assert body.endswith(";"), "data line should end with ';'"
            return json.loads(body[len("const D = "):-1])
    sys.exit("could not find the `const D = ` line in index.html")


def normal(key, value):
    """Make order and ranking numbers irrelevant, so only real content changes show up."""
    if key == "verses":
        return {b: {c: {v: sorted(ps) for v, ps in vs.items()} for c, vs in cs.items()} for b, cs in value.items()}
    if key == "pieces":
        return {k: v[:5] for k, v in value.items()}
    return value


def summarize(old, new, old_bible, new_bible):
    out = []
    for k in new:
        if k == "T":
            continue
        o, n = normal(k, old.get(k)), normal(k, new[k])
        if k == "pieces":
            out.append("  %-9s ranking numbers re-based from the database's view counts (order only)" % k)
        if o == n:
            out.append("  %-9s unchanged" % k)
        elif isinstance(n, dict) and isinstance(o, dict):
            chg = sum(1 for x in set(n) & set(o) if n[x] != o[x])
            out.append("  %-9s changed: %d added, %d removed, %d modified"
                       % (k, len(set(n) - set(o)), len(set(o) - set(n)), chg))
        elif isinstance(n, list) and isinstance(o, list):
            so, sn = {dumps(x) for x in o}, {dumps(x) for x in n}
            out.append("  %-9s changed: %d added, %d removed" % (k, len(sn - so), len(so - sn)))
        else:
            out.append("  %-9s changed" % k)
    bc = sum(1 for b in new_bible for ch in new_bible[b] if old_bible.get(b, {}).get(ch) != new_bible[b][ch])
    out.append("  bible.json: %d of %d chapters differ" % (bc, sum(len(v) for v in new_bible.values())))
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("db", help="path to the Kingdom Code SQLite database")
    ap.add_argument("--check", action="store_true", help="show what would change; write nothing")
    args = ap.parse_args()

    cur = json.loads(CURATED.read_text(encoding="utf-8"))
    warnings = []
    con = connect(args.db)
    D, bible, info = build(con, cur, warnings.append)
    old = read_current()
    old_bible = json.loads(BIBLE.read_text(encoding="utf-8")) if BIBLE.exists() else {}

    print("Source index export from", Path(args.db).name)
    print("  essays on the page: %d (%d cite verses) | verses: %d | chapters: %d"
          % (len(D["pieces"]), D["stats"]["pieces"], D["stats"]["verses"], D["stats"]["chapters"]))
    print("  left out on purpose: %d quips; %d published articles held back; %d citations awaiting review"
          % (info["quips_left_out"], len(info["left_out_published"]), info["skipped_review_citations"]))
    for pid, title, kind in info["left_out_published"]:
        print("      %5d  %s%s" % (pid, title[:60], " [%s]" % kind if kind else ""))
    if info["phantom"]:
        print("  citations at verses missing from the stored text (shown as hits with no verse text; check the database):")
        for pid, raw, n in info["phantom"]:
            print("      %5d  %-32s %d verse%s   %s" % (pid, raw, n, "" if n == 1 else "s", D["pieces"][str(pid)][0][:40]))
    print("Compared with the data currently in index.html:")
    print(summarize(old, D, old_bible, bible))
    for w in sorted(set(warnings)):
        print("  warning:", w)

    if args.check:
        print("(--check: nothing written)")
        return
    html = HTML.read_text(encoding="utf-8")
    lines = html.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith("const D = "):
            lines[i] = "const D = " + dumps(D) + ";\n"
            break
    HTML.write_text("".join(lines), encoding="utf-8")
    BIBLE.write_text(dumps(bible), encoding="utf-8")
    print("wrote index.html and bible.json")


if __name__ == "__main__":
    main()

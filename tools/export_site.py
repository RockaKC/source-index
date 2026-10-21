#!/usr/bin/env python3
"""Rebuild the Source Index data from the Kingdom Code SQLite database.

    python3 tools/export_site.py /path/to/kc_v13.db            # rebuild data/site.js + bible/
    python3 tools/export_site.py /path/to/kc_v13.db --check    # report what would change, write nothing

What it writes:
  * data/site.js                        the page data: one `const D = {...};` line
  * bible/<translation>/<book id>.json  every verse of one book in one translation, fetched on demand
                                        (translation = the book's house translation, lower case, e.g. bible/lxx/1.json)
  * index.html                          only the ?v= stamps on its script and stylesheet tags
                                        (tools/stamp_assets.py), so a browser never pairs a new page with old data

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
import os
import re
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import stamp_assets  # noqa: E402
import connections  # noqa: E402
import library  # noqa: E402
import essay_text  # noqa: E402
import witness  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "tools" / "curated.json"
HTML = ROOT / "index.html"
DATA_JS = ROOT / "data" / "site.js"         # the page data, loaded by index.html before the app
ESSAY_DIR = ROOT / "essay-text"             # essay-text/<essay id>.json: the essay as page HTML, read on the website
BIBLE_DIR = ROOT / "bible"                  # bible/<translation>/<book id>.json
WITNESS_DIR = ROOT / "data" / "witness"     # the Daily Witness: data/witness/<study number>.json (tools/witness.py)

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


def profiles(q, cur):
    """The Names profiles, from the database (kc_v18 or later), in Names-list order. Only published ones."""
    if "people" in cur:
        sys.exit("tools/curated.json still has a 'people' section; profiles now live in the database. Remove it.")
    if not q("select 1 from sqlite_master where name = 'person_profiles'"):
        sys.exit("this database has no Names profiles (table person_profiles); use kc_v18 or later")
    out = []
    for nid, name, slug, line, body in q("""select n.id, n.title, n.slug, n.summary, n.body_md from person_profiles p
                                             join nodes n on n.id = p.node_id
                                             where n.type = 'person' and n.status = 'published' order by p.position"""):
        groups = []
        for gid, title, note in q("select id, title, note from profile_groups where node_id = ? order by position", nid):
            g = {"t": title}
            if note:
                g["g"] = note
            g["refs"] = [list(r) for r in q("""select book_id, chapter, verse_start, verse_end from profile_refs
                                               where group_id = ? order by position""", gid)]
            groups.append(g)
        out.append({"slug": slug, "name": name, "line": line,
                    "about": [para for para in (body or "").split("\n\n") if para.strip()],
                    "groups": groups,
                    "essays": [r[0] for r in q("select article_id from profile_essays where node_id = ? order by position", nid)]})
    return out


def listed_essays(D):
    """The essays the site's lists show: every public Substack essay and every essay that cites verses."""
    has_refs = {str(pid) for chapters in D["verses"].values() for verses in chapters.values() for pids in verses.values() for pid in pids}
    return (set(map(str, D["PUB"])) | has_refs) & set(D["pieces"])


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
    # A published article with no link yet (logged before its post is live) is held back, not published with a dead link.
    pieces_src = [r for r in rows if r[5] != "quip" and r[0] not in excluded and (r[2] or "").strip()]
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

    # ---- which essays the lists show, and (when switched on) essay text for reading on the website ----
    # D["PUB"]: the Substack essays open to everyone. The lists show these and every essay that cites verses; they always open on
    # the platform where they were published. Patreon posts that cite no verse are not listed (the database does not say which are
    # patron-only).
    D["PUB"] = sorted(nid for nid, in q("""select n.id from nodes n join articles a on a.node_id = n.id
                      where n.type = 'article' and n.status = 'published' and a.platform = 'substack' and a.audience = 'everyone'""")
                      if nid in pieces)
    essay_md, essay_html = {}, {}
    # Essay text on the site is published essay by essay: only the ids listed in curated.json as essay_text_ids get text (KC_ESSAY_IDS=1,2,3 adds
    # ids for a preview build in a scratch copy, never in the repository). Only published Substack posts open to everyone qualify, never Patreon posts,
    # members-only posts or drafts. The text is the database's Markdown exactly; every page is checked word for word against it.
    want = {int(x) for x in cur.get("essay_text_ids", [])} | {int(x) for x in os.environ.get("KC_ESSAY_IDS", "").split(",") if x.strip()}
    if want:
        for nid, md in q("""select n.id, n.body_md from nodes n join articles a on a.node_id = n.id
                            where n.type = 'article' and n.status = 'published' and a.platform = 'substack' and a.audience = 'everyone'
                              and n.body_md is not null"""):
            if nid in want and nid in pieces and len(md.strip()) > 200:
                essay_md[nid] = md
        if want - set(essay_md):
            raise SystemExit("essay_text_ids names essays that are not published public Substack posts with text: %s" % sorted(want - set(essay_md)))
        site_slugs = {re.sub(r".*/p/", "", pieces[n][1]).split("?")[0].rstrip("/"): n for n in essay_md}

        def rewrite(href):                   # links between essays, and to this site, stay on the site
            m = re.match(r"https?://kingdomcode\.substack\.com/p/([^/?#]+)", href)
            if m and m.group(1) in site_slugs:
                return "#/essay/%d" % site_slugs[m.group(1)]
            m = re.match(r"https?://sources\.kingdomcodearchive\.com/?(#/[^\s]*)?$", href)
            return (m.group(1) or "#/") if m else None
        linked = {}
        for k, md in essay_md.items():       # each Scripture reference the author wrote becomes a link; the words themselves are untouched
            refs = [(off, raw, essay_text.ref_key(hs, he)) for off, raw, hs, he in q(
                """select char_offset, raw, house_start, house_end from citations
                   where node_id = ? and in_text = 1 and house_start is not null and resolution in ('mapped', 'assumed_same')""", k)]
            linked[k] = essay_text.link_refs(md, refs)
        essay_html = {k: essay_text.to_html(v[0], rewrite) for k, v in linked.items()}
        for k, h in essay_html.items():
            off = essay_text.same_words(essay_md[k], h) or essay_text.structure(essay_md[k], h)
            if off:
                raise SystemExit("essay %d: the page does not say what the manuscript says: %s" % (k, off))
        print("  essay text: %s" % ", ".join("%d (%d words, %d references linked)" % (k, essay_text.words(essay_md[k]), linked[k][1]) for k in sorted(linked)))
    D["ET"] = {str(k): essay_text.words(v) for k, v in sorted(essay_md.items())}

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
    people = profiles(q, cur)
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
    en = cur.get("english")
    if en:
        listed = [i[0] for g in en["groups"] for i in g["items"]]
        extra = sorted(e["id"] for e in D["entries"] if e.get("extra"))
        if sorted(listed) != extra:
            sys.exit("the English-translations page must list each book outside the Protestant canon exactly once; "
                     "missing %s, unexpected or repeated %s" % (sorted(set(extra) - set(listed)),
                     sorted(x for x in set(listed) if listed.count(x) > 1 or x not in extra)))
        D["EN"] = {k: v for k, v in en.items() if not k.startswith("_")}
    tl = cur.get("tiers")
    if tl:
        if str(tl["essay"]) not in D["pieces"]:
            sys.exit("the tier list points at essay %s, which is not a published essay on the page" % tl["essay"])
        D["TL"] = {k: v for k, v in tl.items() if not k.startswith("_")}
    kg = cur.get("kc_guides")
    if kg:
        guides = []
        for g in kg:
            f = ROOT / g["file"]
            if not f.is_file() or f.read_bytes()[:5] != b"%PDF-":
                sys.exit("guide %s: %s is not a PDF file in the repository" % (g["slug"], g["file"]))
            if not (ROOT / g["cover"]).is_file():
                sys.exit("guide %s: cover image %s is missing" % (g["slug"], g["cover"]))
            for c in g.get("contents", []):
                if not (1 <= c["page"] <= g["pages"]) or not c["title"] or not c["about"]:
                    sys.exit("guide %s: contents entry %r needs a title, a line, and a page from 1 to %d" % (g["slug"], c.get("title"), g["pages"]))
            guides.append({**g, "bytes": f.stat().st_size})
        if len({g["slug"] for g in guides}) != len(guides):
            sys.exit("kc_guides: a slug is used twice")
        D["KG"] = guides
    ec = cur.get("early_church")
    if ec:
        for f in ec:
            if not (ROOT / f["image"]).is_file():
                sys.exit("early_church %s: image %s is missing" % (f["slug"], f["image"]))
            if not f.get("overview") or not f.get("name") or not f.get("alt"):
                sys.exit("early_church %s needs a name, an overview and alt text for its image" % f["slug"])
            for src in f.get("sources", []):
                if not (src.get("title") and src.get("note") and str(src.get("url", "")).startswith("https://")):
                    sys.exit("early_church %s: each source needs a title, a note and an https address" % f["slug"])
        if len({f["slug"] for f in ec}) != len(ec):
            sys.exit("early_church: a slug is used twice")
        for f in ec:
            if not isinstance(f.get("sort_year"), int):
                sys.exit("early_church %s needs sort_year: an approximate year (birth, where known), used only to put the figures in time order" % f["slug"])
        ec = sorted(ec, key=lambda f: f["sort_year"])             # the list is always in time order, whatever order they were added in
        D["EC"] = ec
        # Which essays cite or discuss each figure (tools/connections.py). Only the pairs travel, never the essay text; an essay that is not on
        # the site's lists is left out, and a pair appears once.
        links, _ = connections.compute(con, cur)
        shown = listed_essays(D)
        D["EL"] = {k: [r for r in v if str(r[0]) in shown] for k, v in links.items()}
        for k, v in D["EL"].items():
            if len({r[0] for r in v}) != len(v):
                sys.exit("connections: an essay appears twice for %s" % k)
    D["words"] = cur["words"]
    lib = library.load()
    library.validate(lib, listed_essays(D))
    D["LIB"] = library.export(lib, D, listed_essays(D))

    # ---- inlined text for cited chapters (first paint), labels, carried verses, Psalm map ----
    # The word pages show the text of the verses they name without waiting for a download, so those chapters travel too.
    shown = cited_chapters | {(v[0], v[1]) for w in cur["words"] for v in w["verses"]}
    cited_by_book = collections.defaultdict(list)
    for b, ch in shown:
        cited_by_book[b].append(ch)
    D["T"] = {str(b): {str(ch): bible[str(b)][str(ch)] for ch in sorted(chs) if str(ch) in bible.get(str(b), {})}
              for b, chs in sorted(cited_by_book.items())}
    labels = cur["translation_labels"]
    D["TR"] = {str(b): labels[trans_of[b]] for b in sorted(text_rows)}
    src = {k: v for k, v in cur["translation_sources"].items() if not k.startswith("_")}
    if sorted(src) != sorted(labels):
        sys.exit("translation_sources must name exactly the translations in translation_labels: %s vs %s" % (sorted(src), sorted(labels)))
    D["TS"] = {str(b): src[trans_of[b]] for b in sorted(text_rows)}
    D["HT"] = {str(b): trans_of[b].lower() for b in sorted(text_rows)}
    bad = sorted({c for c in D["HT"].values() if not re.fullmatch(r"[a-z]+", c)})
    if bad:
        sys.exit("translation codes must be letters only (they name the bible/<code>/ folders): %s" % bad)
    bn = {}
    for k, v in cur.get("book_notes", {}).items():
        if k.startswith("_"):
            continue
        if not k.isdigit() or int(k) not in text_rows:
            sys.exit("book_notes names a book that has no text: %s" % k)
        note = {"p": v.get("page", "")}
        for ch, t in v.get("chapters", {}).items():
            if not ch.isdigit() or str(ch) not in bible[k]:
                sys.exit("book_notes for book %s names chapter %s, which has no text" % (k, ch))
            note.setdefault("c", {})[ch] = t
        bn[k] = note
    if bn:
        D["BN"] = bn
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
    D["PC"] = {}
    ids = {v[0]: k for k, v in books.items()}
    for name, chs in cur.get("numbering_scope", {}).items():
        if name.startswith("_"):
            continue
        if name not in ids or ids[name] not in partial:
            sys.exit("numbering_scope lists %s, which is not a book with a partial verse map" % name)
        top = max(int(c) for c in bible[str(ids[name])])
        if not chs or any(not isinstance(c, int) or c < 1 or c > top for c in chs):
            sys.exit("numbering_scope for %s must list chapter numbers between 1 and %d" % (name, top))
        D["PC"][str(ids[name])] = sorted(set(chs))
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
    info = {"essay_html": essay_html, "skipped_review_citations": skipped["review"],
            "phantom": sorted((pid, raw, len(vs)) for (pid, raw), vs in phantom.items()),
            "left_out_published": [(r[0], r[1], "no link yet" if not (r[2] or "").strip() else r[5])
                                   for r in rows if r[0] not in pieces and r[5] != "quip"],
            "quips_left_out": sum(1 for r in rows if r[5] == "quip")}
    return D, bible, info


def read_current():
    """The page data as it is now: data/site.js, or the old inline line in index.html before the move."""
    for src in (DATA_JS, HTML):
        if not src.exists():
            continue
        for line in src.read_text(encoding="utf-8").splitlines():
            if line.startswith("const D = "):
                assert line.endswith(";"), "data line should end with ';'"
                return json.loads(line[len("const D = "):-1])
    sys.exit("could not find the `const D = ` line in data/site.js")


def normal(key, value):
    """Make order and ranking numbers irrelevant, so only real content changes show up."""
    if key == "verses":
        return {b: {c: {v: sorted(ps) for v, ps in vs.items()} for c, vs in cs.items()} for b, cs in value.items()}
    if key == "pieces":
        return {k: v[:5] for k, v in value.items()}
    return value


def read_current_bible():
    """Book id -> chapters, from bible/<translation>/<id>.json (or the older flat bible/<id>.json)."""
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in BIBLE_DIR.rglob("*.json")}


def write_bible(bible, house):
    keep = set()
    for b, chapters in bible.items():
        f = BIBLE_DIR / house[b] / ("%s.json" % b)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(dumps(chapters), encoding="utf-8")
        keep.add(f)
    for f in BIBLE_DIR.rglob("*.json"):
        if f not in keep:
            f.unlink()
    for d in sorted(BIBLE_DIR.iterdir()):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()


def write_witness(files):
    keep = set()
    if files:
        WITNESS_DIR.mkdir(parents=True, exist_ok=True)
        for name, obj in files.items():
            f = WITNESS_DIR / name
            f.write_text(dumps(obj), encoding="utf-8")
            keep.add(f)
    if WITNESS_DIR.is_dir():
        for f in WITNESS_DIR.glob("*.json"):
            if f not in keep:
                f.unlink()
        if not any(WITNESS_DIR.iterdir()):
            WITNESS_DIR.rmdir()


def write_essay_text(essay_html):
    if not essay_html:                        # switched off: no essay text is published, and none is left behind
        if ESSAY_DIR.is_dir():
            for f in ESSAY_DIR.glob("*.json"):
                f.unlink()
            ESSAY_DIR.rmdir()
        return
    ESSAY_DIR.mkdir(exist_ok=True)
    keep = set()
    for nid, h in essay_html.items():
        f = ESSAY_DIR / ("%d.json" % nid)
        f.write_text(dumps({"h": h}), encoding="utf-8")
        keep.add(f)
    for f in ESSAY_DIR.glob("*.json"):
        if f not in keep:
            f.unlink()


def write_data(D):
    """Write data/site.js, then refresh the ?v= stamps in index.html."""
    body = ("// Kingdom Code Source Index page data. Written by tools/export_site.py from the database: do not edit.\n"
            "const D = " + dumps(D) + ";\n")
    DATA_JS.parent.mkdir(exist_ok=True)
    DATA_JS.write_text(body, encoding="utf-8")
    if 'src="data/site.js?v=' not in HTML.read_text(encoding="utf-8"):
        sys.exit('index.html must load the data with <script src="data/site.js?v=..."></script>')
    stamp_assets.stamp()
    return stamp_assets.version("data/site.js")


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
    out.append("  bible/      %d of %d chapters differ" % (bc, sum(len(v) for v in new_bible.values())))
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
    old_bible = read_current_bible()
    plan = witness.load()
    wfiles = None
    if plan:
        D["W"], wfiles = witness.export(plan, D, bible, listed_essays(D))

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
    print("  essay text for reading on the site: %d essays%s" % (len(info["essay_html"]), "" if info["essay_html"] else " (switched off: essays open on their platforms)"))
    if wfiles:
        print("  Daily Witness: %d studies (%d approved), schedule %s (data/witness/)" % (len(wfiles), sum(e["st"] == "approved" for e in D["W"]["e"]), D["W"]["ws"] or "not started"))
    print("Compared with the data currently in data/site.js:")
    print(summarize(old, D, old_bible, bible))
    for w in sorted(set(warnings)):
        print("  warning:", w)

    if args.check:
        print("(--check: nothing written)")
        return
    version = write_data(D)
    write_bible(bible, D["HT"])
    write_witness(wfiles)
    if wfiles:
        witness.REVIEW.write_text(witness.review(D, D["W"], wfiles, bible), encoding="utf-8")
    write_essay_text(info["essay_html"])
    print("wrote data/site.js (version %s), the stamps in index.html, bible/ (%d books) and essay-text/ (%d essays)" % (version, len(bible), len(info["essay_html"])))


if __name__ == "__main__":
    main()

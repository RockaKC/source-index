#!/usr/bin/env python3
"""How figures connect: the names an essay uses, the essays that discuss a figure, and how figures relate to each other.

Used by tools/export_site.py (profile_extras), and run on its own as a to-do report:

    python3 tools/knowledge.py kc_v36.db

The report lists, for each figure with a profile, the published essays whose own words (not quotations) use one of the figure's names but
are not yet connected to it. Each is a proposal to read, never a link: connect it with one row (see tools/KNOWLEDGE.md).

Everything that reaches the site is confirmed (links.confirmed = 1) unless KC_SHOW_PROPOSED=1 is set, which a preview build in a scratch copy
uses to show proposed rows. A relationship carries its basis (scripture, church_tradition, ancient_source, scholarly_inference, editorial) and
its evidence, so a reader can see what each connection rests on.
"""
import os
import re
import sqlite3
import sys

INVERSE = {"ancestor_of": "descendant_of", "descendant_of": "ancestor_of", "teacher_of": "student_of", "student_of": "teacher_of", "attested_by": "attests",
           "attests": "attested_by", "associated_with": "associated_with", "contemporary_of": "contemporary_of", "related_manuscript": "related_manuscript"}
RELATIONS = ("ancestor_of", "teacher_of", "contemporary_of", "associated_with", "attested_by", "related_manuscript")
BASES = ("scripture", "church_tradition", "ancient_source", "scholarly_inference", "editorial")


def has_figure_tables(q):
    return bool(q("select 1 from sqlite_master where name = 'node_aliases'")) and bool(q("select 1 from pragma_table_info('links') where name = 'basis'"))


def parse_evidence(text, book_ids):
    """'Genesis 5:21; 2 Kings 2:11; Genesis 5:28-29' -> [{'l': 'Genesis 5:21', 'r': [1, 5, 21, 21]}, ...]. A piece that is not a verse reference stays as plain words."""
    out = []
    for part in [p.strip() for p in (text or "").split(";") if p.strip()]:
        m = re.fullmatch(r"(.+?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?", part)
        b = book_ids.get(m.group(1).strip().lower()) if m else None
        if b:
            vs = int(m.group(3))
            out.append({"l": part, "r": [b, int(m.group(2)), vs, int(m.group(4) or vs)]})
        else:
            out.append({"l": part})
    return out


def profile_extras(q, nid, slug_of, book_ids, show_proposed=None):
    """-> (aliases, relations, essay ids from about links) for one figure. slug_of: node id -> slug of every published profile."""
    if show_proposed is None:
        show_proposed = os.environ.get("KC_SHOW_PROPOSED") == "1"
    if not has_figure_tables(q):
        return [], [], []
    ok = "" if show_proposed else " and l.confirmed = 1"
    aliases = [r[0] for r in q("select alias from node_aliases where node_id = ? order by length(alias) desc, alias", nid)]
    rel = []
    marks = ",".join("?" * len(RELATIONS))
    for fr, to, kind, inv, note, basis, ev in q("""select l.from_node, l.to_node, l.link_type, t.inverse_name, l.note, l.basis, l.evidence
                                                   from links l join link_types t on t.name = l.link_type
                                                   where l.link_type in (%s) and (l.from_node = ? or l.to_node = ?)%s order by l.id""" % (marks, ok),
                                                *RELATIONS, nid, nid):
        other = to if fr == nid else fr
        if other not in slug_of:
            continue
        if not basis or not (ev or "").strip():
            sys.exit("a relationship between %s and %s has no basis or evidence" % (slug_of.get(fr), slug_of.get(to)))
        rel.append({"to": slug_of[other], "as": kind if fr == nid else inv, "why": note or "", "basis": basis, "ev": parse_evidence(ev, book_ids)})
    essays = [r[0] for r in q("""select l.from_node from links l join nodes a on a.id = l.from_node
                                  join articles r on r.node_id = a.id
                                  where l.to_node = ? and l.link_type = 'about' and a.type = 'article' and a.status = 'published'%s
                                  order by r.published_at desc""" % ok, nid)]
    return aliases, rel, essays


def build_network(connections, people, church_slugs, word_slugs, essay_ids, verse_ok):
    """Every connection between two pages of the site, keyed by page ('person/enoch', 'church/tertullian', 'word/cush'), one list per page.

    Figure-to-figure rows come from the database (already on each profile as 'rel', taken off here); a connection that involves an Early Church figure or a
    word study is a hand-kept row in tools/curated.json ('connections'), because those pages are not nodes in the database. Each carries its basis and its
    evidence, and a row is written once and shown from both pages with the inverse wording. Refuses anything it cannot stand behind.
    verse_ok(book, chapter, first, last) says whether a verse is in the stored text."""
    keys = {"person/" + p["slug"] for p in people} | {"church/" + s for s in church_slugs} | {"word/" + s for s in word_slugs}
    nx = {}
    for p in people:
        for r in p.pop("rel", []):
            nx.setdefault("person/" + p["slug"], []).append({**r, "to": "person/" + r["to"]})
    seen = {(a, r["to"], r["as"]) for a, rows in nx.items() for r in rows}
    for c in connections or []:
        a, b, kind = c.get("a"), c.get("b"), c.get("as")
        who = "connection %s / %s" % (a, b)
        if a not in keys or b not in keys or a == b:
            sys.exit("%s: both ends must be different pages of the site (person/..., church/..., word/...)" % who)
        if a.startswith("person/") and b.startswith("person/"):
            sys.exit("%s: a relationship between two figures with profiles belongs in the database (links), not here" % who)
        if kind not in INVERSE:
            sys.exit("%s: unknown relationship %r" % (who, kind))
        if c.get("basis") not in BASES or not (c.get("why") or "").strip() or not c.get("ev"):
            sys.exit("%s needs a basis (%s), a reason and evidence" % (who, ", ".join(BASES)))
        for ev in c["ev"]:
            if not ev.get("l"):
                sys.exit("%s: each piece of evidence needs words" % who)
            if "r" in ev and not verse_ok(*ev["r"]):
                sys.exit("%s rests on %s, which is not fully in the stored text" % (who, ev["l"]))
            if "essay" in ev and ev["essay"] not in essay_ids:
                sys.exit("%s cites essay %s, which is not on the site's lists" % (who, ev["essay"]))
        for x, y, k in ((a, b, kind), (b, a, INVERSE[kind])):
            if (x, y, k) in seen:
                sys.exit("%s is written twice" % who)
            seen.add((x, y, k))
            nx.setdefault(x, []).append({"to": y, "as": k, "why": c["why"], "basis": c["basis"], "ev": c["ev"]})
    return nx


def check_scripture_groups(slug, groups, essay_ids, verse_ok):
    """The Scripture groups on an Early Church page: the passages a figure is tied to, why, and what that rests on."""
    for g in groups or []:
        if not (g.get("t") and g.get("g") and g.get("refs") and g.get("ev")) or g.get("basis") not in BASES:
            sys.exit("early_church %s: each scripture group needs a title, a note, refs, a basis (%s) and evidence" % (slug, ", ".join(BASES)))
        for r in g["refs"]:
            if not verse_ok(*r):
                sys.exit("early_church %s: %r is not fully in the stored text" % (slug, r))
        for ev in g["ev"]:
            if not ev.get("l") or ("r" in ev and not verse_ok(*ev["r"])) or ("essay" in ev and ev["essay"] not in essay_ids):
                sys.exit("early_church %s: evidence %r does not stand" % (slug, ev))


def prose(md):
    """An essay's own words: no quotations (lines starting with >), no headings, no link addresses."""
    keep = [l for l in md.replace("\r\n", "\n").split("\n") if not l.lstrip().startswith((">", "#"))]
    return re.sub(r"\]\([^)]*\)", "]", "\n".join(keep))


def report(con):
    q = lambda s, *a: con.execute(s, a).fetchall()
    figs = q("select n.id, n.title, n.slug from nodes n join person_profiles p on p.node_id = n.id where n.type = 'person' and n.status = 'published' order by p.position")
    essays = q("""select n.id, n.title, n.body_md from nodes n join articles a on a.node_id = n.id
                  where n.type = 'article' and n.status = 'published' and n.body_md is not null""")
    print("Figures and the essays that use their names but are not yet connected (proposals to read; nothing here is linked on the site)\n")
    for nid, title, slug in figs:
        names = [r[0] for r in q("select alias from node_aliases where node_id = ?", nid)]
        if not names:
            print("%-16s no names in node_aliases yet" % title)
            continue
        pat = re.compile(r"\b(?:%s)\b" % "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True)))
        connected = {r[0] for r in q("select article_id from profile_essays where node_id = ?", nid)} | {r[0] for r in q("select from_node from links where to_node = ? and link_type = 'about'", nid)}
        hits = []
        for eid, et, md in essays:
            if eid in connected:
                continue
            n = len(pat.findall(prose(md)))
            if n:
                hits.append((n, eid, et))
        hits.sort(reverse=True)
        print("%-16s %d connected | %d essays use the name, unconnected%s" % (title, len(connected), len(hits), (": " + "; ".join("%d (%d)" % (e, n) for n, e, _ in hits[:8])) if hits else ""))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    report(sqlite3.connect("file:%s?mode=ro" % os.path.abspath(sys.argv[1]), uri=True))

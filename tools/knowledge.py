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

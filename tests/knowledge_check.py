"""Checks for the figure connections (tools/patches/2026-10-22-figure-connections.sql and tools/knowledge.py) on a small made-up database.
Run by tests/figures.spec.js; prints OK, or the first failure."""
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import knowledge  # noqa: E402
import patch_db  # noqa: E402

BASE = """
create table node_types (name text primary key, description text);
insert into node_types values ('person', 'old'), ('article', 'x');
create table nodes (id integer primary key, type text, title text, slug text, status text);
create table articles (node_id integer primary key, published_at text);
create table link_types (name text primary key, inverse_name text, description text);
insert into link_types values ('about', 'subject_of', 'old');
create table links (id integer primary key, from_node integer not null, to_node integer not null, link_type text not null,
  note text, origin text not null default 'boss', confirmed integer not null default 1, created_at text, unique (from_node, to_node, link_type));
create table schema_migrations (version integer, name text, applied_at text);
create table books (id integer primary key, name text);
insert into books values (1, 'Genesis'), (13, '2 Kings'), (37, 'Ezekiel');
"""


def make():
    con = sqlite3.connect(":memory:")
    con.executescript(BASE)
    for i, (slug, title) in enumerate([("enoch", "Enoch"), ("noah", "Noah"), ("elijah", "Elijah"), ("jeremiah", "Jeremiah"), ("sheba", "Queen of Sheba"), ("daniel", "Daniel")], 1):
        con.execute("insert into nodes values (?, 'person', ?, ?, 'published')", (100 + i, title, slug))
    con.execute("insert into nodes values (1349, 'article', 'An essay', 'an-essay', 'published')")
    con.execute("insert into articles values (1349, '2026-10-04T00:00:00Z')")
    for stmt in patch_db.statements((ROOT / "tools" / "patches" / "2026-10-22-figure-connections.sql").read_text(encoding="utf-8")):
        con.execute(stmt)
    return con


def refused(con, sql, *args):
    try:
        con.execute(sql, args)
    except sqlite3.DatabaseError as e:
        return str(e)
    return None


def check():
    con = make()
    q = lambda s, *a: con.execute(s, a).fetchall()
    books = {"genesis": 1, "2 kings": 13, "ezekiel": 37}
    slug_of = {r[0]: r[1] for r in q("select id, slug from nodes where type = 'person'")}
    enoch, noah, elijah, daniel = 101, 102, 103, 106

    # proposed rows are not shown; shown only when asked for
    qq = lambda s, *a: con.execute(s, a).fetchall()
    al, rel, ess = knowledge.profile_extras(qq, enoch, slug_of, books, show_proposed=False)
    assert al == ["Enoch"] and rel == [] and ess == [], (al, rel, ess)
    al, rel, ess = knowledge.profile_extras(qq, enoch, slug_of, books, show_proposed=True)
    assert [r["to"] for r in rel] == ["noah", "elijah"] and ess == [1349]
    r = rel[0]
    assert r["as"] == "ancestor_of" and r["basis"] == "scripture" and r["why"].startswith("Enoch fathers")
    assert r["ev"] == [{"l": "Genesis 5:21", "r": [1, 5, 21, 21]}, {"l": "Genesis 5:25", "r": [1, 5, 25, 25]}, {"l": "Genesis 5:28-29", "r": [1, 5, 28, 29]}], r["ev"]

    # the other direction reads from the inverse, from the same row
    _, rel, _ = knowledge.profile_extras(qq, noah, slug_of, books, show_proposed=True)
    assert [(x["to"], x["as"]) for x in rel] == [("enoch", "descendant_of"), ("daniel", "associated_with")], rel
    _, rel, _ = knowledge.profile_extras(qq, daniel, slug_of, books, show_proposed=True)
    assert [(x["to"], x["as"]) for x in rel] == [("noah", "associated_with")]

    # confirming makes them public; the same rows then show without the preview switch
    con.execute("update links set confirmed = 1 where origin = 'ai' and confirmed = 0 and (link_type in ('ancestor_of', 'associated_with') or from_node = 1349)")
    assert [x["to"] for x in knowledge.profile_extras(qq, enoch, slug_of, books, show_proposed=False)[1]] == ["noah", "elijah"]
    assert knowledge.profile_extras(qq, enoch, slug_of, books, show_proposed=False)[2] == [1349]

    # the database itself refuses a confirmed relationship with no basis or evidence, and a name two figures would share
    assert "needs a basis" in refused(con, "insert into links(from_node, to_node, link_type, origin, confirmed) values (101, 104, 'associated_with', 'boss', 1)")
    assert "needs a basis" in refused(con, "insert into links(from_node, to_node, link_type, origin, confirmed, basis, evidence) values (101, 104, 'teacher_of', 'boss', 1, 'scripture', '  ')")
    assert refused(con, "insert into links(from_node, to_node, link_type, origin, confirmed) values (101, 104, 'associated_with', 'ai', 0)") is None     # a proposal needs neither yet
    assert "needs a basis" in refused(con, "update links set confirmed = 1 where link_type = 'associated_with' and to_node = 104")
    assert "UNIQUE" in refused(con, "insert into node_aliases(node_id, alias) values (102, 'enoch')")                                                        # not case-sensitive
    assert "CHECK" in refused(con, "insert into links(from_node, to_node, link_type, origin, confirmed, basis) values (101, 105, 'ancestor_of', 'ai', 0, 'rumour')")
    assert q("select version from schema_migrations") == [(21,)]

    # evidence that is not a verse stays as words
    assert knowledge.parse_evidence("Genesis 5:24; the Kebra Nagast; Ezekiel 14:14-15", books) == [
        {"l": "Genesis 5:24", "r": [1, 5, 24, 24]}, {"l": "the Kebra Nagast"}, {"l": "Ezekiel 14:14-15", "r": [37, 14, 14, 15]}]

    # a name is looked for in an essay's own words, not in its quotations or headings
    assert "Enoch" not in knowledge.prose("> “Enoch said”\n\n## Enoch\n\nPlain words.\n") and "Plain words" in knowledge.prose("> “Enoch said”\n\n## Enoch\n\nPlain words.\n")

    # connections that involve an Early Church figure or a word study: one hand-kept row, shown from both pages, refused when it cannot stand
    people = [{"slug": "enoch", "rel": [{"to": "noah", "as": "ancestor_of", "why": "w", "basis": "scripture", "ev": [{"l": "Genesis 5:21"}]}]},
              {"slug": "noah", "rel": [{"to": "enoch", "as": "descendant_of", "why": "w", "basis": "scripture", "ev": [{"l": "Genesis 5:21"}]}]}]
    ok = lambda b, ch, v1, v2: b == 1
    row = {"a": "person/enoch", "b": "church/tertullian", "as": "attested_by", "why": "He says so.", "basis": "ancient_source", "ev": [{"l": "On the Apparel of Women 1.3", "essay": 181}]}
    def net(*rows, **kw):
        return knowledge.build_network(list(rows), [{**p, "rel": list(p["rel"])} for p in people], ["tertullian"], ["cush"], kw.get("essays", {181}), ok)
    def refuses(*rows, **kw):
        try:
            net(*rows, **kw)
        except SystemExit as e:
            return str(e)
        return None
    nx = net(row)
    assert [(r["to"], r["as"]) for r in nx["person/enoch"]] == [("person/noah", "ancestor_of"), ("church/tertullian", "attested_by")], nx["person/enoch"]
    assert [(r["to"], r["as"], r["basis"]) for r in nx["church/tertullian"]] == [("person/enoch", "attests", "ancient_source")]
    assert nx["person/noah"][0]["to"] == "person/enoch"
    assert "both ends" in refuses({**row, "b": "church/nobody"}) and "both ends" in refuses({**row, "b": "person/enoch"})
    assert "belongs in the database" in refuses({**row, "b": "person/noah"})
    assert "unknown relationship" in refuses({**row, "as": "friend_of"})
    assert "needs a basis" in refuses({**row, "basis": "rumour"}) and "needs a basis" in refuses({**row, "ev": []}) and "needs a basis" in refuses({**row, "why": " "})
    assert "not on the site" in refuses({**row, "ev": [{"l": "x", "essay": 999}]})
    assert "not fully in the stored text" in refuses({**row, "ev": [{"l": "Exodus 1:1", "r": [2, 1, 1, 1]}]})
    assert "written twice" in refuses(row, {**row, "a": "church/tertullian", "b": "person/enoch", "as": "attests"})
    for bad in ({"t": "x", "g": "y", "refs": [[2, 1, 1, 1]], "basis": "scripture", "ev": [{"l": "z"}]}, {"t": "x", "g": "y", "refs": [[1, 1, 1, 1]], "basis": "hearsay", "ev": [{"l": "z"}]},
                {"t": "x", "g": "y", "refs": [[1, 1, 1, 1]], "basis": "scripture", "ev": []}):
        try:
            knowledge.check_scripture_groups("tertullian", [bad], {181}, ok)
            raise AssertionError("a bad Scripture group was accepted")
        except SystemExit:
            pass
    knowledge.check_scripture_groups("tertullian", [{"t": "x", "g": "y", "refs": [[1, 6, 1, 4]], "basis": "ancient_source", "ev": [{"l": "z", "essay": 181}]}], {181}, ok)
    print("OK")


check()

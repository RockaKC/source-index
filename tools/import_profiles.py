#!/usr/bin/env python3
"""Move the Names profiles into a NEW copy of the Kingdom Code database.

    python3 tools/import_profiles.py PROFILES.json kc_v17.db kc_v18.db

PROFILES.json is a JSON file whose "people" list holds the profiles as the site showed them
before the move (the former `people` section of tools/curated.json). The input database is opened
read-only and never modified; the output must not already exist.

What it writes:
  * one `nodes` row per profile, type `person`, status `published`, origin `ai` (drafted with AI,
    approved by the editor): title = name, slug, summary = the one-line description for the Names
    list, body_md = the introduction (paragraphs separated by a blank line)
  * `person_profiles`   which person nodes have a profile, and their order on the Names list
  * `profile_groups`    the "Where he appears" groups: title and optional note, in order
  * `profile_refs`      the verse links in each group, in the stored text's own numbering
  * `profile_essays`    the curated essays for each profile, in order
  * a `schema_migrations` row and an `import_log` row

It stops, writing nothing, if a verse is not fully in the stored text, an essay is not a published
article, or a slug is already taken.
"""
import json
import os
import sqlite3
import sys

SCHEMA = """
CREATE TABLE person_profiles (
    node_id   INTEGER PRIMARY KEY REFERENCES nodes(id),
    position  INTEGER NOT NULL UNIQUE CHECK (position >= 1)      -- order on the Names list
);
CREATE TABLE profile_groups (
    id        INTEGER PRIMARY KEY,
    node_id   INTEGER NOT NULL REFERENCES person_profiles(node_id),
    position  INTEGER NOT NULL CHECK (position >= 1),
    title     TEXT    NOT NULL,
    note      TEXT,                                               -- shown under the title; may be empty
    UNIQUE (node_id, position)
);
CREATE TABLE profile_refs (                                       -- stored-text (house) numbering
    id          INTEGER PRIMARY KEY,
    group_id    INTEGER NOT NULL REFERENCES profile_groups(id),
    position    INTEGER NOT NULL CHECK (position >= 1),
    book_id     INTEGER NOT NULL REFERENCES books(id),
    chapter     INTEGER NOT NULL CHECK (chapter BETWEEN 1 AND 999),
    verse_start INTEGER NOT NULL CHECK (verse_start BETWEEN 0 AND 998),
    verse_end   INTEGER NOT NULL,
    CHECK (verse_end >= verse_start),
    UNIQUE (group_id, position)
);
CREATE TABLE profile_essays (
    node_id     INTEGER NOT NULL REFERENCES person_profiles(node_id),
    position    INTEGER NOT NULL CHECK (position >= 1),
    article_id  INTEGER NOT NULL REFERENCES nodes(id),
    PRIMARY KEY (node_id, position),
    UNIQUE (node_id, article_id)
);
"""


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src_json, src, out = sys.argv[1:]
    if os.path.exists(out):
        sys.exit("refusing to overwrite an existing file: " + out)
    people = json.load(open(src_json, encoding="utf-8"))["people"]
    tmp = out + ".partial"
    if os.path.exists(tmp):
        os.remove(tmp)
    try:
        build(people, src, tmp, os.path.basename(out), os.path.basename(src_json))
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    os.rename(tmp, out)
    print("wrote", out)


def check(dst, people):
    problems = []
    for pr in people:
        if dst.execute("select 1 from nodes where slug = ?", (pr["slug"],)).fetchone():
            problems.append("slug already taken: " + pr["slug"])
        for g in pr["groups"]:
            for b, ch, v1, v2 in g["refs"]:
                have = {r[0] for r in dst.execute(
                    "select verse from verses where book_id = ? and chapter = ? and verse between ? and ?", (b, ch, v1, v2))}
                if have != set(range(v1, v2 + 1)):
                    problems.append("%s: %d %d:%d-%d is not fully in the stored text" % (pr["name"], b, ch, v1, v2))
        for e in pr["essays"]:
            row = dst.execute("select type, status from nodes where id = ?", (e,)).fetchone()
            if row != ("article", "published"):
                problems.append("%s: essay %s is not a published article" % (pr["name"], e))
    if problems:
        raise RuntimeError("stopping, nothing written:\n  " + "\n  ".join(problems))


def build(people, src, out, final_name, json_name):
    inp = sqlite3.connect("file:%s?mode=ro" % os.path.abspath(src), uri=True)
    dst = sqlite3.connect(out)
    inp.backup(dst)                                  # consistent copy; the input is never touched
    inp.close()
    if dst.execute("select 1 from sqlite_master where name = 'person_profiles'").fetchone():
        raise RuntimeError("this database already has profiles; stopping so nothing is mixed")
    check(dst, people)
    refs = essays = 0
    with dst:
        dst.executescript(SCHEMA)
        for pos, pr in enumerate(people, 1):
            cur = dst.execute(
                """insert into nodes(type, title, slug, summary, body_md, status, origin)
                   values ('person', ?, ?, ?, ?, 'published', 'ai')""",
                (pr["name"], pr["slug"], pr["line"], "\n\n".join(pr["about"])))
            nid = cur.lastrowid
            dst.execute("insert into person_profiles(node_id, position) values (?, ?)", (nid, pos))
            for gpos, g in enumerate(pr["groups"], 1):
                gid = dst.execute("insert into profile_groups(node_id, position, title, note) values (?, ?, ?, ?)",
                                  (nid, gpos, g["t"], g.get("g"))).lastrowid
                for rpos, (b, ch, v1, v2) in enumerate(g["refs"], 1):
                    dst.execute("""insert into profile_refs(group_id, position, book_id, chapter, verse_start, verse_end)
                                   values (?, ?, ?, ?, ?, ?)""", (gid, rpos, b, ch, v1, v2))
                    refs += 1
            for epos, e in enumerate(pr["essays"], 1):
                dst.execute("insert into profile_essays(node_id, position, article_id) values (?, ?, ?)", (nid, epos, e))
                essays += 1
        version = dst.execute("select coalesce(max(version), 0) + 1 from schema_migrations").fetchone()[0]
        dst.execute("insert into schema_migrations(version, name) values (?, 'person_profiles')", (version,))
        dst.execute("insert into import_log(file_name, source, rows_read, rows_loaded, notes) values (?, ?, ?, ?, ?)",
                    (final_name, "person_profiles", len(people), len(people),
                     "Names profiles moved from %s: %d profiles, %d verse links, %d essay links. Text drafted with AI and "
                     "approved by the editor; nodes carry origin 'ai'. Applied to a copy of the previous database."
                     % (json_name, len(people), refs, essays)))
    ok = dst.execute("pragma integrity_check").fetchone()[0]
    fk = dst.execute("pragma foreign_key_check").fetchall()
    if ok != "ok" or fk:
        raise RuntimeError("integrity check failed: %s %s" % (ok, fk[:3]))
    dst.close()
    print("integrity: %s | foreign-key problems: %d" % (ok, len(fk)))
    print("profiles: %d | verse links: %d | essay links: %d" % (len(people), refs, essays))


if __name__ == "__main__":
    main()

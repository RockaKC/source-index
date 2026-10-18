#!/usr/bin/env python3
"""Add newly published Substack posts to a NEW copy of the Kingdom Code database, and refresh the text of named essays.

    python3 tools/import_substack_posts.py EXPORT_DIR kc_v32.db kc_v33.db [--replace-text SLUG ...] [--check]

EXPORT_DIR holds posts.csv and posts/<id>.<slug>.html from Substack's Settings > Exports. Only what the importer needs is read:
the post list and the post pages. The zip's subscriber list and delivery files are never read and must not be put in EXPORT_DIR.

* A published post whose draft is already in the database (matched by its Substack number in nodes.external_ref) is promoted: the
  draft row becomes a published article, with the live title, address, date, audience and the published text (the draft's title and
  text are kept in node_revisions); its citations stay.
* A published post that is not in the database at all becomes an article (origin 'import', status 'published') with its text as
  Markdown (tools/substack_md.py), its Substack address, date, audience and word count. It carries no Scripture citations:
  those come from the editor's own tool and are added to the database afterwards.
* Drafts, and anything not a newsletter or a page, are never imported.
* --replace-text SLUG replaces the text of an essay already in the database with the version in the export (the old text is kept in
  node_revisions by the database's own trigger). Its citations are not touched and should be re-checked.
* The input database is opened read-only and never modified; the output must not already exist. Everything is applied in one
  transaction and recorded in import_log. --check shows what would happen and writes nothing.
"""
import argparse
import csv
import re
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import substack_md  # noqa: E402

BASE = "https://kingdomcode.substack.com/p/"


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower().replace("’", "").replace("'", "")).strip("-")
    return s[:90].rstrip("-") or "post"


def iso(stamp):
    return datetime.strptime(stamp[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%dT%H:%M:%SZ")


def words(md):
    return len(re.findall(r"\S+", re.sub(r"[#>*_`\\\[\]()]|-{3,}", " ", md)))


def read_export(folder):
    folder = Path(folder)
    rows = list(csv.DictReader((folder / "posts.csv").open(encoding="utf-8")))
    pages = {}
    for f in (folder / "posts").glob("*.html"):
        pid, slug = f.name[:-5].split(".", 1)
        pages[slug] = (pid, f)
    out = {}
    for r in rows:
        if r["is_published"] != "true" or r["type"] not in ("newsletter", "page"):
            continue
        slug = r["post_id"].split(".", 1)[1]
        if slug not in pages:
            sys.exit("posts.csv lists %s as published but its page is not in the export" % slug)
        out[slug] = dict(r, slug=slug, numeric=r["post_id"].split(".", 1)[0], file=pages[slug][1])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export_dir")
    ap.add_argument("src_db")
    ap.add_argument("out_db")
    ap.add_argument("--replace-text", nargs="*", default=[], metavar="SLUG")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if not args.check and Path(args.out_db).exists():
        sys.exit("%s already exists; the output must be a new file" % args.out_db)
    posts = read_export(args.export_dir)

    src = sqlite3.connect("file:%s?mode=ro" % Path(args.src_db).resolve(), uri=True)
    have = {}
    for nid, url in src.execute("select node_id, url from articles where platform = 'substack' and url is not null"):
        have[re.sub(r".*/p/", "", url).split("?")[0].rstrip("/")] = nid
    taken = {s for (s,) in src.execute("select slug from nodes where slug is not null")}
    by_ref = {r: (nid, st) for nid, r, st in src.execute("select id, external_ref, status from nodes where external_ref like 'substack:%'")}

    new = sorted((p for s, p in posts.items() if s not in have), key=lambda p: p["post_date"])
    replace = []
    for slug in args.replace_text:
        if slug not in have:
            sys.exit("--replace-text %s: no essay with that address is in the database" % slug)
        if slug not in posts:
            sys.exit("--replace-text %s: that post is not published in the export" % slug)
        replace.append(slug)

    plan_new = []
    for p in new:
        md = substack_md.to_markdown(p["file"].read_text(encoding="utf-8", errors="replace"))
        if not p["title"].strip():
            sys.exit("post %s has no title in posts.csv" % p["slug"])
        if words(md) < 30:
            sys.exit("post %s has almost no text after conversion (%d words); look at it by hand" % (p["slug"], words(md)))
        if "substack:" + p["numeric"] in by_ref:
            nid, status = by_ref["substack:" + p["numeric"]]
            if status != "draft":
                sys.exit("post %s matches node %d, which is %s, not a draft; look at it by hand" % (p["slug"], nid, status))
            plan_new.append((p, md, None, nid))
            continue
        slug = slugify(p["title"])
        n = 2
        while slug in taken:
            slug = "%s-%d" % (slugify(p["title"])[:80], n); n += 1
        taken.add(slug)
        kind = "start_here" if p["type"] == "page" and p["title"].lower().startswith("start here") else None
        plan_new.append((p, md, slug, kind))

    print("Substack export: %d published newsletters and pages; %d already in the database" % (len(posts), len(posts) - len(new)))
    for p, md, slug, kind in plan_new:
        what = "promote draft %d" % kind if slug is None else "new"
        print("  + %-15s %s  %-14s %5d words  %s" % (what, p["post_date"][:10], p["audience"], words(md), p["title"][:56]))
    for slug in replace:
        p = posts[slug]
        old = src.execute("select n.body_md from nodes n join articles a on a.node_id = n.id where a.node_id = ?", (have[slug],)).fetchone()[0]
        md = substack_md.to_markdown(p["file"].read_text(encoding="utf-8", errors="replace"))
        print("  ~ text %-60s %d -> %d words" % (slug[:60], words(old or ""), words(md)))
    if args.check:
        print("(--check: nothing written)")
        return

    out = sqlite3.connect(args.out_db)
    src.backup(out)
    src.close()
    out.execute("pragma foreign_keys = on")
    loaded = 0
    with out:
        for p, md, slug, kind in plan_new:
            if slug is None:                    # a draft already in the database: it becomes the published post
                kind_here = "start_here" if p["type"] == "page" and p["title"].lower().startswith("start here") else None
                out.execute("update nodes set type = 'article', title = ?, body_md = ?, status = 'published' where id = ?", (p["title"].strip(), md, kind))
                row = (BASE + p["slug"], iso(p["post_date"]), words(md), p["audience"], kind_here)
                if out.execute("select 1 from articles where node_id = ?", (kind,)).fetchone():
                    out.execute("update articles set url = ?, published_at = ?, word_count = ?, audience = ?, post_type = ? where node_id = ?", row + (kind,))
                else:                               # a draft has no article row yet
                    out.execute("insert into articles (node_id, platform, url, published_at, word_count, audience, post_type) values (?, 'substack', ?, ?, ?, ?, ?)", (kind,) + row)
                loaded += 1
                continue
            cur = out.execute(
                "insert into nodes (type, title, slug, summary, body_md, status, origin, external_ref) values ('article', ?, ?, ?, ?, 'published', 'import', ?)",
                (p["title"].strip(), slug, (p["subtitle"] or "").strip() or None, md, "substack:" + p["numeric"]))
            out.execute(
                "insert into articles (node_id, platform, url, published_at, word_count, audience, post_type) values (?, 'substack', ?, ?, ?, ?, ?)",
                (cur.lastrowid, BASE + p["slug"], iso(p["post_date"]), words(md), p["audience"], kind))
            loaded += 1
        for slug in replace:
            md = substack_md.to_markdown(posts[slug]["file"].read_text(encoding="utf-8", errors="replace"))
            out.execute("update nodes set body_md = ? where id = ?", (md, have[slug]))
            out.execute("update articles set word_count = ? where node_id = ?", (words(md), have[slug]))
        out.execute(
            "insert into import_log (file_name, source, rows_read, rows_loaded, notes) values (?, 'substack_posts', ?, ?, ?)",
            (Path(args.out_db).name, len(posts), loaded + len(replace),
             "Added or published %d Substack posts that were not live in the database (new posts carry no Scripture citations yet) and replaced the text of %d essays with the "
             "version in the Substack export (%s). Applied to a copy of %s." % (loaded, len(replace), ", ".join(replace) or "none", Path(args.src_db).name)))
    out.close()
    print("wrote %s: %d posts added, %d texts replaced" % (args.out_db, loaded, len(replace)))


if __name__ == "__main__":
    main()

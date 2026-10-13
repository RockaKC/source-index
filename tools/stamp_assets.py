#!/usr/bin/env python3
"""Stamp a content version on every local script and stylesheet that the site's pages load.

    python3 tools/stamp_assets.py            # update the ?v= stamps in index.html and app.html
    python3 tools/stamp_assets.py --check    # exit 1 if any stamp is out of date

Each tag carries the first 10 hex digits of the file's SHA-256, e.g.
    <script src="js/reader.js?v=3fa1c09e2b"></script>
so a browser never pairs a new page with an old copy of a file. Run it after editing anything in
css/ or js/; tools/export_site.py runs it after writing data/site.js. The tests fail on a stale stamp.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "app.html"]      # every page at the root that loads the app (see "Product profiles")
TAG = re.compile(r'((?:src|href)=")([\w./-]+\.(?:js|css))\?v=([0-9a-f]+)(")')


def version(rel):
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]


def stamp(check=False):
    stale = []
    for name in PAGES:
        stale += ["%s: %s" % (name, rel) for rel in stamp_page(ROOT / name, check)]
    return stale


def stamp_page(path, check):
    html = path.read_text(encoding="utf-8")
    stale = []

    def fix(m):
        rel = m.group(2)
        if not (ROOT / rel).is_file():
            sys.exit("%s loads %s, which does not exist" % (path.name, rel))
        v = version(rel)
        if v != m.group(3):
            stale.append(rel)
        return "%s%s?v=%s%s" % (m.group(1), rel, v, m.group(4))

    new = TAG.sub(fix, html)
    if not check and new != html:
        path.write_text(new, encoding="utf-8")
    return stale


if __name__ == "__main__":
    check = "--check" in sys.argv[1:]
    stale = stamp(check)
    if check and stale:
        sys.exit("out-of-date stamps: %s (run python3 tools/stamp_assets.py)" % ", ".join(stale))
    print(("stale: " + ", ".join(stale)) if stale else "all stamps current", "" if check else "(pages updated)" if stale else "")

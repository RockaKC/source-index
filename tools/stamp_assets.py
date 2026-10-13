#!/usr/bin/env python3
"""Stamp a content version on every local script and stylesheet that index.html loads.

    python3 tools/stamp_assets.py            # update the ?v= stamps in index.html
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
HTML = ROOT / "index.html"
TAG = re.compile(r'((?:src|href)=")([\w./-]+\.(?:js|css))\?v=([0-9a-f]+)(")')


def version(rel):
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]


def stamp(check=False):
    html = HTML.read_text(encoding="utf-8")
    stale = []

    def fix(m):
        rel = m.group(2)
        if not (ROOT / rel).is_file():
            sys.exit("index.html loads %s, which does not exist" % rel)
        v = version(rel)
        if v != m.group(3):
            stale.append(rel)
        return "%s%s?v=%s%s" % (m.group(1), rel, v, m.group(4))

    new = TAG.sub(fix, html)
    if not check and new != html:
        HTML.write_text(new, encoding="utf-8")
    return stale


if __name__ == "__main__":
    check = "--check" in sys.argv[1:]
    stale = stamp(check)
    if check and stale:
        sys.exit("out-of-date stamps in index.html: %s (run python3 tools/stamp_assets.py)" % ", ".join(stale))
    print(("stale: " + ", ".join(stale)) if stale else "all stamps current", "" if check else "(index.html updated)" if stale else "")

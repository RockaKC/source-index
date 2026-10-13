#!/usr/bin/env python3
"""Gather the KC Tewahedo Bible's files into www/, the folder the Android app is built from.

    python3 tools/build_app.py            # write www/ (then: npx cap sync android)
    python3 tools/build_app.py --check    # only check that every file app.html loads exists

What goes in, all copied as they are from the repo:
  * app.html, as www/index.html          the app's page frame (profile profiles/app.js)
  * every script and stylesheet it loads  read from its <script src> and <link href> tags
  * bible/                               every book's text, so the whole Bible reads without a connection
  * img/                                 the pictures the pages show (the translation tier list)
  * app-version.json                     the version this build is (env KC_APP_VERSION, 0.0.0 when unset), which the app shows on its Updates page

What stays out: index.html, sw.js and manifest.webmanifest (the site's own page, offline worker
and install file), the tests, the tools and the database. www/ is rebuilt from scratch on every
run and is never committed (see .gitignore). See tools/README.md, "Android app".
"""
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "www"
PAGE = "app.html"
LOCAL = re.compile(r'(?:src|href)="([\w./-]+\.(?:js|css|png))(?:\?v=[0-9a-f]+)?"')


def page_files():
    html = (ROOT / PAGE).read_text(encoding="utf-8")
    files = sorted(set(LOCAL.findall(html)))
    missing = [f for f in files if not (ROOT / f).is_file()]
    if missing:
        sys.exit("%s loads files that do not exist: %s" % (PAGE, ", ".join(missing)))
    for f in ("sw.js", "manifest.webmanifest", "profiles/site.js"):
        if f in files:
            sys.exit("%s loads %s, which belongs to the site, not the app" % (PAGE, f))
    return html, files


def build():
    html, files = page_files()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    (OUT / "index.html").write_text(html, encoding="utf-8")
    for f in files:
        (OUT / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / f, OUT / f)
    shutil.copytree(ROOT / "bible", OUT / "bible")
    shutil.copytree(ROOT / "img", OUT / "img")
    version = os.environ.get("KC_APP_VERSION", "0.0.0")      # the release workflow passes the version it is publishing; 0.0.0 marks a preview build
    if not re.fullmatch(r"\d{1,2}\.\d{1,2}\.\d{1,2}", version):
        sys.exit("KC_APP_VERSION must look like 1.2.3, not %r" % version)
    (OUT / "app-version.json").write_text(json.dumps({"version": version}) + "\n", encoding="utf-8")
    books = sum(1 for _ in (OUT / "bible").rglob("*.json"))
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print("www/: index.html, %d files it loads, %d book files, %.1f MB, version %s" % (len(files), books, size / 1e6, version))


if __name__ == "__main__":
    if "--check" in sys.argv[1:]:
        print("%s loads %d files, all present" % (PAGE, len(page_files()[1])))
    else:
        build()

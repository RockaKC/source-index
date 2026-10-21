"""Runs tools/witness.py against the repository's own stored text, for tests/witness.spec.js.

    python3 tests/witness_check.py ok          prints the index and files the exporter would write for tools/witness.json
    python3 tests/witness_check.py <mistake>   makes one mistake in the plan first and prints the exporter's refusal
"""
import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import witness  # noqa: E402

D = json.loads(re.search(r"^const D = (\{.*\});$", (ROOT / "data" / "site.js").read_text(encoding="utf-8"), re.M).group(1))
bible = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in (ROOT / "bible").rglob("*.json")}
has_refs = {str(pid) for chapters in D["verses"].values() for verses in chapters.values() for pids in verses.values() for pid in pids}
listed = (set(map(str, D["PUB"])) | has_refs) & set(D["pieces"])
plan = json.loads((ROOT / "tools" / "witness.json").read_text(encoding="utf-8"))
mode = sys.argv[1]
e = plan["entries"]
if mode == "stray-quote":
    e[0]["investigation"][0] += ' He said "enough".'
elif mode == "curly-quote":
    e[0]["investigation"][0] += " He said “enough”."
elif mode == "false-quote":
    e[0]["investigation"][0] += " [[Deuteronomy 19:15|every word shall be established by one witness alone]]"
elif mode == "quote-wrong-verse":
    e[0]["crossrefs"][0]["quote"] = "In the beginning God made the heaven and the earth"
elif mode == "missing-verse":
    e[0]["crossrefs"][0]["ref"] = "Deuteronomy 19:900"
elif mode == "repeated-verse":
    e[1]["passage"] = ["Deuteronomy 19:15-16"]
elif mode == "same-book-twice-running":
    e[1]["passage"] = ["Deuteronomy 18:15-16"]
elif mode == "same-book-thrice":
    for k, v in ((0, 8), (2, 9), (4, 10)):
        e[k]["passage"] = ["Acts 1:%d" % v]
elif mode == "builds-on-future":
    e[0]["builds_on"] = [3]
elif mode == "bad-essay":
    e[0]["related"]["essays"] = [999999]
elif mode == "bad-guide":
    e[0]["related"]["guides"] = ["no-such-guide"]
elif mode == "bad-status":
    e[0]["status"] = "published"
elif mode == "short-observation":
    e[0]["observation"] = "Too short."
elif mode == "bad-zone":
    plan["schedule"]["timezone"] = "Mars/Olympus"
elif mode == "bad-start":
    plan["schedule"]["start"] = "2 November"
elif mode == "unfiled-book":
    plan["groups"][0]["books"].pop()
elif mode == "gap-in-numbers":
    e[2]["n"] = 9
elif mode == "two-books":
    e[0]["passage"] = ["Deuteronomy 19:15", "John 5:31"]
elif mode == "too-long":
    e[0]["passage"] = ["Deuteronomy 19:15-19", "Deuteronomy 18:1-9", "Deuteronomy 17:1-4"]
elif mode != "ok":
    sys.exit("unknown mode " + mode)
try:
    W, files = witness.export(plan, D, bible, listed)
    print(json.dumps({"W": W, "files": files}, sort_keys=True))
except SystemExit as err:
    print("REFUSED: " + str(err))

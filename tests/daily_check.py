"""Runs tools/daily.py against the repository's own stored text, for tests/daily.spec.js.

    python3 tests/daily_check.py ok          prints the files the exporter would write for tools/daily.json
    python3 tests/daily_check.py <mistake>   makes one mistake in the plan first and prints the exporter's refusal
"""
import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import daily  # noqa: E402

D = json.loads(re.search(r"^const D = (\{.*\});$", (ROOT / "data" / "site.js").read_text(encoding="utf-8"), re.M).group(1))
bible = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in (ROOT / "bible").rglob("*.json")}
plan = json.loads((ROOT / "tools" / "daily.json").read_text(encoding="utf-8"))
mode = sys.argv[1]
week = plan["seasons"][0]["movements"][0]["weeks"][0]
if mode == "short-week":
    week["days"].pop()
elif mode == "repeated-verse":
    week["days"][1][0] = week["days"][0][0]
elif mode == "long-range":
    week["days"][0][0] = "Genesis 1:1-6"
elif mode == "missing-verse":
    week["days"][0][0] = "Genesis 1:900"
elif mode == "unknown-book":
    week["days"][0][0] = "Hezekiah 1:1"
elif mode == "no-title":
    week["days"][0][1] = ""
elif mode == "wrong-start":
    plan["start"] = [1, 1]
elif mode != "ok":
    sys.exit("unknown mode " + mode)
try:
    print(json.dumps(daily.export(plan, D, bible), sort_keys=True))
except SystemExit as e:
    print("REFUSED: " + str(e))

"""Checks for tools/essay_text.py: an essay's words are never changed, references become links only where it is safe, and a page that
differs from the manuscript is refused. Run by tests/essays.spec.js; prints OK, or the first failure."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import essay_text as e  # noqa: E402

MD = """The sons of God in Genesis 6:1-4 are *plain* to read, and **Job 1:6** says more.

### 1. The Union

> “*And it came to pass*.” - Genesis 6:1-4
>
> “*Second*.” - Job 38:7

* First, see [Genesis 6:2 in context](https://example.com/a?x=1&y=2).
* Second: Psalm 88:7 (Psalm 89:6 in English Bibles)

1. One <b>tag</b> & an ampersand
2. Two

---

Written by A_B and C_D, with 2 * 3 = 6 and a stray *star.
"""


def at(text, needle, nth=0):
    i = -1
    for _ in range(nth + 1):
        i = text.index(needle, i + 1)
    return i


def check():
    refs = [(at(MD, "Genesis 6:1-4"), "Genesis 6:1-4", "1:6:1-4"),
            (at(MD, "Genesis 6:1-4", 1), "Genesis 6:1-4", "1:6:1-4"),
            (at(MD, "Job 1:6"), "Job 1:6", "27:1:6"),                       # inside bold: skipped (its marks are around it, not in it, so it is linked)
            (at(MD, "Job 38:7"), "Job 38:7", "27:38:7"),
            (at(MD, "Genesis 6:2"), "Genesis 6:2", "1:6:2"),                # inside an existing link: skipped
            (at(MD, "Psalm 88:7"), "Psalm 88:7", "28:88:7"),
            (at(MD, "Psalm 89:6"), "Psalm 89:6", "28:88:7"),
            (5, "wrong words", "1:1:1"),                                    # the text is not there: skipped
            (at(MD, "Job 38:7"), "Job 38:7", "27:38:7")]                    # the same place twice: linked once
    linked, n = e.link_refs(MD, refs)
    assert n == 6, n
    assert "[Genesis 6:2 in context](https://example.com" in linked and "kc-ref:1:6:2" not in linked
    assert linked.count("kc-ref:27:38:7") == 1
    assert e.same_words(MD, e.to_html(MD)) is None, e.same_words(MD, e.to_html(MD))
    h = e.to_html(linked)
    assert e.same_words(MD, h) is None, e.same_words(MD, h)                 # linking changes no word
    assert h.count('class="sref"') == 6
    assert '<a class="sref" data-ref="1:6:1-4" href="#/read/1/6/1">Genesis 6:1-4</a>' in h
    assert "&lt;b&gt;tag&lt;/b&gt; &amp; an ampersand" in h and "<b>" not in h          # nothing in a manuscript becomes markup
    assert '<h3>1. The Union</h3>' in h                                      # a numbered heading keeps its number
    assert "A_B and C_D" in h and "2 * 3 = 6" in h
    assert e.words(MD) == len(e.tokens(e._plain_html(h)))
    # a page that differs is refused: a dropped word, a changed word, a swapped order, an extra sentence
    for old, new in (("to read", "read"), ("plain", "plane"), ("First, see", "see First,"), ("</ul>", "</ul><p>Extra.</p>")):
        bad = h.replace(old, new, 1)
        assert bad != h and e.same_words(MD, bad), old
    # the shape too: headings, rules, list items and links; a page that loses or changes one is refused
    assert e.structure(MD, e.to_html(MD)) is None and e.structure(MD, h) is None, e.structure(MD, h)
    for old, new in (("<h3>1. The Union</h3>", "<h3>The Union</h3>"), ("<hr>", ""), ("<li>Two</li>", ""), (">Genesis 6:2 in context<", ">Genesis 6:2<")):
        bad = h.replace(old, new, 1)
        assert bad != h and e.structure(MD, bad), old
    assert e.ref_key(1006001, 1006004) == "1:6:1-4" and e.ref_key(27001006, 27001006) == "27:1:6" and e.ref_key(1006030, 1007002) == "1:6:30"
    print("OK")


check()

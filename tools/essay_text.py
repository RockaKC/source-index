"""Essay text for the website: the database's Markdown, turned into safe page HTML.

Used by tools/export_site.py. The essays' Markdown (nodes.body_md) is simple: paragraphs, ### headings, rules,
block quotes, lists, bold, italics and a few links. Everything is HTML-escaped first, and only the tags built
here are ever produced, so nothing in an essay can inject markup or script into the page.
"""
import html
import re

_LINK = re.compile(r"\[([^\]\n]+)\]\(((?:https?://|kc-ref:)[^\s)]+)\)")
_BOLD_ITALIC = re.compile(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", re.S)
_BOLD = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", re.S)
_ITALIC = re.compile(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", re.S)
_STRAY = r"(?<![\w*])\*+(?=[^\s*])|(?<=[^\s*])\*+(?![\w*])"    # a run of stars hugging a word on one side only
_ESCAPED = re.compile(r"\\([\\`*_{}\[\]()#+\-.!>|~])")


def _a(m, rewrite):
    href, label = m.group(2), m.group(1)
    if href.startswith("kc-ref:"):                  # a Scripture reference the author wrote: the same words, now a link (the page fills in the address)
        key = href[7:]
        b, ch, vs = (key.replace("-", ":").split(":") + ["0"])[:3]
        return '<a class="sref" data-ref="%s" href="#/read/%s/%s/%s">%s</a>' % (key, b, ch, vs, label)
    mine = rewrite(href) if rewrite else None            # a link to another essay or page of this site stays on the site
    if mine:
        return '<a href="%s">%s</a>' % (mine.replace('"', "&quot;"), label)
    return '<a href="%s" target="_blank" rel="noopener">%s</a>' % (href.replace('"', "&quot;"), label)


def inline(text, rewrite=None):
    """Escape, then apply links, bold and italics. Links must be http(s); they open in a new tab unless rewrite(href) names a page here."""
    s = html.escape(text, quote=False)
    keep = []

    def hold(m):                                   # a backslash-escaped mark is kept as the plain character
        keep.append(m.group(1))
        return "\x00%d\x00" % (len(keep) - 1)

    s = _ESCAPED.sub(hold, s)
    s = _LINK.sub(lambda m: _a(m, rewrite), s)
    s = _BOLD_ITALIC.sub(r"<strong><em>\1</em></strong>", s)
    s = _BOLD.sub(r"<strong>\1</strong>", s)
    s = _ITALIC.sub(r"<em>\1</em>", s)
    s = re.sub(r"(<[^>]*>)|" + _STRAY, lambda m: m.group(1) or "", s)    # an emphasis mark the source left unpaired is dropped; a star standing alone (2 * 3) or inside a word is the author's and stays
    return re.sub("\x00(\\d+)\x00", lambda m: keep[int(m.group(1))], s)


def _paragraph(lines, rewrite=None):
    text = "\n".join(l.strip() for l in lines if l.strip())         # emphasis may run across the lines of one paragraph
    return "<p>%s</p>" % inline(text, rewrite).replace("\n", "<br>")


def to_html(md, rewrite=None):
    """Markdown -> HTML (a string of block elements). rewrite(href) may return a page of this site for a link, or None."""
    lines = md.replace("\r\n", "\n").split("\n")
    out, buf, i = [], [], 0

    def flush():
        if buf:
            out.append(_paragraph(buf, rewrite))
            buf.clear()

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            flush(); i += 1; continue
        if re.fullmatch(r"-{3,}|\*{3,}|_{3,}", stripped):
            flush(); out.append("<hr>"); i += 1; continue
        m = re.match(r"(#{1,6})\s+(.+?)\s*#*$", stripped)
        if m:
            flush()
            level = min(4, max(2, len(m.group(1))))        # the page's own title is the h1
            out.append("<h%d>%s</h%d>" % (level, inline(m.group(2), rewrite), level)); i += 1; continue
        if stripped.startswith(">"):
            flush()
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i])); i += 1
            out.append("<blockquote>%s</blockquote>" % to_html("\n".join(quote), rewrite))
            continue
        m = re.match(r"(\s*)([*+-]|\d+\.)\s+(.*)", line)
        if m:
            flush()
            ordered = m.group(2)[0].isdigit()
            items = []
            while i < len(lines):
                mm = re.match(r"(\s*)([*+-]|\d+\.)\s+(.*)", lines[i])
                if not mm or mm.group(2)[0].isdigit() != ordered:
                    break
                text = mm.group(3); i += 1
                while i < len(lines) and lines[i].strip() and not re.match(r"\s*([*+-]|\d+\.)\s+", lines[i]) \
                        and not lines[i].lstrip().startswith((">", "#")) and not re.fullmatch(r"-{3,}", lines[i].strip()):
                    text += " " + lines[i].strip(); i += 1      # a wrapped list line
                items.append("<li>%s</li>" % inline(text, rewrite))
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join(items), tag))
            continue
        buf.append(line); i += 1
    flush()
    return "".join(out)


def words(md):
    return len(tokens(_plain_md(md)))


# ---- Scripture references inside the text ----
_LINKSPAN = re.compile(r"\[[^\]\n]*\]\([^)\s]*\)")


def ref_key(house_start, house_end):
    """The house-numbering key 'book:chapter:verse' or 'book:chapter:first-last' for a citation's verse ids (book*1000000 + chapter*1000 + verse)."""
    b, ch, vs = house_start // 1000000, house_start // 1000 % 1000, house_start % 1000
    eb, ech, ve = house_end // 1000000, house_end // 1000 % 1000, house_end % 1000
    return "%d:%d:%d-%d" % (b, ch, vs, ve) if (eb, ech) == (b, ch) and ve > vs else "%d:%d:%d" % (b, ch, vs)


def link_refs(md, refs):
    """Turn each Scripture reference the author wrote into a link, without changing one character of the text.

    refs: (char_offset, raw, key). A reference is linked only where md really holds `raw` at that offset, outside any existing link,
    and without overlapping another reference. The link keeps the words as they were: [raw](kc-ref:key)."""
    spans = [(m.start(), m.end()) for m in _LINKSPAN.finditer(md)]
    taken, out = [], md
    for off, raw, key in sorted(refs):
        if md[off:off + len(raw)] != raw or "\n" in raw or any(c in raw for c in "[]()\\*_`"):
            continue
        if any(a < off + len(raw) and off < z for a, z in spans) or any(a < off + len(raw) and off < z for a, z in taken):
            continue
        taken.append((off, off + len(raw)))
    done = {(a, z): key for a, z, key in ((o, o + len(r), k) for o, r, k in refs if (o, o + len(r)) in set(taken))}
    for a, z in sorted(taken, reverse=True):
        out = out[:a] + "[%s](kc-ref:%s)" % (md[a:z], done[(a, z)]) + out[z:]
    return out, len(taken)


# ---- the check that the page says exactly what the manuscript says ----
def _plain_md(md):
    t = md.replace("\r\n", "\n")
    t = re.sub(r"(?m)^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", " ", t)                 # rules
    t = re.sub(r"(?m)^(?:\s*>)+ ?", "", t)                                       # quote marks
    t = re.sub(r"(?m)^\s*(?:[*+-]|\d+\.)\s+", "", t)                              # list markers (before headings: "### 1. Title" keeps its number)
    t = re.sub(r"(?m)^\s*#{1,6}\s+", "", t)
    t = re.sub(r"\[([^\]\n]+)\]\((?:https?://|kc-ref:)[^\s)]+\)", r"\1", t)    # a link is its words
    t = _ESCAPED.sub(lambda m: m.group(1), t)
    t = re.sub(_STRAY, "", t)                                                    # emphasis marks (a mark inside a word is kept)
    return t


def _plain_html(h):
    t = re.sub(r"<br\s*/?>|</(?:p|h\d|li|blockquote|ul|ol)>|<hr>", " ", h)
    return html.unescape(re.sub(r"<[^>]+>", "", t))


def tokens(text):
    return re.findall(r"\S+", text)


def same_words(md, h):
    """None when the page's words are exactly the manuscript's, in order; otherwise a short description of the first difference."""
    a, b = tokens(_plain_md(md)), tokens(_plain_html(h))
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return "word %d: manuscript %r, page %r (…%s)" % (i, x, y, " ".join(a[max(0, i - 4):i + 3]))
    if len(a) != len(b):
        return "the manuscript has %d words and the page %d" % (len(a), len(b))
    return None


def structure(md, h):
    """The shape of the manuscript against the shape of the page: the same headings in the same order, the same number of rules and
    list items, the same links (by their words, in order) and the same bold and italic runs. None when they match, else the first difference."""
    t = md.replace("\r\n", "\n")
    t = re.sub(r"(?m)^(?:\s*>)+ ?", "", t)
    def words_of(x):                                   # one line's words, without its markdown marks
        x = re.sub(r"\[([^\]\n]+)\]\((?:https?://|kc-ref:)[^\s)]+\)", r"\1", x)
        return re.sub(r"\s+", " ", re.sub(_STRAY, "", _ESCAPED.sub(lambda m: m.group(1), x))).strip()
    heads = [words_of(m.group(2)) for m in re.finditer(r"(?m)^\s*(#{1,6})\s+(.+?)\s*#*$", t)]
    hh = [re.sub(r"\s+", " ", _plain_html(m.group(2))).strip() for m in re.finditer(r"<h([234])>(.*?)</h\1>", h)]
    rules = len(re.findall(r"(?m)^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", t))
    items = len(re.findall(r"(?m)^\s*(?:[*+-]|\d+\.)\s+", re.sub(r"(?m)^\s*#{1,6}\s+.*$", "", t)))
    links = [m.group(1) for m in re.finditer(r"\[([^\]\n]+)\]\(https?://[^\s)]+\)", md)]
    hl = [html.unescape(re.sub(r"<[^>]+>", "", m.group(1))) for m in re.finditer(r'<a (?![^>]*class="sref")[^>]*>(.*?)</a>', h)]
    em = len(re.findall(r"(?<![\w*])\*(?=[^\s*])[^*\n]+?(?<=[^\s*])\*(?![\w*])", re.sub(r"\*\*[^*]+\*\*", "", t)))
    hem = len(re.findall(r"<em>", h)) - len(re.findall(r"<strong><em>", h))
    for what, a, b in (("headings", heads, hh), ("rules", rules, h.count("<hr>")), ("list items", items, h.count("<li>")), ("links", links, hl)):
        if a != b:
            return "%s differ: manuscript %s, page %s" % (what, a if not isinstance(a, list) else len(a), b if not isinstance(b, list) else len(b))
    return None


def shape(md, h):
    """What the page holds, for the review: counts of each kind of block."""
    return {"headings": len(re.findall(r"<h[234]>", h)), "quotations": h.count("<blockquote>"), "list items": h.count("<li>"), "rules": h.count("<hr>"),
            "links out": len(re.findall(r'<a (?![^>]*class="sref")', h)), "Scripture links": h.count('class="sref"'), "italic runs": h.count("<em>"), "bold runs": h.count("<strong>")}

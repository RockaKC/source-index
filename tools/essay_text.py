"""Essay text for the website: the database's Markdown, turned into safe page HTML.

Used by tools/export_site.py. The essays' Markdown (nodes.body_md) is simple: paragraphs, ### headings, rules,
block quotes, lists, bold, italics and a few links. Everything is HTML-escaped first, and only the tags built
here are ever produced, so nothing in an essay can inject markup or script into the page.
"""
import html
import re

_LINK = re.compile(r"\[([^\]\n]+)\]\((https?://[^\s)]+)\)")
_BOLD_ITALIC = re.compile(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", re.S)
_BOLD = re.compile(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", re.S)
_ITALIC = re.compile(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", re.S)
_ESCAPED = re.compile(r"\\([\\`*_{}\[\]()#+\-.!>|~])")


def _a(m, rewrite):
    href, label = m.group(2), m.group(1)
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
    s = re.sub(r"(<[^>]*>)|\*+", lambda m: m.group(1) or "", s)    # a stray emphasis mark the source left unpaired is dropped, not shown
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
    return len(re.findall(r"\S+", re.sub(r"[#>*_`\\\[\]()]|-{3,}", " ", md)))

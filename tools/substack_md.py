"""A Substack post's HTML (from its "Exports" zip), turned into the Markdown the database keeps in nodes.body_md.

Same conventions as the essays already in the database: *italic*, **bold**, ### headings, > quotes, "* " and "1. " lists,
--- for a rule, and blank lines between blocks. Pictures, buttons, subscribe boxes, embeds and scripts are left out; links
are kept (http and https only). Used by tools/import_substack_posts.py.
"""
import re
from html.parser import HTMLParser

SKIP_TAGS = {"script", "style", "svg", "button", "iframe", "figure", "picture", "img", "source", "video", "audio", "form", "input", "noscript"}
SKIP_CLASS = re.compile(r"subscription-widget|button-wrapper|captioned-button|post-ufi|share-dialog|footer|paywall")


class _Md(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []            # finished blocks of Markdown
        self.cur = []               # pieces of the block being built
        self.skip = 0               # depth inside something we leave out
        self.stack = []             # open tags we track: (tag, is_skip)
        self.quote = 0              # blockquote depth
        self.lists = []             # open lists: ['ul'|'ol', next number]
        self.link = None            # href of the open <a>
        self.link_start = None
        self.heading = None

    # -- helpers --
    def _flush(self):
        text = "".join(self.cur)
        self.cur = []
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r" *\n *", "\n", text).strip()
        if text:
            self.blocks.append(self._wrap(text))

    def _wrap(self, text):
        if self.heading:
            text = "#" * self.heading + " " + text.replace("\n", " ")
        elif self.lists:
            kind, n = self.lists[-1]
            marker = "* " if kind == "ul" else "%d. " % n
            if kind == "ol":
                self.lists[-1][1] += 1
            text = marker + text.replace("\n", " ")
        if self.quote:
            text = "\n".join(("> " * self.quote + l) if l else ">" for l in text.split("\n"))
        return text

    def _emph(self, mark):
        """Open or close an emphasis mark; spaces stay outside the marks, as Markdown needs."""
        if self.cur and mark in ("*", "**"):
            joined = "".join(self.cur)
            if joined.endswith(" ") and self.stack and self.stack[-1][0] == "close-" + mark:
                pass
        self.cur.append(mark)

    # -- parser events --
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class") or ""
        if self.skip:
            if tag not in ("br", "hr", "img", "source", "input"):
                self.stack.append((tag, True)); self.skip += 1
            return
        if tag in SKIP_TAGS or SKIP_CLASS.search(cls):
            if tag not in ("br", "hr", "img", "source", "input"):
                self.stack.append((tag, True)); self.skip += 1
            return
        if tag == "hr":
            self._flush(); self.blocks.append("---"); return
        if tag == "br":
            self.cur.append("\n"); return
        if tag in ("p", "div"):
            self._flush()
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._flush(); self.heading = max(2, min(4, int(tag[1])))
        elif tag == "blockquote":
            self._flush(); self.quote += 1
        elif tag in ("ul", "ol"):
            self._flush(); self.lists.append([tag, 1])
        elif tag == "li":
            self._flush()
        elif tag in ("em", "i"):
            self.cur.append("\x01")             # placeholders: resolved when the block is closed
        elif tag in ("strong", "b"):
            self.cur.append("\x02")
        elif tag == "a":
            href = (a.get("href") or "").strip()
            if re.match(r"https?://", href):
                self.link = href; self.cur.append("\x03")
        self.stack.append((tag, False))

    def handle_endtag(self, tag):
        # close the nearest matching open tag
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                skipped = self.stack[i][1]
                del self.stack[i:]
                if skipped:
                    self.skip -= 1
                    return
                break
        else:
            return
        if self.skip:
            return
        if tag in ("p", "div"):
            self._flush()
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._flush(); self.heading = None
        elif tag == "blockquote":
            self._flush(); self.quote = max(0, self.quote - 1)
        elif tag in ("ul", "ol"):
            self._flush()
            if self.lists:
                self.lists.pop()
        elif tag == "li":
            self._flush()
        elif tag in ("em", "i"):
            self.cur.append("\x01")
        elif tag in ("strong", "b"):
            self.cur.append("\x02")
        elif tag == "a" and self.link:
            self.cur.append("\x04" + self.link + "\x04"); self.link = None

    def handle_data(self, data):
        if not self.skip:
            self.cur.append(data)


def _resolve(text):
    """Placeholders -> Markdown marks, with the spaces moved outside the marks, and links built."""
    # links: \x03 label \x04 href \x04
    text = re.sub("\x03(.*?)\x04(.*?)\x04", lambda m: "[%s](%s)" % (m.group(1).strip(), m.group(2)) if m.group(1).strip() else "", text, flags=re.S)
    for ph, mark in (("\x02", "**"), ("\x01", "*")):
        out, open_at = [], None
        parts = text.split(ph)
        res = parts[0]
        for i, seg in enumerate(parts[1:], 1):
            if i % 2 == 1:                      # an opening placeholder: the segment up to the closing one is emphasised
                res += "\x00OPEN\x00" + seg
            else:
                res += "\x00CLOSE\x00" + seg
        # pair them up
        def pair(m):
            inner = m.group(1)
            lead = len(inner) - len(inner.lstrip(" \n"))
            trail = len(inner) - len(inner.rstrip(" \n"))
            core = inner.strip(" \n")
            if not core:
                return inner
            return inner[:lead] + mark + core + mark + inner[len(inner) - trail:]
        res = re.sub("\x00OPEN\x00(.*?)\x00CLOSE\x00", pair, res, flags=re.S)
        res = res.replace("\x00OPEN\x00", "").replace("\x00CLOSE\x00", "")
        text = res
    return text


def to_markdown(html_text):
    p = _Md()
    p.feed(html_text)
    p._flush()
    blocks = [_resolve(b) for b in p.blocks]
    out = []
    for b in blocks:
        # lists: keep consecutive items together
        if out and re.match(r"(\* |\d+\. )", b) and re.match(r"(\* |\d+\. )", out[-1].split("\n")[-1]):
            out[-1] += "\n" + b
        elif out and b.startswith(">") and out[-1].startswith(">"):
            out[-1] += "\n>\n" + b
        else:
            out.append(b)
    md = "\n\n".join(x for x in out if x.strip())
    return re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"

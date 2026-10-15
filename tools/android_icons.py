#!/usr/bin/env python3
"""Make the Android app's launcher icons and launch-screen mark from one picture.

    python3 tools/android_icons.py                      # from android/icon-source.jpg
    python3 tools/android_icons.py new-artwork.png      # from another picture (it becomes the new icon-source.jpg)

The source is the editor's icon artwork: a rounded tile (the Bible with the gold cross on green leather) on a black
square. The tile is cut out by its own outline (edges and corner radius measured from the picture), and the black around it dropped. It writes,
into android/app/src/main/res/:
  * mipmap-*/ic_launcher_foreground.png  the tile on a transparent square, for Android 8 and newer, which cut every
                                         icon to their own shape (circle, squircle, rounded square). The tile fills
                                         74 of the 108 units, a little more than the 72 a launcher shows, so the
                                         launcher's shape, not the tile's own corners, makes the outline.
  * values/ic_launcher_background.xml    the leather green behind it (ic_launcher_background), sampled from the tile
  * mipmap-*/ic_launcher.png             the tile alone, for Android 7
  * mipmap-*/ic_launcher_round.png       the foreground on its green, cut to a circle, for Android 7 round icons
  * drawable/splash_mark.png             the book on the launch screen, on every Android version (windowSplashScreenAnimatedIcon in
                                         values/styles.xml, and drawable/splash.xml for Android 7 to 11): the tile with its leather
                                         faded away at the edges, so the book sits on the plain green screen (ic_launcher_background)
                                         with no plate showing
Needs Pillow (pip install pillow). The icons are committed; the build does not run this.
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "android" / "icon-source.jpg"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITY = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
TILE_IN_ADAPTIVE = 74 / 108


def tile_of(img):
    """The rounded tile, cut out by its outline: edges found along the middle lines, corner radius along a diagonal."""
    img = img.convert("RGB")
    w, h = img.size
    lum = img.convert("L")
    lit = lambda x, y: lum.getpixel((x, y)) > 14          # the tile's lit rim, against the black around it
    left = next(x for x in range(w) if lit(x, h // 2))
    right = next(x for x in range(w - 1, -1, -1) if lit(x, h // 2))
    top = next(y for y in range(h) if lit(w // 2, y))
    bottom = next(y for y in range(h - 1, -1, -1) if lit(w // 2, y))
    t = next(t for t in range(min(w, h) // 2) if lit(left + t, top + t))
    radius = t / (1 - 2 ** -0.5)                          # where a rounded corner meets its diagonal
    big = 4                                               # drawn at 4x, then reduced, for a smooth edge
    mask = Image.new("L", (w * big, h * big), 0)
    ImageDraw.Draw(mask).rounded_rectangle((left * big, top * big, (right + 1) * big - 1, (bottom + 1) * big - 1),
                                           radius=radius * big, fill=255)
    tile = img.convert("RGBA")
    tile.putalpha(mask.resize((w, h), Image.LANCZOS))
    return tile.crop((left, top, right + 1, bottom + 1))


def leather(tile):
    """The leather's green: the median of a strip between the tile's left edge and the book's spine."""
    w, h = tile.size
    strip = tile.crop((int(w * 0.04), int(h * 0.35), int(w * 0.15), int(h * 0.65))).convert("RGB")
    def median(channel):
        hist, half, seen = channel.histogram(), channel.size[0] * channel.size[1] / 2, 0
        for value, count in enumerate(hist):
            seen += count
            if seen >= half:
                return value
    return tuple(median(c) for c in strip.split())


def splash_mark(tile, canvas=576, share=0.60, feather=0.10):
    """The tile on a transparent square for the launch screen, its leather faded out toward the edges and the book left whole.

    The system shows a launch-screen icon inside a circle two thirds of the square, so the tile takes `share` of the square.
    The fade is the tile's outline eroded by `feather` of its width and blurred (with zeros around it, so straight edges
    fade too), then cut so nothing is left at the rim. The book is found as what is not leather green (green not clearly above
    red: black cover, gold, red ribbon), kept in full, and kept away from the corners where the tile's bright rim is."""
    size = round(canvas * share)
    t = tile.resize((size, size), Image.LANCZOS)
    alpha, e = t.split()[3], round(size * feather)
    pad = e * 3
    fade = ImageOps.expand(alpha, border=pad, fill=0).filter(ImageFilter.MinFilter(2 * e + 1)).filter(ImageFilter.GaussianBlur(e * 0.7))
    fade = fade.crop((pad, pad, pad + size, pad + size)).point(lambda v: int(255 * min(1, max(0, (v - 50) / 170))))
    r, g, _ = t.convert("RGB").split()
    book = ImageChops.subtract(g, r).point(lambda v: 255 if v < 6 else 0).filter(ImageFilter.MaxFilter(11)).filter(ImageFilter.GaussianBlur(5))
    inner = Image.new("L", (size * 2, size * 2), 0)
    d = round(size * 0.045) * 2
    ImageDraw.Draw(inner).rounded_rectangle((d, d, size * 2 - d, size * 2 - d), radius=size * 0.30, fill=255)
    inner = inner.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
    t.putalpha(ImageChops.lighter(fade, ImageChops.multiply(ImageChops.multiply(book, inner), alpha)))
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    off = (canvas - size) // 2
    out.paste(t, (off, off), t)
    return out


def square(img, size):
    return img.resize((size, size), Image.LANCZOS)


def main(src):
    if src != SOURCE:
        Image.open(src).convert("RGB").save(SOURCE, quality=95)
    tile = tile_of(Image.open(SOURCE))
    green = leather(tile)
    for name, d in DENSITY.items():
        out = RES / f"mipmap-{name}"
        out.mkdir(parents=True, exist_ok=True)
        full, inner = round(108 * d), round(108 * d * TILE_IN_ADAPTIVE)
        fg = Image.new("RGBA", (full, full), (0, 0, 0, 0))
        off = (full - inner) // 2
        fg.paste(square(tile, inner), (off, off), square(tile, inner))
        fg.save(out / "ic_launcher_foreground.png", optimize=True)
        legacy = round(48 * d)
        icon = Image.new("RGBA", (legacy, legacy), (0, 0, 0, 0))
        t = square(tile, legacy - 2 * round(d))
        icon.paste(t, (round(d), round(d)), t)
        icon.save(out / "ic_launcher.png", optimize=True)
        shown = Image.new("RGBA", (full, full), green + (255,))
        shown.alpha_composite(fg)
        cut = round(18 * d)                                         # the 72 of 108 units a launcher shows
        shown = square(shown.crop((cut, cut, full - cut, full - cut)), legacy)
        mask = Image.new("L", (legacy * 4, legacy * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
        shown.putalpha(mask.resize((legacy, legacy), Image.LANCZOS))
        shown.save(out / "ic_launcher_round.png", optimize=True)
    splash_mark(tile).save(RES / "drawable" / "splash_mark.png", optimize=True)
    square(tile, 384).save(ROOT / "img" / "app-icon.webp", quality=92)      # the download page's picture of the app
    hexgreen = "#%02X%02X%02X" % green
    bg = RES / "values" / "ic_launcher_background.xml"
    text = bg.read_text(encoding="utf-8")
    bg.write_text(re.sub(r'(<color name="ic_launcher_background">)#[0-9A-Fa-f]{6}(</color>)', r"\g<1>%s\g<2>" % hexgreen, text),
                  encoding="utf-8")
    print("icons written to %s; leather green %s" % (RES, hexgreen))


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else SOURCE)

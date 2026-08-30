#!/usr/bin/env python3
"""
Draw the two launch screens, with the type as outlines rather than as `<text>`.

`assets/splash.svg` and `assets/splash-dark.svg` are what @capacitor/assets
renders the native launch screens from (see scripts/generate-native-icons.mjs).
They are generated rather than hand-authored for one reason: **the rasterizer
has no access to the app's fonts.** These files are rendered by sharp, outside a
browser, on whatever machine runs the build — so a `<text font-family="Figtree">`
resolves to whatever fontconfig happens to offer, which is not Figtree on any
machine. The old files acknowledged this and worked around it by centring the
text so a fallback of any width stayed put. That keeps the layout but not the
brand: the first frame of the app rendered in Helvetica.

Outlining the strings here removes the dependency. The glyphs come from the same
self-hosted subsets the app ships (public/fonts/), so the launch screen and the
first painted frame are set in the same faces — Instrument Serif for the
wordmark, Figtree for the line under it.

    pip install fonttools brotli
    python3 scripts/build-splash.py

Re-run it after changing the wordmark, the tagline, or either font subset. The
strings live in WORDMARK / TAGLINE below, so they stay greppable even though the
output has no text in it.
"""

from __future__ import annotations

from pathlib import Path

from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SERIF = ROOT / "public/fonts/instrument-serif-latin.woff2"
SANS = ROOT / "public/fonts/figtree-latin.woff2"

WORDMARK = "Etto"
TAGLINE = "Track your macros, reach your goals."


def _ntos(value: float) -> str:
    """One decimal is ~0.005px at the sizes used here, and halves the file."""
    rounded = round(value, 1)
    return str(int(rounded)) if rounded == int(rounded) else str(rounded)


def outline(font_path: Path, text: str, size: float, weight: float | None = None) -> str:
    """`text` as one SVG path, centred on x=0 and sitting on the y=0 baseline."""
    font = TTFont(font_path)
    if weight is not None and "fvar" in font:
        font = instantiateVariableFont(font, {"wght": weight}, inplace=False)

    scale = size / font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    metrics = font["hmtx"]

    # The subsets keep a legacy `kern` table where the family has one; GPOS
    # kerning is not read, which for these two strings costs nothing visible.
    kerning: dict[tuple[str, str], int] = {}
    if "kern" in font:
        for subtable in font["kern"].kernTables:
            kerning.update(subtable.kernTable)

    names = [cmap[ord(c)] for c in text]
    advances = [metrics[n][0] for n in names]
    pairs = [kerning.get((names[i], names[i + 1]), 0) for i in range(len(names) - 1)] + [0]
    total = sum(advances) + sum(pairs)

    run = RecordingPen()
    x = -total / 2
    for name, advance, kern in zip(names, advances, pairs):
        glyphs[name].draw(TransformPen(run, (1, 0, 0, 1, x, 0)))
        x += advance + kern

    path = SVGPathPen(glyphs, ntos=_ntos)
    # Font space is y-up, SVG is y-down.
    run.replay(TransformPen(path, (scale, 0, 0, -scale, 0, 0)))
    return path.getCommands()


# The icon artwork, verbatim from public/icon.svg and public/icon-dark.svg —
# same tile, same three rings, same sheen. Kept as a string here rather than
# parsed out of those files: a launch screen that silently followed an icon edit
# is worse than one that visibly needs regenerating.
ICON_LIGHT = """    <rect width="512" height="512" rx="120" fill="url(#tile)"/>
    <g clip-path="url(#tileClip)" fill="none" stroke-linecap="round" stroke-width="30">
      <g transform="rotate(-95 256 256)">
        <circle cx="256" cy="256" r="176" stroke="#ffffff" stroke-opacity=".16"/>
        <circle cx="256" cy="256" r="176" stroke="#CF9B6C" stroke-dasharray="730 376"/>
      </g>
      <g transform="rotate(-20 256 256)">
        <circle cx="256" cy="256" r="120" stroke="#ffffff" stroke-opacity=".16"/>
        <circle cx="256" cy="256" r="120" stroke="#7BA7C4" stroke-dasharray="407 347"/>
      </g>
      <g transform="rotate(60 256 256)">
        <circle cx="256" cy="256" r="72" stroke="#ffffff" stroke-opacity=".16"/>
        <circle cx="256" cy="256" r="72" stroke="#C98A97" stroke-dasharray="344 109"/>
      </g>
    </g>
    <g clip-path="url(#tileClip)">
      <path d="M0 0h512v150c-90 52-180 78-256 78S90 202 0 150Z" fill="url(#specular)"/>
      <rect x="1.5" y="1.5" width="509" height="509" rx="118.5" fill="none" stroke="#ffffff" stroke-opacity=".38" stroke-width="3"/>
    </g>"""

ICON_DARK = """    <rect width="512" height="512" rx="120" fill="#14180F"/>
    <g clip-path="url(#tileClip)">
      <rect width="512" height="512" fill="url(#tile)" opacity=".9"/>
      <rect width="512" height="512" fill="url(#glow)"/>
    </g>
    <g clip-path="url(#tileClip)" fill="none" stroke-linecap="round" stroke-width="30">
      <g transform="rotate(-95 256 256)">
        <circle cx="256" cy="256" r="176" stroke="#14180F" stroke-opacity=".32"/>
        <circle cx="256" cy="256" r="176" stroke="#E0AC7D" stroke-dasharray="730 376"/>
      </g>
      <g transform="rotate(-20 256 256)">
        <circle cx="256" cy="256" r="120" stroke="#14180F" stroke-opacity=".32"/>
        <circle cx="256" cy="256" r="120" stroke="#8FB8D4" stroke-dasharray="407 347"/>
      </g>
      <g transform="rotate(60 256 256)">
        <circle cx="256" cy="256" r="72" stroke="#14180F" stroke-opacity=".32"/>
        <circle cx="256" cy="256" r="72" stroke="#D99BA6" stroke-dasharray="344 109"/>
      </g>
    </g>
    <g clip-path="url(#tileClip)">
      <path d="M0 0h512v150c-90 52-180 78-256 78S90 202 0 150Z" fill="url(#specular)"/>
      <rect x="1.5" y="1.5" width="509" height="509" rx="118.5" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="3"/>
    </g>"""

# Every value below is a Grove token from src/index.css (named in the comments
# there, not here — see the note in TEMPLATE about hyphens in XML comments), so
# the launch screen and the first painted frame are the same colours.
LIGHT = dict(
    scheme="light",
    ground="#F4F6EE",  # CHROME_COLOR.light
    tile_from="#5C8466",
    tile_to="#47694F",
    wordmark="#2F3A32",  # on-surface
    tagline="#5C6B5E",  # on-surface-variant
    bar_track="#D3DBCB",  # outline-variant
    bar_from="#557D5F",  # grad-primary
    bar_to="#47694F",
    icon=ICON_LIGHT,
    extra_defs="",
)

DARK = dict(
    scheme="dark",
    ground="#14180F",  # CHROME_COLOR.dark
    tile_from="#5C8466",
    tile_to="#3F5F49",
    wordmark="#E7ECE0",
    tagline="#9AA896",
    bar_track="#3A4230",
    bar_from="#4F7458",
    bar_to="#3F5F49",
    icon=ICON_DARK,
    extra_defs="""
    <radialGradient id="glow" cx="256" cy="180" r="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8FB896" stop-opacity=".5"/>
      <stop offset="1" stop-color="#8FB896" stop-opacity="0"/>
    </radialGradient>""",
)

TEMPLATE = """<svg width="2732" height="2732" viewBox="0 0 2732 2732" fill="none" xmlns="http://www.w3.org/2000/svg">
  <title>Etto — {tagline_text}</title>
  <!-- Launch screen, {scheme}. GENERATED by scripts/build-splash.py — edit that,
       not this. The wordmark and the line under it are outlines of the app's own
       Instrument Serif and Figtree, because this file is rasterized outside a
       browser and no `font-family` here would resolve to either.

       Composition is centred, and that is not only taste. One 2732 square is
       cover-cropped to every device and orientation, so the only region
       guaranteed to survive is the middle: the tallest phone (9:19.5 portrait)
       keeps a 1261px-wide band, and landscape keeps a 1261px-tall one.
       Everything below sits inside that centred 1261 box — including the
       progress bar, which the design pins 52px off the bottom of its phone
       frame and which no crop to an arbitrary aspect could preserve there.

       The ground is one flat colour: no aurora, which Grove does not have, and
       not the app's near-flat two-stop gradient either. Anything low-contrast
       bands at this size. The gradient's stops are six levels apart, which over
       2732px quantises to a stack of horizontal edges, and a soft sage halo
       behind the tile — tried, in both schemes — quantises to concentric rings
       around the icon. The tile carries itself against either ground without
       one. What is left is CHROME_COLOR from src/lib/theme.ts, which is also
       the Capacitor backgroundColor and the status-bar tint, so the OS
       pre-frame, the launch screen and the first painted frame meet with no
       seam.

       (No CSS custom property is named in this comment on purpose. XML forbids
       a double hyphen inside a comment, so writing one here makes the file
       unparseable — which sharp reports as a corrupt header, several steps away
       from the cause.) -->
  <defs>
    <linearGradient id="tile" x1="96" y1="0" x2="416" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{tile_from}"/>
      <stop offset="1" stop-color="{tile_to}"/>
    </linearGradient>
    <linearGradient id="specular" x1="256" y1="16" x2="256" y2="240" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".42"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{bar_from}"/>
      <stop offset="1" stop-color="{bar_to}"/>
    </linearGradient>
    <clipPath id="tileClip">
      <rect width="512" height="512" rx="120"/>
    </clipPath>{extra_defs}
  </defs>

  <rect width="2732" height="2732" fill="{ground}"/>

  <!-- The app icon at 360px: the 512-space artwork scaled 0.703 and centred. -->
  <g transform="translate(1186 1006) scale(0.703)">
{icon}
  </g>

  <!-- "{wordmark_text}" in Instrument Serif, on the baseline at y=1596. -->
  <path transform="translate(1366 1596)" fill="{wordmark}" d="{wordmark_path}"/>

  <!-- "{tagline_text}" in Figtree 400, baseline y=1690. -->
  <path transform="translate(1366 1690)" fill="{tagline}" d="{tagline_path}"/>

  <rect x="1216" y="1790" width="300" height="10" rx="5" fill="{bar_track}"/>
  <rect x="1216" y="1790" width="128" height="10" rx="5" fill="url(#bar)"/>
</svg>
"""


def build(spec: dict) -> str:
    return TEMPLATE.format(
        wordmark_text=WORDMARK,
        tagline_text=TAGLINE,
        wordmark_path=outline(SERIF, WORDMARK, 190),
        tagline_path=outline(SANS, TAGLINE, 52, weight=400),
        **spec,
    )


if __name__ == "__main__":
    for spec, name in ((LIGHT, "splash.svg"), (DARK, "splash-dark.svg")):
        target = ROOT / "assets" / name
        target.write_text(build(spec), encoding="utf-8")
        print(f"build-splash: wrote {target.relative_to(ROOT)} ({target.stat().st_size:,} bytes)")

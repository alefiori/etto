#!/usr/bin/env python3
"""
Regenerate public/fonts/material-symbols-outlined.woff2.

Icon.tsx renders Material Symbols as a *ligature*: typing "dashboard" is
substituted for the icon glyph by the font's GSUB table. So the subset must
carry, for every icon the app uses, both the output glyph AND the ligature rule
that produces it. If an icon is used in the app but missing from the subset it
silently renders as the literal word ("dashboard") — which is exactly the bug
this script exists to prevent. When you add a new <Icon name="..."> to the app,
re-run this so the glyph ships with it.

Two-step subset, because a naive `pyftsubset --text` over icon names keeps every
ligature buildable from the retained letters (the full alphabet pulls in
thousands of icons, ~3.5MB). So we first prune GSUB to only the wanted
ligatures, then subset — which yields ~65KB.

Requires: pip install fonttools brotli
Usage:    python3 scripts/subset-icon-font.py
"""
import re
import sys
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.subset import main as subset_main

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
OUT = ROOT / "public" / "fonts" / "material-symbols-outlined.woff2"
FULL_URL = (
    "https://github.com/google/material-design-icons/raw/master/variablefont/"
    "MaterialSymbolsOutlined%5BFILL%2CGRAD%2Copsz%2Cwght%5D.ttf"
)

# Most icons are passed to <Icon name="..."> as a literal, directly or via a
# `cond ? 'a' : 'b'` ternary. Match those (either quote style).
NAME_RE = re.compile(r"""(?:name=|icon\??:\s*)['"]([a-z][a-z_]+)['"]""")
TERNARY_RE = re.compile(r"name=\{[^}]*\}")
LITERAL_RE = re.compile(r"""['"]([a-z][a-z_]+)['"]""")

# Some icons are only reachable as *values* of a lookup map whose keys are not
# `icon` — e.g. SOURCE_ICONS's `usda: 'verified'`, or DEFAULT_MEALS's icons.
# A regex can't tell those record values from any other string, so the modules
# that define such maps are listed here and every icon-shaped literal in them is
# treated as used. Add a module here if it introduces a new icon-name constant.
ICON_CONSTANT_MODULES = ["lib/constants.ts", "lib/foodSources.ts"]


def used_icon_names() -> set[str]:
    names: set[str] = set()
    for path in SRC.rglob("*.ts*"):
        if path.name.endswith(".test.tsx") or path.name.endswith(".test.ts"):
            continue
        text = path.read_text()
        names.update(NAME_RE.findall(text))
        for ternary in TERNARY_RE.findall(text):
            names.update(LITERAL_RE.findall(ternary))
        if path.relative_to(SRC).as_posix() in ICON_CONSTANT_MODULES:
            names.update(LITERAL_RE.findall(text))
    return names


def decomp(first: str, components: list[str]) -> str:
    out = first
    for c in components:
        out += "_" if c == "underscore" else c
    return out


def main() -> int:
    names = used_icon_names()
    print(f"{len(names)} icon names found in src")

    cache = ROOT / "node_modules" / ".cache" / "material-symbols-full.ttf"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        print("downloading full Material Symbols font...")
        urllib.request.urlretrieve(FULL_URL, cache)

    font = TTFont(cache)
    gsub = font["GSUB"].table

    # Prune ligatures to only the icons we use; every other subtable form is
    # left untouched.
    kept = 0
    wanted_glyphs = set()
    for lookup in gsub.LookupList.Lookup:
        for st in lookup.SubTable:
            ext = getattr(st, "ExtSubTable", None) or st
            ligs = getattr(ext, "ligatures", None)
            if not ligs:
                continue
            for first in list(ligs.keys()):
                keep = [l for l in ligs[first] if decomp(first, l.Component) in names]
                for l in keep:
                    wanted_glyphs.add(l.LigGlyph)
                    kept += 1
                if keep:
                    ligs[first] = keep
                else:
                    del ligs[first]

    missing = names - {
        decomp(f, l.Component)
        for lk in gsub.LookupList.Lookup
        for st in lk.SubTable
        for ext in [getattr(st, "ExtSubTable", None) or st]
        if getattr(ext, "ligatures", None)
        for f, ls in ext.ligatures.items()
        for l in ls
    }
    if missing:
        print(f"WARNING: no ligature in full font for: {sorted(missing)}", file=sys.stderr)

    pruned = ROOT / "node_modules" / ".cache" / "material-symbols-pruned.ttf"
    font.save(pruned)
    print(f"kept {kept} ligatures")

    # Subset the pruned font by the icon-name text: closure keeps the letters,
    # the icon output glyphs and the (now small) GSUB.
    subset_main([
        str(pruned),
        f"--text={' '.join(sorted(names))}",
        "--layout-features=*",
        "--flavor=woff2",
        f"--output-file={OUT}",
    ])
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    print("Now run `npm run sync:native` (or `cap sync`) to copy it into ios/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

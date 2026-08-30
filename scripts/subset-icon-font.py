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

"Re-run this when you add an icon" is not a guarantee, and it has already been
missed once: `mail`, `gavel`, `shield`, `open_in_new` and `delete_forever`
shipped to the profile screen as the literal words. So a build also records what
it produced in MANIFEST, and `--check` re-derives the icon names from src and
fails if any of them is in neither list. That mode is stdlib-only and offline —
no fonttools, no 3.5MB download — so CI can run it on every push.

Requires: pip install fonttools brotli   (build only; --check needs neither)
Usage:    python3 scripts/subset-icon-font.py
          python3 scripts/subset-icon-font.py --check
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
# A record of the last build, not a runtime asset — hence scripts/ and not
# public/, which would ship it to every client for nothing.
MANIFEST = ROOT / "scripts" / "icon-font-manifest.json"
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


def check() -> int:
    """Fail if src uses an icon the shipped subset can't render.

    Deliberately compares against the manifest rather than the woff2 or the
    full font: reading either would mean a brotli decoder or a download, and
    the question here is only "has anyone added an icon name since the last
    build", which the manifest answers exactly.
    """
    if not MANIFEST.exists():
        print(f"{MANIFEST.relative_to(ROOT)} is missing — run this script without --check.",
              file=sys.stderr)
        return 1

    manifest = json.loads(MANIFEST.read_text())
    known = set(manifest["ligatures"]) | set(manifest["notIcons"])
    unknown = sorted(used_icon_names() - known)

    if unknown:
        print(
            "These names are used in src but are not in the shipped icon font:\n"
            + "".join(f"  - {n}\n" for n in unknown)
            + "They would render as their literal text. Run:\n"
            "  python3 scripts/subset-icon-font.py",
            file=sys.stderr,
        )
        return 1

    print(f"icon font covers all {len(manifest['ligatures'])} icons used in src")
    return 0


def main() -> int:
    # Imported here, not at module scope, so --check stays dependency-free.
    import urllib.request
    from fontTools.ttLib import TTFont
    from fontTools.subset import main as subset_main

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
    kept_names = set()
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
                    kept_names.add(decomp(first, l.Component))
                if keep:
                    ligs[first] = keep
                else:
                    del ligs[first]

    # Whatever is left over has no ligature anywhere in the full font, so it is
    # not an icon at all — the meal keys, macro fields, serving units and locale
    # codes that ICON_CONSTANT_MODULES sweeps up along with the real names. Not
    # a problem, but it has to be recorded: --check needs to tell "harmless
    # non-icon" apart from "icon nobody generated a glyph for".
    not_icons = names - kept_names
    if not_icons:
        print(f"note: not icons, ignored: {sorted(not_icons)}", file=sys.stderr)

    pruned = ROOT / "node_modules" / ".cache" / "material-symbols-pruned.ttf"
    font.save(pruned)
    print(f"kept {len(kept_names)} ligatures")

    # Subset the pruned font by the icon-name text: closure keeps the letters,
    # the icon output glyphs and the (now small) GSUB.
    subset_main([
        str(pruned),
        f"--text={' '.join(sorted(names))}",
        "--layout-features=*",
        "--flavor=woff2",
        f"--output-file={OUT}",
    ])
    MANIFEST.write_text(
        json.dumps(
            {
                "comment": (
                    "Written by scripts/subset-icon-font.py. `ligatures` are the icons "
                    "the shipped woff2 can render; `notIcons` are names the scraper "
                    "picked up that no icon exists for. --check fails on anything in "
                    "neither list. Do not edit by hand."
                ),
                "ligatures": sorted(kept_names),
                "notIcons": sorted(not_icons),
            },
            indent=2,
        )
        + "\n"
    )

    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
    print(f"wrote {MANIFEST.relative_to(ROOT)}")
    print("Now run `pnpm run sync:native` (or `cap sync`) to copy it into ios/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(check() if "--check" in sys.argv[1:] else main())

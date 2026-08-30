#!/usr/bin/env node
/**
 * Render the two listing graphics neither store will publish without.
 *
 *   store/assets/marketing-icon-1024.png  App Store Connect, exactly 1024×1024,
 *                                         **no alpha channel** — an icon with
 *                                         transparency is rejected at upload,
 *                                         which is the single most common way
 *                                         this asset wastes a submission.
 *   store/assets/feature-graphic-1024x500.png
 *                                         Play, exactly 1024×500. Shown at the
 *                                         top of the listing and in promotional
 *                                         placements; Play will not publish a
 *                                         listing without one.
 *
 * Both are rendered from the same artwork under assets/ that the app icons come
 * from, so the listing and the installed icon cannot drift apart. sharp is a
 * declared devDependency: the asset generators already pull the same version in,
 * so this adds nothing to the tree, but pnpm resolves only what is declared and
 * relying on their copy would break this script.
 *
 * The output is gitignored — it is derived, and regenerating takes a second.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const OUT_DIR = 'store/assets'
const ICON_SRC = 'assets/icon-only.svg'

/** Brand colours, matching assets/icon-only.svg and the app's primary. */
export const BRAND = {
  violet: '#8B72FF',
  violetDeep: '#5B3FE0',
  carbs: '#FF9F0A',
  protein: '#0A84FF',
  fats: '#FF375F',
  onViolet: '#ffffff',
  /** The ring track on the violet ground — white at the icon's own opacity. */
  track: '#ffffff',
}

/**
 * What `flatten()` composites under each asset.
 *
 * Both artworks are full-bleed opaque today, so nothing shows through — but
 * this is the colour a hole would expose, and it used to name a teal the brand
 * dropped when it went violet. A missing key is not an error to sharp: it reads
 * `undefined` as "no background given" and quietly composites against black, so
 * the bug would only ever have surfaced as a black edge on a store asset nobody
 * opens again. The deep end of the gradient, so white text and the light rings
 * stay legible against it.
 */
export const FLATTEN_BACKGROUND = BRAND.violetDeep

/**
 * The Play feature graphic.
 *
 * Deliberately not a screenshot collage: at 1024×500, scaled down to a few
 * hundred pixels in the listing, app UI is unreadable mush. What survives that
 * scale is the mark, the name, and one short line — so that is all this is.
 *
 * No text below ~40px for the same reason, and everything important stays out
 * of the outer 5%: Play crops this asset differently across placements.
 */
export function featureGraphicSvg({ tagline = 'Track your macros, every day' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.violet}"/>
      <stop offset="100%" stop-color="${BRAND.violetDeep}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>

  <!-- The three macro rings, same geometry and colours as the app icon. -->
  <g transform="translate(210 250) scale(0.62) translate(-256 -256)">
    <g fill="none" stroke-linecap="round" transform="rotate(-90 256 256)">
      <circle cx="256" cy="256" r="150" stroke="${BRAND.track}" stroke-width="34" opacity="0.22"/>
      <circle cx="256" cy="256" r="150" stroke="${BRAND.carbs}" stroke-width="34"
        stroke-dasharray="942" stroke-dashoffset="236"/>
      <circle cx="256" cy="256" r="106" stroke="${BRAND.track}" stroke-width="34" opacity="0.22"/>
      <circle cx="256" cy="256" r="106" stroke="${BRAND.protein}" stroke-width="34"
        stroke-dasharray="666" stroke-dashoffset="200"/>
      <circle cx="256" cy="256" r="62" stroke="${BRAND.track}" stroke-width="34" opacity="0.22"/>
      <circle cx="256" cy="256" r="62" stroke="${BRAND.fats}" stroke-width="34"
        stroke-dasharray="390" stroke-dashoffset="156"/>
    </g>
  </g>

  <!--
    textLength pins both lines to a known width. Without it the rendered size
    depends on whichever font the rasterizer falls back to when Manrope is not
    installed — which is every CI machine — and the wordmark runs off the right
    edge. Pinning trades a little glyph distortion for an asset that is the same
    everywhere and always fits inside Play's crop margins.

    How much distortion depends on picking a width near the text's natural one.
    "Etto" is four glyphs where "MacroTrack" was ten, so the wordmark is set
    larger rather than stretched across the old 500px slot — pinning four
    letters to that width would smear them. Both lines share a left edge so the
    lockup still reads as one block.
  -->
  <text x="400" y="252" fill="${BRAND.onViolet}"
    font-family="Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="150" font-weight="800" letter-spacing="-4"
    textLength="300" lengthAdjust="spacingAndGlyphs">Etto</text>
  <text x="404" y="322" fill="${BRAND.onViolet}" opacity="0.82"
    font-family="Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    font-size="38" font-weight="500"
    textLength="470" lengthAdjust="spacingAndGlyphs">${tagline}</text>
</svg>
`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { default: sharp } = await import('sharp')

  if (!existsSync(ICON_SRC)) {
    console.error(`generate-store-assets: ${ICON_SRC} is missing.`)
    process.exit(1)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  // flatten() drops the alpha channel against FLATTEN_BACKGROUND. App Store
  // Connect rejects an icon that has one at all, even if it is fully opaque.
  await sharp(readFileSync(ICON_SRC))
    .resize(1024, 1024)
    .flatten({ background: FLATTEN_BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, 'marketing-icon-1024.png'))

  const featureSvg = featureGraphicSvg()
  writeFileSync(join(OUT_DIR, 'feature-graphic-1024x500.svg'), featureSvg)
  await sharp(Buffer.from(featureSvg))
    .resize(1024, 500)
    .flatten({ background: FLATTEN_BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, 'feature-graphic-1024x500.png'))

  console.log(`generate-store-assets: wrote the marketing icon and feature graphic to ${OUT_DIR}/`)
}

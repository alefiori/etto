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
  sage: '#5C8466',
  sageDeep: '#47694F',
  carbs: '#CF9B6C',
  protein: '#7BA7C4',
  fats: '#C98A97',
  onSage: '#ffffff',
  /** The ring track on the sage ground — white at the icon's own opacity. */
  track: '#ffffff',
}

/**
 * What `flatten()` composites under each asset.
 *
 * Both artworks are full-bleed opaque today, so nothing shows through — but
 * this is the colour a hole would expose, and it has already named a dropped
 * brand twice (a teal, then a violet). A missing key is not an error to sharp: it reads
 * `undefined` as "no background given" and quietly composites against black, so
 * the bug would only ever have surfaced as a black edge on a store asset nobody
 * opens again. The deep end of the gradient, so white text and the light rings
 * stay legible against it.
 */
export const FLATTEN_BACKGROUND = BRAND.sageDeep

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
  <title>Etto — ${tagline}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.sage}"/>
      <stop offset="100%" stop-color="${BRAND.sageDeep}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#bg)"/>

  <!-- The three macro arcs, "Meridian" geometry, matching public/icon.svg. -->
  <g transform="translate(220 250) scale(0.62) translate(-256 -256)">
    <g fill="none" stroke-linecap="round" stroke-width="30">
      <g transform="rotate(-95 256 256)">
        <circle cx="256" cy="256" r="176" stroke="${BRAND.track}" opacity="0.16"/>
        <circle cx="256" cy="256" r="176" stroke="${BRAND.carbs}" stroke-dasharray="730 376"/>
      </g>
      <g transform="rotate(-20 256 256)">
        <circle cx="256" cy="256" r="120" stroke="${BRAND.track}" opacity="0.16"/>
        <circle cx="256" cy="256" r="120" stroke="${BRAND.protein}" stroke-dasharray="407 347"/>
      </g>
      <g transform="rotate(60 256 256)">
        <circle cx="256" cy="256" r="72" stroke="${BRAND.track}" opacity="0.16"/>
        <circle cx="256" cy="256" r="72" stroke="${BRAND.fats}" stroke-dasharray="344 109"/>
      </g>
    </g>
  </g>

  <!--
    The wordmark is the geometric Etto mark (design/logo-concepts/wordmark-etto.svg)
    drawn as plain shapes — no font to resolve, so it renders the same on every
    machine. Same centred-origin coords as build-splash.py; 0.8 scale lands its
    cap height beside the ring stack, left edge x≈400.

    The tagline stays <text>: textLength pins it to a known width so the render
    is font-independent — Figtree is on no CI machine — for a little glyph
    distortion. It shares the wordmark's left edge so the two read as one block.
  -->
  <g transform="translate(584 252) scale(0.8)" fill="${BRAND.onSage}">
    <rect x="-229.5" y="-130" width="24" height="130" rx="6"/>
    <rect x="-229.5" y="-130" width="104" height="24" rx="6"/>
    <rect x="-229.5" y="-77" width="86" height="24" rx="6"/>
    <rect x="-229.5" y="-24" width="104" height="24" rx="6"/>
    <rect x="-77.5" y="-147" width="24" height="147" rx="12"/>
    <rect x="12.5" y="-147" width="24" height="147" rx="12"/>
    <rect x="-101.5" y="-95" width="69" height="22" rx="11"/>
    <rect x="-8.5" y="-95" width="69" height="22" rx="11"/>
    <circle cx="154.5" cy="-65" r="63" fill="none" stroke="${BRAND.onSage}" stroke-width="24" stroke-linecap="round" stroke-dasharray="330 66" stroke-dashoffset="-132"/>
  </g>
  <text x="404" y="322" fill="${BRAND.onSage}" opacity="0.82"
    font-family="Figtree, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
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

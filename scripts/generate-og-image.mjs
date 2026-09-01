#!/usr/bin/env node
/**
 * Render the Open Graph / Twitter Card preview image, public/og-image.png,
 * at the 1200×630 size link previews expect.
 *
 * Composed from the same artwork as the store listing graphics
 * (scripts/generate-store-assets.mjs): the Meridian ring mark plus the
 * geometric Etto wordmark, over the same sage gradient ground, so a social
 * share card, the install prompt and the store listing all read as one
 * brand rather than three.
 *
 * The wordmark is drawn as plain shapes copied from
 * design/logo-concepts/wordmark-etto.svg (also inlined in
 * generate-store-assets.mjs's feature graphic) — never <text>. This script
 * runs outside a browser, so font-family="Figtree" would resolve to whatever
 * fontconfig has on whatever machine runs it, which is Figtree nowhere, and
 * would silently ship a Helvetica-rendered wordmark. Shapes render identically
 * everywhere.
 *
 * The output is gitignored — it is derived, and regenerating takes a second.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND, FLATTEN_BACKGROUND } from './generate-store-assets.mjs'

const OUT_DIR = 'public'
const WIDTH = 1200
const HEIGHT = 630

/**
 * The OG/Twitter preview artwork: Meridian rings beside the wordmark, on the
 * same diagonal sage gradient as the Play feature graphic.
 *
 * No tagline text here (unlike the feature graphic) — at social-preview sizes
 * a third element only crowds the mark and the name, which are what actually
 * survive a timeline thumbnail.
 */
export function ogImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <title>Etto — Daily Macro Tracker</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BRAND.sage}"/>
      <stop offset="100%" stop-color="${BRAND.sageDeep}"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

  <!-- The three macro arcs, "Meridian" geometry, matching public/icon.svg and
       generate-store-assets.mjs's feature graphic. -->
  <g transform="translate(300 315) scale(0.72) translate(-256 -256)">
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
    The wordmark, copied verbatim from design/logo-concepts/wordmark-etto.svg
    (rects/circle at their original coordinates, local origin at the shape's
    own horizontal and vertical centre) so it never drifts from the mark
    everywhere else draws. Same shapes as generate-store-assets.mjs's feature
    graphic, just repositioned for this canvas.
  -->
  <g transform="translate(725 383.5) scale(1)" fill="${BRAND.onSage}">
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
</svg>
`
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { default: sharp } = await import('sharp')

  mkdirSync(OUT_DIR, { recursive: true })

  const svg = ogImageSvg()
  await sharp(Buffer.from(svg))
    .resize(WIDTH, HEIGHT)
    .flatten({ background: FLATTEN_BACKGROUND })
    .png({ compressionLevel: 9 })
    .toFile(join(OUT_DIR, 'og-image.png'))

  console.log(`generate-og-image: wrote ${WIDTH}x${HEIGHT} to ${OUT_DIR}/og-image.png`)
}

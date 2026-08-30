import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BRAND, FLATTEN_BACKGROUND, featureGraphicSvg } from './generate-store-assets.mjs'

const SOURCE = readFileSync('scripts/generate-store-assets.mjs', 'utf8')

/**
 * The bug these guard against: `flatten({ background: BRAND.teal })` outlived
 * the teal it named. Nothing threw — a missing key is `undefined`, sharp reads
 * that as "no background given" and quietly composites against black, and the
 * only symptom would have been a black edge on a store asset that nobody opens
 * again after the first upload.
 */
describe('brand colour references', () => {
  it('every BRAND key the script names actually exists', () => {
    const referenced = [...SOURCE.matchAll(/\bBRAND\.(\w+)/g)].map((m) => m[1])
    // Sanity check on the regex itself: if this file stops matching anything,
    // the assertion below would pass vacuously.
    expect(referenced.length).toBeGreaterThan(0)
    for (const key of new Set(referenced)) {
      expect(BRAND, `BRAND.${key} is referenced but not defined`).toHaveProperty(key)
    }
  })

  it('has a real colour to flatten against, not an absent key', () => {
    expect(FLATTEN_BACKGROUND).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('featureGraphicSvg', () => {
  const svg = featureGraphicSvg()

  it('interpolates every value it embeds', () => {
    // A template literal stringifies `undefined` rather than failing, so a typo
    // in an interpolated name reaches the rasterizer as the literal word.
    expect(svg).not.toContain('undefined')
    expect(svg).not.toContain('[object Object]')
  })

  it('is exactly the 1024×500 Play requires', () => {
    expect(svg).toContain('width="1024" height="500"')
    expect(svg).toContain('viewBox="0 0 1024 500"')
  })

  it('carries the app name and the given tagline', () => {
    expect(svg).toContain('>Etto</text>')
    expect(featureGraphicSvg({ tagline: 'A given line' })).toContain('>A given line</text>')
  })

  it('pins both lines to a width near their natural one', () => {
    // textLength is what makes the render font-independent; a value far from
    // the text's natural width is what makes it look stretched. Four glyphs at
    // 150px do not belong in the 500px slot ten glyphs at 86px used to fill.
    const pinned = [...svg.matchAll(/textLength="(\d+)"/g)].map((m) => Number(m[1]))
    expect(pinned).toHaveLength(2)
    expect(pinned[0]).toBeLessThan(400)
  })
})

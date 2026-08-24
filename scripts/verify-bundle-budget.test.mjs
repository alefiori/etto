import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { BUDGET_BYTES, eagerAssets, gzippedTotal } from './verify-bundle-budget.mjs'

const HTML = `
  <script type="module" crossorigin src="/assets/index-DC7e8jNu.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/react-vendor-BBQSzmGl.js">
  <link rel="modulepreload" crossorigin href="/assets/supabase-ClEP6LVV.js">
  <link rel="stylesheet" crossorigin href="/assets/index-DZe_n01O.css">
  <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">
`

describe('eagerAssets', () => {
  it('collects the entry, its preloads and the stylesheet', () => {
    expect(eagerAssets(HTML)).toEqual([
      '/assets/index-DC7e8jNu.js',
      '/assets/react-vendor-BBQSzmGl.js',
      '/assets/supabase-ClEP6LVV.js',
      '/assets/index-DZe_n01O.css',
    ])
  })

  it('ignores assets outside /assets/, which are not render-blocking', () => {
    expect(eagerAssets(HTML)).not.toContain('/apple-touch-icon-180x180.png')
  })

  it('counts a file referenced twice only once', () => {
    const twice = HTML + '<link rel="modulepreload" href="/assets/supabase-ClEP6LVV.js">'
    expect(eagerAssets(twice)).toEqual(eagerAssets(HTML))
  })

  it('returns nothing for markup with no bundle in it', () => {
    // Which the runner treats as a failure rather than a pass — an empty result
    // would otherwise come in under any budget for the wrong reason.
    expect(eagerAssets('<html><body></body></html>')).toEqual([])
  })
})

describe('gzippedTotal', () => {
  it('sums the compressed size, not the size on disk', () => {
    const content = Buffer.from('x'.repeat(10_000))
    const total = gzippedTotal(['/a.js'], () => content)
    expect(total).toBe(gzipSync(content).length)
    expect(total).toBeLessThan(content.length)
  })

  it('is zero when there is nothing to weigh', () => {
    expect(gzippedTotal([], () => Buffer.alloc(0))).toBe(0)
  })
})

describe('the budget', () => {
  it('leaves headroom over what the app currently ships', () => {
    // Guards the guard: a budget set below the real figure would fail every
    // build, and one set far above it would never fail at all. Runs against the
    // last build's output when there is one, and skips when there is not —
    // `npm test` must not depend on `npm run build` having been run.
    let html
    try {
      html = readFileSync('dist/index.html', 'utf8')
    } catch {
      return
    }
    const total = gzippedTotal(eagerAssets(html))
    if (total === 0) return
    expect(total).toBeLessThan(BUDGET_BYTES)
    expect(total).toBeGreaterThan(BUDGET_BYTES * 0.5)
  })
})

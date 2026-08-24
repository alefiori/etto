#!/usr/bin/env node
/**
 * Assert the *eagerly loaded* bundle stays within budget.
 *
 * `build.chunkSizeWarningLimit` in vite.config.ts is raised to 800 KB, because
 * the one chunk over the 500 KB default — the RevenueCat Web Billing SDK — is
 * lazy, un-precached and over by design, and a warning that fires on every build
 * is a warning nobody reads. The cost of raising it is that a genuine regression
 * now has 800 KB of room to hide in, so something else has to hold the line.
 *
 * A per-chunk limit is the wrong shape for that anyway. What a first visit pays
 * is not the largest chunk, it is the entry plus everything the entry preloads
 * plus the stylesheet — which is exactly what dist/index.html lists, and exactly
 * what this measures. Gzipped, because that is what crosses the network.
 *
 * Lazy chunks are deliberately *not* counted: the barcode scanner is precached
 * into the offline shell but not fetched before first paint, and route chunks
 * are fetched only on the route that needs them. Keeping them out is what makes
 * the number here mean "time to first paint" rather than "total app size".
 *
 * Run after `npm run build`. A `--mode native` build emits the same index.html,
 * so it works there too.
 */

import { existsSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'

const DIST = 'dist'
const HTML = join(DIST, 'index.html')

/**
 * The ceiling, in gzipped bytes, for everything a first paint has to download.
 *
 * Set with roughly 12% headroom over the real figure at the time of writing
 * (~205 KiB), which is tight enough that adding a dependency to the eager graph
 * trips it. Raising it should be a deliberate, argued change — the whole point
 * is that it costs something.
 */
export const BUDGET_BYTES = 230 * 1024

/**
 * The asset paths dist/index.html makes the browser fetch before first paint:
 * the module entry, everything it `modulepreload`s, and the stylesheet.
 *
 * Matching on the `/assets/` prefix rather than parsing HTML keeps this honest
 * about what it covers — icons, the manifest and fonts are referenced from
 * elsewhere and are not part of the render-blocking path.
 */
export function eagerAssets(html) {
  return [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))]
}

/** Total gzipped size of the given dist-relative asset paths. */
export function gzippedTotal(paths, read = (p) => readFileSync(join(DIST, p))) {
  return paths.reduce((total, p) => total + gzipSync(read(p)).length, 0)
}

const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (!existsSync(HTML)) {
    console.error(`verify-bundle-budget: no ${HTML} found — run \`npm run build\` first.`)
    process.exit(1)
  }

  const assets = eagerAssets(readFileSync(HTML, 'utf8'))
  if (assets.length === 0) {
    console.error(
      `verify-bundle-budget: ${HTML} references no /assets/ files — did the build change?`,
    )
    process.exit(1)
  }

  const total = gzippedTotal(assets)

  for (const p of assets) {
    console.log(`  ${kib(gzipSync(readFileSync(join(DIST, p))).length).padStart(10)}  ${p}`)
  }

  if (total > BUDGET_BYTES) {
    console.error(
      `\nverify-bundle-budget: first paint costs ${kib(total)}, over the ${kib(BUDGET_BYTES)} budget.\n\n` +
        'Something now loads eagerly that did not before. Either move it behind a\n' +
        'dynamic import, or raise BUDGET_BYTES here with a reason worth the bytes.',
    )
    process.exit(1)
  }

  console.log(
    `\nverify-bundle-budget: first paint costs ${kib(total)} gzipped, within ${kib(BUDGET_BYTES)}.`,
  )
}

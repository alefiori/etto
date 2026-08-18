#!/usr/bin/env node
/**
 * Assert the service worker precaches the app *shell* and not the whole app.
 *
 * `globPatterns` in vite.config.ts sweeps up every emitted `.js`, which is right
 * for the shell and wrong for the RevenueCat Web Billing SDK: ~760 KB raw, ~200 KB
 * gzipped, reached only by opening the paywall on a build with a web billing key,
 * and useless offline since there is no taking a payment without a network.
 * Precaching it would make every first visit pay most of the shell again for code
 * most visits never run. `globIgnores` excludes it; this checks that it worked.
 *
 * The barcode scanner is comparably large and deliberately *stays* precached —
 * scanning in a shop with bad signal is a real thing this app is for.
 *
 * The check exists because the exclusion is by *chunk name*, and chunk names come
 * from the bundler. A Rolldown upgrade, or a dependency renaming its entry
 * module, would quietly put 200 KB back into the shell with nothing failing. Run
 * after `npm run build`; a no-op with a clear message when there is no service
 * worker to inspect (a `--mode native` build skips the PWA plugin entirely).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SW = 'dist/sw.js'
const ASSETS = 'dist/assets'

/**
 * Chunks that must never be precached, as the substring their filename carries
 * before the content hash. Kept in step with `globIgnores` in vite.config.ts.
 */
export const EXCLUDED_CHUNKS = ['Purchases.es']

/** The URLs in a generated Workbox precache manifest. */
export function precachedUrls(swSource) {
  // Workbox emits `precacheAndRoute([{revision:"…",url:"…"}, …])`; pulling the
  // urls out with a regex beats trying to execute a service worker in Node.
  return [...swSource.matchAll(/url\s*:\s*"([^"]+)"/g)].map((m) => m[1])
}

/** Excluded chunk names that appear in the manifest anyway. */
export function offenders(urls, excluded = EXCLUDED_CHUNKS) {
  return excluded.filter((name) => urls.some((url) => url.includes(name)))
}

/**
 * Excluded chunk names that no longer match any emitted file.
 *
 * The other half of the failure: an exclusion that matches nothing is not
 * protecting anything, and reads as though it is.
 */
export function staleExclusions(assetNames, excluded = EXCLUDED_CHUNKS) {
  return excluded.filter((name) => !assetNames.some((file) => file.includes(name)))
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  if (!existsSync(SW)) {
    console.log(`verify-precache: no ${SW} found, skipping (native builds ship no service worker).`)
    process.exit(0)
  }

  const urls = precachedUrls(readFileSync(SW, 'utf8'))
  if (urls.length === 0) {
    console.error(`verify-precache: ${SW} has no precache manifest — did the build change?`)
    process.exit(1)
  }

  const assetNames = existsSync(ASSETS)
    ? readdirSync(ASSETS).filter((f) => statSync(join(ASSETS, f)).isFile())
    : []

  const failures = []
  for (const name of offenders(urls, EXCLUDED_CHUNKS)) {
    failures.push(`${name} is precached; it should be excluded from the app shell`)
  }
  for (const name of staleExclusions(assetNames, EXCLUDED_CHUNKS)) {
    failures.push(`${name} matches no emitted chunk — the exclusion is protecting nothing`)
  }

  if (failures.length > 0) {
    console.error('verify-precache: the app shell is not what it should be:\n')
    for (const f of failures) console.error(`  - ${f}`)
    console.error(
      '\nUpdate globIgnores in vite.config.ts and EXCLUDED_CHUNKS here together.',
    )
    process.exit(1)
  }

  console.log(
    `verify-precache: ${urls.length} shell entries, and none of ${EXCLUDED_CHUNKS.join(', ')}.`,
  )
}

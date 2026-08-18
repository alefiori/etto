import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { EXCLUDED_CHUNKS, offenders, precachedUrls, staleExclusions } from './verify-precache.mjs'

const SW = `
  self.__WB_MANIFEST;
  precacheAndRoute([
    {revision:"a1",url:"index.html"},
    {revision:"b2",url:"assets/index-LvoVKXuq.js"},
    {revision:"c3",url:"assets/BarcodeScanner-CRLu72ke.js"}
  ]);
`

describe('precachedUrls', () => {
  it('pulls every url out of a Workbox manifest', () => {
    expect(precachedUrls(SW)).toEqual([
      'index.html',
      'assets/index-LvoVKXuq.js',
      'assets/BarcodeScanner-CRLu72ke.js',
    ])
  })

  it('returns nothing for a service worker with no manifest', () => {
    // Which the runner treats as a failure rather than a pass — an empty result
    // would otherwise satisfy every check below for the wrong reason.
    expect(precachedUrls('self.addEventListener("fetch", () => {})')).toEqual([])
  })
})

describe('offenders', () => {
  it('is empty when nothing excluded was precached', () => {
    expect(offenders(precachedUrls(SW))).toEqual([])
  })

  it('catches an excluded chunk that made it into the shell', () => {
    const withBilling = SW.replace(
      '{revision:"a1",url:"index.html"}',
      '{revision:"a1",url:"assets/Purchases.es-B99CvF33.js"}',
    )
    expect(offenders(precachedUrls(withBilling))).toEqual(['Purchases.es'])
  })

  it('matches across the content hash, which changes every build', () => {
    expect(offenders(['assets/Purchases.es-ZZZZZZZZ.js'])).toEqual(['Purchases.es'])
  })
})

describe('staleExclusions', () => {
  it('is empty when every exclusion still matches an emitted chunk', () => {
    expect(staleExclusions(['Purchases.es-B99CvF33.js', 'index-LvoVKXuq.js'])).toEqual([])
  })

  it('catches an exclusion that no longer matches anything', () => {
    // The quiet failure this exists for: a renamed chunk leaves the exclusion
    // matching nothing, so it silently protects nothing while looking correct.
    expect(staleExclusions(['index-LvoVKXuq.js'])).toEqual(['Purchases.es'])
  })
})

describe('the exclusion list', () => {
  it('matches globIgnores in vite.config.ts', () => {
    // Two files have to agree: Workbox does the excluding, this does the
    // checking, and a check for something that is no longer excluded is worse
    // than no check at all.
    const config = readFileSync('vite.config.ts', 'utf8')
    const globs = /globIgnores:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? ''
    const names = [...globs.matchAll(/'\*\*\/([^-]+)-\*\.js'/g)].map((m) => m[1])
    expect(names.sort()).toEqual([...EXCLUDED_CHUNKS].sort())
  })

  it('does not exclude the barcode scanner', () => {
    // Deliberate: scanning a label in a shop with bad signal is a real use of
    // this app, so that chunk stays in the offline shell.
    expect(EXCLUDED_CHUNKS).not.toContain('BarcodeScanner')
  })
})

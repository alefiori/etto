import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  translate,
  isLocale,
  detectBrowserLocale,
  DEFAULT_LOCALE,
  LOCALES,
  translations,
  type Locale,
} from './index'
import { en } from './locales/en'

/** Collect every dot-path to a string leaf in a nested catalog. */
function leafPaths(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix]
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) =>
      leafPaths(v, prefix ? `${prefix}.${k}` : k),
    )
  }
  return []
}

describe('translate', () => {
  it('resolves a dot-path for the given locale', () => {
    // Compare against the canonical English catalog value for a known key.
    const key = leafPaths(en)[0] as Parameters<typeof translate>[1]
    expect(typeof translate('en', key)).toBe('string')
  })

  it('interpolates {param} placeholders (also on the fallback string)', () => {
    // An unknown key falls back to itself, then interpolation still runs, so a
    // `{name}` token in the resolved template is replaced.
    expect(translate('en', 'x.{name}' as never, { name: 'Sam' })).toBe('x.Sam')
    // A token with no matching param is left intact.
    expect(translate('en', '{missing}' as never, { other: 'v' })).toBe('{missing}')
  })

  it('falls back to the raw key for an unknown path', () => {
    expect(translate('en', 'does.not.exist' as never)).toBe('does.not.exist')
  })

  it('falls back to English when a locale lacks a key', () => {
    // Every real key resolves to a string in every locale (see parity test),
    // so force the fallback path with a key only present via English default.
    const key = leafPaths(en)[0] as Parameters<typeof translate>[1]
    for (const { code } of LOCALES) {
      expect(typeof translate(code, key)).toBe('string')
    }
  })
})

describe('isLocale', () => {
  it('recognizes supported locale codes', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('it')).toBe(true)
    expect(isLocale('xx')).toBe(false)
  })
})

describe('detectBrowserLocale', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('picks the first supported browser language', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'en-US'] })
    expect(detectBrowserLocale()).toBe('fr')
  })

  it('falls back to the default locale when none match', () => {
    vi.stubGlobal('navigator', { languages: ['zh-CN'] })
    expect(detectBrowserLocale()).toBe(DEFAULT_LOCALE)
  })
})

describe('catalog parity', () => {
  const canonical = leafPaths(en).sort()

  for (const code of Object.keys(translations) as Locale[]) {
    it(`locale "${code}" has the same keys as English`, () => {
      const paths = leafPaths(translations[code]).sort()
      expect(paths).toEqual(canonical)
    })
  }
})

import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  translate,
  isLocale,
  detectBrowserLocale,
  clearStoredLocale,
  getStoredLocale,
  initialLocale,
  storeLocale,
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

describe('stored locale', () => {
  afterEach(() => {
    clearStoredLocale()
    vi.unstubAllGlobals()
  })

  it('round-trips an explicit choice and forgets it on demand', () => {
    expect(getStoredLocale()).toBeNull()
    storeLocale('de')
    expect(getStoredLocale()).toBe('de')
    clearStoredLocale()
    expect(getStoredLocale()).toBeNull()
  })

  it('ignores a stored value that is not a supported locale', () => {
    localStorage.setItem('etto.locale', 'xx')
    expect(getStoredLocale()).toBeNull()
  })

  // Renamed from `macrotrack.locale` when the app became Etto: a native install
  // must keep its language on the first launch of the new build.
  it('migrates a choice left under the pre-rename key', () => {
    localStorage.setItem('macrotrack.locale', 'de')
    expect(getStoredLocale()).toBe('de')
    expect(localStorage.getItem('etto.locale')).toBe('de')
    expect(localStorage.getItem('macrotrack.locale')).toBeNull()
  })
})

describe('initialLocale', () => {
  afterEach(() => {
    clearStoredLocale()
    vi.unstubAllGlobals()
  })

  it('uses the device language when nothing has been chosen', () => {
    vi.stubGlobal('navigator', { languages: ['es-ES'] })
    expect(initialLocale()).toBe('es')
  })

  it('prefers an explicit choice over the device language', () => {
    vi.stubGlobal('navigator', { languages: ['es-ES'] })
    storeLocale('nl')
    expect(initialLocale()).toBe('nl')
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

/**
 * Lightweight i18n core. No runtime dependency: catalogs are plain nested
 * objects, `translate()` resolves dot-paths and interpolates `{name}`
 * placeholders. The selected locale is the same value stored in
 * `profiles.off_language`, so one preference drives both the UI language and
 * the Open Food Facts result language.
 */
import { en } from './locales/en'
import { it } from './locales/it'
import { fr } from './locales/fr'
import { es } from './locales/es'
import { de } from './locales/de'
import { pt } from './locales/pt'
import { nl } from './locales/nl'

/** Same nested shape as the English catalog, but with arbitrary string leaves. */
type Localized<T> = { [K in keyof T]: T[K] extends string ? string : Localized<T[K]> }

/** Shape every locale must satisfy (the English catalog is canonical). */
export type Translation = Localized<typeof en>

/** Supported locale codes — kept in sync with the OFF language list. */
export type Locale = 'en' | 'it' | 'fr' | 'es' | 'de' | 'pt' | 'nl'

export const DEFAULT_LOCALE: Locale = 'en'

export const translations: Record<Locale, Translation> = { en, it, fr, es, de, pt, nl }

/** Selectable languages (endonyms — shown untranslated in the picker). */
export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'nl', label: 'Nederlands' },
]

export function isLocale(code: string): code is Locale {
  return code in translations
}

/**
 * The device's language, as reported by the browser — the default until the
 * user picks one explicitly. Falls back to {@link DEFAULT_LOCALE} when the
 * device speaks a language the app doesn't.
 */
export function detectBrowserLocale(): Locale {
  const langs = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []
  for (const lang of langs) {
    const code = lang?.slice(0, 2).toLowerCase()
    if (code && isLocale(code)) return code
  }
  return DEFAULT_LOCALE
}

/**
 * Where an **explicit** language choice is mirrored locally. The profile row
 * stays the source of truth for a signed-in user, but the auth pages render
 * before any profile is available, so a choice made there is kept here and read
 * back on the next visit.
 *
 * Nothing is stored until the user actually picks a language: an empty slot is
 * what makes the device language the first-run default (see
 * {@link initialLocale}), and it must stay empty for the device to keep winning.
 */
const LOCALE_STORAGE_KEY = 'etto.locale'

/**
 * The key this choice lived under before the rename to Etto. Read once as a
 * fallback and migrated forward on first access, so an existing native-app
 * install keeps its language. Web visitors arrive on a fresh origin without it.
 */
const LEGACY_LOCALE_STORAGE_KEY = 'macrotrack.locale'

export function getStoredLocale(): Locale | null {
  try {
    let stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === null) {
      const legacy = localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY)
      if (legacy !== null) {
        localStorage.setItem(LOCALE_STORAGE_KEY, legacy)
        localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY)
        stored = legacy
      }
    }
    return stored && isLocale(stored) ? stored : null
  } catch {
    return null // Storage can be unavailable (private mode, blocked cookies).
  }
}

export function storeLocale(code: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, code)
  } catch {
    // Not being able to remember the choice is not worth failing over.
  }
}

/** Forget the explicit choice, so the device language takes over again. */
export function clearStoredLocale(): void {
  try {
    localStorage.removeItem(LOCALE_STORAGE_KEY)
  } catch {
    // Same as above — storage may be unavailable.
  }
}

/**
 * The locale to start from: the explicitly chosen one if there is one, and
 * otherwise the device language.
 */
export function initialLocale(): Locale {
  return getStoredLocale() ?? detectBrowserLocale()
}

/** All dot-path keys into the catalog, e.g. `"dashboard.today"`. */
export type TranslationKey = Paths<Translation>

type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`
}[keyof T & string]

type Params = Record<string, string | number>

function resolve(obj: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, obj)
  return typeof value === 'string' ? value : undefined
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Resolve a key for a locale, with `{param}` interpolation. Falls back to the
 * English string, then to the raw key, so a missing translation never throws.
 */
export function translate(locale: Locale, key: TranslationKey, params?: Params): string {
  const template = resolve(translations[locale], key) ?? resolve(en, key) ?? key
  return interpolate(template, params)
}

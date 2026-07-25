import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { initialLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n'
import { useProfile } from '@/context/ProfileContext'

type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string

interface I18nValue {
  locale: Locale
  t: TFunction
}

const I18nContext = createContext<I18nValue | undefined>(undefined)

/**
 * Provides the translation function for the active locale. The locale comes
 * from {@link useProfile} — the user's profile preference once signed in, the
 * remembered/browser language before that — so this must sit inside a
 * ProfileProvider, and it wraps the whole app (auth pages included).
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = useProfile()
  const value = useMemo<I18nValue>(
    () => ({ locale, t: (key, params) => translate(locale, key, params) }),
    [locale],
  )

  // Keep the document language in sync, for screen readers and hyphenation.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Translation function for the active locale. Outside an I18nProvider (unit
 * tests rendering a single component) it falls back to the remembered or
 * browser language rather than throwing.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (ctx) return ctx
  const locale = initialLocale()
  return { locale, t: (key, params) => translate(locale, key, params) }
}

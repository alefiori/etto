import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import {
  clearStoredLocale,
  detectBrowserLocale,
  getStoredLocale,
  isLocale,
  storeLocale,
  type Locale,
} from '@/lib/i18n'
import { useAuth } from '@/context/AuthContext'

interface ProfileValue {
  /**
   * The language in effect. Drives both the UI language and the Open Food Facts
   * result language. It is the user's explicit choice when they have made one —
   * stored in `profiles.off_language`, mirrored to local storage for the
   * pre-login screens — and the device language until then.
   */
  locale: Locale
  /**
   * False while {@link locale} is just the device language. Picking a language
   * (here or on the Profile page) makes it true and pins the choice.
   */
  isLocaleExplicit: boolean
  /** Persist a new locale. Works signed out too (local storage only). */
  setLocale: (code: Locale) => Promise<void>
  /** Alias of {@link locale} as a plain string, for the OFF `lc` query param. */
  offLanguage: string
  loading: boolean
  error: string | null
}

const ProfileContext = createContext<ProfileValue | undefined>(undefined)

/** Explicit choice from a previous visit, if any — otherwise the device's. */
function firstRunLocale(): { locale: Locale; explicit: boolean } {
  const stored = getStoredLocale()
  return stored
    ? { locale: stored, explicit: true }
    : { locale: detectBrowserLocale(), explicit: false }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [{ locale, explicit }, setChoice] = useState(firstRunLocale)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Signed out (auth pages): the stored choice, or the device language.
    if (!user) {
      if (!authLoading) setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('off_language')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else if (data?.off_language && isLocale(data.off_language)) {
          // The account has a language of its own: it wins everywhere.
          setChoice({ locale: data.off_language, explicit: true })
          storeLocale(data.off_language)
        } else {
          // No preference saved on the account. Keep a choice made in this
          // browser if there is one; otherwise follow the device.
          setChoice((current) =>
            current.explicit ? current : { locale: detectBrowserLocale(), explicit: false },
          )
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  async function setLocale(code: Locale) {
    const previous = { locale, explicit }
    setChoice({ locale: code, explicit: true }) // optimistic
    storeLocale(code)
    setError(null)
    if (!user) return // Signed out — the local choice is the whole story.
    // Upsert covers the rare case where the signup trigger hasn't created a row.
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, off_language: code }, { onConflict: 'id' })
    if (error) {
      setChoice(previous)
      if (previous.explicit) storeLocale(previous.locale)
      else clearStoredLocale()
      setError(error.message)
      throw error
    }
  }

  return (
    <ProfileContext.Provider
      value={{
        locale,
        isLocaleExplicit: explicit,
        setLocale,
        offLanguage: locale,
        loading,
        error,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within a ProfileProvider')
  return ctx
}

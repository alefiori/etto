import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { initialLocale, isLocale, storeLocale, type Locale } from '@/lib/i18n'
import { useAuth } from '@/context/AuthContext'

interface ProfileValue {
  /**
   * The user's single language preference. Drives both the UI language and the
   * Open Food Facts result language. Persisted in `profiles.off_language` for a
   * signed-in user, and mirrored to local storage so the auth pages — which
   * render before any profile exists — come up in the same language.
   */
  locale: Locale
  /** Persist a new locale. Works signed out too (local storage only). */
  setLocale: (code: Locale) => Promise<void>
  /** Alias of {@link locale} as a plain string, for the OFF `lc` query param. */
  offLanguage: string
  loading: boolean
  error: string | null
}

const ProfileContext = createContext<ProfileValue | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [locale, setLang] = useState<Locale>(initialLocale)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Signed out (auth pages): the remembered/browser locale is all there is.
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
        else if (data && isLocale(data.off_language)) {
          setLang(data.off_language)
          storeLocale(data.off_language)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  async function setLocale(code: Locale) {
    const previous = locale
    setLang(code) // optimistic
    storeLocale(code)
    setError(null)
    if (!user) return // Signed out — the local choice is the whole story.
    // Upsert covers the rare case where the signup trigger hasn't created a row.
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, off_language: code }, { onConflict: 'id' })
    if (error) {
      setLang(previous)
      storeLocale(previous)
      setError(error.message)
      throw error
    }
  }

  return (
    <ProfileContext.Provider value={{ locale, setLocale, offLanguage: locale, loading, error }}>
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

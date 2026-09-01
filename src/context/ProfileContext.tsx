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
import type { Profile, UnitSystem } from '@/lib/database.types'

interface ProfileValue {
  /**
   * The full profile row, or null when signed out (the auth pages still need a
   * locale, which is why this provider sits above RequireAuth).
   */
  profile: Profile | null
  /**
   * Display units for weight and height. Everything is stored metric; this only
   * decides what the user sees. Metric until they say otherwise.
   */
  unitSystem: UnitSystem
  /**
   * Patch any subset of the profile row. Optimistic, rolls back and rethrows on
   * failure — the same contract as {@link setLocale}.
   */
  updateProfile: (patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>) => Promise<void>
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
  /**
   * Refetch the profile. Exposed for the boot screen's retry — a cold start
   * that failed at the network level has nothing to show and no other way back.
   */
  retry: () => void
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
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumped by retry() to re-run the fetch below. A counter rather than a
  // boolean so a second retry after a second failure still re-runs it.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Signed out (auth pages): the stored choice, or the device language.
    if (!user) {
      setProfile(null)
      setError(null)
      if (!authLoading) setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    // Promise.resolve(...): the query builder is only a `PromiseLike`, not a
    // real `Promise` — it implements `.then()` but not `.catch()`. Wrapping it
    // is what makes the `.catch()` below typecheck at all, not just a style
    // choice.
    Promise.resolve(
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    )
      .then(({ data, error }) => {
        if (cancelled) return
        setProfile(data ?? null)
        if (error) {
          setError(error.message)
        } else {
          // A resolved, error-free fetch clears whatever an earlier attempt
          // left behind — otherwise retry() (or a plain re-render after a
          // transient failure) could succeed and still leave the stale
          // message on screen forever, since nothing else ever clears it.
          setError(null)
          if (data?.off_language && isLocale(data.off_language)) {
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
        }
        setLoading(false)
      })
      // The `error` field above is Supabase *resolving* with a failure — a
      // policy denial, a bad column. This is the promise itself rejecting,
      // which is what a cold start with no network does, and it never reached
      // that handler: `loading` stayed true and the boot screen span forever.
      .catch((cause: unknown) => {
        if (cancelled) return
        setProfile(null)
        setError(cause instanceof Error ? cause.message : String(cause))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading, attempt])

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
    setProfile((p) => (p ? { ...p, off_language: code } : p))
  }

  async function updateProfile(patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>) {
    if (!user) throw new Error('Not authenticated.')
    const previous = profile
    setProfile((p) => (p ? { ...p, ...patch } : p)) // optimistic
    setError(null)
    // Upsert rather than update: the signup trigger normally creates the row,
    // but an account that predates it would otherwise silently no-op.
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, ...patch }, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) {
      setProfile(previous)
      setError(error.message)
      throw error
    }
    setProfile(data)
  }

  return (
    <ProfileContext.Provider
      value={{
        profile,
        unitSystem: profile?.unit_system ?? 'metric',
        updateProfile,
        locale,
        isLocaleExplicit: explicit,
        setLocale,
        offLanguage: locale,
        loading,
        error,
        retry: () => setAttempt((n) => n + 1),
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

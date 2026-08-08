import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { syncNativeChrome } from '@/lib/nativeBootstrap'
import {
  applyTheme,
  getStoredTheme,
  isThemePreference,
  resolveTheme,
  storeTheme,
  watchDeviceTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme'

interface ThemeValue {
  /** The user's choice. `system` means no choice — follow the device. */
  preference: ThemePreference
  /** What is actually rendered: `system` resolved against the device. */
  theme: ResolvedTheme
  /** Persist a new choice. Works signed out too (local storage only). */
  setPreference: (next: ThemePreference) => Promise<void>
}

const ThemeContext = createContext<ThemeValue | undefined>(undefined)

/**
 * Applies the light/dark scheme, and keeps the choice in sync with the profile.
 *
 * Sits inside ProfileProvider for the same reason I18nProvider does: the choice
 * lives in `profiles.theme` for a signed-in user, but the auth pages render
 * before any profile exists, so local storage stands in until one arrives.
 *
 * The class itself is set by the inline bootstrap in index.html, well before
 * React mounts — this provider takes over from there rather than doing the
 * first application, so there is no flash of the wrong scheme on load.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile } = useProfile()
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => getStoredTheme() ?? 'system',
  )
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolveTheme(preference))

  // The account's choice wins once it loads. A NULL column means the account has
  // no preference, which is not the same as choosing `system` — a choice made in
  // this browser before signing in is kept rather than overwritten.
  useEffect(() => {
    const saved = profile?.theme
    if (saved && isThemePreference(saved)) {
      setPreferenceState(saved)
      storeTheme(saved)
    }
  }, [profile?.theme])

  useEffect(() => {
    setTheme(resolveTheme(preference))
    if (preference !== 'system') return
    // Only `system` cares what the device is doing; an explicit choice must
    // survive the user flipping their OS switch.
    return watchDeviceTheme(setTheme)
  }, [preference])

  useEffect(() => {
    applyTheme(theme)
    void syncNativeChrome(theme)
  }, [theme])

  async function setPreference(next: ThemePreference) {
    const previous = preference
    setPreferenceState(next) // optimistic
    storeTheme(next)
    if (!profile) return // Signed out — the local choice is the whole story.
    try {
      // `system` is stored as NULL, the same way an unset language is: it has
      // to be re-resolved on every load rather than frozen at the value the
      // device happened to have when it was picked.
      await updateProfile({ theme: next === 'system' ? null : next })
    } catch (e) {
      setPreferenceState(previous)
      storeTheme(previous)
      throw e
    }
  }

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * The active theme. Outside a ThemeProvider (unit tests rendering a single
 * component) it reports the stored or device scheme rather than throwing, the
 * same fallback {@link useI18n} makes.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (ctx) return ctx
  const preference = getStoredTheme() ?? 'system'
  return { preference, theme: resolveTheme(preference), setPreference: async () => {} }
}

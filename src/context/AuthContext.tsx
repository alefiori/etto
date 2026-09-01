import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/legal'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  /**
   * Set when restoring the session *rejected* — no network, DNS down, the
   * project unreachable — as opposed to resolving with no session, which is
   * the ordinary signed-out case and not an error. Non-null means the app
   * never got far enough to know who the user is; BootScreen shows a retry
   * rather than letting the guest-session fallback spin against a dead
   * network. Cleared by {@link retry}.
   */
  error: Error | null
  /**
   * Try restoring the session again. Re-runs the same effect, so a success
   * clears {@link error} and lands a session exactly as a first load would.
   */
  retry: () => void
  /** True while signed in as an anonymous (guest) user. */
  isAnonymous: boolean
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Create an account. `locale` (the language picked on the auth page) rides
   * along as user metadata, so the profile row the database trigger creates
   * starts in the right language.
   */
  signUp: (email: string, password: string, locale?: string) => Promise<{ needsConfirmation: boolean }>
  /** Start a guest session with no email/password (Supabase anonymous auth). */
  signInAnonymously: (locale?: string) => Promise<void>
  /** Convert the current guest into a permanent account, keeping their data. */
  upgradeAccount: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  /**
   * Set a new password from an active password-recovery session — the second
   * half of the reset flow, called from ResetPassword.tsx once the recovery
   * link's tokens have been handed to Supabase (see lib/deepLinks.ts). A thin
   * wrapper around the same `updateUser` call {@link upgradeAccount} makes,
   * minus the email, so every write to the signed-in user's credentials goes
   * through this one context rather than a page reaching for `supabase.auth`
   * directly.
   */
  updatePassword: (password: string) => Promise<void>
  /**
   * Erase the account and everything in it, permanently. Runs server-side (the
   * `delete-account` Edge Function) because removing an auth user needs the
   * service role; the caller's own JWT is what identifies whose account goes,
   * so there is nothing to pass here.
   */
  deleteAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  // Bumped by retry() to re-run the restore below. A counter rather than a
  // boolean so a second retry after a second failure still re-runs it.
  const [attempt, setAttempt] = useState(0)

  // Restoring the session, on mount and on every retry.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return
        setSession(data.session)
        setLoading(false)
      })
      // Without this, a rejected promise left `loading` true forever and the
      // boot screen span its bar until the tab was closed. getSession() reads
      // local storage, but it hits the network whenever the stored token has
      // expired — so a cold start offline, which is the case this whole file
      // is about, is exactly when it rejects.
      .catch((cause: unknown) => {
        if (cancelled) return
        setSession(null)
        setError(cause instanceof Error ? cause : new Error(String(cause)))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Its own effect, subscribed once: a retry must not tear down and rebuild the
  // auth listener, and an event arriving mid-retry is still the truth.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      // A session arriving by any route means the restore is moot, and a stale
      // failure must not keep the boot screen up over a working app.
      if (newSession) setError(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      error,
      retry: () => setAttempt((n) => n + 1),
      isAnonymous: session?.user?.is_anonymous ?? false,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password, locale) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: locale ? { data: { locale } } : undefined,
        })
        if (error) throw error
        // When email confirmation is enabled, there's no active session yet.
        return { needsConfirmation: !data.session }
      },
      async signInAnonymously(locale) {
        const { error } = await supabase.auth.signInAnonymously(
          locale ? { options: { data: { locale } } } : undefined,
        )
        if (error) throw error
      },
      async upgradeAccount(email, password) {
        // Attach an email + password to the existing (anonymous) user, keeping
        // the same user_id so all logged data carries over. When email
        // confirmation is enabled, the change is pending until they verify.
        const { data, error } = await supabase.auth.updateUser({ email, password })
        if (error) throw error
        return { needsConfirmation: Boolean(data.user?.new_email) }
      },
      async signOut() {
        // Signing out leaves no session, which drops the user back into a fresh
        // guest session — the app's default state. To reach an actual sign-in
        // screen instead, they open it directly (it renders over the guest
        // session now), no sign-out required.
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
      async resetPassword(email) {
        // SITE_URL (src/lib/legal.ts), not window.location.origin: natively the
        // origin is `capacitor://localhost`, a scheme nothing outside the app can
        // open, so a link built from it opens nothing when the email is read on
        // the device the app is installed on. SITE_URL is the same real,
        // deployed HTTPS origin the legal-document links already resolve
        // "what does this app's canonical web address mean" against — a link
        // built from it is one the OS can hand back to the app as a Universal
        // Link / App Link (see the association files under public/.well-known/
        // and lib/deepLinks.ts) on top of working as a plain page on the web.
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${SITE_URL}/reset-password`,
        })
        if (error) throw error
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
      },
      async deleteAccount() {
        const { error } = await supabase.functions.invoke('delete-account', {
          method: 'POST',
        })
        if (error) throw error
        // The auth user is gone, so the access token no longer resolves to
        // anyone; sign out locally to clear the stored session rather than
        // leaving the app holding a token for a deleted account. The failure is
        // swallowed on purpose — the account is already deleted, and surfacing
        // "sign out failed" would suggest, wrongly, that it wasn't.
        await supabase.auth.signOut().catch(() => {})
      },
    }),
    [session, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

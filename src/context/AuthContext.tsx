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

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
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
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/signin`,
        })
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
    [session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

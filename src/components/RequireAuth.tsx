import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { BootScreen } from '@/components/layout/BootScreen'

/**
 * Gates app routes — but starts a guest session rather than showing a wall.
 *
 * A first-time visitor lands straight in the app with an anonymous account.
 * Demanding a signup before someone can log a single meal is the biggest
 * drop-off on mobile, and the account is real: GuestBanner offers to attach an
 * email later, and `upgradeAccount` keeps the same `user_id` so nothing logged
 * in the meantime is lost. Signing out returns here with no session and simply
 * mints another guest — the sign-in screen is reached by opening it directly,
 * not by tearing the guest session down first.
 *
 * The one case that still falls through to the sign-in screen is anonymous
 * sign-in failing — most likely because it is disabled on the Supabase project,
 * or its per-IP hourly limit has been hit. Falling back rather than retrying
 * keeps the user from being stuck on a spinner.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, signInAnonymously } = useAuth()
  const { locale, isLocaleExplicit } = useProfile()
  const { t } = useI18n()
  const location = useLocation()

  const [fallBackToSignIn, setFallBackToSignIn] = useState(false)
  // Guards against a second render starting a second sign-in before the first
  // has produced a session.
  const startedRef = useRef(false)

  useEffect(() => {
    if (loading || session || startedRef.current || fallBackToSignIn) return

    startedRef.current = true
    // Only pass a locale the user actually chose; otherwise leave it unset so
    // the account keeps following the device language.
    signInAnonymously(isLocaleExplicit ? locale : undefined).catch(() => {
      startedRef.current = false
      setFallBackToSignIn(true)
    })
  }, [loading, session, fallBackToSignIn, signInAnonymously, isLocaleExplicit, locale])

  if (fallBackToSignIn && !session) {
    return <Navigate to="/signin" replace state={{ from: location }} />
  }

  if (loading || !session) {
    return <BootScreen label={t('auth.loadingAccount')} />
  }

  return <>{children}</>
}

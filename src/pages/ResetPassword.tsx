import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { parseDeepLink, applyRecoverySession } from '@/lib/deepLinks'

const inputClass =
  'w-full min-h-2xl rounded-[16px] glass-field px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary outline-hidden transition-colors'

/**
 * Reuse the copy's own claim rather than inventing a second rule: the
 * `resetPassword.tooShort` string in every locale already says "at least 8
 * characters" (see src/lib/i18n/locales/en.ts), and nothing else in the
 * codebase enforces a minimum client-side — AuthPage's sign-up form leaves
 * that to Supabase's server-side `minimum_password_length` (6, in
 * supabase/config.toml), which is a floor, not the rule this screen's copy
 * promises. Kept here rather than exported more widely: this is the one
 * screen with copy that names a specific number.
 */
const MIN_PASSWORD_LENGTH = 8

type Phase = 'checking' | 'ready' | 'expired' | 'success'

export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  // Whether *this* URL carries a recovery token/error at all, decided once,
  // synchronously, before the first paint — so it is already known by the
  // time the derived `phase` below runs for the very first render, and the
  // fallback branch in that formula can't race the async work the effect
  // below kicks off for a token it already knows is there.
  const [hasUrlRecovery] = useState(() => parseDeepLink(window.location.href).kind !== 'ignored')

  // The URL-driven half of this state machine ('ready'/'expired' from
  // applyRecoverySession settling below, or 'success' once the password is
  // saved) lives in state, since it follows async work. The other half —
  // "no token on this URL at all, so fall back to whatever AuthContext
  // already knows" — is derived at render time instead of a second effect:
  // session/loading are already reactive values, so syncing them into state
  // would just be a redundant render one tick behind the context that
  // already re-renders this component on every change. `hasUrlRecovery`
  // keeps this branch from firing while the effect below is still
  // establishing a session from the URL's own token.
  const [rawPhase, setRawPhase] = useState<Phase>('checking')
  const phase: Phase =
    rawPhase !== 'checking'
      ? rawPhase
      : hasUrlRecovery || loading
        ? 'checking'
        : session
          ? 'ready'
          : 'expired'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pick up the recovery tokens Supabase's implicit-grant redirect put on
  // *this* URL — the ordinary case for a link opened directly on the web. See
  // lib/deepLinks.ts for why this is read by hand rather than left to the
  // client's own detectSessionInUrl.
  useEffect(() => {
    const action = parseDeepLink(window.location.href)

    if (action.kind === 'reset-password') {
      applyRecoverySession(action.session)
        .then(() => setRawPhase('ready'))
        .catch(() => setRawPhase('expired'))
      // The tokens have done their job; strip them from the visible URL and
      // browser history rather than leaving a bearer token sitting there for
      // a shoulder-surfer, a shared screenshot, or a "reopen closed tab".
      window.history.replaceState(null, '', window.location.pathname)
      return
    }

    if (action.kind === 'reset-password-expired') {
      setRawPhase('expired')
    }
    // 'ignored' means there was no token on *this* URL at all — the native
    // path, where lib/deepLinks.ts's appUrlOpen listener already consumed the
    // real https:// URL and established the session before navigating the
    // in-app router here. `phase` above falls back to AuthContext's own
    // session/loading for that case once it has settled.
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('resetPassword.tooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.passwordsNoMatch'))
      return
    }

    setBusy(true)
    try {
      await updatePassword(password)
      setRawPhase('success')
      // A beat to let the confirmation register before the app takes over —
      // the same "show, then move on" shape ForgotPassword.tsx's sent state
      // uses, just timed rather than waiting on a second tap.
      window.setTimeout(() => navigate('/', { replace: true }), 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Same shell as ForgotPassword.tsx / AuthPage.tsx: no chrome of its own,
    // arrived at outside RequireAuth, self-scrolling for the native shell.
    <div className="relative h-dvh overflow-y-auto pb-safe-bottom pl-safe-left pr-safe-right pt-safe-top antialiased">
      <div className="pointer-events-none fixed left-0 top-0 -z-10 h-[512px] w-full bg-linear-to-b from-surface-container to-background" />

      <main className="relative z-10 flex min-h-full w-full items-center justify-center p-container-margin-mobile md:p-container-margin-desktop">
        <div className="flex w-full max-w-[480px] flex-col gap-lg rounded-lens p-lg glass md:p-xl">
          <div className="flex justify-end">
            <LanguagePicker />
          </div>

          <div className="flex flex-col items-center gap-sm text-center">
            <div className="mb-xs flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint/[0.14] text-primary">
              <Icon name="lock_reset" fill className="text-[2rem] text-primary" />
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
              {t('resetPassword.title')}
            </h1>
          </div>

          {phase === 'checking' && (
            <div className="flex items-center justify-center py-lg">
              <Spinner className="h-6 w-6" />
            </div>
          )}

          {phase === 'expired' && (
            <div className="flex flex-col gap-md">
              <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                {t('resetPassword.expired')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/forgot-password')}
                className="flex min-h-2xl w-full items-center justify-center rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-[0.98] grad-primary"
              >
                {t('forgotPassword.sendResetLink')}
              </button>
            </div>
          )}

          {phase === 'success' && (
            <p role="status" aria-live="polite" className="rounded-lg bg-primary-tint/10 px-md py-sm font-label-md text-label-md text-primary">
              {t('resetPassword.success')}
            </p>
          )}

          {phase === 'ready' && (
            <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
              {error && (
                <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="new-password">
                  {t('resetPassword.newPassword')}
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="confirm-new-password">
                  {t('resetPassword.confirmNewPassword')}
                </label>
                <input
                  id="confirm-new-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={inputClass}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-sm flex min-h-2xl w-full items-center justify-center gap-sm rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 grad-primary"
              >
                {busy ? <Spinner className="h-4 w-4" /> : t('resetPassword.submit')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

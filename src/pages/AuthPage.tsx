import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { guestHasData } from '@/lib/guestData'
import { PRIVACY_URL, TERMS_URL } from '@/lib/legal'

type Tab = 'signin' | 'signup'

const inputClass =
  'w-full min-h-2xl rounded-[16px] glass-field px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary outline-hidden transition-colors'

export default function AuthPage({ initialTab = 'signin' }: { initialTab?: Tab }) {
  const { session, user, isAnonymous, signIn, signUp, signInAnonymously, upgradeAccount } = useAuth()
  const { t, locale } = useI18n()
  const { isLocaleExplicit } = useProfile()
  // Only a language the visitor actually picked is worth saving on the new
  // account; otherwise it starts with none and follows the device.
  const chosenLocale = isLocaleExplicit ? locale : undefined
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>(initialTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Set once a guest with data has been warned that signing into a different
  // account leaves that data behind; a second submit then proceeds.
  const [confirmSwitch, setConfirmSwitch] = useState(false)

  // A guest still has a session, so it renders here instead of being bounced —
  // that is how they reach this screen at all. Only a permanent account, which
  // has nothing left to do here, is sent back into the app.
  if (session && !isAnonymous) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (tab === 'signup' && password !== confirm) {
      setError(t('auth.passwordsNoMatch'))
      return
    }

    setBusy(true)
    try {
      if (tab === 'signin') {
        // Signing into an existing account replaces the guest session and
        // orphans anything logged as a guest. Warn once when there is data to
        // lose; the next submit goes through.
        if (isAnonymous && !confirmSwitch && user && (await guestHasData(user.id))) {
          setNotice(t('auth.switchAccountConfirm'))
          setConfirmSwitch(true)
          setBusy(false)
          return
        }
        await signIn(email, password)
        navigate('/', { replace: true })
      } else if (isAnonymous) {
        // A guest "creating an account" is really attaching credentials to the
        // session they already have, so their data carries over.
        const { needsConfirmation } = await upgradeAccount(email, password)
        if (needsConfirmation) {
          setNotice(t('guest.checkInbox'))
          setTab('signin')
        } else {
          navigate('/', { replace: true })
        }
      } else {
        // Carry a language chosen here into the new account's profile.
        const { needsConfirmation } = await signUp(email, password, chosenLocale)
        if (needsConfirmation) {
          setNotice(t('auth.checkInbox'))
          setTab('signin')
        } else {
          navigate('/', { replace: true })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  function switchTab(next: Tab) {
    setTab(next)
    setError(null)
    setNotice(null)
    setConfirmSwitch(false)
  }

  async function handleGuest() {
    setError(null)
    setNotice(null)
    // Already a guest (the common case — they opened this screen to sign in and
    // changed their mind): just drop back into the app, no new session.
    if (session) {
      navigate('/', { replace: true })
      return
    }
    setBusy(true)
    try {
      await signInAnonymously(chosenLocale)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Outside AppLayout, so nothing else insets this route: the safe padding
    // keeps the card (and the language picker in its corner) clear of the
    // notch, and the page scrolls itself — the native iOS shell disables the
    // WebView's own scrolling, so a form taller than the screen would
    // otherwise have no way to reach its submit button.
    <div className="relative h-dvh overflow-y-auto pb-safe-bottom pl-safe-left pr-safe-right pt-safe-top antialiased">
      {/* Ambient decorative background */}
      <div className="pointer-events-none fixed left-0 top-0 -z-10 h-[512px] w-full bg-linear-to-b from-surface-container to-background" />

      <main className="relative z-10 flex min-h-full w-full items-center justify-center p-container-margin-mobile md:p-container-margin-desktop">
        <div className="flex w-full max-w-[480px] flex-col gap-lg rounded-lens p-lg glass md:p-xl">
          {/* Language — pickable before signing in, and kept for the account */}
          <div className="flex justify-end">
            <LanguagePicker />
          </div>

          {/* Branding */}
          <div className="flex flex-col items-center gap-sm text-center">
            <div className="mb-xs flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint/[0.14] text-primary">
              <Icon name="donut_small" fill className="text-[2rem] text-primary" />
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary md:font-headline-lg md:text-headline-lg">
              Etto
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t('auth.tagline')}
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-sm flex w-full border-b border-surface-container-high">
            <button
              type="button"
              // The selected tab was bold with an underline and nothing else —
              // a purely visual state. `aria-pressed` is the shape the rest of
              // the app already uses for a chosen option among several (the
              // source filters, the meal picker, the chart ranges).
              aria-pressed={tab === 'signin'}
              onClick={() => switchTab('signin')}
              className={`flex-1 pb-sm text-center font-label-md text-label-md transition-colors ${
                tab === 'signin'
                  ? 'border-b-2 border-primary font-bold text-primary'
                  : 'border-b-2 border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              // The selected tab was bold with an underline and nothing else —
              // a purely visual state. `aria-pressed` is the shape the rest of
              // the app already uses for a chosen option among several (the
              // source filters, the meal picker, the chart ranges).
              aria-pressed={tab === 'signup'}
              onClick={() => switchTab('signup')}
              className={`flex-1 pb-sm text-center font-label-md text-label-md transition-colors ${
                tab === 'signup'
                  ? 'border-b-2 border-primary font-bold text-primary'
                  : 'border-b-2 border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('auth.signUp')}
            </button>
          </div>

          {notice && (
            <p role="status" aria-live="polite" className="rounded-lg bg-primary-tint/10 px-md py-sm font-label-md text-label-md text-primary">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
              {error}
            </p>
          )}

          <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-on-surface" htmlFor="email">
                {t('auth.emailAddress')}
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="font-label-md text-label-md text-on-surface" htmlFor="password">
                {t('auth.password')}
              </label>
              <div className="relative w-full">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={tab === 'signin' ? '••••••••' : t('auth.createPasswordPlaceholder')}
                  className={`${inputClass} pr-2xl`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 flex h-2xl w-2xl items-center justify-center text-on-surface-variant transition-colors hover:text-on-surface"
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  <Icon name={showPassword ? 'visibility' : 'visibility_off'} />
                </button>
              </div>
            </div>

            {tab === 'signup' && (
              <div className="flex flex-col gap-xs">
                <label className="font-label-md text-label-md text-on-surface" htmlFor="confirm">
                  {t('auth.confirmPassword')}
                </label>
                <input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder={t('auth.repeatPasswordPlaceholder')}
                  className={inputClass}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
            )}

            {tab === 'signin' && (
              <div className="-mt-sm flex justify-end">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="font-label-md text-label-md text-primary transition-colors hover:text-primary-hover"
                >
                  {t('auth.forgotPassword')}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-sm flex min-h-2xl w-full items-center justify-center gap-sm rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 grad-primary"
            >
              {busy ? (
                <Spinner className="h-4 w-4" />
              ) : tab === 'signin' ? (
                <>
                  <span>{t('auth.signInAction')}</span>
                  <Icon name="arrow_forward" className="text-[1.125rem]" />
                </>
              ) : (
                <span>{t('auth.createAccount')}</span>
              )}
            </button>

            {/* Real links, not decoration: both stores reject a sign-up screen
                that names Terms and a Privacy Policy without linking them, and
                the GDPR consent these words claim to collect is meaningless if
                the documents can't be read. `target="_blank"` is what sends
                them to the system browser natively — Capacitor opens off-origin
                http(s) URLs externally rather than inside the WebView. */}
            {tab === 'signup' && (
              <p className="mt-sm text-center font-body-md text-body-md text-on-surface-variant">
                {t('auth.termsPrefix')}{' '}
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2 hover:text-primary-hover"
                >
                  {t('auth.terms')}
                </a>{' '}
                {t('auth.and')}{' '}
                <a
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2 hover:text-primary-hover"
                >
                  {t('auth.privacyPolicy')}
                </a>
                .
              </p>
            )}
          </form>

          {/* Guest access */}
          <div className="flex items-center gap-sm">
            <div className="h-px flex-1 bg-outline-variant" />
            <span className="font-label-md text-label-md text-on-surface-variant">
              {t('auth.or')}
            </span>
            <div className="h-px flex-1 bg-outline-variant" />
          </div>
          <button
            type="button"
            onClick={handleGuest}
            disabled={busy}
            className="flex min-h-2xl w-full items-center justify-center gap-sm rounded-[16px] glass-field font-label-md text-label-md text-on-surface transition-colors hover:glass-chip disabled:opacity-60"
          >
            <Icon name="person_outline" className="text-[1.125rem]" />
            <span>{t('auth.continueAsGuest')}</span>
          </button>
        </div>
      </main>
    </div>
  )
}

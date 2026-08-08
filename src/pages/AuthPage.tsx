import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { LanguagePicker } from '@/components/ui/LanguagePicker'
import { guestHasData } from '@/lib/guestData'

type Tab = 'signin' | 'signup'

const inputClass =
  'w-full min-h-[48px] rounded-lg border border-outline-variant bg-surface px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors'

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
    <div className="relative h-[100dvh] overflow-y-auto pb-safe-bottom pl-safe-left pr-safe-right pt-safe-top antialiased">
      {/* Ambient decorative background */}
      <div className="pointer-events-none fixed left-0 top-0 -z-10 h-[512px] w-full bg-gradient-to-b from-surface-container to-background" />

      <main className="relative z-10 flex min-h-full w-full items-center justify-center p-container-margin-mobile md:p-container-margin-desktop">
        <div className="flex w-full max-w-[480px] flex-col gap-lg rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-lg shadow-card md:p-xl">
          {/* Language — pickable before signing in, and kept for the account */}
          <div className="flex justify-end">
            <LanguagePicker />
          </div>

          {/* Branding */}
          <div className="flex flex-col items-center gap-sm text-center">
            <div className="mb-xs flex h-16 w-16 items-center justify-center rounded-full bg-surface-container">
              <Icon name="donut_small" fill className="text-[32px] text-primary" />
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary md:font-headline-lg md:text-headline-lg">
              MacroTrack
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t('auth.tagline')}
            </p>
          </div>

          {/* Tabs */}
          <div className="mt-sm flex w-full border-b border-surface-container-high">
            <button
              type="button"
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
            <p className="rounded-lg bg-primary-tint/10 px-md py-sm font-label-md text-label-md text-primary">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
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
                  className={`${inputClass} pr-[48px]`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-0 top-0 flex h-[48px] w-[48px] items-center justify-center text-on-surface-variant transition-colors hover:text-on-surface"
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
              <div className="mt-[-8px] flex justify-end">
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
              className="mt-sm flex min-h-[48px] w-full items-center justify-center gap-sm rounded-lg bg-primary font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-primary-hover hover:shadow-md active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? (
                <Spinner className="h-4 w-4" />
              ) : tab === 'signin' ? (
                <>
                  <span>{t('auth.signInAction')}</span>
                  <Icon name="arrow_forward" className="text-[18px]" />
                </>
              ) : (
                <span>{t('auth.createAccount')}</span>
              )}
            </button>

            {tab === 'signup' && (
              <p className="mt-sm text-center font-body-md text-body-md text-on-surface-variant">
                {t('auth.termsPrefix')}{' '}
                <span className="text-primary">{t('auth.terms')}</span> {t('auth.and')}{' '}
                <span className="text-primary">{t('auth.privacyPolicy')}</span>.
              </p>
            )}
          </form>

          {/* Guest access */}
          <div className="flex items-center gap-sm">
            <div className="h-px flex-1 bg-surface-container-high" />
            <span className="font-label-md text-label-md text-on-surface-variant">
              {t('auth.or')}
            </span>
            <div className="h-px flex-1 bg-surface-container-high" />
          </div>
          <button
            type="button"
            onClick={handleGuest}
            disabled={busy}
            className="flex min-h-[48px] w-full items-center justify-center gap-sm rounded-lg border border-outline-variant bg-surface font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-60"
          >
            <Icon name="person_outline" className="text-[18px]" />
            <span>{t('auth.continueAsGuest')}</span>
          </button>
        </div>
      </main>
    </div>
  )
}

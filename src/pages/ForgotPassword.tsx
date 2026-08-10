import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { LanguagePicker } from '@/components/ui/LanguagePicker'

const inputClass =
  'w-full min-h-[48px] rounded-[16px] glass-field px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Insets and self-scrolling as in AuthPage — this route has no chrome of
    // its own either.
    <div className="relative h-[100dvh] overflow-y-auto pb-safe-bottom pl-safe-left pr-safe-right pt-safe-top antialiased">
      <div className="pointer-events-none fixed left-0 top-0 -z-10 h-[512px] w-full bg-gradient-to-b from-surface-container to-background" />

      <main className="relative z-10 flex min-h-full w-full items-center justify-center p-container-margin-mobile md:p-container-margin-desktop">
        <div className="flex w-full max-w-[480px] flex-col gap-lg rounded-lens p-lg glass md:p-xl">
          <div className="flex justify-end">
            <LanguagePicker />
          </div>

          <div className="flex flex-col items-center gap-sm text-center">
            <div className="mb-xs flex h-16 w-16 items-center justify-center rounded-full bg-primary-tint/[0.14] text-primary">
              <Icon name="lock_reset" fill className="text-[32px] text-primary" />
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary">
              {t('forgotPassword.title')}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('forgotPassword.instruction')}
            </p>
          </div>

          {sent ? (
            <div className="flex flex-col gap-md">
              <p className="rounded-lg bg-primary-tint/10 px-md py-sm font-label-md text-label-md text-primary">
                {t('forgotPassword.linkSent', { email })}
              </p>
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="flex min-h-[48px] w-full items-center justify-center rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-[0.98] grad-primary"
              >
                {t('forgotPassword.backToSignIn')}
              </button>
            </div>
          ) : (
            <form className="flex flex-col gap-md" onSubmit={handleSubmit}>
              {error && (
                <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                  {error}
                </p>
              )}
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
              <button
                type="submit"
                disabled={busy}
                className="mt-sm flex min-h-[48px] w-full items-center justify-center gap-sm rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60 grad-primary"
              >
                {busy ? <Spinner className="h-4 w-4" /> : t('forgotPassword.sendResetLink')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="text-center font-label-md text-label-md text-primary hover:text-primary-hover"
              >
                {t('forgotPassword.backToSignIn')}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

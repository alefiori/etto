import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { useScrollLock } from '@/hooks/useScrollLock'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'

const inputClass =
  'w-full min-h-[48px] rounded-lg border border-outline-variant bg-surface px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/70 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors'

/**
 * Persistent prompt shown to guest (anonymous) users, offering to turn their
 * temporary session into a permanent account so their logged data isn't lost.
 * The upgrade keeps the same user_id, so all existing data carries over.
 */
export function GuestBanner() {
  const { isAnonymous, upgradeAccount } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useScrollLock(open)

  if (!isAnonymous) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { needsConfirmation } = await upgradeAccount(email, password)
      if (needsConfirmation) {
        setNotice(t('guest.checkInbox'))
      } else {
        setOpen(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.somethingWrong'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-sm px-container-margin-mobile pt-md md:flex-row md:items-center md:justify-between md:px-container-margin-desktop">
        <div className="flex items-center gap-sm rounded-2xl border border-primary/30 bg-primary-tint/10 p-md text-on-surface md:flex-1">
          <Icon name="info" className="shrink-0 text-primary" />
          <p className="font-body-md text-body-md">{t('guest.message')}</p>
          <button
            onClick={() => setOpen(true)}
            className="ml-auto shrink-0 rounded-full bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90"
          >
            {t('guest.upgrade')}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 backdrop-blur-[4px] dark:bg-black/60 sm:items-center sm:p-lg"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setOpen(false)
          }}
        >
          <div className="flex w-full flex-col gap-md rounded-t-2xl bg-surface-container-lowest p-lg pb-[calc(theme(spacing.lg)+theme(spacing.safe-bottom))] shadow-card sm:max-w-md sm:rounded-2xl sm:pb-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-headline-md text-headline-md text-on-surface">{t('guest.title')}</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                aria-label={t('common.close')}
              >
                <Icon name="close" />
              </button>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">{t('guest.dialogBody')}</p>

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
                <label className="font-label-md text-label-md text-on-surface" htmlFor="guest-email">
                  {t('auth.emailAddress')}
                </label>
                <input
                  id="guest-email"
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
                <label className="font-label-md text-label-md text-on-surface" htmlFor="guest-password">
                  {t('auth.password')}
                </label>
                <input
                  id="guest-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder={t('auth.createPasswordPlaceholder')}
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-sm flex min-h-[48px] w-full items-center justify-center gap-sm rounded-lg bg-primary font-label-md text-label-md text-on-primary shadow-sm transition-all hover:bg-primary-hover disabled:opacity-60"
              >
                {busy ? <Spinner className="h-4 w-4" /> : <span>{t('guest.createAccount')}</span>}
              </button>
            </form>

            {/* For guests who already have an account and just want back in. */}
            <p className="text-center font-body-md text-body-md text-on-surface-variant">
              {t('guest.haveAccount')}{' '}
              <button
                type="button"
                onClick={() => navigate('/signin')}
                className="font-label-md text-label-md text-primary transition-colors hover:text-primary-hover"
              >
                {t('auth.signInAction')}
              </button>
            </p>
          </div>
        </div>
      )}
    </>
  )
}

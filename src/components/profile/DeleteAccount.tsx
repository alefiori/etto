import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/**
 * Deleting the account, from inside the app.
 *
 * Apple's guideline 5.1.1(v) requires this of any app that lets you create an
 * account, and this is where that is answered — for **registered** accounts
 * only. A guest session is not an account anybody signed up for: it has no
 * email, no credentials and nothing to sign back into, so "delete account" on
 * it is a destructive button offering to undo something the user never did.
 * The action that fits a guest is the one already above it on the page —
 * signing in, or saving the data to a real account — and the guideline is
 * satisfied by the registered case, which is the only one it describes. Guests
 * therefore see nothing here; see the guard below and the call site in
 * pages/Profile.tsx.
 *
 * Two things the confirmation has to say, because each is true and neither is
 * guessable:
 *
 *   1. It cannot be undone, and it takes the logs with it. That is the whole
 *      point, but it is worth one sentence before an irreversible action.
 *   2. A store subscription is **not** cancelled by this. Apple and Google own
 *      that record and neither offers an API to cancel on a user's behalf, so
 *      deleting the account here would otherwise leave someone paying for an
 *      account that no longer exists. Shown only to people who actually have
 *      one — an irrelevant billing warning on a destructive dialog is noise
 *      that gets read past.
 */
export function DeleteAccount() {
  const { t } = useI18n()
  const { deleteAccount, isAnonymous } = useAuth()
  const { isPro } = useEntitlement()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setError(null)
    setBusy(true)
    try {
      await deleteAccount()
      setConfirming(false)
      // Signing out drops back to a fresh guest session, which is the app's
      // default state — so there is somewhere to land rather than a dead end.
      navigate('/', { replace: true })
    } catch {
      setError(t('profile.deleteAccountFailed'))
    } finally {
      setBusy(false)
    }
  }

  // The invariant lives here rather than only at the call site: this is a
  // destructive control, and it should not depend on a caller remembering.
  if (isAnonymous) return null

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-error-container/50 text-error"
        >
          <Icon name="delete_forever" style={{ fontSize: '1.125rem' }} />
        </span>
        <h3 className="font-label-md text-label-md text-on-surface">
          {t('profile.deleteAccount')}
        </h3>
      </div>
      <p className="font-body-md text-sm text-on-surface-variant">
        {t('profile.deleteAccountDescription')}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-2xl items-center justify-center gap-sm self-start rounded-full border border-error px-4 font-label-md text-label-md text-error transition-colors hover:bg-error-container/40"
      >
        <Icon name="delete_forever" className="text-[1.25rem]" />
        {t('profile.deleteAccount')}
      </button>

      <ConfirmDialog
        open={confirming}
        destructive
        busy={busy}
        title={t('profile.deleteAccountConfirmTitle')}
        confirmLabel={t('profile.deleteAccountConfirmCta')}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
        message={
          <span className="flex flex-col gap-sm">
            <span>{t('profile.deleteAccountConfirmMessage')}</span>
            {isPro && (
              <span className="rounded-lg glass-chip px-md py-sm text-sm">
                {t('profile.deleteAccountStoreNote')}
              </span>
            )}
          </span>
        }
      />
    </div>
  )
}

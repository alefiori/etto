import { useEffect, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { manageSubscriptionUrl, purchasesAvailable, restorePurchases } from '@/lib/purchases'
import { isNativePlatform } from '@/lib/platform'

/**
 * Where a subscriber sees what they have, and a non-subscriber sees what they
 * could have.
 *
 * Restore lives here rather than only on the paywall because the person who
 * needs it most has already paid and therefore has no reason to open a paywall —
 * a reinstall, a new phone, a fresh sign-in. Both stores also require a restore
 * path to exist, and "it's inside the upgrade screen" is a common review
 * rejection.
 *
 * The manage link is fetched from the store rather than hardcoded to Apple's or
 * Google's subscription page: RevenueCat reports the URL for the store that
 * actually sold the subscription, and it is null for a lifetime unlock, which
 * has nothing to manage.
 */
export function ProSubscription() {
  const { t } = useI18n()
  const { locale } = useProfile()
  const { isPro, subscription, hasBillingIssue, syncAfterPurchase } = useEntitlement()
  const { openPaywall } = useAppShell()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [manageUrl, setManageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isPro || !purchasesAvailable()) return
    let cancelled = false
    void manageSubscriptionUrl().then((url) => {
      if (!cancelled) setManageUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [isPro])

  async function handleRestore() {
    setNotice(null)
    setBusy(true)
    try {
      const outcome = await restorePurchases()
      if (outcome === 'restored') {
        // The store found the purchase; the entitlement row still has to catch
        // up, so wait for the webhook rather than claiming Pro on the spot.
        const active = await syncAfterPurchase()
        setNotice(active ? t('paywall.restored') : t('paywall.syncing'))
      } else if (outcome === 'nothing-to-restore') {
        setNotice(t('paywall.nothingToRestore'))
      } else {
        setNotice(t(isNativePlatform() ? 'paywall.unavailableNative' : 'paywall.unavailableWeb'))
      }
    } catch {
      setNotice(t('paywall.failed'))
    } finally {
      setBusy(false)
    }
  }

  const expiresAt = subscription?.expires_at ?? null
  const status = !isPro
    ? t('paywall.notSubscribed')
    : expiresAt == null
      ? t('paywall.activeLifetime')
      : t('paywall.activeUntil', {
          date: new Date(expiresAt).toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        })

  return (
    /* Its own highlighted card, not a section between two rules like the rest
       of the page. Pro is the only thing here that is bought rather than set,
       and the only one whose state can change without the user touching it —
       a renewal, a lapse, a billing problem. A sage-tinted card is what makes
       it findable in one glance on a page of nine grey sections, which is what
       somebody arriving to fix their billing is doing. */
    <section className="flex flex-col gap-sm rounded-lens border border-primary/25 bg-primary-tint/[0.10] p-lg dark:border-primary/40 dark:bg-primary-tint/[0.14]">
      <div className="flex items-center gap-sm">
        {/* Filled, where every other section leads with a tinted tile: the one
            badge on the page that is a status and not a category. */}
        <span
          aria-hidden="true"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            isPro ? 'text-on-primary grad-primary' : 'glass-chip text-on-surface-variant'
          }`}
        >
          <Icon name="workspace_premium" style={{ fontSize: '1.125rem' }} fill={isPro} />
        </span>
        <h3 className="font-headline-md text-headline-md text-on-surface">{t('paywall.title')}</h3>
      </div>

      <p className="font-body-md text-body-md text-on-surface">{status}</p>

      {/* A billing problem is the one state where doing nothing loses access, so
          it is loud, and it names the store rather than offering an in-app fix
          this app cannot perform. */}
      {hasBillingIssue && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('paywall.billingIssue')}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-lg glass-chip px-md py-sm font-label-md text-label-md text-on-surface"
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-sm sm:flex-row">
        {!isPro && (
          <button
            type="button"
            onClick={openPaywall}
            className="flex min-h-2xl flex-1 items-center justify-center gap-sm rounded-full font-label-md text-label-md transition-all hover:brightness-105 active:scale-95 grad-primary"
          >
            <Icon name="workspace_premium" className="text-[1.125rem]" />
            {t('paywall.upgradeCta')}
          </button>
        )}

        {manageUrl && (
          <a
            href={manageUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex min-h-2xl flex-1 items-center justify-center gap-sm rounded-full font-label-md text-label-md text-on-surface transition-all hover:brightness-[1.06] glass-field active:scale-95"
          >
            <Icon name="open_in_new" className="text-[1.125rem]" />
            {t('paywall.manage')}
          </a>
        )}

        <button
          type="button"
          onClick={handleRestore}
          disabled={busy}
          className="flex min-h-2xl flex-1 items-center justify-center gap-sm rounded-full font-label-md text-label-md text-on-surface transition-all hover:brightness-[1.06] glass-field active:scale-95 disabled:opacity-60"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Icon name="restore" className="text-[1.125rem]" />}
          {t('paywall.restore')}
        </button>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useAuth } from '@/context/AuthContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { PLANS, purchasePlan, restorePurchases, purchasesAvailable, type Plan } from '@/lib/purchases'

const FEATURE_KEYS = [
  'paywall.featureAdaptive',
  'paywall.featureTrends',
  'paywall.featureReminders',
  'paywall.featureExport',
] as const

export function PaywallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { isAnonymous } = useAuth()
  const { refetch } = useEntitlement()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const available = purchasesAvailable()

  async function handleBuy(plan: Plan) {
    setNotice(null)
    setBusy(plan.id)
    try {
      const outcome = await purchasePlan(plan)
      if (outcome === 'purchased') {
        // The entitlement is written server-side by the webhook, so re-read it
        // rather than trusting what the device just told us.
        await refetch()
        onClose()
      } else if (outcome === 'unavailable') {
        setNotice(t('paywall.unavailable'))
      }
    } catch {
      setNotice(t('paywall.failed'))
    } finally {
      setBusy(null)
    }
  }

  async function handleRestore() {
    setNotice(null)
    setBusy('restore')
    try {
      const outcome = await restorePurchases()
      if (outcome === 'restored') {
        await refetch()
        setNotice(t('paywall.restored'))
      } else if (outcome === 'nothing-to-restore') {
        setNotice(t('paywall.nothingToRestore'))
      } else {
        setNotice(t('paywall.unavailable'))
      }
    } catch {
      setNotice(t('paywall.failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="paywall-title">
      <header className="flex items-center justify-between gap-md border-b border-surface-variant p-md">
        <h2 id="paywall-title" className="font-headline-md text-headline-md text-on-surface">
          {t('paywall.title')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)]"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className="flex flex-col gap-lg p-md">
        <p className="font-body-lg text-body-lg text-on-surface">{t('paywall.subtitle')}</p>

        <ul className="flex flex-col gap-sm">
          {FEATURE_KEYS.map((key) => (
            <li key={key} className="flex items-start gap-sm font-body-md text-body-md text-on-surface">
              <Icon name="check_circle" className="mt-0.5 text-[18px] text-primary" />
              {t(key)}
            </li>
          ))}
        </ul>

        <p className="rounded-lg glass-chip px-md py-sm font-label-md text-label-md text-on-surface-variant">
          {t('paywall.freeNote')}
        </p>

        {/* A guest has a real user_id but nothing durable to restore against, so
            steer them to an account before they hand over money. */}
        {isAnonymous && (
          <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
            {t('paywall.guestPrompt')}
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

        <div className="grid gap-sm sm:grid-cols-3">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              type="button"
              disabled={busy !== null || isAnonymous}
              onClick={() => handleBuy(plan)}
              className={`relative flex min-h-[96px] flex-col items-center justify-center gap-1 rounded-2xl border p-md transition-all active:scale-98 disabled:opacity-50 ${
                plan.id === 'yearly'
                  ? 'border-primary bg-primary text-on-primary'
                  : 'text-on-surface hover:border-primary glass-field'
              }`}
            >
              {plan.id === 'yearly' && (
                <span className="absolute -top-2 rounded-full bg-tertiary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-tertiary">
                  {t('paywall.bestValue')}
                </span>
              )}
              <span className="font-label-md text-label-md opacity-80">{t(`paywall.${plan.id}`)}</span>
              <span className="font-headline-md text-headline-md">
                {plan.id === 'monthly'
                  ? t('paywall.perMonth', { price: plan.price })
                  : plan.id === 'yearly'
                    ? t('paywall.perYear', { price: plan.price })
                    : t('paywall.once', { price: plan.price })}
              </span>
              {busy === plan.id && <Spinner className="h-4 w-4" />}
            </button>
          ))}
        </div>

        {!available && (
          <p className="font-label-md text-label-md text-on-surface-variant">
            {t('paywall.unavailable')}
          </p>
        )}

        <button
          type="button"
          onClick={handleRestore}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 font-label-md text-label-md text-primary disabled:opacity-50"
        >
          {busy === 'restore' && <Spinner className="h-4 w-4" />}
          {t('paywall.restore')}
        </button>

        {/* Both stores require the renewal terms to be visible on the paywall. */}
        <p className="font-label-md text-label-md text-outline">{t('paywall.terms')}</p>
      </div>
    </Modal>
  )
}

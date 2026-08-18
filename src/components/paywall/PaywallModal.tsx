import { useEffect, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useAuth } from '@/context/AuthContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import {
  defaultOffers,
  loadOffers,
  purchasePlan,
  restorePurchases,
  purchasesAvailable,
  type IntroOffer,
  type Offer,
  type PlanId,
} from '@/lib/purchases'
import {
  EXTERNAL_PURCHASE_URL,
  externalPurchaseAllowed,
  externalPurchaseHost,
} from '@/lib/purchases/externalPurchase'
import { isNativePlatform } from '@/lib/platform'
import type { TranslationKey } from '@/lib/i18n'

/**
 * The four features Pro unlocks, in the order they were built.
 *
 * Every one of these exists in the binary. Listing a feature the app does not
 * contain is an App Store 2.3.1 rejection, so this array and what the app can
 * actually do have to be kept in step — if a feature is ever pulled, its line
 * comes out of here first.
 */
const FEATURE_KEYS = [
  'paywall.featureAdaptive',
  'paywall.featureTrends',
  'paywall.featureReminders',
  'paywall.featureExport',
] as const

/**
 * Intro-period units, as the store reports them, mapped onto [singular, plural].
 *
 * The period carries the *whole* phrase ("First week", "First 3 months") rather
 * than a bare duration slotted into a frame, because the article and the
 * ordinal have to agree with it — "Prima settimana" but "Primo mese", and no
 * amount of `{count} {unit}` interpolation gets that right.
 */
const INTRO_PERIOD_KEYS: Record<IntroOffer['unit'], [TranslationKey, TranslationKey]> = {
  DAY: ['paywall.introDayOne', 'paywall.introDayOther'],
  WEEK: ['paywall.introWeekOne', 'paywall.introWeekOther'],
  MONTH: ['paywall.introMonthOne', 'paywall.introMonthOther'],
  YEAR: ['paywall.introYearOne', 'paywall.introYearOther'],
}

export function PaywallModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { isAnonymous } = useAuth()
  const { syncAfterPurchase } = useEntitlement()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Where the store can't be asked, the fallback prices *are* the answer, so
  // they render immediately. Where it can, the grid waits: showing €24.99 to
  // someone the store is about to quote ¥3,900 is worse than a moment's spinner.
  const available = purchasesAvailable()
  const [offers, setOffers] = useState<Offer[] | null>(() => (available ? null : defaultOffers()))
  const [linkOut, setLinkOut] = useState(false)

  // Ask the store what it actually charges, and only while the paywall is open:
  // the prices are regional, they can change under a running app, and fetching
  // them at start-up would spend a network round trip most sessions never need.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void loadOffers().then((loaded) => {
      if (!cancelled) setOffers(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // Whether the stores currently permit pointing this install at web checkout.
  // Three conditions, all of them off by default — see externalPurchase.ts. A
  // guest is excluded here as well as there: their anonymous session cannot be
  // signed into on the web, so the link would strand them at a checkout they
  // can't authenticate against.
  useEffect(() => {
    if (!open || isAnonymous) return
    let cancelled = false
    void externalPurchaseAllowed().then((allowed) => {
      if (!cancelled) setLinkOut(allowed)
    })
    return () => {
      cancelled = true
    }
  }, [open, isAnonymous])

  async function handleBuy(id: PlanId) {
    setNotice(null)
    setBusy(id)
    try {
      const outcome = await purchasePlan(id)
      if (outcome === 'purchased') {
        // The entitlement is written server-side by the webhook, so wait for
        // that row rather than trusting what the device just told us. If it
        // hasn't landed in time the purchase is still safe — say so and leave
        // the paywall open instead of closing onto a locked feature.
        const active = await syncAfterPurchase()
        if (active) onClose()
        else setNotice(t('paywall.syncing'))
      } else if (outcome === 'unavailable') {
        setNotice(t('paywall.unavailable'))
      } else if (outcome === 'failed') {
        setNotice(t('paywall.failed'))
      }
      // 'cancelled' is the user's own choice — no notice.
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
        const active = await syncAfterPurchase()
        setNotice(active ? t('paywall.restored') : t('paywall.syncing'))
      } else if (outcome === 'nothing-to-restore') {
        setNotice(t('paywall.nothingToRestore'))
      } else {
        // Restore can only be 'unavailable' when there is no billing backend at
        // all — a build-shaped fact, unlike a single plan being unbuyable.
        setNotice(t(isNativePlatform() ? 'paywall.unavailableNative' : 'paywall.unavailableWeb'))
      }
    } catch {
      setNotice(t('paywall.failed'))
    } finally {
      setBusy(null)
    }
  }

  /** "First week free" — the store's own introductory terms, if it has any. */
  function introLine(offer: Offer): string | null {
    const intro = offer.intro
    if (!intro) return null
    const [one, other] = INTRO_PERIOD_KEYS[intro.unit]
    const period = t(intro.count === 1 ? one : other, { count: intro.count })
    return intro.free
      ? t('paywall.introFree', { period })
      : t('paywall.introPaid', { price: intro.price, period })
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
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover)"
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

        {offers === null ? (
          <div className="flex min-h-24 items-center justify-center">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <div className="grid gap-sm sm:grid-cols-3">
            {offers.map((offer) => {
              const intro = introLine(offer)
              // A plan the store didn't answer for cannot be bought — a product
              // still awaiting review, or one missing from the current offering.
              // Better a disabled plan than a tap that fails. On the web nothing
              // comes from a store, so this must not apply there.
              const unbuyable = available && !offer.fromStore
              return (
                <button
                  key={offer.id}
                  type="button"
                  disabled={busy !== null || isAnonymous || unbuyable}
                  onClick={() => handleBuy(offer.id)}
                  className={`relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border p-md transition-all active:scale-98 disabled:opacity-50 ${
                    offer.id === 'yearly'
                      ? 'border-primary bg-primary text-on-primary'
                      : 'text-on-surface hover:border-primary glass-field'
                  }`}
                >
                  {offer.id === 'yearly' && (
                    <span className="absolute -top-2 rounded-full bg-tertiary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-tertiary">
                      {t('paywall.bestValue')}
                    </span>
                  )}
                  <span className="font-label-md text-label-md opacity-80">
                    {t(`paywall.${offer.id}`)}
                  </span>
                  <span className="font-headline-md text-headline-md">
                    {offer.id === 'monthly'
                      ? t('paywall.perMonth', { price: offer.price })
                      : offer.id === 'yearly'
                        ? t('paywall.perYear', { price: offer.price })
                        : t('paywall.once', { price: offer.price })}
                  </span>
                  {/* Both stores require introductory terms to be disclosed
                      wherever the price is, so it rides on the plan itself. */}
                  {intro && (
                    <span className="text-center font-label-md text-label-md opacity-90">
                      {intro}
                    </span>
                  )}
                  {busy === offer.id && <Spinner className="h-4 w-4" />}
                </button>
              )
            })}
          </div>
        )}

        {/* A build with no billing key configured. The two platforms fail for
            different reasons and need different words: natively the store keys
            are missing, and in a browser Web Billing is. Neither is the user's
            problem to solve, so neither message asks them to do anything. */}
        {!available && (
          <p className="font-label-md text-label-md text-on-surface-variant">
            {t(isNativePlatform() ? 'paywall.unavailableNative' : 'paywall.unavailableWeb')}
          </p>
        )}

        {/* Every plan disabled, on a build that can transact: the store didn't
            answer at all. Without this the paywall is three greyed-out cards and
            no reason why — and the answer, unusually, is "wait and retry". */}
        {available && offers !== null && offers.every((offer) => !offer.fromStore) && (
          <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
            {t('paywall.storeUnreachable')}
          </p>
        )}

        {/* Where the stores permit it, the same subscription can be bought on the
            web instead. A plain link that leaves the app, with the destination
            named — not a second in-app purchase flow, which is exactly what the
            entitlement does not allow. */}
        {linkOut && !isAnonymous && (
          <a
            href={EXTERNAL_PURCHASE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-col gap-1 rounded-lg glass-chip px-md py-sm transition-colors hover:bg-(--glass-chip-hover)"
          >
            <span className="flex items-center gap-2 font-label-md text-label-md text-primary">
              <Icon name="open_in_new" className="text-[16px]" />
              {t('paywall.buyOnWeb')}
            </span>
            {/* The destination is named rather than hidden behind "the web":
                Apple's external-link rules want the user to know where they are
                being sent, and it is the reassuring detail anyway. */}
            <span className="font-label-md text-label-md text-on-surface-variant">
              {t('paywall.buyOnWebNote', { site: externalPurchaseHost() })}
            </span>
          </a>
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

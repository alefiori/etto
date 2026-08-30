/**
 * What a purchase backend has to provide, and the vocabulary the UI speaks.
 *
 * Two backends implement this: `native.ts` over the store's own billing through
 * `@revenuecat/purchases-capacitor`, and `web.ts` over RevenueCat Web Billing
 * through `@revenuecat/purchases-js`. They share nothing but this file — the two
 * SDKs have different shapes, different error types and different notions of
 * what "restore" means — and `index.ts` picks between them.
 *
 * Neither backend is ever the authority on entitlement. Both report what a store
 * said; Pro is unlocked by `public.subscriptions`, which only the
 * `revenuecat-webhook` Edge Function writes. Both platforms therefore land in the
 * same table, which is why `store` in 0012 already allowed `'stripe'` alongside
 * the two app stores.
 */

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pro'

export type PlanId = 'monthly' | 'yearly' | 'lifetime'

export interface Plan {
  id: PlanId
  /**
   * Product identifier. The same string in App Store Connect, the Play Console
   * and Web Billing — RevenueCat allows one product id per store, and keeping
   * them identical is what lets `Offer.productId` be compared across platforms.
   */
  productId: string
  /** Localized price string from the store, or a fallback before it loads. */
  price: string
}

/**
 * Display prices. The store is the authority on what a user is actually
 * charged — these are what the paywall shows until a backend reports the real,
 * regionally-correct strings, and what a build with no key configured shows.
 */
export const PLANS: Plan[] = [
  { id: 'monthly', productId: 'etto_pro_monthly', price: '€3.99' },
  { id: 'yearly', productId: 'etto_pro_yearly', price: '€24.99' },
  { id: 'lifetime', productId: 'etto_pro_lifetime', price: '€49.99' },
]

/** An introductory offer or free trial a backend says this user is eligible for. */
export interface IntroOffer {
  /** Localized price of the intro period. */
  price: string
  /** True when the intro period costs nothing — i.e. a free trial. */
  free: boolean
  /** Length of the intro period, exactly as the backend reports it. */
  unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
  count: number
}

/** One purchasable plan as the paywall should render it. */
export interface Offer {
  id: PlanId
  productId: string
  price: string
  intro: IntroOffer | null
  /** True when `price` came from a store rather than from {@link PLANS}. */
  fromStore: boolean
}

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable' | 'failed'

/**
 * `'restored'` means a previous purchase was found and the entitlement is live.
 *
 * On the web there is nothing to restore in the store-billing sense — the
 * entitlement is attached to the Supabase user id, so signing in *is* the
 * restore — but the outcome is still reported the same way, because "did signing
 * in get my subscription back?" is the question the button answers on both
 * platforms.
 */
export type RestoreOutcome = 'restored' | 'nothing-to-restore' | 'unavailable'

/** The seam both backends implement. */
export interface PurchaseBackend {
  /** Point the SDK at a Supabase user, configuring it on first use. */
  identify(userId: string): Promise<void>
  /** Detach from the signed-out user, so the next one starts clean. */
  forget(): Promise<void>
  loadOffers(): Promise<Offer[]>
  purchase(id: PlanId): Promise<PurchaseOutcome>
  restore(): Promise<RestoreOutcome>
  /** Where the user cancels or changes payment method, or null if nowhere. */
  manageUrl(): Promise<string | null>
  /** Test seam: drop cached SDK state. */
  reset(): void
}

/**
 * The fallback offers — what a build with no key configured shows, and what
 * stands in when a store doesn't answer.
 */
export function defaultOffers(): Offer[] {
  return PLANS.map((plan) => ({
    id: plan.id,
    productId: plan.productId,
    price: plan.price,
    intro: null,
    fromStore: false,
  }))
}

/** Product id for a plan, as configured in every store. */
export function productIdFor(id: PlanId): string {
  return PLANS.find((plan) => plan.id === id)!.productId
}

/**
 * Map an ISO 8601 duration (`P1W`, `P3M`) or a `{ number, unit }` pair onto the
 * unit and count an {@link IntroOffer} carries.
 *
 * The two SDKs disagree about how they express a period — the Capacitor one
 * reports `periodUnit: 'MONTH'` plus a count, the web one an ISO duration string
 * or a `Period` object — so both funnel through here rather than each inventing
 * its own normalization.
 */
export function introPeriod(
  period: { number: number; unit: string } | string | null | undefined,
): Pick<IntroOffer, 'unit' | 'count'> | null {
  if (!period) return null
  if (typeof period === 'string') {
    // ISO 8601 duration, restricted to the single-component forms a
    // subscription period can actually take (P3D, P1W, P2M, P1Y).
    const m = /^P(\d+)([DWMY])$/.exec(period.trim().toUpperCase())
    if (!m) return null
    const unit = ({ D: 'DAY', W: 'WEEK', M: 'MONTH', Y: 'YEAR' } as const)[
      m[2] as 'D' | 'W' | 'M' | 'Y'
    ]
    return { unit, count: Number(m[1]) }
  }
  const unit = String(period.unit).toUpperCase()
  const singular = unit.endsWith('S') ? unit.slice(0, -1) : unit
  if (singular !== 'DAY' && singular !== 'WEEK' && singular !== 'MONTH' && singular !== 'YEAR') {
    return null
  }
  if (!Number.isFinite(period.number) || period.number <= 0) return null
  return { unit: singular, count: period.number }
}

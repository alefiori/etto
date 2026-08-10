/**
 * Store purchases.
 *
 * This is the seam the RevenueCat SDK plugs into. It is deliberately a thin
 * interface rather than a direct SDK import, for two reasons:
 *
 *   1. In-app purchase only exists on iOS and Android. On the web there is no
 *      store to buy from, and both Apple and Google require digital goods to be
 *      sold through their own billing anyway — so the web build reports the
 *      feature as unavailable rather than pretending, and the paywall says so.
 *   2. It keeps `@revenuecat/purchases-capacitor` out of the web bundle
 *      entirely, which matters because it carries native code.
 *
 * Wiring the native side (Phase 4, once the Capacitor shell exists):
 *
 *   npm i @revenuecat/purchases-capacitor
 *   Purchases.configure({ apiKey, appUserID: session.user.id })
 *
 * `appUserID` **must** be the Supabase user id. That is what the webhook reads
 * from `event.app_user_id` to find the row to write, and anything else — in
 * particular RevenueCat's own `$RCAnonymousID:` — is rejected there because
 * there is no account to attach the entitlement to.
 */

import { isNativePlatform } from './platform'

export type PlanId = 'monthly' | 'yearly' | 'lifetime'

export interface Plan {
  id: PlanId
  /** Store product identifier, configured in App Store Connect / Play Console. */
  productId: string
  /** Localized price string from the store, or a fallback before it loads. */
  price: string
}

/**
 * Display prices. The store is the authority on what a user is actually
 * charged — these are what the paywall shows until the SDK reports the real,
 * regionally-correct strings, and what the web build shows permanently.
 */
export const PLANS: Plan[] = [
  { id: 'monthly', productId: 'macrotrack_pro_monthly', price: '€3.99' },
  { id: 'yearly', productId: 'macrotrack_pro_yearly', price: '€24.99' },
  { id: 'lifetime', productId: 'macrotrack_pro_lifetime', price: '€49.99' },
]

export type PurchaseOutcome = 'purchased' | 'cancelled' | 'unavailable'
export type RestoreOutcome = 'restored' | 'nothing-to-restore' | 'unavailable'

/**
 * Whether this build can transact at all. False on the web.
 *
 * Keyed on the platform rather than on a bundled SDK, which is what keeps the
 * web build free of native imports.
 */
export function purchasesAvailable(): boolean {
  return isNativePlatform()
}

export async function purchasePlan(_plan: Plan): Promise<PurchaseOutcome> {
  if (!purchasesAvailable()) return 'unavailable'
  // Native implementation lands with the Capacitor shell; see the header.
  return 'unavailable'
}

export async function restorePurchases(): Promise<RestoreOutcome> {
  if (!purchasesAvailable()) return 'unavailable'
  return 'unavailable'
}

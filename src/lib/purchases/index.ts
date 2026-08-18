/**
 * Buying Pro, on whichever platform the app is running on.
 *
 * One interface, two backends:
 *
 *   - **Native** (`native.ts`) — the App Store and Play billing, through
 *     `@revenuecat/purchases-capacitor`. The only purchase path offered *inside*
 *     the native shell, because Apple 3.1.1 and Google Play Billing require it.
 *   - **Web** (`web.ts`) — RevenueCat Web Billing, through
 *     `@revenuecat/purchases-js`. A browser has no store to buy from, so this is
 *     the only path there.
 *
 * Both land in the same place. Entitlements are written **only** by the
 * `revenuecat-webhook` Edge Function into `public.subscriptions`, whose `store`
 * column has allowed `'stripe'` since 0012 — so a web purchase unlocks Pro in the
 * native apps too, with nothing further to build. Apple's guideline 3.1.3(b)
 * permits exactly that: honouring a subscription bought elsewhere. What it does
 * not generally permit is *advertising* the web checkout from inside the app —
 * see `externalPurchase.ts` for the narrow, explicitly-enabled cases where the
 * stores now do allow a link.
 *
 * Neither backend is ever the authority. Both report what a store said; the app
 * re-reads the server row afterwards (`waitForProEntitlement`).
 */

import { isNativePlatform } from '../platform'
import { nativeApiKey, nativeBackend } from './native'
import { webApiKey, webBackend } from './web'
import type { PlanId, PurchaseBackend, PurchaseOutcome, RestoreOutcome, Offer } from './types'

export {
  PLANS,
  PRO_ENTITLEMENT,
  defaultOffers,
  introPeriod,
  productIdFor,
  type IntroOffer,
  type Offer,
  type Plan,
  type PlanId,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './types'

/** The backend for this platform, whether or not it has a key configured. */
function backend(): PurchaseBackend {
  return isNativePlatform() ? nativeBackend : webBackend
}

/**
 * Whether this build can transact at all.
 *
 * True natively with a store key configured, and true in a browser with a Web
 * Billing key configured. False otherwise — a build with no key is a normal
 * state (CI, the e2e suite, a fresh clone), and reporting it honestly is what
 * keeps the paywall from failing on the first click.
 */
export function purchasesAvailable(): boolean {
  return isNativePlatform() ? nativeApiKey() !== null : webApiKey() !== null
}

/**
 * Point the SDK at a Supabase user id.
 *
 * Called from `EntitlementProvider` whenever the signed-in user changes, on both
 * platforms. `appUserID` **must** be the Supabase user id: it is what the webhook
 * reads from `event.app_user_id` to find the row to write, and both SDKs will
 * otherwise mint a `$RCAnonymousID:` the webhook rejects, because there would be
 * no account to attach the entitlement to. Guests are identified too — an
 * anonymous Supabase account's id survives being upgraded, so a purchase stays
 * attached across it.
 */
export function identifyPurchaser(userId: string): Promise<void> {
  return backend().identify(userId)
}

/** Detach from the signed-out user, so the next one starts clean. */
export function forgetPurchaser(): Promise<void> {
  return backend().forget()
}

/** What to show on the paywall, priced by the store where one answered. */
export function loadOffers(): Promise<Offer[]> {
  return backend().loadOffers()
}

export function purchasePlan(id: PlanId): Promise<PurchaseOutcome> {
  return backend().purchase(id)
}

export function restorePurchases(): Promise<RestoreOutcome> {
  return backend().restore()
}

/**
 * Where the user manages or cancels the subscription, per the store that sold
 * it: Apple's or Google's subscription settings, or RevenueCat's customer portal
 * for a web subscription. Null when there is nothing to manage — a lifetime
 * unlock has no subscription, and neither does a build with no key.
 */
export function manageSubscriptionUrl(): Promise<string | null> {
  return backend().manageUrl()
}

/** Test seam: drop cached SDK state on both backends. */
export function resetPurchasesForTests(): void {
  nativeBackend.reset()
  webBackend.reset()
}

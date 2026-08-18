/**
 * Store billing on iOS and Android, through `@revenuecat/purchases-capacitor`.
 *
 * Every SDK entry point is behind a dynamic import, which keeps the plugin — and
 * the native bridge code it registers — out of the web bundle entirely.
 *
 * This is the only purchase path the app offers *inside* the native shell, and it
 * has to be: Apple's guideline 3.1.1 and Google Play Billing require their own
 * billing for anything that unlocks features in the app. A web subscription is
 * still honoured natively — the entitlement is read from the server, not from
 * this SDK — and where the stores now permit it the paywall may additionally link
 * out to web checkout; see `externalPurchase.ts`, which is a link, not a backend.
 */

import { platform } from '../platform'
import {
  PRO_ENTITLEMENT,
  defaultOffers,
  introPeriod,
  productIdFor,
  type IntroOffer,
  type Offer,
  type PlanId,
  type PurchaseBackend,
  type PurchaseOutcome,
  type RestoreOutcome,
} from './types'

// Type-only references, so nothing from the plugin is emitted into the bundle.
type Sdk = typeof import('@revenuecat/purchases-capacitor')
type Package = import('@revenuecat/purchases-capacitor').PurchasesPackage
type Offering = import('@revenuecat/purchases-capacitor').PurchasesOffering

/**
 * The publishable API key for this platform, or null when none is configured.
 *
 * A native build with no key is a real state — CI builds one, and so does anyone
 * who cloned the repo — so it reports purchases as unavailable rather than
 * letting `configure` throw on the first tap.
 */
export function nativeApiKey(): string | null {
  const key =
    platform() === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_KEY
      : platform() === 'android'
        ? import.meta.env.VITE_REVENUECAT_ANDROID_KEY
        : undefined
  const trimmed = typeof key === 'string' ? key.trim() : ''
  return trimmed === '' ? null : trimmed
}

// Module state. `configured` and `identity` are separate because logOut()
// leaves the SDK configured under a fresh anonymous id — so the next sign-in
// has to logIn(), not configure() again (which the SDK treats as an error).
let sdkPromise: Promise<Sdk> | null = null
let configured = false
let identity: string | null = null
/** Packages from the current offering, keyed by our plan id. */
let packages: Partial<Record<PlanId, Package>> = {}

async function sdk(): Promise<Sdk | null> {
  if (nativeApiKey() === null) return null
  sdkPromise ??= import('@revenuecat/purchases-capacitor')
  try {
    return await sdkPromise
  } catch {
    // A shell built before the plugin was added has no bridge to import.
    sdkPromise = null
    return null
  }
}

function introOf(pkg: Package): IntroOffer | null {
  const intro = pkg.product.introPrice
  if (!intro) return null
  const period = introPeriod({
    number: intro.periodNumberOfUnits,
    unit: String(intro.periodUnit),
  })
  if (!period) return null
  return { price: intro.priceString, free: intro.price === 0, ...period }
}

/**
 * The current offering's packages, mapped onto our three plans.
 *
 * Matched by RevenueCat's own package types first (`$rc_monthly` and friends,
 * which is what the dashboard's default packages use) and by product identifier
 * second, so an offering assembled from custom packages still resolves.
 */
function mapPackages(offering: Offering): Partial<Record<PlanId, Package>> {
  const byProduct = (productId: string) =>
    offering.availablePackages.find((p) => p.product.identifier === productId) ?? undefined
  return {
    monthly: offering.monthly ?? byProduct(productIdFor('monthly')),
    yearly: offering.annual ?? byProduct(productIdFor('yearly')),
    lifetime: offering.lifetime ?? byProduct(productIdFor('lifetime')),
  }
}

function isCancellation(error: unknown, codes: Sdk['PURCHASES_ERROR_CODE']): boolean {
  if (typeof error !== 'object' || error === null) return false
  const e = error as { code?: unknown; userCancelled?: unknown }
  if (e.userCancelled === true) return true
  return e.code != null && String(e.code) === String(codes.PURCHASE_CANCELLED_ERROR)
}

function grantsPro(customerInfo: { entitlements: { active: Record<string, unknown> } }): boolean {
  return PRO_ENTITLEMENT in customerInfo.entitlements.active
}

export const nativeBackend: PurchaseBackend = {
  /**
   * Never throws — a purchase attempt reports its own failure, and start-up must
   * not depend on the store being reachable.
   */
  async identify(userId: string): Promise<void> {
    const mod = await sdk()
    if (!mod) return
    try {
      if (!configured) {
        await mod.Purchases.configure({ apiKey: nativeApiKey()!, appUserID: userId })
        configured = true
        identity = userId
        return
      }
      if (identity !== userId) {
        await mod.Purchases.logIn({ appUserID: userId })
        identity = userId
        packages = {} // Offerings can differ per user (targeting rules).
      }
    } catch (e) {
      console.error('could not identify the purchaser', e)
    }
  },

  async forget(): Promise<void> {
    if (!configured || identity === null) return
    const mod = await sdk()
    if (!mod) return
    try {
      await mod.Purchases.logOut()
    } catch (e) {
      console.error('could not sign the purchaser out', e)
    } finally {
      identity = null
      packages = {}
    }
  },

  /**
   * Falls back to {@link defaultOffers} for any plan the store didn't answer
   * for, so the paywall always renders three plans — a missing package means
   * "this one can't be bought right now", which the paywall shows as a disabled
   * plan, rather than a hole in the layout.
   */
  async loadOffers(): Promise<Offer[]> {
    const mod = await sdk()
    if (!mod) return defaultOffers()
    try {
      const { current } = await mod.Purchases.getOfferings()
      if (!current) return defaultOffers()
      packages = mapPackages(current)
      return defaultOffers().map((fallback) => {
        const pkg = packages[fallback.id]
        if (!pkg) return fallback
        return {
          id: fallback.id,
          productId: pkg.product.identifier,
          price: pkg.product.priceString,
          intro: introOf(pkg),
          fromStore: true,
        }
      })
    } catch (e) {
      console.error('could not load offerings', e)
      return defaultOffers()
    }
  },

  /**
   * `'purchased'` means the store took the money *and* reported the entitlement
   * active. The server row is written by the webhook moments later, which is why
   * the caller polls for it rather than unlocking on this return value.
   */
  async purchase(id: PlanId): Promise<PurchaseOutcome> {
    const mod = await sdk()
    if (!mod) return 'unavailable'
    if (!packages[id]) await this.loadOffers()
    const pkg = packages[id]
    if (!pkg) return 'unavailable'

    try {
      const { customerInfo } = await mod.Purchases.purchasePackage({ aPackage: pkg })
      if (grantsPro(customerInfo)) return 'purchased'
      // The purchase went through but the product isn't attached to the `pro`
      // entitlement in the dashboard. Nothing the user can do; don't claim
      // success for something that unlocked nothing.
      console.error(
        `purchase of ${pkg.product.identifier} granted no ${PRO_ENTITLEMENT} entitlement`,
      )
      return 'failed'
    } catch (e) {
      if (isCancellation(e, mod.PURCHASES_ERROR_CODE)) return 'cancelled'
      console.error('purchase failed', e)
      return 'failed'
    }
  },

  async restore(): Promise<RestoreOutcome> {
    const mod = await sdk()
    if (!mod) return 'unavailable'
    const { customerInfo } = await mod.Purchases.restorePurchases()
    return grantsPro(customerInfo) ? 'restored' : 'nothing-to-restore'
  },

  async manageUrl(): Promise<string | null> {
    const mod = await sdk()
    if (!mod) return null
    try {
      const { customerInfo } = await mod.Purchases.getCustomerInfo()
      return customerInfo.managementURL ?? null
    } catch (e) {
      console.error('could not read the management URL', e)
      return null
    }
  },

  reset(): void {
    sdkPromise = null
    configured = false
    identity = null
    packages = {}
  },
}

/**
 * The App Store / Play storefront country, uppercased, or null.
 *
 * Read from the store rather than from the device locale or the browser
 * timezone: the storefront is what decides which of Apple's and Google's
 * regional rules apply to this install, and someone with an Italian phone
 * language can perfectly well be on the US storefront. Used only by
 * `externalPurchase.ts`.
 */
export async function storefrontCountry(): Promise<string | null> {
  const mod = await sdk()
  if (!mod) return null
  try {
    const storefront = await mod.Purchases.getStorefront()
    const code = storefront?.countryCode
    return typeof code === 'string' && code.trim() !== '' ? code.trim().toUpperCase() : null
  } catch (e) {
    console.error('could not read the storefront', e)
    return null
  }
}

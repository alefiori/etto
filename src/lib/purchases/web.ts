/**
 * Web billing, through RevenueCat Web Billing (`@revenuecat/purchases-js`).
 *
 * Why this exists at all: the app is a PWA first, and until now the web build
 * could show a paywall but never take a payment. It could not use the app
 * stores — there is no store in a browser — and it must not be the purchase path
 * *inside* the native shell, where Apple 3.1.1 and Google Play Billing require
 * their own billing.
 *
 * Why Web Billing rather than talking to Stripe directly: entitlements arrive
 * through the **same** `revenuecat-webhook` the app stores already use, as
 * `store: 'STRIPE'` — which `normalize.ts` has always mapped and `0012`'s check
 * constraint has always allowed. That keeps one webhook to secure, one table as
 * the source of truth, and one place where "is this person Pro right now?" is
 * answered, rather than a second billing integration with its own signature
 * verification and its own replay guards to get right.
 *
 * The SDK is behind a dynamic import for the same reason the native one is: it
 * mounts its own checkout UI and pulls in a fair amount of code, none of which a
 * session that never opens the paywall should download.
 *
 * **A purchase here unlocks Pro everywhere**, including in the native apps, with
 * no extra work: `isPro` is read from `public.subscriptions`, never from an SDK
 * cache, and Apple's guideline 3.1.3(b) explicitly permits honouring a
 * subscription bought elsewhere.
 */

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

type Sdk = typeof import('@revenuecat/purchases-js')
type Purchases = import('@revenuecat/purchases-js').Purchases
type Package = import('@revenuecat/purchases-js').Package
type Offering = import('@revenuecat/purchases-js').Offering
type Product = import('@revenuecat/purchases-js').Product
type CustomerInfo = import('@revenuecat/purchases-js').CustomerInfo

/**
 * The Web Billing publishable key, or null when none is configured.
 *
 * A separate key from the two mobile ones — RevenueCat issues one per store —
 * and unset is a normal state: it is what CI, the e2e suite and a fresh clone
 * build, and what makes the paywall say purchases are unavailable instead of
 * failing on the first click.
 */
export function webApiKey(): string | null {
  const key = import.meta.env.VITE_REVENUECAT_WEB_KEY
  const trimmed = typeof key === 'string' ? key.trim() : ''
  return trimmed === '' ? null : trimmed
}

let sdkPromise: Promise<Sdk> | null = null
let client: Purchases | null = null
let identity: string | null = null
let packages: Partial<Record<PlanId, Package>> = {}

async function sdk(): Promise<Sdk | null> {
  if (webApiKey() === null) return null
  sdkPromise ??= import('@revenuecat/purchases-js')
  try {
    return await sdkPromise
  } catch {
    sdkPromise = null
    return null
  }
}

/**
 * The product carrying a package's price.
 *
 * `webBillingProduct` is the current field; `rcBillingProduct` is its older
 * name, still populated. Preferring the new one and falling back keeps this
 * working across the SDK's rename rather than pinning us to one minor version.
 */
function productOf(pkg: Package): Product {
  return pkg.webBillingProduct ?? pkg.rcBillingProduct
}

/**
 * A free trial or introductory price, whichever the product carries.
 *
 * A trial wins when both are present: it is the stronger offer and the one the
 * stores require to be disclosed first. `price` is null on a trial phase, which
 * is precisely what makes it free.
 */
function introOf(pkg: Package): IntroOffer | null {
  const product = productOf(pkg)
  const phase = product.freeTrialPhase ?? product.introPricePhase
  if (!phase) return null
  const period = introPeriod(phase.period ?? phase.periodDuration)
  if (!period) return null
  return {
    price: phase.price?.formattedPrice ?? '',
    free: phase.price == null || phase.price.amountMicros === 0,
    ...period,
  }
}

function mapPackages(offering: Offering): Partial<Record<PlanId, Package>> {
  const byProduct = (productId: string) =>
    offering.availablePackages.find((p) => productOf(p).identifier === productId) ?? undefined
  return {
    monthly: offering.monthly ?? byProduct(productIdFor('monthly')),
    yearly: offering.annual ?? byProduct(productIdFor('yearly')),
    lifetime: offering.lifetime ?? byProduct(productIdFor('lifetime')),
  }
}

function grantsPro(customerInfo: CustomerInfo): boolean {
  return PRO_ENTITLEMENT in customerInfo.entitlements.active
}

/** `ErrorCode.UserCancelledError`, without importing the enum as a value. */
function isCancellation(error: unknown, codes: Sdk['ErrorCode']): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { errorCode?: unknown }).errorCode
  return code != null && code === codes.UserCancelledError
}

export const webBackend: PurchaseBackend = {
  /**
   * Configure once, then `changeUser` for every later change.
   *
   * `appUserId` is the Supabase user id here exactly as it is natively — it is
   * what the webhook resolves back to a row, and the web SDK will happily mint
   * an anonymous `$RCAnonymousID:` of its own if left to itself, which the
   * webhook rejects because there would be no account to attach Pro to.
   */
  async identify(userId: string): Promise<void> {
    const mod = await sdk()
    if (!mod) return
    try {
      if (!client) {
        client = mod.Purchases.configure({ apiKey: webApiKey()!, appUserId: userId })
        identity = userId
        return
      }
      if (identity !== userId) {
        await client.changeUser(userId)
        identity = userId
        packages = {}
      }
    } catch (e) {
      console.error('could not identify the purchaser', e)
    }
  },

  /**
   * Tear the instance down rather than aliasing to an anonymous id.
   *
   * The web SDK has no `logOut`, and `changeUser` to a generated anonymous id
   * would leave a stray RevenueCat customer behind on every sign-out. The next
   * sign-in configures a fresh instance, which is cheap.
   */
  async forget(): Promise<void> {
    if (!client) return
    try {
      client.close()
    } catch (e) {
      console.error('could not close the purchases client', e)
    } finally {
      client = null
      identity = null
      packages = {}
    }
  },

  async loadOffers(): Promise<Offer[]> {
    const mod = await sdk()
    if (!mod || !client) return defaultOffers()
    try {
      const { current } = await client.getOfferings()
      if (!current) return defaultOffers()
      packages = mapPackages(current)
      return defaultOffers().map((fallback) => {
        const pkg = packages[fallback.id]
        if (!pkg) return fallback
        const product = productOf(pkg)
        return {
          id: fallback.id,
          productId: product.identifier,
          price: product.currentPrice.formattedPrice,
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
   * Mounts RevenueCat's checkout over the page and resolves when it closes.
   *
   * No `htmlTarget`: the SDK appends its own root to the body, which is what we
   * want — the paywall is already a modal, and rendering a second payment form
   * inside it would inherit the modal's scroll lock and its stacking context.
   */
  async purchase(id: PlanId): Promise<PurchaseOutcome> {
    const mod = await sdk()
    if (!mod || !client) return 'unavailable'
    if (!packages[id]) await this.loadOffers()
    const pkg = packages[id]
    if (!pkg) return 'unavailable'

    try {
      const { customerInfo } = await client.purchase({ rcPackage: pkg })
      if (grantsPro(customerInfo)) return 'purchased'
      console.error(
        `purchase of ${productOf(pkg).identifier} granted no ${PRO_ENTITLEMENT} entitlement`,
      )
      return 'failed'
    } catch (e) {
      if (isCancellation(e, mod.ErrorCode)) return 'cancelled'
      console.error('purchase failed', e)
      return 'failed'
    }
  },

  /**
   * There is nothing to "restore" from a browser in the store-billing sense —
   * the entitlement is attached to the Supabase user id, so signing in already
   * did it. Reading customer info is the honest equivalent: it answers "did
   * signing in get my subscription back?", which is what the button asks.
   */
  async restore(): Promise<RestoreOutcome> {
    const mod = await sdk()
    if (!mod || !client) return 'unavailable'
    const customerInfo = await client.getCustomerInfo()
    return grantsPro(customerInfo) ? 'restored' : 'nothing-to-restore'
  },

  async manageUrl(): Promise<string | null> {
    const mod = await sdk()
    if (!mod || !client) return null
    try {
      const customerInfo = await client.getCustomerInfo()
      return customerInfo.managementURL ?? null
    } catch (e) {
      console.error('could not read the management URL', e)
      return null
    }
  },

  reset(): void {
    // Deliberately not calling close(): reset() is a test seam, and a half-built
    // instance from a failed configure has nothing to close.
    sdkPromise = null
    client = null
    identity = null
    packages = {}
  },
}

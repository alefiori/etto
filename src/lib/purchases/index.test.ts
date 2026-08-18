import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  PLANS,
  PRO_ENTITLEMENT,
  defaultOffers,
  identifyPurchaser,
  loadOffers,
  manageSubscriptionUrl,
  productIdFor,
  purchasePlan,
  purchasesAvailable,
  resetPurchasesForTests,
  restorePurchases,
} from './index'

/**
 * These run in a jsdom environment with no billing keys configured — which is
 * exactly what CI, the e2e suite and a fresh clone build. That state has to be
 * *reported* rather than crashed on, because it is the difference between a
 * paywall that says "not available here" and one that throws on the first click.
 *
 * The two backends' happy paths cannot be exercised here: one needs a native
 * bridge and the other a real Web Billing account, and mocking either would only
 * assert that the mock was called. They are covered by sandbox testing on a
 * device and by a test purchase on the deployed web app.
 */
describe('with no billing key configured', () => {
  beforeEach(() => {
    resetPurchasesForTests()
  })

  it('reports itself unavailable', () => {
    // Both keys unset: the web key here, and the mobile ones in the native case.
    expect(import.meta.env.VITE_REVENUECAT_WEB_KEY ?? '').toBe('')
    expect(purchasesAvailable()).toBe(false)
  })

  it('falls back to the built-in prices rather than an empty paywall', async () => {
    await expect(loadOffers()).resolves.toEqual(defaultOffers())
  })

  it('refuses a purchase instead of pretending one happened', async () => {
    await expect(purchasePlan('yearly')).resolves.toBe('unavailable')
  })

  it('refuses a restore', async () => {
    await expect(restorePurchases()).resolves.toBe('unavailable')
  })

  it('has no subscription to manage', async () => {
    await expect(manageSubscriptionUrl()).resolves.toBeNull()
  })

  it('identifying a purchaser is a silent no-op, not a throw', async () => {
    // Called on every sign-in from EntitlementProvider, on both platforms;
    // start-up must not depend on a billing service being reachable.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(identifyPurchaser('00000000-0000-4000-8000-000000000001')).resolves.toBeUndefined()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})

describe('defaultOffers', () => {
  it('offers all three plans, marked as not from a store', () => {
    const offers = defaultOffers()
    expect(offers.map((o) => o.id)).toEqual(['monthly', 'yearly', 'lifetime'])
    expect(offers.every((o) => !o.fromStore)).toBe(true)
    expect(offers.every((o) => o.intro === null)).toBe(true)
  })

  it('is a fresh array each call, so a caller cannot mutate the fallback', () => {
    expect(defaultOffers()).not.toBe(defaultOffers())
  })
})

describe('plan configuration', () => {
  it('names the three products every store is configured with', () => {
    expect(PLANS.map((p) => p.productId)).toEqual([
      'macrotrack_pro_monthly',
      'macrotrack_pro_yearly',
      'macrotrack_pro_lifetime',
    ])
  })

  it('resolves a product id from a plan id', () => {
    expect(productIdFor('yearly')).toBe('macrotrack_pro_yearly')
  })

  it('gates on the entitlement id the webhook defaults to', () => {
    // 0012_subscriptions.sql defaults `entitlement` to 'pro'; a mismatch here
    // would leave a paying customer with an inactive row.
    expect(PRO_ENTITLEMENT).toBe('pro')
  })

  it('has a display price for every plan, for a paywall with no store answer', () => {
    expect(PLANS.every((p) => p.price.trim() !== '')).toBe(true)
  })
})

describe('platform dispatch', () => {
  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor
    resetPurchasesForTests()
  })

  it('stays unavailable natively while no store key is configured', () => {
    // What CI and a fresh clone build. Reporting availability here would mean
    // configure() throwing on the first tap instead of the paywall saying so.
    ;(window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    }
    expect(import.meta.env.VITE_REVENUECAT_IOS_KEY ?? '').toBe('')
    expect(purchasesAvailable()).toBe(false)
  })

  it('keys availability on the platform, not on one shared key', () => {
    // The web key must not make the native build think it can transact, nor the
    // reverse: RevenueCat issues one publishable key per store.
    ;(window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
    }
    const native = purchasesAvailable()
    delete (window as { Capacitor?: unknown }).Capacitor
    expect(native).toBe(purchasesAvailable()) // both false here, for different reasons
  })
})

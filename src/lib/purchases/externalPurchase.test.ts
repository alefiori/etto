import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  EXTERNAL_PURCHASE_COUNTRIES,
  EXTERNAL_PURCHASE_URL,
  countryAllowsExternalPurchase,
  externalPurchaseAllowed,
  externalPurchaseEnabled,
  externalPurchaseHost,
} from './externalPurchase'

/**
 * The gate on linking out of the native apps to web checkout.
 *
 * Every one of these tests exists because the failure mode is asymmetric: a link
 * shown where it isn't permitted risks the app being pulled, while a link
 * withheld where it is permitted only costs a percentage. So the tests are
 * written from the direction of "prove it stays closed".
 */
describe('externalPurchaseEnabled', () => {
  it('is off unless the build explicitly opts in', () => {
    // The default, and what CI and a fresh clone build. Apple has to grant
    // com.apple.developer.storekit.external-purchase-link before this may be on,
    // and no build made before that paperwork exists should carry the link.
    expect(import.meta.env.VITE_EXTERNAL_PURCHASE_LINK ?? '').toBe('')
    expect(externalPurchaseEnabled()).toBe(false)
  })
})

describe('countryAllowsExternalPurchase', () => {
  it('allows the United States, post-injunction', () => {
    expect(countryAllowsExternalPurchase('US')).toBe(true)
  })

  it('allows EU member states, under the DMA', () => {
    expect(countryAllowsExternalPurchase('IT')).toBe(true)
    expect(countryAllowsExternalPurchase('DE')).toBe(true)
    expect(countryAllowsExternalPurchase('IE')).toBe(true)
  })

  it('does not allow the wider EEA, which the DMA does not cover', () => {
    // Norway, Iceland and Liechtenstein follow EU rules in many areas but are
    // not bound by the DMA, and guessing in the permissive direction is the
    // expensive mistake here.
    expect(countryAllowsExternalPurchase('NO')).toBe(false)
    expect(countryAllowsExternalPurchase('IS')).toBe(false)
    expect(countryAllowsExternalPurchase('LI')).toBe(false)
  })

  it('does not allow the UK, Switzerland, or anywhere else', () => {
    expect(countryAllowsExternalPurchase('GB')).toBe(false)
    expect(countryAllowsExternalPurchase('CH')).toBe(false)
    expect(countryAllowsExternalPurchase('JP')).toBe(false)
    expect(countryAllowsExternalPurchase('BR')).toBe(false)
  })

  it('normalizes case and whitespace, since storefront codes come from an SDK', () => {
    expect(countryAllowsExternalPurchase(' it ')).toBe(true)
    expect(countryAllowsExternalPurchase('us')).toBe(true)
  })

  it('treats an unknown storefront as not permitted', () => {
    expect(countryAllowsExternalPurchase(null)).toBe(false)
    expect(countryAllowsExternalPurchase('')).toBe(false)
  })

  it('lists 27 EU states plus the US, and nothing else', () => {
    expect(EXTERNAL_PURCHASE_COUNTRIES).toHaveLength(28)
    expect(new Set(EXTERNAL_PURCHASE_COUNTRIES).size).toBe(28)
  })
})

describe('externalPurchaseAllowed', () => {
  afterEach(() => {
    delete (window as { Capacitor?: unknown }).Capacitor
  })

  it('is false in a browser — the web paywall is already the web checkout', async () => {
    await expect(externalPurchaseAllowed()).resolves.toBe(false)
  })

  it('is false natively while the build has not opted in', async () => {
    ;(window as { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
    }
    await expect(externalPurchaseAllowed()).resolves.toBe(false)
  })
})

describe('EXTERNAL_PURCHASE_URL', () => {
  it('lands on a page that opens checkout, not on the dashboard', () => {
    // AppShellProvider reads ?checkout=pro. The stores permit one link; spending
    // it on a page the user then has to navigate from would waste it.
    expect(EXTERNAL_PURCHASE_URL).toContain('checkout=pro')
  })

  it('is absolute, because natively the origin is capacitor://localhost', () => {
    expect(EXTERNAL_PURCHASE_URL.startsWith('https://')).toBe(true)
  })

  it('names a host for the disclosure sentence', () => {
    expect(externalPurchaseHost()).not.toBe('')
    expect(externalPurchaseHost()).not.toContain('/')
  })
})

describe('the regions declared to Apple', () => {
  it('match the regions the app will show the link in', () => {
    // Info.plist's SKExternalPurchaseLink is written by patch-ios-project.mjs
    // from its own copy of this list — it is plain Node and cannot import from
    // src/. A link shown without a matching declaration is a rejection, so the
    // two lists are compared here rather than trusted to stay in step.
    const script = readFileSync('scripts/patch-ios-project.mjs', 'utf8')
    const block = /export const EXTERNAL_PURCHASE_REGIONS = \[([\s\S]*?)\]/.exec(script)?.[1] ?? ''
    const declared = [...block.matchAll(/'([A-Z]{2})'/g)].map((m) => m[1])
    expect(declared.sort()).toEqual([...EXTERNAL_PURCHASE_COUNTRIES].sort())
  })
})

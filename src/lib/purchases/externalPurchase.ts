/**
 * Linking out from the native apps to web checkout.
 *
 * This is **not** a purchase backend. Inside the native shell, buying goes
 * through store billing (`native.ts`) — Apple's guideline 3.1.1 and Google Play
 * Billing require it. What this adds is a *link* to the web paywall, which both
 * stores have been compelled to permit in some regions: the United States,
 * following the injunction in *Epic v. Apple* (and its Google counterpart), and
 * the European Union under the Digital Markets Act.
 *
 * Three things have to be true before the link is shown, and all three are
 * checked:
 *
 *   1. **Apple has granted the entitlement.** A link-out without
 *      `com.apple.developer.external-purchase-link` is a rejection, and the
 *      entitlement has to be requested from Apple and approved before it can even
 *      be added to a build. That approval is not something the app can detect, so
 *      it is represented by an explicit build flag, `VITE_EXTERNAL_PURCHASE_LINK`.
 *      Default off — which means CI, a fresh clone and every build made before the
 *      paperwork exists cannot accidentally ship a link that gets the app pulled.
 *   2. **The storefront is a region that allows it.** Read from the store, not
 *      from the device language or timezone: the storefront decides which
 *      regional rules apply to an install, and someone with an Italian phone
 *      language can perfectly well be on the US storefront.
 *   3. **The user has a real account.** A guest's anonymous Supabase session
 *      cannot be signed into on the web, so linking one out would strand them on
 *      a checkout page they cannot authenticate against. The paywall enforces
 *      this, the same way it already refuses to sell to a guest.
 *
 * **This list is legal policy, not a technical constant.** It has changed
 * repeatedly since 2024 and will change again; re-check it against Apple's and
 * Google's current terms before every submission. Getting it wrong in the
 * permissive direction risks the app, not just the feature.
 */

import { isNativePlatform } from '../platform'
import { SITE_URL } from '../legal'
import { storefrontCountry } from './native'

/**
 * The 27 EU member states, where the DMA applies, plus the United States.
 *
 * Deliberately the EU rather than the wider EEA: the DMA binds the Union, and
 * Iceland, Liechtenstein and Norway are not covered by it, however much the
 * three usually travel with EU rules elsewhere.
 */
export const EXTERNAL_PURCHASE_COUNTRIES: readonly string[] = [
  'US',
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR',
  'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI',
  'SK',
]

/**
 * Whether this build was made with Apple's (and Google's) permission in hand.
 *
 * Anything other than an explicit `1`/`true` is off, so a typo in a CI variable
 * fails safe rather than enabling a link the app has no entitlement for.
 */
export function externalPurchaseEnabled(): boolean {
  const flag = import.meta.env.VITE_EXTERNAL_PURCHASE_LINK
  const value = typeof flag === 'string' ? flag.trim().toLowerCase() : ''
  return value === '1' || value === 'true'
}

/** Whether a storefront is one of the regions that currently permits a link. */
export function countryAllowsExternalPurchase(country: string | null): boolean {
  if (!country) return false
  return EXTERNAL_PURCHASE_COUNTRIES.includes(country.trim().toUpperCase())
}

/**
 * Where the link goes: the deployed web app, told to open its paywall.
 *
 * `?checkout=pro` is read by AppShellProvider, so the link lands on a checkout
 * rather than on a dashboard the user then has to go hunting through. Absolute,
 * and built from the same `SITE_URL` the legal documents use — natively the origin
 * is `capacitor://localhost`, so a relative URL would resolve inside the WebView
 * and 404.
 */
export const EXTERNAL_PURCHASE_URL = `${SITE_URL}/?checkout=pro`

/** Just the host, for telling the user where the link is about to take them. */
export function externalPurchaseHost(): string {
  try {
    return new URL(SITE_URL).host
  } catch {
    // A malformed VITE_SITE_URL shouldn't blank the sentence around it.
    return SITE_URL.replace(/^https?:\/\//, '')
  }
}

/**
 * Whether to offer the link on this device right now.
 *
 * Async because the storefront is a store round trip. Errs to `false` on any
 * uncertainty — an unknown storefront is not a permitted one.
 */
export async function externalPurchaseAllowed(): Promise<boolean> {
  // On the web the paywall *is* the web checkout; there is nothing to link to.
  if (!isNativePlatform()) return false
  if (!externalPurchaseEnabled()) return false
  return countryAllowsExternalPurchase(await storefrontCountry())
}

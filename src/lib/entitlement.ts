/**
 * Reading the Pro entitlement.
 *
 * The row is written only by the revenuecat-webhook Edge Function; the client
 * has select and nothing else. This module is the read side plus the small
 * amount of policy around what to do when the read fails.
 */

import { supabase } from './supabase'
import type { Subscription } from './database.types'

/**
 * A null expiry means the entitlement never expires — that is how the lifetime
 * unlock is stored, so it must read as active rather than as long-expired.
 */
export function isSubscriptionActive(
  sub: Pick<Subscription, 'expires_at'> | null,
  now = Date.now(),
): boolean {
  if (!sub) return false
  if (sub.expires_at == null) return true
  const at = Date.parse(sub.expires_at)
  return Number.isNaN(at) ? false : at > now
}

/** The caller's own entitlement row, or null if they have never subscribed. */
export async function fetchSubscription(): Promise<Subscription | null> {
  const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}

/**
 * How long to keep re-reading the entitlement after a purchase, in ms between
 * attempts. Roughly ten seconds in total.
 *
 * The store returns from `purchasePackage` the moment payment clears, but the
 * row this app gates on is written by RevenueCat's webhook a beat later. Without
 * the wait, the paywall would close onto a still-locked feature and look like it
 * had taken the money for nothing. The delays grow because the first attempt
 * usually wins and a tight loop would just hammer PostgREST.
 */
const PURCHASE_SYNC_DELAYS_MS = [0, 700, 1300, 2000, 3000, 3000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Re-read the entitlement until it is active, or until the attempts run out.
 *
 * Returns whatever it saw last — an inactive or missing row included, which the
 * caller shows as "the purchase went through, give it a moment". Read errors are
 * swallowed between attempts for the same reason the provider keeps stale
 * state: a failed read is not evidence that a purchase didn't happen.
 */
export async function waitForProEntitlement(
  delays: number[] = PURCHASE_SYNC_DELAYS_MS,
): Promise<Subscription | null> {
  let last: Subscription | null = null
  for (const delay of delays) {
    if (delay > 0) await sleep(delay)
    try {
      last = await fetchSubscription()
      if (isSubscriptionActive(last)) return last
    } catch {
      // Keep trying; the webhook may still be in flight either way.
    }
  }
  return last
}

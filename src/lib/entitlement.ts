/**
 * Reading the Pro entitlement.
 *
 * The row is written only by the revenuecat-webhook Edge Function; the client
 * has select and nothing else. This module is the read side plus the small
 * amount of policy around what to do when the read fails.
 */

import { supabase } from './supabase'
import type { Subscription } from './database.types'

/** Features gated behind Pro. Free keeps everything the app shipped with. */
export type ProFeature = 'adaptive-targets' | 'weight-trends' | 'hydration-reminders' | 'export'

export const PRO_FEATURES: ProFeature[] = [
  'adaptive-targets',
  'weight-trends',
  'hydration-reminders',
  'export',
]

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

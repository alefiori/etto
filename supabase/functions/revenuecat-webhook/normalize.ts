// Pure RevenueCat-event -> subscriptions-row mapping.
//
// Deno-free on purpose so it can be unit-tested from Vitest, exactly as
// food-search/normalize.ts is. index.ts keeps the fetch/env/auth concerns.
//
// The two things worth getting right here are both about trust:
//
//   1. RevenueCat is the source of truth, because it is the only party that has
//      verified the receipt with Apple or Google. Nothing the client says is
//      consulted.
//   2. Webhooks retry, and retries arrive out of order. An EXPIRATION delivered
//      after the RENEWAL that superseded it would revoke a paying customer's
//      access. `shouldApply` is what stops that.

export interface RevenueCatEvent {
  id?: string
  type?: string
  /** RevenueCat's app_user_id — we set it to the Supabase user id. */
  app_user_id?: string
  original_app_user_id?: string
  product_id?: string
  period_type?: string
  store?: string
  environment?: string
  entitlement_id?: string | null
  entitlement_ids?: string[] | null
  original_transaction_id?: string
  purchased_at_ms?: number
  expiration_at_ms?: number | null
  event_timestamp_ms?: number
}

export interface SubscriptionRow {
  user_id: string
  entitlement: string
  product_id: string | null
  store: string
  period_type: string
  original_transaction_id: string | null
  /** ISO timestamp, or null for an entitlement that never expires. */
  expires_at: string | null
  billing_issue: boolean
  last_event_id: string | null
  last_event_at: string
}

/** Existing row state, as far as ordering is concerned. */
export interface ExistingState {
  last_event_id?: string | null
  last_event_at?: string | null
}

const STORES: Record<string, string> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  STRIPE: 'stripe',
  PROMOTIONAL: 'promotional',
}

const PERIOD_TYPES: Record<string, string> = {
  NORMAL: 'normal',
  TRIAL: 'trial',
  INTRO: 'intro',
}

/**
 * Event types that revoke access outright.
 *
 * Note CANCELLATION is *not* here: cancelling turns off auto-renewal but the
 * user keeps what they paid for until expiration_at_ms. Treating it as a
 * revocation would cut off someone mid-term who has already paid.
 */
const REVOKING_TYPES = new Set(['EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED'])

/** Types that mean "still entitled, but the store is having trouble billing". */
const BILLING_ISSUE_TYPES = new Set(['BILLING_ISSUE'])

/** Types this function knows how to act on. Anything else is acknowledged and ignored. */
export const HANDLED_TYPES = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'CANCELLATION',
  'BILLING_ISSUE',
  'EXPIRATION',
  'REFUND',
  'SUBSCRIPTION_PAUSED',
  'TRANSFER',
])

export function isHandled(type: string | undefined): boolean {
  return type != null && HANDLED_TYPES.has(type)
}

export function isRevoking(type: string | undefined): boolean {
  return type != null && REVOKING_TYPES.has(type)
}

/**
 * Whether this event should be written, given what the row already reflects.
 *
 * Rejects an exact replay of the last event, and any event stamped earlier than
 * the one already applied. Equal timestamps from a different event are allowed
 * through: RevenueCat can emit two events in the same millisecond (a
 * CANCELLATION and the PRODUCT_CHANGE that caused it), and dropping the second
 * would lose real state.
 */
export function shouldApply(event: RevenueCatEvent, existing: ExistingState | null): boolean {
  if (!existing) return true

  if (event.id && existing.last_event_id && event.id === existing.last_event_id) return false

  const incoming = event.event_timestamp_ms
  if (incoming == null || !existing.last_event_at) return true

  const applied = Date.parse(existing.last_event_at)
  if (Number.isNaN(applied)) return true

  return incoming >= applied
}

/**
 * Map an event onto the row to store.
 *
 * `userId` is passed in rather than trusted from the payload's app_user_id so
 * the caller can decide how to resolve it (and reject anything that isn't a
 * plain Supabase user id).
 */
export function toSubscriptionRow(
  event: RevenueCatEvent,
  userId: string,
  defaultEntitlement = 'pro',
): SubscriptionRow {
  const entitlement =
    event.entitlement_id ??
    (Array.isArray(event.entitlement_ids) && event.entitlement_ids.length > 0
      ? event.entitlement_ids[0]
      : null) ??
    defaultEntitlement

  // A revoking event sets expiry to the event time, so access ends now rather
  // than at whatever the last-known expiry was.
  const expiresAt = isRevoking(event.type)
    ? new Date(event.event_timestamp_ms ?? Date.now()).toISOString()
    : msToIso(event.expiration_at_ms)

  return {
    user_id: userId,
    entitlement,
    product_id: event.product_id ?? null,
    store: STORES[event.store ?? ''] ?? 'unknown',
    period_type: PERIOD_TYPES[event.period_type ?? ''] ?? 'normal',
    original_transaction_id: event.original_transaction_id ?? null,
    expires_at: expiresAt,
    billing_issue: BILLING_ISSUE_TYPES.has(event.type ?? ''),
    last_event_id: event.id ?? null,
    last_event_at: new Date(event.event_timestamp_ms ?? Date.now()).toISOString(),
  }
}

/**
 * NULL expiry means "never expires" — a lifetime unlock — so it reads as
 * active, not as long-expired.
 */
export function isActive(row: { expires_at: string | null }, now = Date.now()): boolean {
  if (row.expires_at == null) return true
  const at = Date.parse(row.expires_at)
  return Number.isNaN(at) ? false : at > now
}

function msToIso(ms: number | null | undefined): string | null {
  if (ms == null) return null
  const n = Number(ms)
  return Number.isFinite(n) ? new Date(n).toISOString() : null
}

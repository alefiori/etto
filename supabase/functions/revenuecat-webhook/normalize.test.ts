import { describe, it, expect } from 'vitest'
import {
  shouldApply,
  toSubscriptionRow,
  isActive,
  isHandled,
  isRevoking,
  type RevenueCatEvent,
} from './normalize'

const USER = '00000000-0000-4000-8000-000000000001'
const T0 = Date.parse('2026-06-01T12:00:00.000Z')

function event(overrides: Partial<RevenueCatEvent> = {}): RevenueCatEvent {
  return {
    id: 'evt-1',
    type: 'INITIAL_PURCHASE',
    app_user_id: USER,
    product_id: 'pro_monthly',
    period_type: 'NORMAL',
    store: 'APP_STORE',
    original_transaction_id: 'txn-1',
    purchased_at_ms: T0,
    expiration_at_ms: T0 + 30 * 86_400_000,
    event_timestamp_ms: T0,
    ...overrides,
  }
}

describe('isHandled / isRevoking', () => {
  it('recognises the event types it acts on', () => {
    expect(isHandled('RENEWAL')).toBe(true)
    expect(isHandled('EXPIRATION')).toBe(true)
  })

  it('ignores anything unknown rather than guessing', () => {
    expect(isHandled('SOMETHING_NEW')).toBe(false)
    expect(isHandled(undefined)).toBe(false)
  })

  it('treats expiry and refund as revoking', () => {
    expect(isRevoking('EXPIRATION')).toBe(true)
    expect(isRevoking('REFUND')).toBe(true)
  })

  it('does not treat cancellation as revoking', () => {
    // Cancelling stops auto-renewal; the user keeps what they already paid for
    // until the period ends.
    expect(isRevoking('CANCELLATION')).toBe(false)
  })
})

describe('shouldApply', () => {
  it('applies anything when there is no existing row', () => {
    expect(shouldApply(event(), null)).toBe(true)
  })

  it('rejects an exact replay of the last event', () => {
    expect(shouldApply(event({ id: 'evt-1' }), { last_event_id: 'evt-1' })).toBe(false)
  })

  it('rejects an event stamped before the one already applied', () => {
    const existing = { last_event_id: 'evt-2', last_event_at: new Date(T0).toISOString() }
    expect(shouldApply(event({ id: 'evt-1', event_timestamp_ms: T0 - 60_000 }), existing)).toBe(false)
  })

  it('does not let a late EXPIRATION revoke a live renewal', () => {
    // The exact production hazard: a retried EXPIRATION arriving after the
    // RENEWAL that superseded it.
    const afterRenewal = {
      last_event_id: 'evt-renewal',
      last_event_at: new Date(T0 + 1000).toISOString(),
    }
    const lateExpiry = event({ id: 'evt-expire', type: 'EXPIRATION', event_timestamp_ms: T0 })
    expect(shouldApply(lateExpiry, afterRenewal)).toBe(false)
  })

  it('applies a newer event', () => {
    const existing = { last_event_id: 'evt-1', last_event_at: new Date(T0).toISOString() }
    expect(shouldApply(event({ id: 'evt-2', event_timestamp_ms: T0 + 1000 }), existing)).toBe(true)
  })

  it('allows a different event sharing the same millisecond', () => {
    const existing = { last_event_id: 'evt-1', last_event_at: new Date(T0).toISOString() }
    expect(shouldApply(event({ id: 'evt-2', event_timestamp_ms: T0 }), existing)).toBe(true)
  })

  it('applies when the stored timestamp is unusable rather than getting stuck', () => {
    const existing = { last_event_id: 'evt-1', last_event_at: 'not-a-date' }
    expect(shouldApply(event({ id: 'evt-2' }), existing)).toBe(true)
  })

  it('applies when the event carries no timestamp', () => {
    const existing = { last_event_id: 'evt-1', last_event_at: new Date(T0).toISOString() }
    expect(shouldApply(event({ id: 'evt-2', event_timestamp_ms: undefined }), existing)).toBe(true)
  })
})

describe('toSubscriptionRow', () => {
  it('maps a purchase onto the row', () => {
    const row = toSubscriptionRow(event(), USER)
    expect(row).toMatchObject({
      user_id: USER,
      product_id: 'pro_monthly',
      store: 'app_store',
      period_type: 'normal',
      original_transaction_id: 'txn-1',
      billing_issue: false,
      last_event_id: 'evt-1',
    })
    expect(row.expires_at).toBe(new Date(T0 + 30 * 86_400_000).toISOString())
  })

  it('takes the user id from the caller, not from the payload', () => {
    const row = toSubscriptionRow(event({ app_user_id: 'someone-else' }), USER)
    expect(row.user_id).toBe(USER)
  })

  it('normalises store names and falls back to unknown', () => {
    expect(toSubscriptionRow(event({ store: 'PLAY_STORE' }), USER).store).toBe('play_store')
    expect(toSubscriptionRow(event({ store: 'MAC_APP_STORE' }), USER).store).toBe('app_store')
    expect(toSubscriptionRow(event({ store: 'WHO_KNOWS' }), USER).store).toBe('unknown')
  })

  it('normalises the period type', () => {
    expect(toSubscriptionRow(event({ period_type: 'TRIAL' }), USER).period_type).toBe('trial')
    expect(toSubscriptionRow(event({ period_type: 'INTRO' }), USER).period_type).toBe('intro')
    expect(toSubscriptionRow(event({ period_type: 'MYSTERY' }), USER).period_type).toBe('normal')
  })

  it('stores a lifetime purchase as never expiring', () => {
    const row = toSubscriptionRow(
      event({ type: 'NON_RENEWING_PURCHASE', expiration_at_ms: null }),
      USER,
    )
    expect(row.expires_at).toBeNull()
  })

  it('ends access now on a revoking event, not at the old expiry', () => {
    const row = toSubscriptionRow(
      event({ type: 'REFUND', expiration_at_ms: T0 + 30 * 86_400_000 }),
      USER,
    )
    expect(row.expires_at).toBe(new Date(T0).toISOString())
    expect(isActive(row, T0 + 1000)).toBe(false)
  })

  it('keeps access through a cancellation until the period ends', () => {
    const row = toSubscriptionRow(event({ type: 'CANCELLATION' }), USER)
    expect(isActive(row, T0 + 1000)).toBe(true)
  })

  it('flags a billing issue without revoking', () => {
    const row = toSubscriptionRow(event({ type: 'BILLING_ISSUE' }), USER)
    expect(row.billing_issue).toBe(true)
    expect(isActive(row, T0 + 1000)).toBe(true)
  })

  it('prefers an explicit entitlement id', () => {
    expect(toSubscriptionRow(event({ entitlement_id: 'plus' }), USER).entitlement).toBe('plus')
  })

  it('falls back to the first of entitlement_ids, then to the default', () => {
    expect(
      toSubscriptionRow(event({ entitlement_id: null, entitlement_ids: ['gold'] }), USER)
        .entitlement,
    ).toBe('gold')
    expect(
      toSubscriptionRow(event({ entitlement_id: null, entitlement_ids: [] }), USER).entitlement,
    ).toBe('pro')
  })
})

describe('isActive', () => {
  it('is true while the expiry is in the future', () => {
    expect(isActive({ expires_at: new Date(T0 + 1000).toISOString() }, T0)).toBe(true)
  })

  it('is false once the expiry has passed', () => {
    expect(isActive({ expires_at: new Date(T0 - 1000).toISOString() }, T0)).toBe(false)
  })

  it('treats a null expiry as a lifetime unlock, not as long-expired', () => {
    expect(isActive({ expires_at: null }, T0)).toBe(true)
  })

  it('fails closed on an unparseable expiry', () => {
    expect(isActive({ expires_at: 'nonsense' }, T0)).toBe(false)
  })
})

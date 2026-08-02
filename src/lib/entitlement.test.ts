import { describe, it, expect } from 'vitest'
import { isSubscriptionActive } from './entitlement'

const NOW = Date.parse('2026-06-01T12:00:00.000Z')

describe('isSubscriptionActive', () => {
  it('is false when there is no subscription at all', () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false)
  })

  it('is true while the expiry is in the future', () => {
    expect(isSubscriptionActive({ expires_at: new Date(NOW + 86_400_000).toISOString() }, NOW)).toBe(
      true,
    )
  })

  it('is false once the expiry has passed', () => {
    expect(isSubscriptionActive({ expires_at: new Date(NOW - 1000).toISOString() }, NOW)).toBe(false)
  })

  it('is false exactly at the expiry instant', () => {
    expect(isSubscriptionActive({ expires_at: new Date(NOW).toISOString() }, NOW)).toBe(false)
  })

  it('treats a null expiry as the lifetime unlock', () => {
    // The lifetime purchase is stored with no expiry; reading that as
    // "expired at the epoch" would lock out everyone who bought it.
    expect(isSubscriptionActive({ expires_at: null }, NOW)).toBe(true)
  })

  it('fails closed on an unparseable expiry', () => {
    expect(isSubscriptionActive({ expires_at: 'not-a-date' }, NOW)).toBe(false)
  })
})

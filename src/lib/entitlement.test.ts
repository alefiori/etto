import { describe, it, expect, vi, afterEach } from 'vitest'
import { isSubscriptionActive, waitForProEntitlement } from './entitlement'
import { supabase } from './supabase'
import type { Subscription } from './database.types'

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

function row(overrides: Partial<Subscription> = {}): Subscription {
  return {
    user_id: 'u1',
    entitlement: 'pro',
    product_id: 'etto_pro_yearly',
    store: 'app_store',
    period_type: 'normal',
    original_transaction_id: 'txn-1',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    billing_issue: false,
    last_event_id: 'evt-1',
    last_event_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Stub the one read `fetchSubscription` makes, answer by answer. */
function stubReads(answers: (
  | { data: Subscription | null; error: null }
  | { data: null; error: { message: string } }
)[]) {
  let call = 0
  return vi.spyOn(supabase, 'from').mockImplementation(
    () =>
      ({
        select: () => ({
          maybeSingle: async () => answers[Math.min(call++, answers.length - 1)],
        }),
      }) as never,
  )
}

describe('waitForProEntitlement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns as soon as the entitlement is active', async () => {
    const from = stubReads([{ data: row(), error: null }])
    // Zero delays: the timing policy is not what is under test, the number of
    // reads is.
    await expect(waitForProEntitlement([0, 0, 0])).resolves.toMatchObject({ entitlement: 'pro' })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('keeps polling while the webhook has not landed yet', async () => {
    // The store returns from purchasePackage before the webhook writes the row,
    // which is the whole reason this function exists.
    const from = stubReads([
      { data: null, error: null },
      { data: null, error: null },
      { data: row(), error: null },
    ])
    await expect(waitForProEntitlement([0, 0, 0, 0])).resolves.not.toBeNull()
    expect(from).toHaveBeenCalledTimes(3)
  })

  it('gives up after the attempts run out, returning what it last saw', async () => {
    // A lapsed subscriber who re-buys the wrong product ends up here: there is
    // a row, it just isn't active. Returning it beats returning null — the
    // caller reports "still syncing" rather than "nothing found".
    const expired = row({ expires_at: '2020-01-01T00:00:00.000Z' })
    const from = stubReads([{ data: expired, error: null }])
    await expect(waitForProEntitlement([0, 0])).resolves.toBe(expired)
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('swallows a read error and tries again', async () => {
    // A failed read is not evidence that a purchase didn't happen.
    stubReads([
      { data: null, error: { message: 'network down' } },
      { data: row(), error: null },
    ])
    await expect(waitForProEntitlement([0, 0, 0])).resolves.not.toBeNull()
  })

  it('resolves null when every attempt fails', async () => {
    stubReads([{ data: null, error: { message: 'network down' } }])
    await expect(waitForProEntitlement([0, 0])).resolves.toBeNull()
  })
})

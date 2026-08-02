import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { Subscription } from '@/lib/database.types'

const h = vi.hoisted(() => ({
  fetchSubscription: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
  authLoading: false,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading }),
}))
vi.mock('@/lib/entitlement', async () => {
  const actual = await vi.importActual<typeof import('@/lib/entitlement')>('@/lib/entitlement')
  return { ...actual, fetchSubscription: h.fetchSubscription }
})

import { EntitlementProvider, useEntitlement } from './EntitlementContext'

function sub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    user_id: 'user-1',
    entitlement: 'pro',
    product_id: 'pro_monthly',
    store: 'app_store',
    period_type: 'normal',
    original_transaction_id: 'txn-1',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    billing_issue: false,
    last_event_id: 'evt-1',
    last_event_at: new Date().toISOString(),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function Probe() {
  const { isPro, loading, hasBillingIssue, error } = useEntitlement()
  return (
    <div>
      <span data-testid="pro">{String(isPro)}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="billing">{String(hasBillingIssue)}</span>
      <span data-testid="error">{String(error)}</span>
    </div>
  )
}

const renderProvider = () =>
  render(
    <EntitlementProvider>
      <Probe />
    </EntitlementProvider>,
  )

const pro = () => screen.getByTestId('pro').textContent

beforeEach(() => {
  vi.clearAllMocks()
  h.user = { id: 'user-1' }
  h.authLoading = false
  h.fetchSubscription.mockResolvedValue(null)
})

describe('EntitlementProvider', () => {
  it('is not Pro for someone who has never subscribed', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(pro()).toBe('false')
  })

  it('unlocks Pro for a live subscription', async () => {
    h.fetchSubscription.mockResolvedValue(sub())
    renderProvider()
    await waitFor(() => expect(pro()).toBe('true'))
  })

  it('does not unlock Pro for an expired one', async () => {
    h.fetchSubscription.mockResolvedValue(sub({ expires_at: '2020-01-01T00:00:00.000Z' }))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(pro()).toBe('false')
  })

  it('unlocks Pro for a lifetime purchase with no expiry', async () => {
    h.fetchSubscription.mockResolvedValue(sub({ expires_at: null }))
    renderProvider()
    await waitFor(() => expect(pro()).toBe('true'))
  })

  it('keeps Pro through a billing issue, and reports it', async () => {
    h.fetchSubscription.mockResolvedValue(sub({ billing_issue: true }))
    renderProvider()
    await waitFor(() => expect(pro()).toBe('true'))
    expect(screen.getByTestId('billing')).toHaveTextContent('true')
  })

  it('fails closed for someone it has never seen an entitlement for', async () => {
    h.fetchSubscription.mockRejectedValue(new Error('offline'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    // A read failure must not hand out Pro to a non-subscriber.
    expect(pro()).toBe('false')
    expect(screen.getByTestId('error')).toHaveTextContent('offline')
  })

  it('is not Pro when signed out', async () => {
    h.user = null
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(pro()).toBe('false')
    expect(h.fetchSubscription).not.toHaveBeenCalled()
  })
})

describe('useEntitlement outside a provider', () => {
  it('reports not-Pro instead of throwing', () => {
    // A missing provider must never be the reason a paywall is bypassed.
    render(<Probe />)
    expect(pro()).toBe('false')
  })
})

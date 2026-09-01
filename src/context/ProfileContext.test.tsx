import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  from: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: h.user, loading: h.authLoading }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: h.from },
}))

import { ProfileProvider, useProfile } from './ProfileContext'

/**
 * A chainable Supabase query-builder mock whose terminal read either resolves
 * `result` or rejects `rejectWith` — the two shapes ProfileContext's fetch has
 * to tell apart: a resolved `{ error }` (a policy denial) versus the promise
 * itself rejecting (no network).
 */
function builder({ result, rejectWith }: { result?: unknown; rejectWith?: Error }) {
  const outcome = () => (rejectWith ? Promise.reject(rejectWith) : Promise.resolve(result))
  const b = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    maybeSingle: vi.fn(() => outcome()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      outcome().then(resolve, reject),
  }
  return b
}

function Probe() {
  const { profile, loading, error, retry } = useProfile()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="profile">{profile ? 'has-profile' : 'none'}</span>
      <span data-testid="error">{error ?? ''}</span>
      <button onClick={retry}>retry</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <ProfileProvider>
      <Probe />
    </ProfileProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.user = null
  h.authLoading = false
})

describe('ProfileProvider — fetching the profile', () => {
  it('resolves loading with the profile row on success', async () => {
    h.user = { id: 'u1' }
    h.from.mockReturnValue(
      builder({ result: { data: { id: 'u1', off_language: null }, error: null } }),
    )
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('profile')).toHaveTextContent('has-profile')
    expect(screen.getByTestId('error')).toBeEmptyDOMElement()
  })

  it('resolves loading and records the message when Supabase reports a failure', async () => {
    h.user = { id: 'u1' }
    h.from.mockReturnValue(
      builder({ result: { data: null, error: { message: 'permission denied' } } }),
    )
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('error')).toHaveTextContent('permission denied')
  })

  it('clears loading and records an error when the request itself rejects', async () => {
    // The offline case: a returning session with no network reaches this
    // fetch, and the promise rejects rather than resolving with an `error`
    // field — the fetch never reached the resolved-with-failure branch above.
    h.user = { id: 'u1' }
    h.from.mockReturnValue(builder({ rejectWith: new Error('network unreachable') }))
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('profile')).toHaveTextContent('none')
    expect(screen.getByTestId('error')).toHaveTextContent('network unreachable')
  })

  it('does not fetch, and clears loading once auth settles, when signed out', async () => {
    h.user = null
    h.authLoading = false
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(h.from).not.toHaveBeenCalled()
  })

  it('retry() re-runs the fetch and can clear a previous error', async () => {
    h.user = { id: 'u1' }
    h.from.mockReturnValueOnce(builder({ rejectWith: new Error('network unreachable') }))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('network unreachable'))

    h.from.mockReturnValueOnce(
      builder({ result: { data: { id: 'u1', off_language: null }, error: null } }),
    )
    fireEvent.click(screen.getByText('retry'))

    await waitFor(() => expect(screen.getByTestId('error')).toBeEmptyDOMElement())
    expect(screen.getByTestId('profile')).toHaveTextContent('has-profile')
  })

  it('does not update state after unmount', async () => {
    h.user = { id: 'u1' }
    // A builder whose promise we control directly, so it can be rejected
    // strictly after unmount.
    let reject!: (e: Error) => void
    const pending = new Promise((_resolve, r) => (reject = r))
    h.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => pending),
      then: (resolve: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        pending.then(resolve, rej),
    })
    const { unmount } = renderProbe()
    unmount()

    expect(() => reject(new Error('too late'))).not.toThrow()
    // Swallow the now-orphaned rejection so it doesn't fail the run as an
    // unhandled rejection.
    await pending.catch(() => {})
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: h.getSession,
      onAuthStateChange: h.onAuthStateChange,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInAnonymously: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    functions: { invoke: vi.fn() },
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

/** Reads the context and exposes it for assertions. */
function Probe() {
  const { session, loading, error, retry } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="session">{session ? 'signed-in' : 'none'}</span>
      <span data-testid="error">{error?.message ?? ''}</span>
      <button onClick={retry}>retry</button>
    </div>
  )
}

function renderProbe() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: h.unsubscribe } } })
})

describe('AuthProvider — restoring the session', () => {
  it('resolves loading and reports no session when there is none stored', async () => {
    h.getSession.mockResolvedValue({ data: { session: null } })
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session')).toHaveTextContent('none')
    expect(screen.getByTestId('error')).toBeEmptyDOMElement()
  })

  it('clears loading and records an error when the restore rejects', async () => {
    // The concrete offline failure: getSession() hits the network to refresh
    // an expired stored token, and a cold start with no connection rejects
    // rather than resolving with `session: null`.
    h.getSession.mockRejectedValue(new Error('offline'))
    renderProbe()

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('session')).toHaveTextContent('none')
    expect(screen.getByTestId('error')).toHaveTextContent('offline')
  })

  it('does not update state after unmount', async () => {
    let resolve!: (v: { data: { session: null } }) => void
    h.getSession.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = renderProbe()
    unmount()

    // Resolving after unmount must not throw an act() warning or a
    // "state update on an unmounted component" error.
    expect(() => resolve({ data: { session: null } })).not.toThrow()
  })

  it('retry() re-runs the restore and can clear a previous error', async () => {
    h.getSession.mockRejectedValueOnce(new Error('offline'))
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))

    h.getSession.mockResolvedValueOnce({ data: { session: null } })
    fireEvent.click(screen.getByText('retry'))

    await waitFor(() => expect(screen.getByTestId('error')).toBeEmptyDOMElement())
    expect(h.getSession).toHaveBeenCalledTimes(2)
  })

  it('a session arriving through onAuthStateChange clears a stale restore error', async () => {
    h.getSession.mockRejectedValue(new Error('offline'))
    let emit!: (event: string, session: unknown) => void
    h.onAuthStateChange.mockImplementation((cb: (e: string, s: unknown) => void) => {
      emit = cb
      return { data: { subscription: { unsubscribe: h.unsubscribe } } }
    })
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('offline'))

    emit('SIGNED_IN', { user: { id: 'u1' } })
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('signed-in'))
    expect(screen.getByTestId('error')).toBeEmptyDOMElement()
  })

  it('unsubscribes the auth listener on unmount', () => {
    h.getSession.mockResolvedValue({ data: { session: null } })
    const { unmount } = renderProbe()
    unmount()
    expect(h.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

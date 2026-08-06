import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const h = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
  session: null as { user: { id: string } } | null,
  loading: false,
  locale: 'en',
  isLocaleExplicit: false,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: h.session,
    loading: h.loading,
    signInAnonymously: h.signInAnonymously,
  }),
}))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ locale: h.locale, isLocaleExplicit: h.isLocaleExplicit }),
}))

import { RequireAuth } from './RequireAuth'

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <p>the app</p>
            </RequireAuth>
          }
        />
        <Route path="/signin" element={<p>sign in screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.session = null
  h.loading = false
  h.locale = 'en'
  h.isLocaleExplicit = false
  h.signInAnonymously.mockResolvedValue(undefined)
})

describe('RequireAuth', () => {
  it('renders the app when there is already a session', () => {
    h.session = { user: { id: 'user-1' } }
    renderGuard()
    expect(screen.getByText('the app')).toBeInTheDocument()
    expect(h.signInAnonymously).not.toHaveBeenCalled()
  })

  it('starts a guest session instead of showing a login wall', async () => {
    renderGuard()
    await waitFor(() => expect(h.signInAnonymously).toHaveBeenCalledTimes(1))
    // No redirect to the auth screen.
    expect(screen.queryByText('sign in screen')).not.toBeInTheDocument()
  })

  it('does not pin a locale the user never chose', async () => {
    renderGuard()
    await waitFor(() => expect(h.signInAnonymously).toHaveBeenCalledWith(undefined))
  })

  it('passes an explicitly chosen locale so the account keeps it', async () => {
    h.isLocaleExplicit = true
    h.locale = 'it'
    renderGuard()
    await waitFor(() => expect(h.signInAnonymously).toHaveBeenCalledWith('it'))
  })

  it('waits rather than signing in twice while auth is still loading', () => {
    h.loading = true
    renderGuard()
    expect(h.signInAnonymously).not.toHaveBeenCalled()
  })

  it('only starts one guest session across re-renders', async () => {
    const { rerender } = renderGuard()
    await waitFor(() => expect(h.signInAnonymously).toHaveBeenCalledTimes(1))

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <p>the app</p>
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    expect(h.signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('falls back to the sign-in screen when anonymous sign-in is unavailable', async () => {
    // The realistic cause: anonymous sign-ins disabled on the project, or the
    // per-IP hourly limit hit. Getting stuck on a spinner would be worse.
    h.signInAnonymously.mockRejectedValue(new Error('anonymous sign-ins disabled'))
    renderGuard()
    expect(await screen.findByText('sign in screen')).toBeInTheDocument()
  })

  it('mints a fresh guest after a sign-out leaves no session', async () => {
    // Sign-out no longer routes to a login wall: the guard just hands back
    // another guest, the app's default state.
    renderGuard()
    await waitFor(() => expect(h.signInAnonymously).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('sign in screen')).not.toBeInTheDocument()
  })
})

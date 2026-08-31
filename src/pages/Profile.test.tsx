import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { renderWithProviders as render } from '@/test/utils'
import userEvent from '@testing-library/user-event'

interface ProfileStub {
  locale: string
  setLocale: (c: string) => Promise<void> | void
  isLocaleExplicit: boolean
  loading: boolean
  profile: Record<string, unknown> | null
  unitSystem: string
  updateProfile: (patch: Record<string, unknown>) => Promise<void>
}

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
  user: { email: 'sam@example.com' } as { email: string } | null,
  isAnonymous: false,
  setLocale: vi.fn(),
  updateProfile: vi.fn(),
  openPaywall: vi.fn(),
  isPro: false,
  profile: null as unknown as ProfileStub,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: h.user,
    isAnonymous: h.isAnonymous,
    signOut: h.signOut,
    deleteAccount: h.deleteAccount,
  }),
}))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => h.profile,
}))
// The page now carries three Pro-gated sections (reminders, export, and the
// subscription card). Each reads the shell for `openPaywall`, which throws
// outside a provider by design, and the entitlement for the gate — so both are
// stubbed here, defaulting to a free account. The gated behaviour itself is
// covered by e2e/pro.spec.ts against a real entitlement row.
vi.mock('@/context/AppShellContext', () => ({
  // `_registerRefresh` is how the page declares what pull-to-refresh does;
  // outside the real shell it registers into nothing.
  useAppShell: () => ({ openPaywall: h.openPaywall, _registerRefresh: () => {} }),
}))
vi.mock('@/context/EntitlementContext', () => ({
  useEntitlement: () => ({
    isPro: h.isPro,
    subscription: null,
    hasBillingIssue: false,
    loading: false,
    error: null,
    refetch: vi.fn(),
    syncAfterPurchase: vi.fn(),
  }),
}))
// The meals section has its own test — stub it out to a stable, empty list.
vi.mock('@/context/MealsContext', () => ({
  useMeals: () => ({
    meals: [],
    loading: false,
    error: null,
    atLimit: false,
    labelFor: (key: string) => key,
    addMeal: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    refetch: vi.fn(),
  }),
}))

import Profile from './Profile'
import { ThemeProvider } from '@/context/ThemeContext'

/**
 * The appearance control is the one part of this page that needs a real
 * provider — everything else here reads a mocked context. ThemeProvider sits on
 * the mocked ProfileContext above, so the profile write it makes is `h.updateProfile`.
 */
const renderThemed = () =>
  render(
    <ThemeProvider>
      <Profile />
    </ThemeProvider>,
  )

function stubProfile(overrides: Partial<ProfileStub> = {}): ProfileStub {
  return {
    locale: 'en',
    setLocale: h.setLocale,
    isLocaleExplicit: true,
    loading: false,
    profile: null,
    unitSystem: 'metric',
    updateProfile: h.updateProfile,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // ThemeProvider writes to <html>, which RTL's cleanup does not undo.
  document.documentElement.classList.remove('dark')
  h.profile = stubProfile()
  h.user = { email: 'sam@example.com' }
  h.isAnonymous = false
  h.isPro = false
})

/**
 * Language is a disclosure row now, so it opens before the picker exists. See
 * SettingsRow. `fireEvent` keeps the synchronous tests synchronous.
 */
function openLanguage() {
  fireEvent.click(screen.getByRole('button', { name: /^Language/ }))
}

describe('Profile page', () => {
  it('shows the signed-in email', () => {
    render(<Profile />)
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
  })

  it('says so while the language just follows the device', () => {
    h.profile = stubProfile({ isLocaleExplicit: false })
    render(<Profile />)
    openLanguage()
    expect(screen.getByText('Following your device language.')).toBeInTheDocument()
  })

  it('drops the device-language note once a language is chosen', () => {
    render(<Profile />) // isLocaleExplicit: true
    openLanguage()
    expect(screen.queryByText('Following your device language.')).not.toBeInTheDocument()
  })

  it('saves the language when the picker changes', async () => {
    h.setLocale.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Profile />)
    openLanguage()

    // The page now has several selects (body metrics), so target this one by
    // its label rather than assuming it is the only combobox.
    await user.selectOptions(screen.getByLabelText('Language'), 'it')
    expect(h.setLocale).toHaveBeenCalledWith('it')
  })

  it('labels a guest rather than showing a blank email', () => {
    // Guests are the default entry point now, so this is the common case.
    h.isAnonymous = true
    h.user = null
    render(<Profile />)
    expect(screen.getByText('Guest account')).toBeInTheDocument()
  })

  it('starts the appearance control on System, since nothing is chosen', () => {
    renderThemed()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked()
  })

  it('applies and remembers the chosen appearance', async () => {
    const user = userEvent.setup()
    renderThemed()

    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('etto.theme')).toBe('dark')
  })

  it('reports a failed appearance save', async () => {
    h.profile = stubProfile({ profile: { theme: null } })
    h.updateProfile.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderThemed()

    await user.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(
      await screen.findByText('Could not save appearance. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('signs out when the sign-out button is clicked', async () => {
    h.signOut.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Profile />)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  /**
   * Apple's guideline 5.1.1(v) makes this a submission requirement, so these
   * cover that the control is reachable and that it asks first — a delete that
   * fires straight off the button would be a worse bug than not having one.
   */
  describe('deleting the account', () => {
    it('asks for confirmation before deleting anything', async () => {
      const user = userEvent.setup()
      render(<Profile />)

      await user.click(screen.getByRole('button', { name: 'Delete account' }))

      expect(await screen.findByText('Delete your account?')).toBeInTheDocument()
      expect(h.deleteAccount).not.toHaveBeenCalled()
    })

    it('deletes once confirmed', async () => {
      h.deleteAccount.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(<Profile />)

      await user.click(screen.getByRole('button', { name: 'Delete account' }))
      await user.click(await screen.findByRole('button', { name: 'Delete permanently' }))

      expect(h.deleteAccount).toHaveBeenCalledTimes(1)
    })

    it('is not offered to a guest at all', async () => {
      // A guest never created an account: there are no credentials to revoke
      // and nothing to sign back into, so the whole section goes rather than
      // showing an irreversible button for an account that does not exist yet.
      // Signing in — the control directly above it — is what a guest actually
      // wants from this part of the page.
      h.isAnonymous = true
      h.user = null
      render(<Profile />)

      expect(screen.queryByRole('button', { name: /delete account/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })

    it('reports a failure rather than pretending the account is gone', async () => {
      h.deleteAccount.mockRejectedValue(new Error('nope'))
      const user = userEvent.setup()
      render(<Profile />)

      await user.click(screen.getByRole('button', { name: 'Delete account' }))
      await user.click(await screen.findByRole('button', { name: 'Delete permanently' }))

      expect(
        await screen.findByText('Could not delete your account. Please try again.'),
      ).toBeInTheDocument()
    })
  })
})

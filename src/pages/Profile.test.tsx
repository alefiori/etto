import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  setLocale: vi.fn(),
  updateProfile: vi.fn(),
  profile: null as unknown as ProfileStub,
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'sam@example.com' }, signOut: h.signOut }),
}))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => h.profile,
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
  h.profile = stubProfile()
})

describe('Profile page', () => {
  it('shows the signed-in email', () => {
    render(<Profile />)
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
  })

  it('says so while the language just follows the device', () => {
    h.profile = stubProfile({ isLocaleExplicit: false })
    render(<Profile />)
    expect(screen.getByText('Following your device language.')).toBeInTheDocument()
  })

  it('drops the device-language note once a language is chosen', () => {
    render(<Profile />) // isLocaleExplicit: true
    expect(screen.queryByText('Following your device language.')).not.toBeInTheDocument()
  })

  it('saves the language when the picker changes', async () => {
    h.setLocale.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Profile />)

    // The page now has several selects (body metrics), so target this one by
    // its label rather than assuming it is the only combobox.
    await user.selectOptions(screen.getByLabelText('Language'), 'it')
    expect(h.setLocale).toHaveBeenCalledWith('it')
  })

  it('signs out when the sign-out button is clicked', async () => {
    h.signOut.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Profile />)

    // The sign-out control is the button in the error-container card.
    const buttons = screen.getAllByRole('button')
    await user.click(buttons[buttons.length - 1])
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })
})

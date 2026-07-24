import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  signOut: vi.fn(),
  setLocale: vi.fn(),
  profile: { locale: 'en', setLocale: vi.fn(), loading: false } as {
    locale: string
    setLocale: (c: string) => Promise<void> | void
    loading: boolean
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'sam@example.com' }, signOut: h.signOut }),
}))
vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => h.profile,
}))

import Profile from './Profile'

beforeEach(() => {
  vi.clearAllMocks()
  h.profile = { locale: 'en', setLocale: h.setLocale, loading: false }
})

describe('Profile page', () => {
  it('shows the signed-in email', () => {
    render(<Profile />)
    expect(screen.getByText('sam@example.com')).toBeInTheDocument()
  })

  it('saves the language when the picker changes', async () => {
    h.setLocale.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Profile />)

    await user.selectOptions(screen.getByRole('combobox'), 'it')
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

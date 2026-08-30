import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '@/lib/database.types'
import type { ThemePreference } from '@/lib/theme'

const h = vi.hoisted(() => ({
  profile: null as Partial<Profile> | null,
  updateProfile: vi.fn(),
  syncNativeChrome: vi.fn(),
}))

vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ profile: h.profile, updateProfile: h.updateProfile }),
}))
vi.mock('@/lib/nativeBootstrap', () => ({ syncNativeChrome: h.syncNativeChrome }))

import { ThemeProvider, useTheme } from './ThemeContext'

const listeners = new Set<(e: MediaQueryListEvent) => void>()

function stubMatchMedia(prefersDark: boolean) {
  listeners.clear()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('dark') && prefersDark,
    media: query,
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.delete(fn),
  }))
}

/**
 * Reads the context and offers a button per preference. It swallows the
 * rejection into `failure` the way Profile does, so a failing save is asserted
 * rather than escaping as an unhandled rejection.
 */
function Probe() {
  const { preference, theme, setPreference } = useTheme()
  const [failure, setFailure] = useState<string | null>(null)
  const pick = async (next: ThemePreference) => {
    setFailure(null)
    try {
      await setPreference(next)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'failed')
    }
  }
  return (
    <div>
      <span data-testid="state">
        {preference}/{theme}
      </span>
      <span data-testid="failure">{failure ?? ''}</span>
      <button onClick={() => pick('dark')}>dark</button>
      <button onClick={() => pick('light')}>light</button>
      <button onClick={() => pick('system')}>system</button>
    </div>
  )
}

const renderProvider = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )

const state = () => screen.getByTestId('state').textContent
const isDark = () => document.documentElement.classList.contains('dark')

beforeEach(() => {
  h.profile = null
  h.updateProfile.mockReset().mockResolvedValue(undefined)
  h.syncNativeChrome.mockReset()
  document.documentElement.className = ''
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ThemeProvider', () => {
  it('follows the device when nothing has been chosen', () => {
    stubMatchMedia(true)
    renderProvider()
    expect(state()).toBe('system/dark')
    expect(isDark()).toBe(true)
  })

  it('starts from a choice made on a previous visit', () => {
    localStorage.setItem('etto.theme', 'dark')
    renderProvider()
    expect(state()).toBe('dark/dark')
    expect(isDark()).toBe(true)
  })

  it('applies and mirrors a new choice', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'dark' }))

    expect(state()).toBe('dark/dark')
    expect(isDark()).toBe(true)
    expect(localStorage.getItem('etto.theme')).toBe('dark')
  })

  it('keeps the native status bar in step with the resolved theme', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'dark' }))
    await waitFor(() => expect(h.syncNativeChrome).toHaveBeenLastCalledWith('dark'))
  })

  it('does not write to a profile that is not there', async () => {
    const user = userEvent.setup()
    renderProvider()
    await user.click(screen.getByRole('button', { name: 'dark' }))
    expect(h.updateProfile).not.toHaveBeenCalled()
  })

  // The column is nullable and NULL means "follow the device", so picking
  // System has to clear it rather than store the word.
  it('saves an explicit choice to the profile, and system as null', async () => {
    h.profile = { theme: null }
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'light' }))
    expect(h.updateProfile).toHaveBeenLastCalledWith({ theme: 'light' })

    await user.click(screen.getByRole('button', { name: 'system' }))
    expect(h.updateProfile).toHaveBeenLastCalledWith({ theme: null })
  })

  it('rolls back and rethrows when the profile write fails', async () => {
    h.profile = { theme: null }
    h.updateProfile.mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    renderProvider()

    await user.click(screen.getByRole('button', { name: 'dark' }))

    await waitFor(() => expect(state()).toBe('system/light'))
    expect(isDark()).toBe(false)
    expect(localStorage.getItem('etto.theme')).toBeNull()
    expect(screen.getByTestId('failure')).toHaveTextContent('offline')
  })

  it('takes the account preference once the profile loads', async () => {
    h.profile = { theme: 'dark' }
    renderProvider()
    await waitFor(() => expect(state()).toBe('dark/dark'))
    expect(localStorage.getItem('etto.theme')).toBe('dark')
  })

  // A NULL column is "this account has no preference", which must not stamp on
  // a choice the user made in this browser before signing in.
  it('leaves a local choice alone when the account has none', async () => {
    localStorage.setItem('etto.theme', 'dark')
    h.profile = { theme: null }
    renderProvider()
    await waitFor(() => expect(state()).toBe('dark/dark'))
  })

  it('re-resolves when the device flips, but only while following it', async () => {
    renderProvider()
    expect(state()).toBe('system/light')

    for (const fn of listeners) fn({ matches: true } as MediaQueryListEvent)
    await waitFor(() => expect(state()).toBe('system/dark'))

    // An explicit choice has to survive the user flipping their OS switch.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'light' }))
    expect(listeners.size).toBe(0)
    expect(state()).toBe('light/light')
  })
})

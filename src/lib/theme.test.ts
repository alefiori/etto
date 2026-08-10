import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyTheme,
  CHROME_COLOR,
  clearStoredTheme,
  detectDeviceTheme,
  documentTheme,
  getStoredTheme,
  isThemePreference,
  resolveTheme,
  storeTheme,
  watchDeviceTheme,
} from './theme'

/**
 * jsdom has no matchMedia, so every test that touches the device scheme installs
 * one. `listeners` lets a test fire a change the way the OS switch would.
 */
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

function fireDeviceChange(matches: boolean) {
  for (const fn of listeners) fn({ matches } as MediaQueryListEvent)
}

beforeEach(() => {
  document.documentElement.className = ''
  document.head.innerHTML = '<meta id="app-theme-color" name="theme-color" content="#f7f7fb">'
  stubMatchMedia(false)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('preference storage', () => {
  it('round-trips an explicit choice', () => {
    storeTheme('dark')
    expect(getStoredTheme()).toBe('dark')
  })

  // "System" is the absence of a choice, not a third stored value — the slot has
  // to end up empty or the device would stop winning on the next load.
  it('stores nothing for system', () => {
    storeTheme('dark')
    storeTheme('system')
    expect(getStoredTheme()).toBeNull()
    expect(localStorage.getItem('macrotrack.theme')).toBeNull()
  })

  it('clearing is the same as choosing system', () => {
    storeTheme('light')
    clearStoredTheme()
    expect(getStoredTheme()).toBeNull()
  })

  it('ignores a value that is not a preference', () => {
    localStorage.setItem('macrotrack.theme', 'sepia')
    expect(getStoredTheme()).toBeNull()
  })

  it('recognises only the three preferences', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('midnight')).toBe(false)
  })
})

describe('resolveTheme', () => {
  it('passes an explicit choice through, whatever the device says', () => {
    stubMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the device for system', () => {
    stubMatchMedia(true)
    expect(resolveTheme('system')).toBe('dark')
    stubMatchMedia(false)
    expect(resolveTheme('system')).toBe('light')
  })

  it('falls back to light when the platform cannot report a scheme', () => {
    vi.stubGlobal('matchMedia', () => {
      throw new Error('unsupported')
    })
    expect(detectDeviceTheme()).toBe('light')
  })
})

describe('watchDeviceTheme', () => {
  it('reports device changes until unsubscribed', () => {
    const onChange = vi.fn()
    const stop = watchDeviceTheme(onChange)

    fireDeviceChange(true)
    expect(onChange).toHaveBeenCalledWith('dark')

    fireDeviceChange(false)
    expect(onChange).toHaveBeenLastCalledWith('light')

    stop()
    fireDeviceChange(true)
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})

describe('applyTheme', () => {
  it('adds the dark class and repaints the browser chrome', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.getElementById('app-theme-color')?.getAttribute('content')).toBe(
      CHROME_COLOR.dark,
    )
  })

  it('removes it again for light', () => {
    applyTheme('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.getElementById('app-theme-color')?.getAttribute('content')).toBe(
      CHROME_COLOR.light,
    )
  })

  it('reads back what it applied', () => {
    applyTheme('dark')
    expect(documentTheme()).toBe('dark')
    applyTheme('light')
    expect(documentTheme()).toBe('light')
  })
})

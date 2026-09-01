import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseDeepLink,
  setDeepLinkNavigator,
  registerDeepLinks,
} from './deepLinks'

describe('parseDeepLink', () => {
  it('reads a well-formed reset link', () => {
    const action = parseDeepLink(
      'https://etto.fitness/reset-password#access_token=abc123&refresh_token=def456&expires_in=3600&token_type=bearer&type=recovery',
    )
    expect(action).toEqual({
      kind: 'reset-password',
      session: { accessToken: 'abc123', refreshToken: 'def456' },
    })
  })

  it('reads tokens from the query string too, not only the fragment', () => {
    const action = parseDeepLink(
      'https://etto.fitness/reset-password?access_token=abc123&refresh_token=def456',
    )
    expect(action).toEqual({
      kind: 'reset-password',
      session: { accessToken: 'abc123', refreshToken: 'def456' },
    })
  })

  it('recognizes an expired or already-used link by its GoTrue error shape', () => {
    const action = parseDeepLink(
      'https://etto.fitness/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )
    expect(action).toEqual({ kind: 'reset-password-expired' })
  })

  it('treats any error param as expired, not only otp_expired', () => {
    const action = parseDeepLink('https://etto.fitness/reset-password#error=server_error')
    expect(action).toEqual({ kind: 'reset-password-expired' })
  })

  it('ignores a reset-password link with no token and no error', () => {
    const action = parseDeepLink('https://etto.fitness/reset-password')
    expect(action).toEqual({ kind: 'ignored' })
  })

  it('ignores a reset-password link with only one of the two tokens', () => {
    expect(parseDeepLink('https://etto.fitness/reset-password#access_token=abc123')).toEqual({
      kind: 'ignored',
    })
    expect(parseDeepLink('https://etto.fitness/reset-password#refresh_token=def456')).toEqual({
      kind: 'ignored',
    })
  })

  it('ignores an unrelated deep link even with tokens on it', () => {
    const action = parseDeepLink(
      'https://etto.fitness/signin#access_token=abc123&refresh_token=def456',
    )
    expect(action).toEqual({ kind: 'ignored' })
  })

  it('ignores the app root and other ordinary paths', () => {
    expect(parseDeepLink('https://etto.fitness/')).toEqual({ kind: 'ignored' })
    expect(parseDeepLink('https://etto.fitness/foods')).toEqual({ kind: 'ignored' })
  })

  it('ignores a malformed URL rather than throwing', () => {
    expect(parseDeepLink('not a url')).toEqual({ kind: 'ignored' })
    expect(parseDeepLink('')).toEqual({ kind: 'ignored' })
  })

  it('works given a bare custom-scheme URL, not only https', () => {
    // Belt and braces: nothing about parsing depends on the scheme being
    // https, so a shell that ever handed this a capacitor:// URL directly
    // (rather than the https:// Universal Link it is designed around) would
    // still parse correctly.
    const action = parseDeepLink(
      'capacitor://localhost/reset-password#access_token=abc123&refresh_token=def456',
    )
    expect(action).toEqual({
      kind: 'reset-password',
      session: { accessToken: 'abc123', refreshToken: 'def456' },
    })
  })
})

describe('setDeepLinkNavigator', () => {
  beforeEach(() => {
    // Clear whatever the previous test left registered.
    setDeepLinkNavigator(null)
  })

  it('accepts registering and clearing a navigator without throwing', () => {
    // handleIncomingUrl/navigate() — where a registered navigator actually
    // gets called — are internal to the appUrlOpen listener and not exported;
    // this pins the public registration contract that App.tsx's
    // DeepLinkNavigator component relies on (register on mount, clear on
    // unmount) without reaching into module-private state to do it.
    const nav = vi.fn()
    expect(() => setDeepLinkNavigator(nav)).not.toThrow()
    expect(() => setDeepLinkNavigator(null)).not.toThrow()
  })
})

describe('registerDeepLinks', () => {
  it('is a no-op on the web — no @capacitor/app import is even attempted to fail', async () => {
    // isNativePlatform() is false under Vitest's jsdom environment (no
    // window.Capacitor global), so this must resolve without throwing and
    // without needing @capacitor/app installed.
    await expect(registerDeepLinks()).resolves.toBeUndefined()
  })
})

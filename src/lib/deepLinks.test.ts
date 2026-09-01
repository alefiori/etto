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

  describe('the etto:// fallback link (/verify)', () => {
    it('reads a well-formed recovery verification', () => {
      const action = parseDeepLink(
        'etto://app/verify?type=recovery&email=sam%40example.com&token=123456',
      )
      expect(action).toEqual({
        kind: 'otp',
        verification: { email: 'sam@example.com', token: '123456', type: 'recovery' },
      })
    })

    it('reads a well-formed signup verification', () => {
      const action = parseDeepLink(
        'etto://app/verify?type=signup&email=sam%40example.com&token=654321',
      )
      expect(action).toEqual({
        kind: 'otp',
        verification: { email: 'sam@example.com', token: '654321', type: 'signup' },
      })
    })

    it('reads a well-formed magiclink verification', () => {
      const action = parseDeepLink(
        'etto://app/verify?type=magiclink&email=sam%40example.com&token=111222',
      )
      expect(action).toEqual({
        kind: 'otp',
        verification: { email: 'sam@example.com', token: '111222', type: 'magiclink' },
      })
    })

    it('the host is not part of the route — any app-ish host works, the pathname decides', () => {
      // etto://app/verify and etto:///verify (empty host) both resolve to
      // pathname "/verify"; this pins that the host is decorative, not load
      // -bearing, since a non-special scheme like etto: puts everything after
      // // into the host until the next "/" — see the file's own header
      // comment for why "app" was chosen deliberately over no host at all.
      const action = parseDeepLink('etto:///verify?type=recovery&email=a%40b.com&token=1')
      expect(action).toEqual({
        kind: 'otp',
        verification: { email: 'a@b.com', token: '1', type: 'recovery' },
      })
    })

    it('rejects an unrecognized type rather than guessing', () => {
      const action = parseDeepLink(
        'etto://app/verify?type=email_change&email=sam%40example.com&token=123456',
      )
      expect(action).toEqual({ kind: 'ignored' })
    })

    it('ignores a verify link missing the email', () => {
      const action = parseDeepLink('etto://app/verify?type=recovery&token=123456')
      expect(action).toEqual({ kind: 'ignored' })
    })

    it('ignores a verify link missing the token', () => {
      const action = parseDeepLink('etto://app/verify?type=recovery&email=sam%40example.com')
      expect(action).toEqual({ kind: 'ignored' })
    })

    it('ignores a verify link missing the type', () => {
      const action = parseDeepLink('etto://app/verify?email=sam%40example.com&token=123456')
      expect(action).toEqual({ kind: 'ignored' })
    })

    it('does not fall through to the reset-password token/error parsing for this path', () => {
      // /verify and /reset-password are parsed by two different branches;
      // an access_token on a /verify URL must not be misread as a recovery
      // session, and an error param on it must not be misread as expired.
      const withAccessToken = parseDeepLink(
        'etto://app/verify?access_token=abc&refresh_token=def',
      )
      expect(withAccessToken).toEqual({ kind: 'ignored' })

      const withError = parseDeepLink('etto://app/verify?error=access_denied')
      expect(withError).toEqual({ kind: 'ignored' })
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

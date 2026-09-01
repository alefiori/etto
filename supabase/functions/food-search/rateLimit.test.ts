import { describe, it, expect } from 'vitest'
import {
  applyRequest,
  evaluateRateLimit,
  queryTooLong,
  resetAtMs,
  retryAfterSeconds,
  subjectFromAuthHeader,
  windowIsCurrent,
  MAX_QUERY_CHARS,
  SEARCH_RATE_LIMIT,
  SEARCH_RATE_WINDOW_SECONDS,
  type WindowState,
} from './rateLimit.ts'

const HOUR_MS = SEARCH_RATE_WINDOW_SECONDS * 1000
// An arbitrary fixed "now" so nothing here depends on the wall clock.
const T0 = Date.UTC(2026, 7, 31, 12, 0, 0)

/** Encode a JWT-shaped token whose payload is `payload`. The signature is never read. */
function token(payload: Record<string, unknown>): string {
  const b64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.sig`
}

describe('windowIsCurrent', () => {
  it('is current inside the window', () => {
    expect(windowIsCurrent(T0, T0)).toBe(true)
    expect(windowIsCurrent(T0, T0 + HOUR_MS - 1)).toBe(true)
  })

  // Exclusive boundary, matching `window_started_at <= now() - interval` in the
  // SQL: the instant the window is a full hour old, it is over.
  it('is over at exactly one window length', () => {
    expect(windowIsCurrent(T0, T0 + HOUR_MS)).toBe(false)
    expect(windowIsCurrent(T0, T0 + HOUR_MS + 1)).toBe(false)
  })
})

describe('applyRequest', () => {
  it("opens a window at 1 for a user who has never searched", () => {
    expect(applyRequest(null, T0)).toEqual<WindowState>({ count: 1, windowStartedAtMs: T0 })
  })

  it('increments inside the window without moving its start', () => {
    const state = applyRequest({ count: 7, windowStartedAtMs: T0 }, T0 + 60_000)
    expect(state).toEqual<WindowState>({ count: 8, windowStartedAtMs: T0 })
  })

  // The request doing the resetting is itself the first of the new window, so
  // it restarts at 1 — not 0, which would hand out one free request an hour.
  it('restarts at 1 in a new window once the old one expired', () => {
    const state = applyRequest({ count: SEARCH_RATE_LIMIT, windowStartedAtMs: T0 }, T0 + HOUR_MS)
    expect(state).toEqual<WindowState>({ count: 1, windowStartedAtMs: T0 + HOUR_MS })
  })
})

describe('evaluateRateLimit', () => {
  it('allows a fresh window under the limit', () => {
    const verdict = evaluateRateLimit({ count: 1, windowStartedAtMs: T0 }, T0)
    expect(verdict.allowed).toBe(true)
    expect(verdict.remaining).toBe(SEARCH_RATE_LIMIT - 1)
    expect(verdict.resetAtMs).toBe(T0 + HOUR_MS)
  })

  it('allows the request that lands exactly on the limit', () => {
    const verdict = evaluateRateLimit(
      { count: SEARCH_RATE_LIMIT, windowStartedAtMs: T0 },
      T0 + 1000,
    )
    expect(verdict.allowed).toBe(true)
    expect(verdict.remaining).toBe(0)
  })

  it('rejects the request that crosses the threshold', () => {
    const verdict = evaluateRateLimit(
      { count: SEARCH_RATE_LIMIT + 1, windowStartedAtMs: T0 },
      T0 + 1000,
    )
    expect(verdict.allowed).toBe(false)
    expect(verdict.remaining).toBe(0)
  })

  // The whole point of the DB-backed counter: a user who spent the window is
  // let back in by the clock, not by an isolate being recycled.
  it('lets a spent user back in once the window rolls over', () => {
    const spent: WindowState = { count: SEARCH_RATE_LIMIT + 40, windowStartedAtMs: T0 }
    expect(evaluateRateLimit(spent, T0 + HOUR_MS - 1).allowed).toBe(false)

    const next = applyRequest(spent, T0 + HOUR_MS)
    const verdict = evaluateRateLimit(next, T0 + HOUR_MS)
    expect(verdict.allowed).toBe(true)
    expect(verdict.remaining).toBe(SEARCH_RATE_LIMIT - 1)
    expect(verdict.resetAtMs).toBe(T0 + 2 * HOUR_MS)
  })

  it('carries the Retry-After of its own window', () => {
    const verdict = evaluateRateLimit(
      { count: SEARCH_RATE_LIMIT + 1, windowStartedAtMs: T0 },
      T0 + 30 * 60_000,
    )
    expect(verdict.retryAfterSeconds).toBe(1800)
  })
})

describe('retryAfterSeconds', () => {
  it('is the whole window at the instant it opens', () => {
    expect(retryAfterSeconds(T0, T0)).toBe(SEARCH_RATE_WINDOW_SECONDS)
  })

  it('counts down through the window', () => {
    expect(retryAfterSeconds(T0, T0 + 60_000)).toBe(3540) // 1 min in
    expect(retryAfterSeconds(T0, T0 + 30 * 60_000)).toBe(1800) // half way
    expect(retryAfterSeconds(T0, T0 + 59 * 60_000)).toBe(60) // 1 min left
  })

  // Rounded up, so waiting exactly Retry-After seconds lands in the new window
  // rather than a few hundred milliseconds short of it and 429ing again.
  it('rounds a partial second up', () => {
    expect(retryAfterSeconds(T0, T0 + HOUR_MS - 1500)).toBe(2)
    expect(retryAfterSeconds(T0, T0 + HOUR_MS - 200)).toBe(1)
  })

  it('never returns 0 or a negative, even past the reset', () => {
    expect(retryAfterSeconds(T0, T0 + HOUR_MS)).toBe(1)
    expect(retryAfterSeconds(T0, T0 + 3 * HOUR_MS)).toBe(1)
  })
})

describe('resetAtMs', () => {
  it('is one window after the start', () => {
    expect(resetAtMs(T0)).toBe(T0 + HOUR_MS)
    expect(resetAtMs(T0, 60)).toBe(T0 + 60_000)
  })
})

describe('subjectFromAuthHeader', () => {
  it('reads the sub claim of a bearer token', () => {
    const sub = '00000000-0000-4000-8000-000000000001'
    expect(subjectFromAuthHeader(`Bearer ${token({ sub, role: 'authenticated' })}`)).toBe(sub)
  })

  it('accepts any casing and surrounding whitespace', () => {
    expect(subjectFromAuthHeader(`  bearer ${token({ sub: 'u1' })}  `)).toBe('u1')
  })

  // A bare anon/publishable key identifies the project, not a person, so there
  // is nothing to key a per-user limit on.
  it('returns null for a token with no sub, such as the anon key', () => {
    expect(subjectFromAuthHeader(`Bearer ${token({ role: 'anon', ref: 'abc' })}`)).toBeNull()
  })

  it('returns null for anything that is not a readable bearer JWT', () => {
    expect(subjectFromAuthHeader(null)).toBeNull()
    expect(subjectFromAuthHeader('')).toBeNull()
    expect(subjectFromAuthHeader('Basic dXNlcjpwYXNz')).toBeNull()
    expect(subjectFromAuthHeader('Bearer not-a-jwt')).toBeNull()
    expect(subjectFromAuthHeader('Bearer a.b.c')).toBeNull()
  })

  it('returns null when sub is present but not a non-empty string', () => {
    expect(subjectFromAuthHeader(`Bearer ${token({ sub: '' })}`)).toBeNull()
    expect(subjectFromAuthHeader(`Bearer ${token({ sub: 42 })}`)).toBeNull()
  })
})

describe('queryTooLong', () => {
  it('accepts a realistic food name', () => {
    expect(queryTooLong('Pâtisserie ou viennoiserie industrielle, avec fruits, préemballée')).toBe(
      false,
    )
  })

  it('accepts exactly the cap and rejects one over', () => {
    expect(queryTooLong('a'.repeat(MAX_QUERY_CHARS))).toBe(false)
    expect(queryTooLong('a'.repeat(MAX_QUERY_CHARS + 1))).toBe(true)
  })
})

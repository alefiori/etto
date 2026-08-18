import { describe, it, expect } from 'vitest'
import { introPeriod } from './types'

/**
 * The two SDKs express a subscription period differently — the Capacitor one as
 * `{ periodUnit: 'MONTH', periodNumberOfUnits: 3 }`, the web one as an ISO 8601
 * duration or a `{ number, unit }` pair in lower case — and both feed the same
 * paywall sentence. This is where that disagreement is resolved, so it is where
 * a mis-parse would silently turn "First 3 months free" into no line at all.
 */
describe('introPeriod', () => {
  it('parses the ISO durations a subscription period can take', () => {
    expect(introPeriod('P3D')).toEqual({ unit: 'DAY', count: 3 })
    expect(introPeriod('P1W')).toEqual({ unit: 'WEEK', count: 1 })
    expect(introPeriod('P2M')).toEqual({ unit: 'MONTH', count: 2 })
    expect(introPeriod('P1Y')).toEqual({ unit: 'YEAR', count: 1 })
  })

  it('tolerates whitespace and lower case around an ISO duration', () => {
    expect(introPeriod(' p1m ')).toEqual({ unit: 'MONTH', count: 1 })
  })

  it('rejects an ISO duration it cannot represent, rather than guessing', () => {
    // A trial is never expressed with a time component or multiple parts, and
    // inventing a reading would put a wrong number in front of a paying customer.
    expect(introPeriod('P1M15D')).toBeNull()
    expect(introPeriod('PT30M')).toBeNull()
    expect(introPeriod('P')).toBeNull()
    expect(introPeriod('1M')).toBeNull()
  })

  it('parses the uppercase unit the Capacitor SDK reports', () => {
    expect(introPeriod({ number: 7, unit: 'DAY' })).toEqual({ unit: 'DAY', count: 7 })
  })

  it('parses the lowercase unit the web SDK reports', () => {
    expect(introPeriod({ number: 1, unit: 'month' })).toEqual({ unit: 'MONTH', count: 1 })
  })

  it('accepts a pluralized unit', () => {
    // Neither SDK documents pluralizing, and both have renamed fields before.
    expect(introPeriod({ number: 2, unit: 'weeks' })).toEqual({ unit: 'WEEK', count: 2 })
  })

  it('rejects an unknown unit', () => {
    expect(introPeriod({ number: 2, unit: 'fortnight' })).toBeNull()
  })

  it('rejects a non-positive or non-finite count', () => {
    expect(introPeriod({ number: 0, unit: 'MONTH' })).toBeNull()
    expect(introPeriod({ number: -1, unit: 'MONTH' })).toBeNull()
    expect(introPeriod({ number: Number.NaN, unit: 'MONTH' })).toBeNull()
  })

  it('treats an absent period as no intro offer', () => {
    expect(introPeriod(null)).toBeNull()
    expect(introPeriod(undefined)).toBeNull()
    expect(introPeriod('')).toBeNull()
  })
})

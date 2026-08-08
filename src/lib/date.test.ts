import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  toISODate,
  todayISO,
  fromISODate,
  addDays,
  dayOfWeek,
  isToday,
  formatLong,
  formatWeekday,
  formatMonthDay,
  formatShort,
  diffDays,
  dateRange,
} from './date'

describe('toISODate / fromISODate', () => {
  it('formats a Date as YYYY-MM-DD with zero-padding', () => {
    expect(toISODate(new Date(2024, 0, 5))).toBe('2024-01-05')
    expect(toISODate(new Date(2024, 11, 31))).toBe('2024-12-31')
  })

  it('round-trips through fromISODate (local midnight)', () => {
    const d = fromISODate('2024-03-15')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(15)
    expect(toISODate(d)).toBe('2024-03-15')
  })
})

describe('addDays', () => {
  it('adds and subtracts days', () => {
    expect(addDays('2024-01-01', 1)).toBe('2024-01-02')
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31')
  })

  it('rolls over month and year boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29') // leap year
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
  })
})

describe('dayOfWeek', () => {
  it('returns the JS day index (0 = Sunday)', () => {
    expect(dayOfWeek('2024-01-07')).toBe(0) // Sunday
    expect(dayOfWeek('2024-01-08')).toBe(1) // Monday
  })
})

describe('isToday / todayISO', () => {
  afterEach(() => vi.useRealTimers())

  it('detects the current local date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 15, 12, 0, 0))
    expect(todayISO()).toBe('2024-06-15')
    expect(isToday('2024-06-15')).toBe(true)
    expect(isToday('2024-06-14')).toBe(false)
  })
})

describe('formatters', () => {
  it('localize with an explicit locale', () => {
    expect(formatLong('2023-10-26', 'en-US')).toBe('Thursday, October 26')
    expect(formatWeekday('2023-10-26', 'en-US')).toBe('Thursday')
    expect(formatMonthDay('2023-10-26', 'en-US')).toBe('October 26')
    expect(formatShort('2023-10-26', 'en-US')).toBe('Oct 26, 2023')
  })
})

describe('diffDays', () => {
  it('counts whole days forward', () => {
    expect(diffDays('2026-01-01', '2026-01-11')).toBe(10)
  })

  it('is negative going backwards', () => {
    expect(diffDays('2026-01-11', '2026-01-01')).toBe(-10)
  })

  it('is zero for the same day', () => {
    expect(diffDays('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('crosses month and year boundaries', () => {
    expect(diffDays('2026-01-31', '2026-02-01')).toBe(1)
    expect(diffDays('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('counts the leap day', () => {
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2)
    expect(diffDays('2025-02-28', '2025-03-01')).toBe(1)
  })

  it('returns whole days across a DST transition', () => {
    // Late March and late October are when EU/US clocks shift; the result must
    // stay an integer rather than 0.96 or 1.04 of a day.
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2)
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2)
  })
})

describe('dateRange', () => {
  it('includes both ends', () => {
    expect(dateRange('2026-01-01', '2026-01-04')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ])
  })

  it('returns a single date when both ends match', () => {
    expect(dateRange('2026-01-01', '2026-01-01')).toEqual(['2026-01-01'])
  })

  it('returns nothing when the end precedes the start', () => {
    expect(dateRange('2026-01-05', '2026-01-01')).toEqual([])
  })

  it('rolls over a month boundary', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ])
  })

  it('has a length matching diffDays plus one', () => {
    expect(dateRange('2026-01-01', '2026-03-01')).toHaveLength(
      diffDays('2026-01-01', '2026-03-01') + 1,
    )
  })
})

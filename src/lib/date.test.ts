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

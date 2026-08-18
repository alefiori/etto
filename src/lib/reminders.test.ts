import { describe, it, expect } from 'vitest'
import {
  DEFAULT_REMINDER_SETTINGS,
  MAX_PENDING_REMINDERS,
  plannedReminders,
  reminderSlots,
  remindersAvailable,
  settingsFromProfile,
  type ReminderSettings,
} from './reminders'

function settings(overrides: Partial<ReminderSettings> = {}): ReminderSettings {
  return { ...DEFAULT_REMINDER_SETTINGS, enabled: true, ...overrides }
}

/** Local time throughout — the whole point of scheduling on the device. */
function at(hour: number, minute = 0, dayOffset = 0): Date {
  const d = new Date(2026, 5, 1, hour, minute, 0, 0) // 1 June 2026, a Monday
  d.setDate(d.getDate() + dayOffset)
  return d
}

const hoursOf = (dates: Date[]) => dates.map((d) => d.getHours())

describe('reminderSlots', () => {
  it('steps from the start hour while strictly inside the window', () => {
    // 9-to-21 every two hours ends at 19:00, not 21:00 — a reminder fired as the
    // window closes leaves no time to act on it.
    expect(reminderSlots(settings())).toEqual([540, 660, 780, 900, 1020, 1140])
  })

  it('handles an interval that does not divide the window', () => {
    expect(reminderSlots(settings({ startHour: 8, endHour: 13, intervalMinutes: 90 }))).toEqual([
      480, 570, 660, 750,
    ])
  })

  it('is empty for an inverted or empty window', () => {
    expect(reminderSlots(settings({ startHour: 20, endHour: 8 }))).toEqual([])
    expect(reminderSlots(settings({ startHour: 9, endHour: 9 }))).toEqual([])
  })

  it('is empty for a non-positive interval', () => {
    expect(reminderSlots(settings({ intervalMinutes: 0 }))).toEqual([])
  })
})

describe('plannedReminders', () => {
  const base = { consumedMl: 0, goalMl: 2000 }

  it('schedules nothing while reminders are off', () => {
    expect(
      plannedReminders({ ...base, settings: settings({ enabled: false }), now: at(8) }),
    ).toEqual([])
  })

  it('skips today’s slots that have already passed', () => {
    const planned = plannedReminders({ ...base, settings: settings(), now: at(14, 30), days: 1 })
    expect(hoursOf(planned)).toEqual([15, 17, 19])
  })

  it('treats a slot at the current minute as passed', () => {
    // Firing "now" for a decision made now is noise, not a reminder.
    const planned = plannedReminders({ ...base, settings: settings(), now: at(15, 0), days: 1 })
    expect(hoursOf(planned)).toEqual([17, 19])
  })

  it('goes quiet for the rest of the day once the goal is met', () => {
    const planned = plannedReminders({
      settings: settings(),
      now: at(11),
      consumedMl: 2000,
      goalMl: 2000,
      days: 2,
    })
    // Nothing left today; tomorrow's full schedule stands.
    expect(planned.every((d) => d.getDate() === at(0, 0, 1).getDate())).toBe(true)
    expect(hoursOf(planned)).toEqual([9, 11, 13, 15, 17, 19])
  })

  it('still schedules tomorrow when today is over', () => {
    const planned = plannedReminders({ ...base, settings: settings(), now: at(23), days: 2 })
    expect(hoursOf(planned)).toEqual([9, 11, 13, 15, 17, 19])
    expect(planned[0].getDate()).toBe(at(0, 0, 1).getDate())
  })

  it('does not silence the day when no goal is known', () => {
    // goalMl 0 is "couldn't measure", not "goal met" — see useReminderSync's
    // failure path, which schedules from the settings alone.
    const planned = plannedReminders({
      settings: settings(),
      now: at(8),
      consumedMl: 0,
      goalMl: 0,
      days: 1,
    })
    expect(hoursOf(planned)).toEqual([9, 11, 13, 15, 17, 19])
  })

  it('caps the queue rather than the days', () => {
    // 30-minute reminders over a full day is 48 slots; iOS keeps only the 64
    // soonest, so an uncapped week would silently drop its own later days.
    const planned = plannedReminders({
      ...base,
      settings: settings({ startHour: 0, endHour: 24, intervalMinutes: 30 }),
      now: at(0, 0),
    })
    expect(planned).toHaveLength(MAX_PENDING_REMINDERS)
  })

  it('returns dates in ascending order', () => {
    const planned = plannedReminders({ ...base, settings: settings(), now: at(8), days: 3 })
    const times = planned.map((d) => d.getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('lands each reminder on the exact minute of its slot', () => {
    const planned = plannedReminders({
      ...base,
      settings: settings({ startHour: 8, endHour: 10, intervalMinutes: 45 }),
      now: at(7),
      days: 1,
    })
    expect(planned.map((d) => [d.getHours(), d.getMinutes(), d.getSeconds()])).toEqual([
      [8, 0, 0],
      [8, 45, 0],
      [9, 30, 0],
    ])
  })
})

describe('settingsFromProfile', () => {
  it('falls back to the defaults for a profile predating the migration', () => {
    expect(settingsFromProfile({})).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(settingsFromProfile(null)).toEqual(DEFAULT_REMINDER_SETTINGS)
  })

  it('reads the stored settings', () => {
    expect(
      settingsFromProfile({
        water_reminders_enabled: true,
        water_reminder_start_hour: 7,
        water_reminder_end_hour: 22,
        water_reminder_interval_minutes: 60,
      }),
    ).toEqual({ enabled: true, startHour: 7, endHour: 22, intervalMinutes: 60 })
  })

  it('keeps a stored 0 rather than treating it as absent', () => {
    // Midnight is a legitimate start hour, and `??` is what makes it survive.
    expect(settingsFromProfile({ water_reminder_start_hour: 0 }).startHour).toBe(0)
  })
})

describe('remindersAvailable', () => {
  it('is false in a browser — a tab that is closed fires nothing', () => {
    expect(remindersAvailable()).toBe(false)
  })
})

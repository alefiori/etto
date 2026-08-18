/**
 * Hydration reminders (Pro).
 *
 * These are **local** notifications, scheduled on the device by
 * `@capacitor/local-notifications`. Nothing is pushed from a server: there is no
 * device token to store, no per-device registry, and no reason for this app to
 * learn which phones a user owns. `profiles` stores the intent (on/off, window,
 * interval — see 0015) and every device the account is signed into arms itself
 * from that, in its own local time. A user who flies to Tokyo wants a 9-to-21
 * window *there*, which is exactly what a local schedule gives for free and what
 * a server-side one would get wrong.
 *
 * Two consequences shape the design:
 *
 *   1. **The web can't do this honestly.** A browser tab that isn't open fires
 *      nothing, and the Notification API plus a timer would be a reminder that
 *      silently doesn't arrive — worse than no feature. {@link remindersAvailable}
 *      is false on the web and the settings card says so.
 *   2. **A schedule is a plan, not a subscription.** Notifications are queued
 *      ahead of time, so the queue is rebuilt from scratch — {@link syncReminders} —
 *      whenever anything it depends on changes: the settings, the entitlement,
 *      a drink being logged, or the app coming back to the foreground. Slots
 *      that have already passed today are skipped, and so is the rest of today
 *      once the goal is met, which is the difference between a helpful nudge and
 *      being told to drink water while holding an empty bottle.
 */

import { isNativePlatform } from './platform'

/** Whether reminders can be scheduled at all. False on the web. */
export function remindersAvailable(): boolean {
  return isNativePlatform()
}

/**
 * How many days ahead to queue.
 *
 * The plugin has no "every 2 hours between 9 and 21" primitive, so the schedule
 * is materialized as individual notifications. Seven days is the balance: enough
 * that an app left unopened over a week still reminds, few enough to stay well
 * inside both platforms' pending-notification limits (iOS allows 64) at the
 * tightest interval a user can pick — 30 minutes over a 24-hour window is 48
 * slots a day, so the count is capped rather than the days.
 */
export const REMINDER_DAYS_AHEAD = 7

/**
 * The most notifications to leave pending.
 *
 * iOS keeps only the 64 soonest and silently drops the rest, so the cap is ours
 * to apply — an over-long queue would otherwise mean the *later* days are the
 * ones that go missing, unpredictably.
 */
export const MAX_PENDING_REMINDERS = 60

/** Ids are ours to own: a fixed block, so a rebuild replaces its own queue. */
export const REMINDER_ID_BASE = 4200

export interface ReminderSettings {
  enabled: boolean
  /** Local-time window; `endHour` is exclusive, so 24 means "up to midnight". */
  startHour: number
  endHour: number
  intervalMinutes: number
}

/** The choices the settings UI offers, in minutes. */
export const REMINDER_INTERVALS = [30, 60, 90, 120, 180, 240] as const

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  startHour: 9,
  endHour: 21,
  intervalMinutes: 120,
}

/**
 * The slots one day's reminders fall on, as minutes past local midnight.
 *
 * Counting from `startHour` in `intervalMinutes` steps while strictly inside the
 * window: a 9-to-21 window at 120 minutes gives 9:00 through 19:00 and *not*
 * 21:00, because the last slot should still leave time to act on it before the
 * window it belongs to closes.
 */
export function reminderSlots(settings: ReminderSettings): number[] {
  const start = settings.startHour * 60
  const end = settings.endHour * 60
  const step = settings.intervalMinutes
  if (!(step > 0) || !(end > start)) return []
  const slots: number[] = []
  for (let at = start; at < end; at += step) slots.push(at)
  return slots
}

/**
 * When the next `REMINDER_DAYS_AHEAD` days' reminders should fire.
 *
 * Pure, and the whole of the scheduling policy: today's slots that have already
 * passed are dropped, all of today's are dropped once the goal is met, and the
 * result is capped. `now` and the returned dates are local time throughout,
 * which is the point of scheduling on the device.
 */
export function plannedReminders(opts: {
  settings: ReminderSettings
  now: Date
  /** Millilitres drunk today, and the day's goal — used to skip a met goal. */
  consumedMl: number
  goalMl: number
  days?: number
  max?: number
}): Date[] {
  const { settings, now, consumedMl, goalMl } = opts
  if (!settings.enabled) return []
  const slots = reminderSlots(settings)
  if (slots.length === 0) return []

  const days = opts.days ?? REMINDER_DAYS_AHEAD
  const max = opts.max ?? MAX_PENDING_REMINDERS
  const goalMet = goalMl > 0 && consumedMl >= goalMl
  const minutesNow = now.getHours() * 60 + now.getMinutes()

  const out: Date[] = []
  for (let day = 0; day < days && out.length < max; day++) {
    // Today's remaining slots only, and none at all once the goal is met.
    if (day === 0 && goalMet) continue
    for (const slot of slots) {
      if (day === 0 && slot <= minutesNow) continue
      if (out.length >= max) break
      const at = new Date(now)
      at.setDate(at.getDate() + day)
      at.setHours(Math.floor(slot / 60), slot % 60, 0, 0)
      out.push(at)
    }
  }
  return out
}

/** Read reminder settings off a profile row, tolerating a pre-0015 one. */
export function settingsFromProfile(
  profile: {
    water_reminders_enabled?: boolean | null
    water_reminder_start_hour?: number | null
    water_reminder_end_hour?: number | null
    water_reminder_interval_minutes?: number | null
  } | null,
): ReminderSettings {
  if (!profile) return DEFAULT_REMINDER_SETTINGS
  return {
    enabled: profile.water_reminders_enabled ?? DEFAULT_REMINDER_SETTINGS.enabled,
    startHour: profile.water_reminder_start_hour ?? DEFAULT_REMINDER_SETTINGS.startHour,
    endHour: profile.water_reminder_end_hour ?? DEFAULT_REMINDER_SETTINGS.endHour,
    intervalMinutes:
      profile.water_reminder_interval_minutes ?? DEFAULT_REMINDER_SETTINGS.intervalMinutes,
  }
}

// ---------------------------------------------------------------------------
// The native edge
// ---------------------------------------------------------------------------

type Plugin = typeof import('@capacitor/local-notifications')

async function plugin(): Promise<Plugin | null> {
  if (!remindersAvailable()) return null
  try {
    return await import('@capacitor/local-notifications')
  } catch {
    // A shell built before the plugin was added has no bridge to import.
    return null
  }
}

export type PermissionState = 'granted' | 'denied' | 'unavailable'

/**
 * Ask for notification permission, returning what the user decided.
 *
 * Asked when the toggle is turned on rather than at start-up: a permission
 * prompt for something the user hasn't shown any interest in is how an app
 * gets a permanent "Don't allow" — and on iOS and Android 13+ that decision is
 * effectively final.
 */
export async function requestReminderPermission(): Promise<PermissionState> {
  const mod = await plugin()
  if (!mod) return 'unavailable'
  try {
    const { display } = await mod.LocalNotifications.checkPermissions()
    if (display === 'granted') return 'granted'
    const result = await mod.LocalNotifications.requestPermissions()
    return result.display === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}

/** Drop every reminder this app has queued, leaving other notifications alone. */
export async function clearReminders(): Promise<void> {
  const mod = await plugin()
  if (!mod) return
  try {
    const { notifications } = await mod.LocalNotifications.getPending()
    const ours = notifications.filter((n) => n.id >= REMINDER_ID_BASE)
    if (ours.length > 0) {
      await mod.LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
    }
  } catch (e) {
    console.error('could not clear hydration reminders', e)
  }
}

/**
 * Rebuild the queue from the current state. The one entry point the app calls.
 *
 * Cancel-then-schedule rather than a diff: the plan is cheap to recompute and
 * an incremental update would have to reason about which of the old slots the
 * new settings still imply, which is where a stale 3am notification comes from.
 *
 * Returns the number of reminders now pending — 0 when reminders are off,
 * unavailable, unpermitted, or the goal is already met and the window is done.
 */
export async function syncReminders(opts: {
  settings: ReminderSettings
  /** Pro gates the feature: a lapsed subscriber's phone must go quiet. */
  isPro: boolean
  consumedMl: number
  goalMl: number
  /** Localized notification copy. */
  title: string
  body: string
  now?: Date
}): Promise<number> {
  const mod = await plugin()
  if (!mod) return 0

  await clearReminders()
  if (!opts.isPro || !opts.settings.enabled) return 0

  // Permission may have been revoked in Settings since the toggle went on.
  try {
    const { display } = await mod.LocalNotifications.checkPermissions()
    if (display !== 'granted') return 0
  } catch {
    return 0
  }

  const when = plannedReminders({
    settings: opts.settings,
    now: opts.now ?? new Date(),
    consumedMl: opts.consumedMl,
    goalMl: opts.goalMl,
  })
  if (when.length === 0) return 0

  try {
    await mod.LocalNotifications.schedule({
      notifications: when.map((at, i) => ({
        id: REMINDER_ID_BASE + i,
        title: opts.title,
        body: opts.body,
        schedule: { at, allowWhileIdle: true },
        // Tapping one should land on the dashboard, where the water card is.
        extra: { kind: 'hydration' },
      })),
    })
    return when.length
  } catch (e) {
    console.error('could not schedule hydration reminders', e)
    return 0
  }
}

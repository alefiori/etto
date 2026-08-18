import { useCallback, useEffect } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useAppShell } from '@/context/AppShellContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { clearReminders, remindersAvailable, settingsFromProfile, syncReminders } from '@/lib/reminders'
import { fetchWaterLogs, totalMl, waterGoalMl } from '@/lib/water'
import { fetchWeightLogs } from '@/lib/weights'
import { addDays, todayISO } from '@/lib/date'

/**
 * Keeps the queued hydration reminders in step with the state they describe.
 *
 * Mounted once, in the app shell. A scheduled notification is a snapshot of a
 * decision made minutes or days ago, so everything that could invalidate it has
 * to re-arm the queue: the settings changing, the entitlement changing, a drink
 * being logged (the goal may now be met), and the app returning to the
 * foreground — which is the one that matters most, because it is where "the
 * queue was built yesterday and it is now tomorrow" gets fixed.
 *
 * On the web this does nothing at all and issues no queries: `remindersAvailable()`
 * is false there, and a browser cannot deliver a reminder for a tab that isn't
 * open. See lib/reminders.ts.
 */
export function useReminderSync(): void {
  const { profile } = useProfile()
  const { isPro } = useEntitlement()
  const { waterVersion } = useAppShell()
  const { t } = useI18n()

  // Destructured to primitives so the callback below depends on the *values*
  // rather than on a settings object rebuilt on every render.
  const { enabled, startHour, endHour, intervalMinutes } = settingsFromProfile(profile)
  const goalOverrideMl = profile?.water_goal_ml ?? null

  const sync = useCallback(async () => {
    if (!remindersAvailable()) return
    const settings = { enabled, startHour, endHour, intervalMinutes }
    if (!isPro || !enabled) {
      // Covers both "turned it off" and "the subscription lapsed": either way
      // the phone has to go quiet, and there is nothing to measure first.
      await clearReminders()
      return
    }
    const today = todayISO()
    try {
      // Today's intake and the goal it is measured against, so a met goal
      // silences the rest of the day. A short weight window is enough to find
      // the latest weigh-in a derived goal needs.
      const [logs, weights] = await Promise.all([
        fetchWaterLogs(today),
        fetchWeightLogs(addDays(today, -30), today),
      ])
      const latestWeightKg = weights.length > 0 ? weights[weights.length - 1].weight_kg : null
      await syncReminders({
        settings,
        isPro,
        consumedMl: totalMl(logs),
        goalMl: waterGoalMl(goalOverrideMl, latestWeightKg),
        title: t('water.reminderTitle'),
        body: t('water.reminderBody'),
      })
    } catch (e) {
      // A failed read must not leave yesterday's plan in place, but it must not
      // silence a paying user either — schedule from the settings alone and let
      // the next sync refine it.
      console.error('could not measure hydration before scheduling', e)
      await syncReminders({
        settings,
        isPro,
        consumedMl: 0,
        goalMl: 0,
        title: t('water.reminderTitle'),
        body: t('water.reminderBody'),
      })
    }
    // `t` is memoized per locale, so this re-arms on a language change too —
    // which is right: a queued notification carries copy, and a user who
    // switched to German should not be reminded in English tomorrow.
  }, [isPro, enabled, startHour, endHour, intervalMinutes, goalOverrideMl, t])

  useEffect(() => {
    void sync()
  }, [sync, waterVersion])

  // Re-arm whenever the app comes back to the foreground: the queue ages, the
  // day rolls over, and permission can be revoked from system settings while
  // the app is backgrounded.
  useEffect(() => {
    if (!remindersAvailable()) return
    let remove: (() => void) | undefined
    let cancelled = false
    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) void sync()
        })
        if (cancelled) void handle.remove()
        else remove = () => void handle.remove()
      } catch {
        // No App plugin: the mount-time sync above is all there is.
      }
    })()
    return () => {
      cancelled = true
      remove?.()
    }
  }, [sync])
}

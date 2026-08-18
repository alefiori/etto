import { useState } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { ProGate } from '@/components/paywall/ProGate'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { Toggle } from '@/components/ui/Toggle'
import {
  REMINDER_INTERVALS,
  remindersAvailable,
  requestReminderPermission,
  reminderSlots,
  settingsFromProfile,
} from '@/lib/reminders'

/** Whole hours, so the window can be picked without a time widget. */
const HOURS = Array.from({ length: 25 }, (_, h) => h)

const selectClass =
  'h-2xl w-full appearance-none rounded-[16px] glass-field px-3 pr-8 font-body-md text-body-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60'

/**
 * Hydration reminders: the toggle, the window, and the interval.
 *
 * The permission prompt is fired by turning the toggle *on*, never on load —
 * asking for notifications before the user has expressed any interest is how an
 * app earns a permanent "Don't allow", and on both platforms that answer is
 * effectively final. A refusal turns the toggle back off rather than storing a
 * `true` the device will never honour, so the UI can't claim to be reminding
 * anyone it isn't.
 *
 * The settings stay editable on the web even though nothing there can fire:
 * they are account settings, and someone who configures them in a browser
 * expects their phone to pick them up. The card says as much rather than
 * pretending a tab can wake up.
 */
export function HydrationReminders() {
  const { profile, updateProfile, loading, locale } = useProfile()
  const { t } = useI18n()
  const { isPro } = useEntitlement()
  const { openPaywall } = useAppShell()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const settings = settingsFromProfile(profile)
  const perDay = reminderSlots(settings).length

  if (!isPro) {
    return (
      <ProGate title={t('water.remindersDescription')} onUpgrade={openPaywall}>
        {null}
      </ProGate>
    )
  }

  async function save(patch: Parameters<typeof updateProfile>[0]) {
    setError(null)
    setSaving(true)
    try {
      await updateProfile(patch)
    } catch {
      setError(t('water.couldNotSaveReminders'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(next: boolean) {
    setDenied(false)
    if (!next) {
      await save({ water_reminders_enabled: false })
      return
    }
    // Ask before storing: a stored `true` the OS won't honour is a lie the
    // settings card would then keep telling.
    if (remindersAvailable()) {
      const permission = await requestReminderPermission()
      if (permission === 'denied') {
        setDenied(true)
        return
      }
    }
    await save({ water_reminders_enabled: true })
  }

  /** Keep the window non-empty: the database rejects start >= end outright. */
  async function handleStartHour(hour: number) {
    const endHour = Math.max(settings.endHour, hour + 1)
    await save({ water_reminder_start_hour: hour, water_reminder_end_hour: endHour })
  }

  async function handleEndHour(hour: number) {
    const startHour = Math.min(settings.startHour, hour - 1)
    await save({ water_reminder_end_hour: hour, water_reminder_start_hour: startHour })
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-start justify-between gap-md">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon name="notifications_active" className="text-[20px] text-on-surface-variant" />
            <span className="font-label-md text-label-md text-on-surface">
              {t('water.remindersLabel')}
            </span>
            {saving && <Spinner className="h-4 w-4 text-primary" />}
          </div>
          <p className="mt-1 font-body-md text-sm text-on-surface-variant">
            {t('water.remindersDescription')}
          </p>
        </div>
        <Toggle
          checked={settings.enabled}
          disabled={loading || saving}
          onChange={handleToggle}
          label={t('water.remindersLabel')}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {denied && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('water.remindersDenied')}
        </p>
      )}

      {/* A browser cannot deliver a reminder for a tab that isn't open, so say
          so instead of letting the toggle imply otherwise. */}
      {!remindersAvailable() && (
        <p className="flex items-start gap-1 rounded-lg glass-chip px-md py-sm font-label-md text-label-md text-on-surface-variant">
          <Icon name="smartphone" className="mt-0.5 shrink-0 text-[16px]" />
          {t('water.remindersMobileOnly')}
        </p>
      )}

      {settings.enabled && (
        <div className="flex flex-col gap-sm">
          <div className="flex gap-sm">
            <label className="flex-1">
              <span className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                {t('water.remindersFrom')}
              </span>
              <div className="relative">
                <select
                  className={selectClass}
                  disabled={loading || saving}
                  value={settings.startHour}
                  onChange={(e) => handleStartHour(Number(e.target.value))}
                >
                  {/* 24:00 is only meaningful as an end, so it isn't offered here. */}
                  {HOURS.slice(0, 24).map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h, locale)}
                    </option>
                  ))}
                </select>
                <Icon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-outline"
                />
              </div>
            </label>

            <label className="flex-1">
              <span className="mb-1 block font-label-md text-label-md text-on-surface-variant">
                {t('water.remindersTo')}
              </span>
              <div className="relative">
                <select
                  className={selectClass}
                  disabled={loading || saving}
                  value={settings.endHour}
                  onChange={(e) => handleEndHour(Number(e.target.value))}
                >
                  {HOURS.slice(1).map((h) => (
                    <option key={h} value={h}>
                      {formatHour(h, locale)}
                    </option>
                  ))}
                </select>
                <Icon
                  name="expand_more"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-outline"
                />
              </div>
            </label>
          </div>

          <div
            role="radiogroup"
            aria-label={t('water.remindersEvery')}
            className="flex flex-wrap gap-1 rounded-full glass-chip p-1"
          >
            {REMINDER_INTERVALS.map((minutes) => {
              const active = settings.intervalMinutes === minutes
              return (
                <button
                  key={minutes}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={loading || saving}
                  onClick={() => save({ water_reminder_interval_minutes: minutes })}
                  className={`flex-1 rounded-full px-3 py-1.5 font-label-md text-label-md transition-colors disabled:opacity-60 ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant enabled:hover:bg-(--glass-chip-hover)'
                  }`}
                >
                  {formatInterval(minutes)}
                </button>
              )
            })}
          </div>

          {/* The count is the honest summary of the three controls above — it is
              what tells someone that "every 30 minutes" is 24 notifications. */}
          <p className="font-label-md text-label-md text-outline">
            {t(perDay === 1 ? 'water.remindersPerDayOne' : 'water.remindersPerDayOther', {
              count: perDay,
            })}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * An hour as the device would write it.
 *
 * `toLocaleTimeString` rather than a hand-rolled `HH:00`, so a locale that uses
 * a 12-hour clock gets "9 AM" instead of a 24-hour string its users read twice.
 * The app's own language decides that, not the device's — the two disagree the
 * moment someone pins a language, and every other formatted value here follows
 * the app.
 * 24 is midnight at the *end* of the window, which no clock format expresses —
 * it renders as 00:00, and the label beside it ("to") carries the meaning.
 */
function formatHour(hour: number, locale: string): string {
  const d = new Date()
  d.setHours(hour % 24, 0, 0, 0)
  return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}

function formatInterval(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

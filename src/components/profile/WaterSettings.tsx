import { useEffect, useState } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { ProGate } from '@/components/paywall/ProGate'
import { ProBadge } from '@/components/paywall/ProBadge'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { volumeForDisplay, volumeToMl, volumeUnit } from '@/lib/water'

const inputClass =
  'h-2xl w-full rounded-[16px] glass-field px-4 font-body-md text-body-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60'

/**
 * The daily hydration goal.
 *
 * Empty is a real, meaningful value here: it means "derive it from my weight",
 * so the goal keeps up as the user's bodyweight changes rather than freezing at
 * signup. That is the same convention `profiles.off_language` uses for
 * "follow the device language", hence the placeholder rather than a number.
 *
 * Pro, because the goal is the target the (Pro) water card fills toward —
 * leaving it settable for a free user would be a setting with nothing to act on.
 */
export function WaterSettings() {
  const { profile, unitSystem, updateProfile, loading } = useProfile()
  const { t } = useI18n()
  const { isPro } = useEntitlement()
  const { openPaywall } = useAppShell()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unit = volumeUnit(unitSystem)
  const storedMl = profile?.water_goal_ml ?? null
  const [draft, setDraft] = useState(
    storedMl != null ? String(Math.round(volumeForDisplay(storedMl, unitSystem))) : '',
  )

  useEffect(() => {
    setDraft(storedMl != null ? String(Math.round(volumeForDisplay(storedMl, unitSystem))) : '')
  }, [storedMl, unitSystem])

  // Below every hook. The gate names the row it replaces — on a settings page
  // a bare description has no heading of its own to hang from.
  if (!isPro) {
    return (
      <ProGate
        title={t('water.goalLocked')}
        label={t('water.goalSettingLabel', { unit })}
        icon="water_drop"
        onUpgrade={openPaywall}
      >
        {null}
      </ProGate>
    )
  }

  async function commit() {
    const value = draft.trim()
    const next = value === '' ? null : Number(value)
    if (next != null && (!Number.isFinite(next) || next <= 0)) return

    // The column caps at 10 litres; clamp so a stray keystroke can't 400.
    const ml = next == null ? null : Math.min(10000, Math.round(volumeToMl(next, unitSystem)))
    if (ml === storedMl) return

    setError(null)
    setSaving(true)
    try {
      await updateProfile({ water_goal_ml: ml })
    } catch {
      setError(t('water.couldNotSaveGoal'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="water_drop" className="text-[1.25rem] text-on-surface-variant" />
        <label htmlFor="water-goal" className="font-label-md text-label-md text-on-surface">
          {t('water.goalSettingLabel', { unit })}
        </label>
        <ProBadge />
        {saving && <Spinner className="h-4 w-4 text-primary" />}
      </div>
      <p className="font-body-md text-sm text-on-surface-variant">{t('water.goalSettingHint')}</p>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <input
        id="water-goal"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={t('water.goalPlaceholder')}
        className={inputClass}
        disabled={loading || saving}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { useAppShell } from '@/context/AppShellContext'
import { useWaterLogs } from '@/hooks/useWaterLogs'
import { useWeightLogs } from '@/hooks/useWeightLogs'
import {
  addWater,
  deleteWater,
  totalMl,
  volumeForDisplay,
  volumeToMl,
  volumeUnit,
  waterGoalMl,
  isGoalDerived,
  QUICK_ADD_ML,
} from '@/lib/water'
import { WATER_COLOR } from '@/lib/constants'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { ProgressRing } from '@/components/ui/ProgressRing'

/**
 * Hydration for the selected day.
 *
 * Drinks are appended one row at a time rather than accumulated into a daily
 * total, so tapping +250 twice quickly can't lose one to a read-modify-write
 * race — and "undo" is just deleting the last row.
 */
export function WaterCard() {
  const { t } = useI18n()
  const { profile, unitSystem } = useProfile()
  const { selectedDate, waterVersion, bumpWaterVersion } = useAppShell()
  const { logs, loading, error } = useWaterLogs(selectedDate, waterVersion)
  // Only to derive a goal when the user hasn't set one; a short window is
  // enough to find the latest weigh-in.
  const { logs: weights } = useWeightLogs(30, 0)

  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const unit = volumeUnit(unitSystem)
  const consumedMl = useMemo(() => totalMl(logs), [logs])

  const latestWeightKg = weights.length > 0 ? weights[weights.length - 1].weight_kg : null
  const goalMl = waterGoalMl(profile?.water_goal_ml ?? null, latestWeightKg)
  const derived = isGoalDerived(profile?.water_goal_ml ?? null)

  async function log(amountMl: number) {
    setSaveError(null)
    setBusy(true)
    try {
      await addWater(selectedDate, amountMl)
      bumpWaterVersion()
    } catch {
      setSaveError(t('water.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCustom() {
    const parsed = Number(custom.trim())
    if (!Number.isFinite(parsed) || parsed <= 0) return
    await log(volumeToMl(parsed, unitSystem))
    setCustom('')
  }

  async function handleUndo() {
    if (logs.length === 0) return
    setSaveError(null)
    setBusy(true)
    try {
      await deleteWater(logs[logs.length - 1].id)
      bumpWaterVersion()
    } catch {
      setSaveError(t('water.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  const reached = consumedMl >= goalMl

  return (
    <div className="flex flex-col gap-md rounded-2xl bg-surface-container-lowest p-lg shadow-card">
      <div className="flex items-center justify-between gap-md">
        <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
          <Icon name="water_drop" className="text-[22px]" style={{ color: WATER_COLOR.color }} />
          {t('water.title')}
        </h3>
        {busy && <Spinner className="h-4 w-4 text-primary" />}
      </div>

      {loading ? (
        <div className="flex justify-center py-lg">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : (
        <div className="flex items-center gap-lg">
          <ProgressRing
            consumed={consumedMl}
            target={goalMl}
            color={WATER_COLOR.color}
            trackColor={WATER_COLOR.tint}
            className="h-[96px] w-[96px] shrink-0"
          >
            <span
              className="font-headline-md text-headline-md leading-none"
              style={{ color: WATER_COLOR.textColor }}
            >
              {formatVolume(volumeForDisplay(consumedMl, unitSystem))}
            </span>
            <span className="font-label-md text-label-md text-on-surface-variant">{unit}</span>
          </ProgressRing>

          <div className="flex min-w-0 flex-col gap-xs">
            <p className="font-label-md text-label-md text-on-surface-variant">
              {reached
                ? t('water.goalReached')
                : t('water.progress', {
                    consumed: formatVolume(volumeForDisplay(consumedMl, unitSystem)),
                    goal: formatVolume(volumeForDisplay(goalMl, unitSystem)),
                    unit,
                  })}
            </p>
            {derived && (
              <p className="font-label-md text-label-md text-outline">{t('water.goalDerived')}</p>
            )}
            {logs.length === 0 && (
              <p className="font-body-md text-sm text-on-surface-variant">{t('water.empty')}</p>
            )}
          </div>
        </div>
      )}

      {(saveError || error) && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {saveError ?? t('water.couldNotLoad')}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-sm">
        {QUICK_ADD_ML.map((ml) => {
          // A litre reads better than "1,000 ml" on a button; fl oz has no such
          // step up, so imperial keeps the card's unit throughout.
          const asLitres = unitSystem === 'metric' && ml >= 1000
          const shown = formatVolume(asLitres ? ml / 1000 : volumeForDisplay(ml, unitSystem))
          const shownUnit = asLitres ? 'L' : unit
          return (
            <button
              key={ml}
              type="button"
              disabled={busy}
              onClick={() => log(ml)}
              aria-label={t('water.addAria', { amount: shown, unit: shownUnit })}
              className="flex h-10 items-center gap-1 rounded-full px-4 font-label-md text-label-md transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: WATER_COLOR.tint, color: WATER_COLOR.textColor }}
            >
              <Icon name="add" className="text-[16px]" />
              {shown} {shownUnit}
            </button>
          )
        })}

        {logs.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={handleUndo}
            aria-label={t('water.undoAria')}
            className="flex h-10 items-center gap-1 rounded-full px-3 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:opacity-40"
          >
            <Icon name="undo" className="text-[16px]" />
            {t('water.undo')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-sm">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          aria-label={t('water.customAria', { unit })}
          placeholder={unit}
          className="h-[44px] w-full rounded-lg border border-outline-variant bg-surface px-4 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
          value={custom}
          disabled={busy}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleCustom()
            }
          }}
        />
        <button
          type="button"
          onClick={handleCustom}
          disabled={busy || custom.trim() === ''}
          className="h-[44px] shrink-0 rounded-full bg-primary px-lg font-label-md text-label-md text-on-primary transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-40"
        >
          {t('water.add')}
        </button>
      </div>
    </div>
  )
}

function formatVolume(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString()
}

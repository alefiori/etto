import { useMemo, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { useWeightLogs } from '@/hooks/useWeightLogs'
import { saveWeight } from '@/lib/weights'
import { ewma, robustTrendPerDay, type SeriesPoint } from '@/lib/trend'
import { weightForDisplay, weightToKg, weightUnit } from '@/lib/units'
import { todayISO } from '@/lib/date'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { TrendChart } from '@/components/ui/TrendChart'

const RANGES = [
  { days: 30, labelKey: 'weight.range30' },
  { days: 90, labelKey: 'weight.range90' },
  { days: 365, labelKey: 'weight.range365' },
] as const

/** Weight readings are noisy, so the chart leads with the smoothed trend. */
const TREND_COLOR = '#00685f' // primary
const TREND_TINT = '#f4fffc' // on-primary-container

/**
 * Rates below this read as "holding steady" rather than as a number.
 *
 * 100 g a week is about 14 g a day — far under the half-kilo of daily swing a
 * bathroom scale shows on water alone, so over a two-week window a slope this
 * small is indistinguishable from noise. Reporting it as a direction would
 * imply a confidence the data doesn't support.
 */
const FLAT_BAND_KG_PER_WEEK = 0.1

/**
 * Today's weigh-in plus the trend it feeds.
 *
 * The raw scale reading is shown as dots and the EWMA as the line, because the
 * gap between the two is the whole point: a 700 g overnight jump is water, and
 * seeing the trend hold flat through it is what stops people abandoning a diet
 * that is actually working.
 */
export function WeightCard() {
  const { t } = useI18n()
  const { unitSystem } = useProfile()
  const [rangeDays, setRangeDays] = useState<number>(90)
  const [version, setVersion] = useState(0)
  const { logs, loading, error } = useWeightLogs(rangeDays, version)

  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const unit = weightUnit(unitSystem)

  const { raw, trend, perWeek, latest } = useMemo(() => {
    const rawSeries: SeriesPoint[] = logs.map((l) => ({
      date: l.log_date,
      value: weightForDisplay(l.weight_kg, unitSystem),
    }))
    // The EWMA is what gets drawn; the *rate* is measured from the raw
    // readings, because fitting a slope to a smoothed series lags the trend and
    // reports about half the real rate. Theil-Sen keeps that honesty without
    // letting one water spike tilt the answer.
    const trendSeries = ewma(rawSeries)
    const slope = robustTrendPerDay(rawSeries)
    return {
      raw: rawSeries,
      trend: trendSeries,
      perWeek: slope != null ? slope * 7 : null,
      latest: rawSeries.length > 0 ? rawSeries[rawSeries.length - 1] : null,
    }
  }, [logs, unitSystem])

  async function handleSave() {
    const parsed = Number(draft.trim())
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setSaveError(null)
    setSaving(true)
    try {
      await saveWeight(todayISO(), weightToKg(parsed, unitSystem))
      setDraft('')
      setJustSaved(true)
      setVersion((v) => v + 1)
      window.setTimeout(() => setJustSaved(false), 2000)
    } catch {
      setSaveError(t('weight.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  // Under about a week of readings the slope is noise dressed up as a trend,
  // so say so rather than showing a confident number that will flip tomorrow.
  const trendReady = perWeek != null && raw.length >= 3
  const trendText = !trendReady
    ? t('weight.trendPending')
    : // perWeek is in display units, so the band has to be converted too —
      // comparing pounds against a kilogram constant would make the band
      // twice as tight for imperial users.
      Math.abs(perWeek) < weightForDisplay(FLAT_BAND_KG_PER_WEEK, unitSystem)
      ? t('weight.trendFlat')
      : perWeek > 0
        ? t('weight.trendUp', { value: formatRate(perWeek), unit })
        : t('weight.trendDown', { value: formatRate(Math.abs(perWeek)), unit })

  return (
    <div className="flex flex-col gap-md rounded-2xl bg-surface-container-lowest p-lg shadow-card">
      <div className="flex items-center justify-between gap-md">
        <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
          <Icon name="monitor_weight" className="text-[22px] text-on-surface-variant" />
          {t('weight.title')}
        </h3>
        {latest && (
          <div className="text-right">
            <span className="block font-label-md text-label-md text-on-surface-variant">
              {t('weight.latest')}
            </span>
            <span className="font-headline-md text-headline-md text-on-surface">
              {formatWeight(latest.value)} {unit}
            </span>
          </div>
        )}
      </div>

      {/* Today's entry */}
      <div className="flex items-center gap-sm">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.1}
          aria-label={t('weight.inputAria', { unit })}
          placeholder={t('weight.todayLabel')}
          className="h-[48px] w-full rounded-lg border border-outline-variant bg-surface px-4 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSave()
            }
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || draft.trim() === ''}
          className="flex h-[48px] shrink-0 items-center gap-2 rounded-full bg-primary px-lg font-label-md text-label-md text-on-primary transition-all hover:bg-on-primary-fixed-variant active:scale-95 disabled:opacity-40"
        >
          {saving ? <Spinner className="h-4 w-4" /> : null}
          {justSaved ? t('weight.saved') : t('weight.save')}
        </button>
      </div>

      {saveError && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {saveError}
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('weight.couldNotLoad')}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-lg">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : raw.length === 0 ? (
        <div className="flex flex-col items-center gap-xs py-lg text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-variant">
            <Icon name="monitor_weight" className="text-[24px] text-on-surface-variant" />
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">{t('weight.empty')}</p>
          <p className="font-label-md text-label-md text-outline">{t('weight.emptyHint')}</p>
        </div>
      ) : (
        <>
          <TrendChart
            trend={trend}
            raw={raw}
            color={TREND_COLOR}
            tint={TREND_TINT}
            label={t('weight.chartAria', { days: rangeDays })}
            height={120}
          />

          <div className="flex items-center justify-between gap-md">
            <p className="font-label-md text-label-md text-on-surface-variant">{trendText}</p>
            <div
              role="group"
              aria-label={t('weight.rangeAria')}
              className="flex shrink-0 gap-1 rounded-full bg-surface-container-low p-1"
            >
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  aria-pressed={rangeDays === r.days}
                  onClick={() => setRangeDays(r.days)}
                  className={`rounded-full px-3 py-1 font-label-md text-label-md transition-colors ${
                    rangeDays === r.days
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {t(r.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatWeight(n: number): string {
  return (Math.round(n * 10) / 10).toLocaleString()
}

function formatRate(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString()
}

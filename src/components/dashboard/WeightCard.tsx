import { useMemo, useState } from 'react'
import { useI18n } from '@/context/I18nContext'
import { useProfile } from '@/context/ProfileContext'
import { useEntitlement } from '@/context/EntitlementContext'
import { useAppShell } from '@/context/AppShellContext'
import { ProGate } from '@/components/paywall/ProGate'
import { useWeightLogs } from '@/hooks/useWeightLogs'
import { saveWeight } from '@/lib/weights'
import { ewma, robustTrendPerDay, type SeriesPoint } from '@/lib/trend'
import { weightForDisplay, weightToKg, weightUnit } from '@/lib/units'
import { todayISO } from '@/lib/date'
import type { GoalDirection } from '@/lib/database.types'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { TrendChart } from '@/components/ui/TrendChart'

const RANGES = [
  { days: 30, labelKey: 'weight.range30' },
  { days: 90, labelKey: 'weight.range90' },
  { days: 365, labelKey: 'weight.range365' },
] as const

/**
 * Weight readings are noisy, so the chart leads with the smoothed trend.
 *
 * Both are theme variables (src/index.css): the light build draws a primary
 * line with a near-white dot fill, and the dark one dims the line to
 * primary-fixed-dim and fills the dots with the card surface, so they keep
 * reading as raw readings punched out of the line rather than as blobs.
 */
const TREND_COLOR = 'rgb(var(--trend))'
const TREND_TINT = 'rgb(var(--trend-dot))'

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
 * Readings needed before the chart is drawn at all.
 *
 * Below this there is no line to draw — one point plots as a dot floating in an
 * empty frame, and a range switch under it offers to re-scale nothing. The card
 * shows a placeholder that says so instead, and the same threshold gates the
 * rate text, so the chart and the number appear together or not at all.
 */
const MIN_READINGS_FOR_CHART = 3

/** Which way the scale has to move for each stated goal to be on track. */
const GOAL_MOVES: Record<GoalDirection, 'up' | 'down' | 'flat'> = {
  lose: 'down',
  gain: 'up',
  maintain: 'flat',
}

/**
 * Today's weigh-in plus the trend it feeds.
 *
 * The raw scale reading is shown as dots and the EWMA as the line, because the
 * gap between the two is the whole point: a 700 g overnight jump is water, and
 * seeing the trend hold flat through it is what stops people abandoning a diet
 * that is actually working.
 *
 * Weight tracking is Pro in full — the weigh-in as much as the trend it feeds.
 * The card keeps its heading when locked, for the same reason WaterCard does,
 * and asks for no rows at all.
 */
export function WeightCard() {
  const { t } = useI18n()
  const { profile, unitSystem } = useProfile()
  const { isPro } = useEntitlement()
  const { openPaywall, weightVersion, bumpWeightVersion } = useAppShell()
  const [rangeDays, setRangeDays] = useState<number>(90)
  const { logs, loading, error } = useWeightLogs(rangeDays, weightVersion, isPro)

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
      bumpWeightVersion()
      window.setTimeout(() => setJustSaved(false), 2000)
    } catch {
      setSaveError(t('weight.couldNotSave'))
    } finally {
      setSaving(false)
    }
  }

  // Under about a week of readings the slope is noise dressed up as a trend,
  // so say so rather than showing a confident number that will flip tomorrow.
  const chartReady = raw.length >= MIN_READINGS_FOR_CHART
  const trendReady = perWeek != null && chartReady
  const rangeLabelKey = RANGES.find((r) => r.days === rangeDays)!.labelKey
  // perWeek is in display units, so the band has to be converted too —
  // comparing pounds against a kilogram constant would make the band twice as
  // tight for imperial users.
  const flat =
    trendReady && Math.abs(perWeek) < weightForDisplay(FLAT_BAND_KG_PER_WEEK, unitSystem)
  const direction = !trendReady || flat ? 'flat' : perWeek > 0 ? 'up' : 'down'
  const trendText = !trendReady
    ? t('weight.trendPending')
    : flat
      ? t('weight.trendFlat')
      : perWeek > 0
        ? t('weight.trendUp', { value: formatRate(perWeek), unit })
        : t('weight.trendDown', { value: formatRate(Math.abs(perWeek)), unit })

  // Green means "going the way you asked for", not "going down". The design
  // colours a loss green, which is right for the common case and wrong for
  // anyone bulking — and the profile already records which they are, so there
  // is no need to guess. No goal set means no opinion: neutral, and the arrow
  // still carries the direction.
  const goal = profile?.goal_direction ?? null
  const onTrack = goal != null && GOAL_MOVES[goal] === direction
  const rateTone = onTrack ? 'text-success' : 'text-on-surface-variant'
  const rateIcon =
    direction === 'flat' ? 'trending_flat' : direction === 'down' ? 'arrow_downward' : 'arrow_upward'

  // Below every hook, so the locked branch keeps the same hook order as the
  // unlocked one.
  if (!isPro) {
    return (
      <div className="flex flex-col gap-md rounded-lens p-lg glass">
        <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
          <span className="flex min-h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-full bg-primary-tint/[0.14] p-1 text-primary">
            <Icon name="monitor_weight" className="text-[1.125rem]" />
          </span>
          {t('weight.title')}
        </h3>
        <ProGate title={t('weight.locked')} onUpgrade={openPaywall}>
          {null}
        </ProGate>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-md rounded-lens p-lg glass">
      <div className="flex items-start justify-between gap-md">
        <h3 className="flex items-center gap-2 font-headline-md text-headline-md text-on-surface">
          <span className="flex min-h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-full bg-primary-tint/[0.14] p-1 text-primary">
            <Icon name="monitor_weight" className="text-[1.125rem]" />
          </span>
          {t('weight.title')}
        </h3>
        {latest && (
          <div className="text-right">
            <span className="block font-label-md text-label-md text-on-surface-variant">
              {t('weight.latest')}
            </span>
            {/* nowrap: "220.5 lb" folds after the number in the narrow right
                column, which reads as two separate figures. */}
            <span className="whitespace-nowrap font-headline-md text-headline-md text-on-surface">
              {formatWeight(latest.value)} {unit}
            </span>
          </div>
        )}
      </div>

      {/* Today's entry. The unit rides inside the field rather than labelling
          it from outside: it is the one thing you need to know before typing,
          and at this width an external label costs a whole row. */}
      <div className="flex items-center gap-sm">
        <div className="relative flex-1">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.1}
            aria-label={t('weight.inputAria', { unit })}
            placeholder={t('weight.todayLabel')}
            className="min-h-2xl w-full rounded-full glass-field pl-4 pr-12 font-body-md text-body-md text-on-surface outline-hidden transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
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
          {/* aria-hidden and click-through: the accessible name already carries
              the unit, and a label that swallowed taps aimed at the field's
              right edge would be worse than no label. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-label-md text-label-md text-on-surface-variant"
          >
            {unit}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || draft.trim() === ''}
          className="flex min-h-2xl shrink-0 items-center gap-2 rounded-full px-lg font-label-md text-label-md transition-all hover:brightness-105 active:scale-95 disabled:opacity-40 grad-primary"
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
        <p role="alert" className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {t('weight.couldNotLoad')}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-lg">
          <Spinner className="h-5 w-5 text-primary" />
        </div>
      ) : (
        /* Everything below the weigh-in — the smoothed trend, the weekly rate
           and the 90/365-day windows — sits inside the same entitlement as the
           input above it, so there is no second gate here. */
        <>
          {/* The rate reads as a status line of its own now that the range
              switch has moved below the chart, so it carries the direction as
              an arrow and names the window it was measured over — otherwise
              "down 0.3 a week" says nothing about 30 days versus a year. */}
          {trendReady && (
            <p className={`flex items-center gap-1.5 font-label-md text-label-md ${rateTone}`}>
              <Icon name={rateIcon} className="shrink-0 text-[1rem]" />
              <span>{trendText}</span>
              <span className="text-on-surface-variant">· {t(rangeLabelKey)}</span>
            </p>
          )}

          {chartReady ? (
            <TrendChart
              trend={trend}
              raw={raw}
              color={TREND_COLOR}
              tint={TREND_TINT}
              label={t('weight.chartAria', { days: rangeDays })}
              height={120}
            />
          ) : (
            /* Too few readings to draw a line. A chart frame holding one dot
               looks like a chart that failed to load, so the placeholder says
               plainly what is missing — and mimics the line it is standing in
               for: a dashed baseline with the readings so far sitting on it. */
            <div className="flex items-center gap-md rounded-[22px] border border-dashed border-outline-variant p-md">
              <div aria-hidden className="relative h-[38px] w-[76px] shrink-0">
                <div
                  className="absolute inset-x-0 top-1/2 h-px"
                  style={{
                    background:
                      'repeating-linear-gradient(90deg, rgb(var(--outline)) 0 5px, transparent 5px 10px)',
                  }}
                />
                {raw.length === 0 ? (
                  <div className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-outline-variant" />
                ) : (
                  raw.slice(-2).map((p, i) => (
                    <div
                      key={p.date}
                      className="absolute top-1/2 h-[9px] w-[9px] -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20"
                      style={{ left: 8 + i * 28 }}
                    />
                  ))
                )}
              </div>
              <div className="min-w-0">
                <p className="font-label-md text-label-md text-on-surface">
                  {raw.length === 0
                    ? t('weight.empty')
                    : t(raw.length === 1 ? 'weight.readingsSoFarOne' : 'weight.readingsSoFarOther', {
                        count: raw.length,
                      })}
                </p>
                <p className="mt-0.5 font-body-md text-sm text-on-surface-variant">
                  {raw.length === 0 ? t('weight.emptyHint') : t('weight.trendPending')}
                </p>
              </div>
            </div>
          )}

          {/* Present but inert below the threshold: hiding it would make the
              card jump a row the moment a third reading lands, and it is the
              clearest signal that a chart belongs here once there is one. */}
          <div
            role="group"
            aria-label={t('weight.rangeAria')}
            // `flex-1` alone cannot shrink these below their own labels, so at
            // 200% text on a narrow phone the last range ran past the card.
            // Wrapping with a basis is the same answer the appearance picker in
            // Profile reached, `rounded-2xl` included: a wrapped row of pills
            // inside a pill reads as a mistake.
            className={`flex flex-wrap gap-1 rounded-2xl glass-chip p-1 ${chartReady ? '' : 'opacity-45'}`}
          >
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                aria-pressed={rangeDays === r.days}
                disabled={!chartReady}
                onClick={() => setRangeDays(r.days)}
                className={`min-w-0 flex-1 basis-[4.5rem] rounded-full px-3 py-1.5 font-label-md text-label-md transition-colors disabled:cursor-not-allowed ${
                  rangeDays === r.days
                    ? 'bg-primary text-on-primary'
                    : 'text-on-surface-variant enabled:hover:bg-(--glass-chip-hover)'
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
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

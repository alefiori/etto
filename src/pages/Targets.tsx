import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { AdaptiveTargets } from '@/components/targets/AdaptiveTargets'
import { useI18n } from '@/context/I18nContext'
import { useTargets } from '@/hooks/useTargets'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/components/ui/Icon'
import { LoadingBlock } from '@/components/ui/Spinner'
import { MACROS, TARGET_DAYS } from '@/lib/constants'
import { calories, type MacroGrams } from '@/lib/macros'
import type { TranslationKey } from '@/lib/i18n'

/** Map a JS day-of-week index (0 = Sunday) to its weekday translation key. */
const DOW_KEY: Record<number, TranslationKey> = {
  0: 'weekday.short.sun',
  1: 'weekday.short.mon',
  2: 'weekday.short.tue',
  3: 'weekday.short.wed',
  4: 'weekday.short.thu',
  5: 'weekday.short.fri',
  6: 'weekday.short.sat',
}

interface DayValues {
  carbs_g: number
  protein_g: number
  fats_g: number
}

type Values = Record<number, DayValues>

const EMPTY: DayValues = { carbs_g: 0, protein_g: 0, fats_g: 0 }

/** How long editing pauses before an edit is written back. */
const AUTOSAVE_DELAY_MS = 700

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function Targets() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { byDay, loading, error, refetch } = useTargets()
  const { profile } = useProfile()
  // When adaptive mode owns the targets the manual grid becomes read-only, so
  // the two writers can never race over the same seven rows.
  const adaptive = profile?.adaptive_targets_enabled ?? false
  const [values, setValues] = useState<Values>({})
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  /** The day currently held for pasting (day_of_week), or null. */
  const [copied, setCopied] = useState<number | null>(null)

  // Autosave bookkeeping. The current values also live in a ref so the
  // debounced flush always writes what is on screen, without every keystroke
  // having to re-create the timer's closure.
  const valuesRef = useRef<Values>({})
  const dirtyRef = useRef(new Set<number>())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const inFlightRef = useRef(0)
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = user?.id ?? null

  // Seed editable state once targets load.
  useEffect(() => {
    const next: Values = {}
    for (const { dow } of TARGET_DAYS) {
      const target = byDay[dow]
      next[dow] = target
        ? { carbs_g: target.carbs_g, protein_g: target.protein_g, fats_g: target.fats_g }
        : { ...EMPTY }
    }
    valuesRef.current = next
    setValues(next)
  }, [byDay])

  /** Upsert the given days. Writes are queued so edits land in the order made. */
  const persist = useCallback((days: number[]) => {
    const userId = userIdRef.current
    if (!userId || days.length === 0) return
    const rows = days.map((dow) => ({
      user_id: userId,
      day_of_week: dow,
      ...(valuesRef.current[dow] ?? EMPTY),
    }))
    inFlightRef.current += 1
    setStatus('saving')
    setSaveError(null)
    queueRef.current = queueRef.current.then(async () => {
      const { error: upsertErr } = await supabase
        .from('macro_targets')
        .upsert(rows, { onConflict: 'user_id,day_of_week' })
      inFlightRef.current -= 1
      if (upsertErr) {
        // Keep the days dirty so the next edit — or Retry — writes them again.
        for (const dow of days) dirtyRef.current.add(dow)
        setSaveError(upsertErr.message)
        setStatus('error')
        return
      }
      // Only claim "saved" once nothing is in flight and nothing is waiting.
      if (inFlightRef.current === 0 && dirtyRef.current.size === 0) setStatus('saved')
    })
  }, [])

  /** Write every pending day right now, cancelling the debounce timer. */
  const flushNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const days = [...dirtyRef.current]
    dirtyRef.current.clear()
    persist(days)
  }, [persist])

  /** Apply an edit locally and schedule the autosave. */
  const edit = useCallback(
    (next: Values, changed: number[]) => {
      valuesRef.current = next
      setValues(next)
      for (const dow of changed) dirtyRef.current.add(dow)
      if (userIdRef.current) setStatus('saving')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flushNow, AUTOSAVE_DELAY_MS)
    },
    [flushNow],
  )

  // Don't lose a pending edit when the tab is hidden or the page is left.
  useEffect(() => {
    function flushIfPending() {
      if (timerRef.current) flushNow()
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushIfPending()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flushIfPending)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flushIfPending)
      flushIfPending()
    }
  }, [flushNow])

  function setField(dow: number, field: keyof DayValues, raw: string) {
    const v = Math.max(0, parseFloat(raw) || 0)
    const current = valuesRef.current[dow] ?? EMPTY
    if (current[field] === v) return
    edit({ ...valuesRef.current, [dow]: { ...current, [field]: v } }, [dow])
  }

  /**
   * Paste the copied day's macros into `dow`. Copying arms a day, pasting
   * applies it one day at a time — the same flow the dashboard uses for meals.
   */
  function pasteInto(dow: number) {
    if (copied === null) return
    const src = valuesRef.current[copied]
    const prev = valuesRef.current[dow]
    if (!src) return
    if (
      prev &&
      prev.carbs_g === src.carbs_g &&
      prev.protein_g === src.protein_g &&
      prev.fats_g === src.fats_g
    ) {
      return
    }
    edit({ ...valuesRef.current, [dow]: { ...src } }, [dow])
  }

  /**
   * Write one macro split to every weekday.
   *
   * This goes through the same serialized queue as the manual autosave rather
   * than issuing its own upsert, so an in-flight hand edit can't land on top of
   * the adaptive write. Afterwards it refetches so the grid shows what was
   * actually stored.
   */
  async function applyToAllDays(macros: MacroGrams) {
    const userId = userIdRef.current
    if (!userId) throw new Error('Not authenticated.')

    const next: Values = {}
    for (const { dow } of TARGET_DAYS) {
      next[dow] = { carbs_g: macros.carbs_g, protein_g: macros.protein_g, fats_g: macros.fats_g }
    }
    valuesRef.current = next
    setValues(next)

    // Cancel any pending debounce so the manual path can't re-write stale
    // values a moment after this lands.
    if (timerRef.current) clearTimeout(timerRef.current)
    dirtyRef.current.clear()

    const rows = TARGET_DAYS.map(({ dow }) => ({
      user_id: userId,
      day_of_week: dow,
      ...next[dow],
    }))

    inFlightRef.current += 1
    setStatus('saving')
    setSaveError(null)
    const write = queueRef.current.then(async () => {
      const { error: upsertErr } = await supabase
        .from('macro_targets')
        .upsert(rows, { onConflict: 'user_id,day_of_week' })
      inFlightRef.current -= 1
      if (upsertErr) {
        setSaveError(upsertErr.message)
        setStatus('error')
        throw new Error(upsertErr.message)
      }
      if (inFlightRef.current === 0 && dirtyRef.current.size === 0) setStatus('saved')
    })
    // The queue must survive a rejection, or every later write chains off a
    // permanently rejected promise.
    queueRef.current = write.catch(() => {})
    await write
    await refetch()
  }

  return (
    <div className="flex flex-col">
      {/* Page header */}
      {/* `top-0` is relative to <main>, which already offsets the fixed mobile
          top bar — an extra 72px here would pin the header over the first card. */}
      <div className="sticky top-0 z-20 flex flex-col justify-between gap-xs border-b border-outline-variant/10 bg-surface-bright/80 px-container-margin-mobile py-lg backdrop-blur-sm md:flex-row md:items-end md:gap-md lg:px-container-margin-desktop lg:py-xl">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface lg:font-headline-lg lg:text-headline-lg">
            {t('targets.title')}
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t('targets.subtitle')}
          </p>
        </div>
        <div
          role="status"
          aria-live="polite"
          className="flex min-h-[24px] shrink-0 items-center gap-xs font-label-md text-label-md text-on-surface-variant md:pb-1"
        >
          {status === 'saving' && (
            <>
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
              <span>{t('targets.saving')}</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <Icon name="cloud_done" className="text-[18px] text-primary" />
              <span>{t('targets.saved')}</span>
            </>
          )}
          {status === 'error' && (
            <>
              <Icon name="cloud_off" className="text-[18px] text-error" />
              <span className="text-error">{saveError ?? t('targets.couldNotSave')}</span>
              <button
                onClick={flushNow}
                className="rounded-full px-sm py-1 font-label-md text-label-md text-primary underline transition-colors hover:bg-surface-container-high"
              >
                {t('targets.retry')}
              </button>
            </>
          )}
          {status === 'idle' && (
            <>
              <Icon name="cloud_sync" className="text-[18px]" />
              <span>{t('targets.autosaveHint')}</span>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] p-container-margin-mobile lg:p-container-margin-desktop">
        {error && (
          <p className="mb-md rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
            {error}
          </p>
        )}

        {copied !== null && (
          <div className="mb-md flex items-center justify-between gap-sm rounded-2xl border border-primary/30 bg-primary-tint/10 p-md shadow-card">
            <div className="flex min-w-0 items-center gap-sm text-on-surface">
              <Icon name="content_paste" className="shrink-0 text-primary" />
              <p className="truncate font-body-md text-body-md">
                {t('targets.dayCopied', { day: t(DOW_KEY[copied]) })}
              </p>
            </div>
            <button
              onClick={() => setCopied(null)}
              aria-label={t('targets.clearCopiedDay')}
              className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        )}

        <div className="mb-md">
          <AdaptiveTargets byDay={byDay} onApply={applyToAllDays} />
        </div>

        {loading ? (
          <LoadingBlock label={t('targets.loading')} />
        ) : (
          // One column on a phone, seven across a desktop. The middle steps
          // matter for tablets: a single column of seven day cards is a very
          // long scroll, and seven across is far too cramped.
          <div className="grid grid-cols-1 items-start gap-md sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 xl:gap-sm">
            {TARGET_DAYS.map(({ dow }) => {
              const v = values[dow] ?? EMPTY
              const kcal = calories(v)
              const dayLabel = t(DOW_KEY[dow])
              return (
                <div
                  key={dow}
                  className="flex flex-col gap-md rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-md shadow-card transition-all hover:shadow-card-hover"
                >
                  <div className="flex items-center justify-between gap-xs border-b border-outline-variant/10 pb-sm">
                    <h3
                      className={`truncate font-headline-md text-headline-md ${
                        dow === 0 || dow === 6 ? 'text-on-surface-variant' : 'text-on-surface'
                      }`}
                    >
                      {dayLabel}
                    </h3>
                    <div className="flex shrink-0 items-center gap-xs">
                      {copied !== null && copied !== dow && (
                        <button
                          onClick={() => pasteInto(dow)}
                          aria-label={t('targets.pasteIntoDay', { day: dayLabel })}
                          title={t('targets.pasteIntoDay', { day: dayLabel })}
                          className="rounded-full bg-primary p-1 text-on-primary transition-opacity hover:opacity-90"
                        >
                          <Icon name="content_paste" className="text-[18px]" />
                        </button>
                      )}
                      <button
                        onClick={() => setCopied(dow)}
                        aria-label={t('targets.copyDayAria', { day: dayLabel })}
                        title={t('targets.copyDayAria', { day: dayLabel })}
                        className={`rounded-full p-1 transition-colors hover:bg-surface-container-high hover:text-primary ${
                          copied === dow
                            ? 'bg-surface-container-high text-primary'
                            : 'text-outline-variant'
                        }`}
                      >
                        <Icon name="content_copy" className="text-[18px]" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-sm">
                    {MACROS.map((m) => (
                      <div key={m.key} className="flex flex-col gap-xs">
                        <label
                          htmlFor={`target-${dow}-${m.key}`}
                          className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: m.color }}
                          />
                          {t('targets.macroLabel', { macro: t(`macro.${m.key}`) })}
                        </label>
                        <input
                          id={`target-${dow}-${m.key}`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          placeholder="0"
                          value={v[m.field] || ''}
                          disabled={adaptive}
                          onChange={(e) => setField(dow, m.field, e.target.value)}
                          className="h-[48px] w-full rounded-lg border border-outline-variant/50 bg-surface px-md text-right font-body-md text-body-md text-on-surface outline-none transition-all placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-auto flex flex-col items-center justify-center rounded-lg bg-surface-container-low p-sm pt-sm">
                    <span className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {t('targets.totalCalories')}
                    </span>
                    <div className="font-data-display text-[28px] font-bold leading-[36px] text-on-surface">
                      {Math.round(kcal)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppShell } from '@/context/AppShellContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useMeals } from '@/context/MealsContext'
import { useTargets } from '@/hooks/useTargets'
import { useFoodLogs } from '@/hooks/useFoodLogs'
import { Icon } from '@/components/ui/Icon'
import { Spinner, LoadingBlock } from '@/components/ui/Spinner'
import { ProgressRing } from '@/components/ui/ProgressRing'
import { Toast } from '@/components/ui/Toast'
import { FoodLogRow } from '@/components/dashboard/FoodLogRow'
import { MACROS, RING_TRACK, type MealKey } from '@/lib/constants'
import {
  calories,
  caloriesForServings,
  scaleMacros,
  sumMacros,
  remaining,
  round,
  type MacroGrams,
} from '@/lib/macros'
import { addDays, dayOfWeek, formatLong, formatMonthDay, formatShort, formatWeekday, isToday, todayISO } from '@/lib/date'
import { copyDayFoods, copyFoodLog, copyMealFoods } from '@/lib/foods'
import { formatDayText, formatMealText, shareText } from '@/lib/exportText'
import type { FoodLogWithFood } from '@/lib/database.types'
import { WeightCard } from '@/components/dashboard/WeightCard'
import { WaterCard } from '@/components/dashboard/WaterCard'

const ZERO: MacroGrams = { carbs_g: 0, protein_g: 0, fats_g: 0 }

/** Which "clear" label names what is currently on the clipboard. */
const CLEAR_ARIA = {
  day: 'dashboard.clearCopiedDay',
  meal: 'dashboard.clearCopiedMeal',
  food: 'dashboard.clearCopiedFood',
} as const

export default function Dashboard() {
  const {
    selectedDate,
    setSelectedDate,
    openAddFood,
    foodLogVersion,
    bumpFoodLogVersion,
    clipboard,
    copyDay,
    copyMeal,
    copyFood,
    clearClipboard,
  } = useAppShell()
  const { byDay, loading: targetsLoading } = useTargets()
  const { logs, loading: logsLoading, error } = useFoodLogs(selectedDate, foodLogVersion)
  const { locale } = useProfile()
  const { t } = useI18n()
  const { meals, loading: mealsLoading, labelFor } = useMeals()

  const [pasting, setPasting] = useState(false)
  const [pastingMeal, setPastingMeal] = useState<MealKey | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(noticeTimer.current), [])

  function flashNotice(message: string) {
    setNotice(message)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 3000)
  }

  async function handleShare(text: string) {
    if (!text) return
    setActionError(null)
    try {
      const outcome = await shareText(text)
      if (outcome === 'copied') flashNotice(t('dashboard.shareCopied'))
    } catch {
      setActionError(t('dashboard.failedShare'))
    }
  }

  const canPasteHere = clipboard?.kind === 'day' && clipboard.date !== selectedDate
  /** A day pastes into a day; the other two are what a meal header can accept. */
  const mealClipboard = clipboard !== null && clipboard.kind !== 'day'

  async function handlePasteDay() {
    if (clipboard?.kind !== 'day') return
    setPasting(true)
    setActionError(null)
    try {
      await copyDayFoods(clipboard.date, selectedDate)
      // Pasting consumes the clipboard: with one slot, a banner that outlives
      // the paste reads as "nothing happened" rather than "ready for more".
      clearClipboard()
      bumpFoodLogVersion()
      flashNotice(t('dashboard.pastedIntoDay'))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('dashboard.failedPaste'))
    } finally {
      setPasting(false)
    }
  }

  async function handlePasteInto(targetMeal: MealKey) {
    if (clipboard === null || clipboard.kind === 'day') return
    setPastingMeal(targetMeal)
    setActionError(null)
    try {
      if (clipboard.kind === 'meal') {
        await copyMealFoods(clipboard.date, clipboard.meal, selectedDate, targetMeal)
      } else {
        await copyFoodLog(clipboard.foodId, clipboard.servings, selectedDate, targetMeal)
      }
      clearClipboard()
      bumpFoodLogVersion()
      flashNotice(t('dashboard.pastedInto', { meal: labelFor(targetMeal) }))
    } catch (e) {
      const fallback =
        clipboard.kind === 'meal' ? 'dashboard.failedPasteMeal' : 'dashboard.failedPasteFood'
      setActionError(e instanceof Error ? e.message : t(fallback))
    } finally {
      setPastingMeal(null)
    }
  }

  const target = byDay[dayOfWeek(selectedDate)]
  const targetMacros: MacroGrams = target
    ? { carbs_g: target.carbs_g, protein_g: target.protein_g, fats_g: target.fats_g }
    : ZERO

  const consumed = useMemo(
    () => sumMacros(logs.map((l) => scaleMacros(l.food, l.servings))),
    [logs],
  )

  const consumedKcal = calories(consumed)
  const goalKcal = calories(targetMacros)
  const remainingKcal = Math.max(0, Math.round(goalKcal - consumedKcal))
  const hasTarget = Boolean(target)

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-lg px-container-margin-mobile py-lg md:px-container-margin-desktop md:py-xl">
      {/* Date selector. Stacked at phone width: the title, two icon buttons and
          the day stepper do not fit on one 390px line, and squeezing them
          folded the date onto three lines and pushed the stepper off the
          card's right edge. */}
      <header className="flex flex-col gap-sm rounded-lens p-md sm:flex-row sm:items-center sm:justify-between glass">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
            {isToday(selectedDate) ? t('dashboard.today') : formatWeekday(selectedDate, locale)}
          </h2>
          <p className="mt-1 font-label-md text-label-md font-normal text-on-surface-variant">
            {isToday(selectedDate) ? formatLong(selectedDate, locale) : formatMonthDay(selectedDate, locale)}
          </p>
        </div>
        <div className="flex items-center justify-end gap-sm">
          <button
            onClick={() => handleShare(formatDayText(logs, selectedDate, locale, t, meals))}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)] disabled:cursor-not-allowed disabled:opacity-40 glass-chip"
            aria-label={t('dashboard.shareDayAria')}
            title={t('dashboard.shareDayAria')}
          >
            <Icon name="ios_share" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.shareDay')}</span>
          </button>
          <button
            onClick={() => copyDay(selectedDate, logs.length)}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)] disabled:cursor-not-allowed disabled:opacity-40 glass-chip"
            aria-label={t('dashboard.copyDayAria')}
            title={t('dashboard.copyDayAria')}
          >
            <Icon name="content_copy" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.copyDay')}</span>
          </button>
          <div className="flex items-center gap-sm rounded-full p-1 glass-chip">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)]"
              aria-label={t('dashboard.previousDay')}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              onClick={() => setSelectedDate(todayISO())}
              className="px-3 font-label-md text-label-md text-primary"
            >
              {t('dashboard.today')}
            </button>
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)]"
              aria-label={t('dashboard.nextDay')}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        </div>
      </header>

      {/* One clipboard, one banner. It trims its own padding to pay for a 40px
          dismiss button, so growing the target doesn't grow the banner. */}
      {clipboard && (
        <div
          className={`flex gap-sm rounded-lens border border-primary/30 bg-primary-tint/[0.12] py-3 pl-md pr-3 shadow-card backdrop-blur-xl ${
            clipboard.kind === 'day'
              ? 'flex-col sm:flex-row sm:items-center sm:justify-between'
              : 'items-center justify-between'
          }`}
        >
          <div className="flex min-w-0 items-center gap-sm text-on-surface">
            <Icon name="content_paste" className="shrink-0 text-[20px] text-primary" />
            <p className="truncate font-body-md text-body-md">
              {clipboard.kind === 'day' && (
                <>
                  {t(clipboard.count === 1 ? 'dashboard.itemCopiedOne' : 'dashboard.itemCopiedOther', {
                    count: clipboard.count,
                  })}{' '}
                  <span className="font-label-md text-label-md">
                    {formatShort(clipboard.date, locale)}
                  </span>
                </>
              )}
              {clipboard.kind === 'meal' && (
                <>
                  {t(clipboard.count === 1 ? 'dashboard.mealCopiedOne' : 'dashboard.mealCopiedOther', {
                    count: clipboard.count,
                    meal: labelFor(clipboard.meal),
                  })}{' '}
                  <span className="font-label-md text-label-md">
                    {formatShort(clipboard.date, locale)}
                  </span>
                </>
              )}
              {clipboard.kind === 'food' && (
                <>
                  {t('dashboard.foodCopied')}{' '}
                  <span className="font-label-md text-label-md">{clipboard.name}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            {/* A day has nowhere else to be pasted, so it carries its own
                target here; a meal or a food is pasted from a meal header. */}
            {clipboard.kind === 'day' && (
              <button
                onClick={handlePasteDay}
                disabled={!canPasteHere || pasting}
                className="flex h-9 items-center gap-xs rounded-full px-3.5 font-label-md text-label-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 grad-primary"
                title={canPasteHere ? t('dashboard.pasteIntoThisDay') : t('dashboard.navigateToPaste')}
              >
                {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-[16px]" />}
                {t('dashboard.pasteHere')}
              </button>
            )}
            <button
              onClick={clearClipboard}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)]"
              aria-label={t(CLEAR_ARIA[clipboard.kind])}
            >
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmations float rather than sit in the flow: these actions are
          taken from anywhere down a long day, and a banner up here would both
          go unread and shove the list under the user's thumb. */}
      <Toast message={notice} />

      {actionError && (
        <p className="rounded-lens bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      {targetsLoading ? (
        <LoadingBlock label={t('dashboard.loadingTargets')} />
      ) : (
        <>
          {!hasTarget && (
            <div className="flex flex-col items-start gap-sm rounded-lens border-dashed border-outline p-lg sm:flex-row sm:items-center sm:justify-between glass">
              <div className="flex items-center gap-sm text-on-surface-variant">
                <Icon name="info" className="text-primary" />
                <p className="font-body-md text-body-md">
                  {t('dashboard.noTargetSet')}
                </p>
              </div>
              <Link
                to="/targets"
                className="rounded-full bg-primary-tint/[0.14] px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/25"
              >
                {t('dashboard.setWeeklyTargets')}
              </Link>
            </div>
          )}

          {/* Macro lenses. Three separate cards at every width now, rather than
              one shared box on phones: on glass a single box holding three
              rings reads as one reading split in three, and the row is three
              independent readings. Each floats a blurred wash of its own accent
              behind the ring, which is what tells the three apart before any
              label is read — hence the overflow-hidden and the relative box. */}
          <section className="grid grid-cols-3 gap-2 md:gap-lg">
            {MACROS.map((m) => {
              const c = consumed[m.field]
              const tgt = targetMacros[m.field]
              return (
                <div
                  key={m.key}
                  className="flex flex-col items-center overflow-hidden rounded-lens px-2 py-md md:p-lg glass"
                >
                  {/* Sized to the card, not to a fixed number: at 140px this
                      flooded a 110px-wide phone card and the lens became a
                      solid block of the accent instead of a tint of it. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-8 h-[96px] w-[96px] rounded-full blur-[26px] md:-right-8 md:-top-10 md:h-[150px] md:w-[150px] md:blur-[36px]"
                    style={{ backgroundColor: `color-mix(in srgb, ${m.color} 24%, transparent)` }}
                  />
                  <div className="relative flex w-full items-center justify-center md:mb-4 md:justify-between">
                    <h3 className="font-label-md text-label-md text-on-surface-variant">
                      {t(`macro.${m.key}`)}
                    </h3>
                    <span
                      className="hidden h-[30px] w-[30px] items-center justify-center rounded-full md:flex"
                      style={{ color: m.color, backgroundColor: m.tint }}
                    >
                      <Icon name={m.icon} className="text-[17px]" />
                    </span>
                  </div>
                  <ProgressRing
                    consumed={c}
                    target={tgt}
                    color={m.color}
                    trackColor={RING_TRACK}
                    className="relative mt-2 h-[84px] w-[84px] md:h-[124px] md:w-[124px]"
                  >
                    <span className="font-headline-md text-xl text-on-surface md:text-[30px] md:leading-8">
                      {round(c, 0)}
                      <span className="text-xs font-normal text-on-surface-variant md:text-sm">g</span>
                    </span>
                    <span className="mt-0.5 text-center text-xs font-semibold text-on-surface-variant">
                      /{round(tgt, 0)}g
                    </span>
                  </ProgressRing>
                  {/* The remaining figure is the one number a glance is after,
                      so it gets the accent chip rather than sitting as plain
                      caption text under the ring. */}
                  <p
                    className="relative mt-3 whitespace-nowrap rounded-full px-2.5 py-1 text-center font-label-md text-xs md:px-3.5 md:text-label-md"
                    style={{ backgroundColor: m.tint, color: m.textColor }}
                  >
                    {/* "41g remaining" wraps to two lines in a chip this
                        narrow, and in the longer languages to three. The bare
                        figure is the same reading — the ring above it already
                        says which macro, and what the number means. */}
                    <span className="md:hidden">{round(remaining(tgt, c), 0)}g</span>
                    <span className="hidden md:inline">
                      {t('dashboard.remaining', { value: round(remaining(tgt, c), 0) })}
                    </span>
                  </p>
                </div>
              )
            })}
          </section>

          {/* Food log + calorie summary */}
          <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
            <div className="flex flex-col gap-lg lg:col-span-2">
              {error && (
                <p className="rounded-lens bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                  {error}
                </p>
              )}
              {logsLoading || mealsLoading ? (
                <LoadingBlock label={t('dashboard.loadingMeals')} />
              ) : (
                meals.map((meal) => {
                  const mealLogs = logs.filter((l) => l.meal === meal.key)
                  return (
                    <MealCard
                      key={meal.key}
                      label={meal.label}
                      icon={meal.icon}
                      logs={mealLogs}
                      onAdd={() => openAddFood({ meal: meal.key })}
                      onChanged={bumpFoodLogVersion}
                      onCopy={() => copyMeal(selectedDate, meal.key, mealLogs.length)}
                      onCopyFood={(log) => copyFood(log.food_id, log.food.name, log.servings)}
                      onNotice={flashNotice}
                      onShare={() =>
                        handleShare(formatMealText(meal, mealLogs, selectedDate, locale, t))
                      }
                      canPaste={mealClipboard}
                      pasting={pastingMeal === meal.key}
                      onPaste={() => handlePasteInto(meal.key)}
                    />
                  )
                })
              )}
            </div>

            {/* Calorie summary */}
            <div className="flex flex-col gap-lg lg:col-span-1">
              {/* The one solid surface on the page, and deliberately so: every
                  other card is a lens, and calories is the reading the day is
                  actually judged on. It is the violet gradient rather than a
                  flat fill for the same reason the CTAs are — and it carries a
                  real ring now, where it used to draw a static decorative
                  circle and put the progress nowhere. */}
              <div className="relative overflow-hidden rounded-lens p-lg text-white shadow-accent grad-primary">
                <div
                  aria-hidden
                  className="absolute -right-10 -top-14 h-[200px] w-[200px] rounded-full bg-white/25 blur-[46px]"
                />
                <div className="relative z-10 mb-lg flex items-center justify-between">
                  <h3 className="font-headline-md text-headline-md">{t('dashboard.calories')}</h3>
                  {goalKcal > 0 && (
                    <span className="rounded-full bg-white/20 px-2.5 py-1 font-label-md text-xs">
                      {t('dashboard.percentOfGoal', {
                        value: Math.round((consumedKcal / goalKcal) * 100),
                      })}
                    </span>
                  )}
                </div>
                <div className="relative z-10 mb-lg flex flex-col items-center justify-center">
                  <ProgressRing
                    consumed={consumedKcal}
                    target={goalKcal}
                    color="rgba(255,255,255,.95)"
                    trackColor="rgba(255,255,255,.22)"
                    className="h-[172px] w-[172px]"
                  >
                    <span className="block font-data-display text-data-display leading-none">
                      {Math.round(consumedKcal).toLocaleString()}
                    </span>
                    <span className="mt-1 block font-label-md text-label-md uppercase tracking-widest opacity-80">
                      {t('dashboard.consumed')}
                    </span>
                  </ProgressRing>
                </div>
                <div className="relative z-10 flex items-center justify-between rounded-[20px] border border-white/25 bg-white/[0.16] p-md backdrop-blur-sm">
                  <div className="text-center">
                    <span className="block text-sm opacity-85">{t('dashboard.goal')}</span>
                    <span className="font-label-md text-label-md">
                      {Math.round(goalKcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-8 w-px bg-white/30" />
                  <div className="text-center">
                    <span className="block text-sm opacity-85">{t('dashboard.remainingLabel')}</span>
                    <span className="font-label-md text-label-md">
                      {remainingKcal.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <WaterCard />

              <WeightCard />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MealCard({
  label,
  icon,
  logs,
  onAdd,
  onChanged,
  onCopy,
  onCopyFood,
  onNotice,
  onShare,
  canPaste,
  pasting,
  onPaste,
}: {
  label: string
  icon: string
  logs: FoodLogWithFood[]
  onAdd: () => void
  onChanged: () => void
  onCopy: () => void
  onCopyFood: (log: FoodLogWithFood) => void
  onNotice: (message: string) => void
  onShare: () => void
  /** True when a meal or a food is on the clipboard — a day is pasted elsewhere. */
  canPaste: boolean
  pasting: boolean
  onPaste: () => void
}) {
  const { t } = useI18n()
  const mealKcal = logs.reduce((sum, l) => sum + caloriesForServings(l.food, l.servings), 0)
  const empty = logs.length === 0

  return (
    <div className={`rounded-lens p-md md:p-lg glass ${empty ? 'border-dashed border-outline' : ''}`}>
      <div className="mb-md flex items-center justify-between gap-sm border-b border-[color:var(--glass-row-border)] pb-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              empty ? 'text-on-surface-variant glass-chip' : 'bg-primary-tint/[0.14] text-primary'
            }`}
          >
            <Icon name={icon} className="text-[19px]" />
          </span>
          <h3
            className={`truncate font-headline-md text-headline-md ${
              empty ? 'text-on-surface-variant' : 'text-on-surface'
            }`}
          >
            {label}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          {canPaste && (
            <button
              onClick={onPaste}
              disabled={pasting}
              className="flex h-9 items-center gap-xs rounded-full px-3.5 font-label-md text-label-md transition-opacity hover:opacity-90 disabled:opacity-40 grad-primary"
              title={t('dashboard.pasteMealHere')}
            >
              {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-[16px]" />}
              {t('dashboard.pasteMealHere')}
            </button>
          )}
          {/* Paired tightly and sized to the 40px minimum: as 14px glyphs in a
              4px box they were a smaller target than the row they sit above,
              and the one you hit was largely down to luck.
              They also stand down entirely while something is on the clipboard.
              Three controls plus the calorie total left the meal's own name a
              sliver, and with a paste pending this header has exactly one job —
              which is also why the paste button can now afford its label at
              phone width, where it used to be a bare unlabelled pill. */}
          {!empty && !canPaste && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={onShare}
                className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)] hover:text-primary"
                aria-label={t('dashboard.shareMealAria', { meal: label })}
                title={t('dashboard.shareMealAria', { meal: label })}
              >
                <Icon name="ios_share" className="text-[20px]" />
              </button>
              <button
                onClick={onCopy}
                className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-[color:var(--glass-chip-hover)] hover:text-primary"
                aria-label={t('dashboard.copyMealAria', { meal: label })}
                title={t('dashboard.copyMealAria', { meal: label })}
              >
                <Icon name="content_copy" className="text-[20px]" />
              </button>
            </div>
          )}
          <span className="font-label-md text-label-md text-on-surface-variant">
            {t('dashboard.mealKcal', { kcal: Math.round(mealKcal) })}
          </span>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-sm py-xl text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant glass-chip">
            <Icon name="restaurant" />
          </div>
          <p className="text-sm text-on-surface-variant">{t('dashboard.noItemsLogged')}</p>
          <button
            onClick={onAdd}
            className="mt-2 rounded-full bg-primary-tint/[0.14] px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/25"
          >
            {t('dashboard.addMeal', { meal: label })}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          {logs.map((log) => (
            <FoodLogRow
              key={log.id}
              log={log}
              onChanged={onChanged}
              onCopy={() => onCopyFood(log)}
              onNotice={onNotice}
            />
          ))}
          <button
            onClick={onAdd}
            className="mt-sm flex w-full items-center justify-center gap-xs rounded-row py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/[0.12]"
          >
            <Icon name="add_circle" className="text-sm" /> {t('dashboard.addMealItem', { meal: label })}
          </button>
        </div>
      )}
    </div>
  )
}

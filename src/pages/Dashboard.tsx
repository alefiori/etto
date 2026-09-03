import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppShell } from '@/context/AppShellContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useMeals } from '@/context/MealsContext'
import { useTargets } from '@/hooks/useTargets'
import { useRefreshHandler } from '@/hooks/useRefreshHandler'
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
import { drawDelay } from '@/lib/motion'
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

/** Which figure the macro dials lead with. */
type MacroUnit = 'percent' | 'grams'

/**
 * Where the choice is remembered.
 *
 * `localStorage` rather than the profile row: this is how one person likes to
 * read one card, not a setting worth a round trip and a column, and a reader
 * who prefers grams wants them back on the next launch, not on the next device.
 * Every access is guarded — a private window, a WebView with site data blocked,
 * and the thumbnail capture all throw on the accessor itself.
 */
const MACRO_UNIT_KEY = 'etto.macroUnit'

function storedMacroUnit(): MacroUnit {
  try {
    return localStorage.getItem(MACRO_UNIT_KEY) === 'grams' ? 'grams' : 'percent'
  } catch {
    return 'percent'
  }
}

function rememberMacroUnit(unit: MacroUnit): void {
  try {
    localStorage.setItem(MACRO_UNIT_KEY, unit)
  } catch {
    // Nothing to do and nothing to tell the reader: the card still works, it
    // just opens on the default next time.
  }
}

export default function Dashboard() {
  const {
    selectedDate,
    setSelectedDate,
    openAddFood,
    foodLogVersion,
    bumpFoodLogVersion,
    bumpWaterVersion,
    bumpWeightVersion,
    clipboard,
    copyDay,
    copyMeal,
    copyFood,
    clearClipboard,
  } = useAppShell()
  const { byDay, loading: targetsLoading, refetch: refetchTargets } = useTargets()
  const { logs, loading: logsLoading, error, refetch: refetchLogs } = useFoodLogs(
    selectedDate,
    foodLogVersion,
  )
  const { locale } = useProfile()
  const { t } = useI18n()
  const { meals, loading: mealsLoading, labelFor, refetch: refetchMeals } = useMeals()

  // What a pull down the dashboard refetches: this page's own three queries,
  // awaited so the indicator is still spinning while they land, plus a bump of
  // the two counters the hydration and weight cards fetch on. Those two run
  // their own request and show their own spinner, so they are asked rather than
  // awaited — the alternative is lifting their data up here purely so the
  // gesture can wait on it.
  useRefreshHandler(async () => {
    bumpWaterVersion()
    bumpWeightVersion()
    await Promise.all([refetchLogs(), refetchTargets(), refetchMeals()])
  })

  // Percentage or grams in the macro dials. The artboard leads with the
  // percentage; the grams are the number you act on, so which one is big is
  // the reader's to pick rather than mine.
  const [macroUnit, setMacroUnitState] = useState<MacroUnit>(storedMacroUnit)
  function setMacroUnit(unit: MacroUnit) {
    setMacroUnitState(unit)
    rememberMacroUnit(unit)
  }

  // Hoisted rather than inlined into the JSX: the icon-subset checker reads
  // `name={...}` ternaries literally, so a quoted `'percent'` in the condition
  // would look to it like an icon called "percent" that the font is missing.
  // See scripts/subset-icon-font.py.
  const showingPercent = macroUnit === 'percent'
  const unitToggleLabel = t(showingPercent ? 'dashboard.showAsGrams' : 'dashboard.showAsPercent')

  const [pasting, setPasting] = useState(false)
  const [pastingMeal, setPastingMeal] = useState<MealKey | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
      <header
        className="flex animate-rise flex-col gap-sm rounded-lens p-md sm:flex-row sm:items-center sm:justify-between glass"
        style={{ animationDelay: '0ms' }}
      >
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
            {isToday(selectedDate) ? t('dashboard.today') : formatWeekday(selectedDate, locale)}
          </h2>
          <p className="mt-1 font-label-md text-label-md font-normal text-on-surface-variant">
            {isToday(selectedDate) ? formatLong(selectedDate, locale) : formatMonthDay(selectedDate, locale)}
          </p>
        </div>
        {/* `flex-wrap`: at the reader's default these three sit on one line, but
            at a large text size the two actions plus the day stepper are wider
            than a phone and the actions were being pushed clean off the card —
            content lost to a font-size setting, which is the whole failure
            this pass is here to fix. Wrapping costs a row and loses nothing. */}
        <div className="flex flex-wrap items-center justify-end gap-sm">
          <button
            onClick={() => handleShare(formatDayText(logs, selectedDate, locale, t, meals))}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover) disabled:cursor-not-allowed disabled:opacity-40 glass-chip"
            aria-label={t('dashboard.shareDayAria')}
            title={t('dashboard.shareDayAria')}
          >
            <Icon name="ios_share" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.shareDay')}</span>
          </button>
          <button
            onClick={() => copyDay(selectedDate, logs.length)}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover) disabled:cursor-not-allowed disabled:opacity-40 glass-chip"
            aria-label={t('dashboard.copyDayAria')}
            title={t('dashboard.copyDayAria')}
          >
            <Icon name="content_copy" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.copyDay')}</span>
          </button>
          {/* `flex-wrap` and a width cap, because this trio is the widest
              fixed thing on the page: two 44px targets either side of a word.
              At 200% text on a 320px viewport — Android's largest display size
              on top of its largest font size — it came to 324px in a 288px
              lane, and `justify-end` took the difference off the left edge, so
              "previous day" was half off-screen and the shell's `overflow:
              hidden` swallowed the rest. Wrapped, it costs a row and keeps
              every target reachable; `rounded-full` clamps to half the height,
              so two rows read as a taller stadium rather than a broken pill. */}
          <div className="flex max-w-full flex-wrap items-center justify-center gap-sm rounded-full p-1 glass-chip">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="tap-target flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover)"
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
              className="tap-target flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover)"
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
          className={`flex gap-sm rounded-lens border border-primary/30 bg-primary-tint/12 py-3 pl-md pr-3 shadow-card backdrop-blur-xl ${
            clipboard.kind === 'day'
              ? 'flex-col sm:flex-row sm:items-center sm:justify-between'
              : 'items-center justify-between'
          }`}
        >
          <div className="flex min-w-0 items-center gap-sm text-on-surface">
            <Icon name="content_paste" className="shrink-0 text-[1.25rem] text-primary" />
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
                className="flex min-h-9 items-center gap-xs rounded-full px-3.5 font-label-md text-label-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 grad-primary"
                title={canPasteHere ? t('dashboard.pasteIntoThisDay') : t('dashboard.navigateToPaste')}
              >
                {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-[1rem]" />}
                {t('dashboard.pasteHere')}
              </button>
            )}
            <button
              onClick={clearClipboard}
              className="tap-target flex min-h-10 min-w-10 shrink-0 items-center justify-center p-2 rounded-full text-on-surface-variant transition-colors hover:bg-(--glass-chip-hover)"
              aria-label={t(CLEAR_ARIA[clipboard.kind])}
            >
              <Icon name="close" className="text-[1.125rem]" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmations float rather than sit in the flow: these actions are
          taken from anywhere down a long day, and a banner up here would both
          go unread and shove the list under the user's thumb. */}
      <Toast message={notice} />

      {actionError && (
        <p role="alert" className="rounded-lens bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
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

          {/* One grid for everything under the header, so a phone and a desktop
              can disagree about the order without the calorie card being
              rendered twice.

              Phone reads calories → macros → meals → water → weight, which is
              the artboard's order and the order of the questions: what is left
              today, how is the split going, what did I eat, did I drink, where
              is the weight. Calories used to arrive fourth here, below every
              meal, because it was the head of the sidebar column — right at a
              desktop width, wrong at a phone's. `order` fixes the phone; the
              explicit row and column placement below fixes the desktop, where
              the sidebar returns.

              The pieces arrive a beat apart so the page assembles top-down
              rather than all at once. The meal list fades where the others
              rise: its rows open sheets and dialogs at `position: fixed`, and a
              transform on an ancestor — even one that lasts 650ms — would lay
              those out inside a meal card. See the entrance note in
              src/index.css. */}
          <div className="grid grid-cols-1 items-start gap-lg lg:grid-cols-3">

          {/* One card, three readings — the artboard's "Macronutrients" box,
              where this used to be three separate cards side by side. Three
              cards each carried their own padding, border and shadow around a
              74px dial, so most of the row was card rather than reading; under
              one title the dials sit closer, line up on a shared baseline, and
              read as the three parts of one split that they are.

              The dial leads with the percentage and the grams sit under the
              name. Which of the two is in the ring is the reader's call — see
              the unit toggle in the header, and `macroUnit` above. */}
            <section className="order-2 animate-rise rounded-lens p-md md:p-lg glass lg:order-none lg:col-span-3 lg:row-start-1">
            <div className="mb-md flex items-center justify-between gap-sm">
              <h3 className="font-label-md text-label-md tracking-wide text-on-surface-variant">
                {t('dashboard.macronutrients')}
              </h3>
              {/* Icon-only, like the share and copy controls a meal header
                  carries, and for the same reason: the words that name this
                  action ("show macros as percentages") do not fit a card header
                  beside its title in seven languages. The glyph shows the unit
                  you would switch *to* — a scale for grams, a dial for the
                  share of target.

                  `monitor_weight` and `donut_small` rather than the more
                  obvious `scale` and `percent`, which are not in the shipped
                  icon subset: the font carries only the glyphs the app uses,
                  and an unsubsetted name renders as its own literal text. See
                  scripts/subset-icon-font.py, whose `--check` mode catches
                  exactly this in CI — it caught these two. */}
              <button
                type="button"
                onClick={() => setMacroUnit(showingPercent ? 'grams' : 'percent')}
                aria-label={unitToggleLabel}
                title={unitToggleLabel}
                className="tap-target flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full text-outline transition-colors hover:bg-(--glass-chip-hover) hover:text-primary"
              >
                <Icon name={showingPercent ? 'monitor_weight' : 'donut_small'} className="text-[1.125rem]" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 md:gap-md">
              {MACROS.map((m, i) => {
                const c = consumed[m.field]
                const tgt = targetMacros[m.field]
                const pct = tgt > 0 ? Math.round((c / tgt) * 100) : 0
                return (
                  <div key={m.key} className="flex flex-col items-center gap-2">
                    <ProgressRing
                      consumed={c}
                      target={tgt}
                      color={m.color}
                      trackColor={RING_TRACK}
                      drawDelay={drawDelay(i)}
                      label={t('dashboard.macroRingAria', {
                        macro: t(`macro.${m.key}`),
                        consumed: round(c, 0),
                        target: round(tgt, 0),
                        remaining: round(remaining(tgt, c), 0),
                      })}
                      // Fluid, not fixed. A dial is a box drawn around type, so
                      // it has to grow with the type — but it also lives in a
                      // third of a phone's width, so it must never grow past
                      // the column. `w-full` up to the drawn size does both.
                      className="aspect-square w-full max-w-[4.75rem] md:max-w-[7rem]"
                    >
                      {showingPercent ? (
                        <span
                          className="font-headline-md text-base md:text-2xl"
                          style={{ color: m.textColor }}
                        >
                          {pct}%
                        </span>
                      ) : (
                        <span className="font-headline-md text-base text-on-surface md:text-2xl">
                          {round(c, 0)}
                          <span className="text-xs font-normal text-on-surface-variant">g</span>
                        </span>
                      )}
                    </ProgressRing>

                    <div className="text-center">
                      <div className="font-label-md text-label-md text-on-surface-variant">
                        {t(`macro.${m.key}`)}
                      </div>
                      {/* Whichever unit is not in the dial. Both readings are
                          on the card either way — the toggle only decides
                          which one is the big one. */}
                      <div className="mt-0.5 text-xs text-outline">
                        {showingPercent
                          ? t('dashboard.macroAmountOfTarget', {
                              consumed: round(c, 0),
                              target: round(tgt, 0),
                            })
                          : t('dashboard.percentOfGoal', { value: pct })}
                      </div>
                    </div>

                    <p
                      className="rounded-full px-2.5 py-1 text-center font-label-md text-xs md:px-3.5 md:text-label-md"
                      style={{ backgroundColor: m.tint, color: m.textColor }}
                    >
                      {/* "N g left", at every width. `dashboard.remaining`
                          ("41g remaining") wrapped to three lines in the longer
                          languages inside a chip this narrow; `macroLeft` is
                          the short form for exactly this spot. */}
                      {t('dashboard.macroLeft', { value: round(remaining(tgt, c), 0) })}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

            {/* The meals, which are most of the page and all of the width a
                desktop can give them. On a desktop this is one cell beside the
                right-hand sidebar (calories + water + weight), so it no longer
                spans two rows — the sidebar owns its own vertical rhythm now. */}
            <div
              className="order-3 flex animate-rise-in-place flex-col gap-lg lg:order-none lg:col-span-2 lg:col-start-1 lg:row-start-2"
              style={{ animationDelay: '120ms' }}
            >
              {error && (
                <p role="alert" className="rounded-lens bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
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

            {/* The right-hand sidebar: calories, then water and weight. On a
                phone it is `display: contents` so the three cards fall straight
                into the single-column grid and each keeps its own `order` (this
                stack is split there — calories first, water and weight last,
                with the meals between). On a desktop it becomes one grid cell
                and a flex column, so the space between the calorie card and the
                water card is exactly one `gap-lg` — not `gap-lg` plus whatever
                slack the tall meals column left in a shared grid row. */}
            <div className="contents lg:col-start-3 lg:row-start-2 lg:flex lg:flex-col lg:gap-lg">

            {/* Calories: first thing on a phone, head of the sidebar on a
                desktop. */}
            <div
              className="order-1 animate-rise lg:order-none"
              style={{ animationDelay: '190ms' }}
            >
              {/* A card like every other, not the one solid tinted slab it
                  used to be. The slab was a violet-era decision carried into
                  Grove unexamined: a full-bleed gradient with white type, a
                  white-on-white ring, a breathing white blob and a looping
                  sheen. Grove's artboard draws this as an ordinary card whose
                  ring is the only saturated thing on it, and it is right —
                  calories being the day's headline is a job for a big serif
                  number and a sage arc, not for making one card louder than
                  the page it sits on. It also unpicked a knot: the card was
                  the only surface that hardcoded `text-white`, so it was what
                  stopped the dark CTA gradient becoming the light sage the
                  token spec asks for. */}
              <div className="flex flex-col items-center rounded-lens p-lg glass">
                <h3 className="mb-md self-start font-label-md text-label-md tracking-wide text-on-surface-variant">
                  {t('dashboard.calories')}
                </h3>

                <ProgressRing
                  consumed={consumedKcal}
                  target={goalKcal}
                  color="rgb(var(--primary))"
                  trackColor={RING_TRACK}
                  label={t('dashboard.calorieRingAria', {
                    consumed: Math.round(consumedKcal).toLocaleString(),
                    goal: Math.round(goalKcal).toLocaleString(),
                    remaining: remainingKcal.toLocaleString(),
                  })}
                  className="aspect-square w-full max-w-[11rem]"
                >
                  <span className="block font-data-display text-data-display leading-none text-on-surface">
                    {remainingKcal.toLocaleString()}
                  </span>
                  <span className="mt-1 block font-label-md text-label-md uppercase tracking-widest text-on-surface-variant">
                    {t('dashboard.remainingLabel')}
                  </span>
                </ProgressRing>

                {goalKcal > 0 && (
                  <span className="mt-md rounded-full bg-primary-tint/[0.10] px-4 py-2 font-label-md text-label-md text-primary">
                    {t('dashboard.percentOfGoal', {
                      value: Math.round((consumedKcal / goalKcal) * 100),
                    })}
                  </span>
                )}

                {/* Goal · Eaten · Left — the ring already leads with what is
                    left, and this strip carries the two figures it is derived
                    from beside it. All three reuse existing keys. Hairline
                    separators rather than gaps: three equal cells under one
                    rule read as one figure broken into parts, which is what
                    they are. */}
                <div className="stat-split mt-md w-full border-t border-outline-variant/20 pt-md">
                  <div className="min-w-0 flex-1 px-1 text-center">
                    <span className="block font-label-md text-label-md text-outline">
                      {t('dashboard.goal')}
                    </span>
                    <span className="mt-0.5 block font-label-md text-body-md font-bold text-on-surface">
                      {Math.round(goalKcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="stat-split-sep bg-outline-variant/20" />
                  <div className="min-w-0 flex-1 px-1 text-center">
                    <span className="block font-label-md text-label-md text-outline">
                      {t('dashboard.consumed')}
                    </span>
                    <span className="mt-0.5 block font-label-md text-body-md font-bold text-on-surface">
                      {Math.round(consumedKcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="stat-split-sep bg-outline-variant/20" />
                  <div className="min-w-0 flex-1 px-1 text-center">
                    <span className="block font-label-md text-label-md text-outline">
                      {t('dashboard.remainingLabel')}
                    </span>
                    <span className="mt-0.5 block font-label-md text-body-md font-bold text-on-surface">
                      {remainingKcal.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

            </div>

            {/* Water and weight: the two readings that are not about today's
                food, so they come after it on a phone and sit under the
                calorie card on a desktop. */}
            <div
              className="order-4 flex animate-rise flex-col gap-lg lg:order-none"
              style={{ animationDelay: '260ms' }}
            >
              <WaterCard />
              <WeightCard />
            </div>
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
      {/* `flex-wrap` plus a floor on the name's width. The meal's name was
          competing on one line with two icon buttons and the calorie total,
          and `truncate` resolved that competition by deleting the name — at
          150% text "Breakfast" came out as "B…". Below the floor the actions
          drop to a second row instead, which costs a line and keeps the word.
          The floor is in rem, so it rises with the text that needs the room. */}
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm border-b border-(--glass-row-border) pb-sm">
        <div className="flex min-w-[8rem] flex-1 items-center gap-sm">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              empty ? 'text-on-surface-variant glass-chip' : 'bg-primary-tint/[0.14] text-primary'
            }`}
          >
            <Icon name={icon} className="text-[1.1875rem]" />
          </span>
          <h3
            className={`truncate font-headline-md text-headline-md ${
              empty ? 'text-on-surface-variant' : 'text-on-surface'
            }`}
          >
            {label}
          </h3>
        </div>
        {/* `shrink-0` keeps the actions whole and lets the meal name truncate
            instead — but only down to the point where the actions themselves
            fit. `max-w-full` + `flex-wrap` is that floor: past it the kcal
            total drops under the icons rather than off the card. */}
        <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center justify-end gap-sm">
          {canPaste && (
            <button
              onClick={onPaste}
              disabled={pasting}
              className="flex min-h-9 items-center gap-xs rounded-full px-3.5 font-label-md text-label-md transition-opacity hover:opacity-90 disabled:opacity-40 grad-primary"
              title={t('dashboard.pasteMealHere')}
            >
              {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-[1rem]" />}
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
              phone width, where it used to be a bare unlabelled pill.

              `text-outline`, a step back from `on-surface-variant`: the
              artboard draws these lighter than the meal's name and its total,
              because they are the two things on the header nobody came for. It
              draws them at #b3bdb0, which is 1.9:1 on a card and fails WCAG
              1.4.11 for a control — the canvas says its contrast pass is still
              to come. `--outline` is the lightest token that clears 3:1, so it
              is where "lighter" stops. */}
          {!empty && !canPaste && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={onShare}
                className="tap-target flex min-h-10 min-w-10 items-center justify-center p-2 rounded-full text-outline transition-colors hover:bg-(--glass-chip-hover) hover:text-primary"
                aria-label={t('dashboard.shareMealAria', { meal: label })}
                title={t('dashboard.shareMealAria', { meal: label })}
              >
                <Icon name="ios_share" className="text-[1.25rem]" />
              </button>
              <button
                onClick={onCopy}
                className="tap-target flex min-h-10 min-w-10 items-center justify-center p-2 rounded-full text-outline transition-colors hover:bg-(--glass-chip-hover) hover:text-primary"
                aria-label={t('dashboard.copyMealAria', { meal: label })}
                title={t('dashboard.copyMealAria', { meal: label })}
              >
                <Icon name="content_copy" className="text-[1.25rem]" />
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
          {/* Solid, not a tint. This is the only thing on an empty meal card
              and the artboard fills it — a tinted pill under a grey
              illustration on an already-dashed card was three shades of
              nothing. */}
          <button
            onClick={onAdd}
            className="mt-2 min-h-2xl rounded-full bg-primary px-5 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90"
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
          {/* A filled sage-tinted bar, not a bare text link. It is the one
              action on a meal card and it sits under a list of rows that are
              themselves filled surfaces — transparent, it read as a caption
              under the last row rather than as the thing to press. The
              artboard fills it for the same reason. */}
          <button
            onClick={onAdd}
            className="mt-sm flex min-h-2xl w-full items-center justify-center gap-xs rounded-row bg-primary-tint/[0.10] py-2.5 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/20"
          >
            <Icon name="add" className="text-[1.125rem]" /> {t('dashboard.addMealItem', { meal: label })}
          </button>
        </div>
      )}
    </div>
  )
}

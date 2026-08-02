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
import { MACROS, type MealKey } from '@/lib/constants'
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
import { copyDayFoods, copyMealFoods, deleteFoodLog, updateLogServings } from '@/lib/foods'
import { formatDayText, formatMealText, shareText } from '@/lib/exportText'
import type { FoodLogWithFood } from '@/lib/database.types'
import { WeightCard } from '@/components/dashboard/WeightCard'
import { WaterCard } from '@/components/dashboard/WaterCard'

const ZERO: MacroGrams = { carbs_g: 0, protein_g: 0, fats_g: 0 }

export default function Dashboard() {
  const {
    selectedDate,
    setSelectedDate,
    openAddFood,
    foodLogVersion,
    bumpFoodLogVersion,
    copiedDay,
    copyDay,
    clearCopiedDay,
    copiedMeal,
    copyMeal,
    clearCopiedMeal,
  } = useAppShell()
  const { byDay, loading: targetsLoading } = useTargets()
  const { logs, loading: logsLoading, error } = useFoodLogs(selectedDate, foodLogVersion)
  const { locale } = useProfile()
  const { t } = useI18n()
  const { meals, loading: mealsLoading, labelFor } = useMeals()

  const [pasting, setPasting] = useState(false)
  const [pastingMeal, setPastingMeal] = useState<MealKey | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const shareNoticeTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(shareNoticeTimer.current), [])

  function flashShareNotice(message: string) {
    setShareNotice(message)
    clearTimeout(shareNoticeTimer.current)
    shareNoticeTimer.current = setTimeout(() => setShareNotice(null), 3000)
  }

  async function handleShare(text: string) {
    if (!text) return
    setActionError(null)
    try {
      const outcome = await shareText(text)
      if (outcome === 'copied') flashShareNotice(t('dashboard.shareCopied'))
    } catch {
      setActionError(t('dashboard.failedShare'))
    }
  }

  const canPasteHere = copiedDay !== null && copiedDay.date !== selectedDate

  async function handlePaste() {
    if (!copiedDay) return
    setPasting(true)
    setActionError(null)
    try {
      await copyDayFoods(copiedDay.date, selectedDate)
      bumpFoodLogVersion()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('dashboard.failedPaste'))
    } finally {
      setPasting(false)
    }
  }

  async function handlePasteMeal(targetMeal: MealKey) {
    if (!copiedMeal) return
    setPastingMeal(targetMeal)
    setActionError(null)
    try {
      await copyMealFoods(copiedMeal.date, copiedMeal.meal, selectedDate, targetMeal)
      bumpFoodLogVersion()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('dashboard.failedPasteMeal'))
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
      {/* Date selector */}
      <header className="flex items-center justify-between rounded-2xl bg-surface-container-lowest p-md shadow-card">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
            {isToday(selectedDate) ? t('dashboard.today') : formatWeekday(selectedDate, locale)}
          </h2>
          <p className="mt-1 font-label-md text-label-md font-normal text-on-surface-variant">
            {isToday(selectedDate) ? formatLong(selectedDate, locale) : formatMonthDay(selectedDate, locale)}
          </p>
        </div>
        <div className="flex items-center gap-sm">
          <button
            onClick={() => handleShare(formatDayText(logs, selectedDate, locale, t, meals))}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full bg-surface-container-low px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('dashboard.shareDayAria')}
            title={t('dashboard.shareDayAria')}
          >
            <Icon name="ios_share" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.shareDay')}</span>
          </button>
          <button
            onClick={() => copyDay(selectedDate, logs.length)}
            disabled={logsLoading || logs.length === 0}
            className="flex items-center gap-xs rounded-full bg-surface-container-low px-3 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={t('dashboard.copyDayAria')}
            title={t('dashboard.copyDayAria')}
          >
            <Icon name="content_copy" className="text-sm" />
            <span className="hidden sm:inline">{t('dashboard.copyDay')}</span>
          </button>
          <div className="flex items-center gap-sm rounded-full bg-surface-container-low p-1">
            <button
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
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
              className="flex items-center justify-center rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
              aria-label={t('dashboard.nextDay')}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        </div>
      </header>

      {copiedDay && (
        <div className="flex flex-col gap-sm rounded-2xl border border-primary/30 bg-primary-container/10 p-md shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-sm text-on-surface">
            <Icon name="content_paste" className="text-primary" />
            <p className="font-body-md text-body-md">
              {t(copiedDay.count === 1 ? 'dashboard.itemCopiedOne' : 'dashboard.itemCopiedOther', {
                count: copiedDay.count,
              })}{' '}
              <span className="font-label-md text-label-md">{formatShort(copiedDay.date, locale)}</span>
            </p>
          </div>
          <div className="flex items-center gap-sm">
            <button
              onClick={handlePaste}
              disabled={!canPasteHere || pasting}
              className="flex items-center gap-xs rounded-full bg-primary px-4 py-2 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              title={canPasteHere ? t('dashboard.pasteIntoThisDay') : t('dashboard.navigateToPaste')}
            >
              {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-sm" />}
              {t('dashboard.pasteHere')}
            </button>
            <button
              onClick={clearCopiedDay}
              className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
              aria-label={t('dashboard.clearCopiedDay')}
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        </div>
      )}

      {copiedMeal && (
        <div className="flex items-center justify-between gap-sm rounded-2xl border border-primary/30 bg-primary-container/10 p-md shadow-card">
          <div className="flex min-w-0 items-center gap-sm text-on-surface">
            <Icon name="content_paste" className="shrink-0 text-primary" />
            <p className="truncate font-body-md text-body-md">
              {t(copiedMeal.count === 1 ? 'dashboard.mealCopiedOne' : 'dashboard.mealCopiedOther', {
                count: copiedMeal.count,
                meal: labelFor(copiedMeal.meal),
              })}{' '}
              <span className="font-label-md text-label-md">{formatShort(copiedMeal.date, locale)}</span>
            </p>
          </div>
          <button
            onClick={clearCopiedMeal}
            className="shrink-0 rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label={t('dashboard.clearCopiedMeal')}
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}

      {shareNotice && (
        <p className="flex items-center gap-sm rounded-2xl border border-primary/30 bg-primary-container/10 px-md py-sm font-label-md text-label-md text-on-surface">
          <Icon name="check_circle" className="text-sm text-primary" />
          {shareNotice}
        </p>
      )}

      {actionError && (
        <p className="rounded-2xl bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      {targetsLoading ? (
        <LoadingBlock label={t('dashboard.loadingTargets')} />
      ) : (
        <>
          {!hasTarget && (
            <div className="flex flex-col items-start gap-sm rounded-2xl border border-dashed border-outline-variant/50 bg-surface-container-lowest p-lg shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-sm text-on-surface-variant">
                <Icon name="info" className="text-primary" />
                <p className="font-body-md text-body-md">
                  {t('dashboard.noTargetSet')}
                </p>
              </div>
              <Link
                to="/targets"
                className="rounded-full bg-primary-container/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-container/20"
              >
                {t('dashboard.setWeeklyTargets')}
              </Link>
            </div>
          )}

          {/* Macro rings — single horizontal box on mobile, separate cards on md+ */}
          <section className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-container-lowest p-md shadow-card md:gap-lg md:bg-transparent md:p-0 md:shadow-none">
            {MACROS.map((m) => {
              const c = consumed[m.field]
              const tgt = targetMacros[m.field]
              return (
                <div
                  key={m.key}
                  className="relative flex flex-col items-center overflow-hidden rounded-2xl md:bg-surface-container-lowest md:p-lg md:shadow-card"
                >
                  <div
                    className="absolute right-4 top-4 hidden rounded-full p-2 md:block"
                    style={{ color: m.color, backgroundColor: m.tint }}
                  >
                    <Icon name={m.icon} className="text-sm" />
                  </div>
                  <h3 className="mb-2 font-label-md text-label-md text-on-surface-variant md:mb-6 md:self-start">
                    {t(`macro.${m.key}`)}
                  </h3>
                  <ProgressRing
                    consumed={c}
                    target={tgt}
                    color={m.color}
                    trackColor={m.tint}
                    className="h-[88px] w-[88px] md:h-[120px] md:w-[120px]"
                  >
                    <span className="font-headline-md text-xl text-on-surface md:text-headline-md">
                      {round(c, 0)}
                      <span className="text-xs font-normal text-on-surface-variant md:text-sm">g</span>
                    </span>
                    <span className="mt-1 w-10 border-t border-outline-variant pt-1 text-center text-xs text-on-surface-variant md:w-12">
                      {round(tgt, 0)}g
                    </span>
                  </ProgressRing>
                  <div className="mt-2 text-center md:mt-4">
                    <p className="font-label-md text-xs text-on-surface md:text-label-md">
                      {t('dashboard.remaining', { value: round(remaining(tgt, c), 0) })}
                    </p>
                  </div>
                </div>
              )
            })}
          </section>

          {/* Food log + calorie summary */}
          <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
            <div className="flex flex-col gap-lg lg:col-span-2">
              {error && (
                <p className="rounded-2xl bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
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
                      onShare={() =>
                        handleShare(formatMealText(meal, mealLogs, selectedDate, locale, t))
                      }
                      canPaste={copiedMeal !== null}
                      pasting={pastingMeal === meal.key}
                      onPaste={() => handlePasteMeal(meal.key)}
                    />
                  )
                })
              )}
            </div>

            {/* Calorie summary */}
            <div className="flex flex-col gap-lg lg:col-span-1">
              <div className="relative overflow-hidden rounded-2xl bg-primary p-lg text-on-primary shadow-sm">
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                <h3 className="relative z-10 mb-xl font-headline-md text-headline-md">{t('dashboard.calories')}</h3>
                <div className="relative z-10 mb-lg flex flex-col items-center justify-center">
                  <div className="flex h-[160px] w-[160px] items-center justify-center rounded-full border-4 border-white/20 bg-white/10">
                    <div className="text-center">
                      <span className="block font-data-display text-data-display leading-none">
                        {Math.round(consumedKcal).toLocaleString()}
                      </span>
                      <span className="mt-1 block font-label-md text-label-md uppercase tracking-widest opacity-80">
                        {t('dashboard.consumed')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative z-10 flex items-center justify-between rounded-xl bg-black/10 p-md backdrop-blur-sm">
                  <div className="text-center">
                    <span className="block text-sm opacity-80">{t('dashboard.goal')}</span>
                    <span className="font-label-md text-label-md">
                      {Math.round(goalKcal).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-8 w-px bg-white/20" />
                  <div className="text-center">
                    <span className="block text-sm opacity-80">{t('dashboard.remainingLabel')}</span>
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
  onShare: () => void
  canPaste: boolean
  pasting: boolean
  onPaste: () => void
}) {
  const { t } = useI18n()
  const mealKcal = logs.reduce((sum, l) => sum + caloriesForServings(l.food, l.servings), 0)
  const empty = logs.length === 0

  return (
    <div
      className={`rounded-2xl bg-surface-container-lowest p-md shadow-card md:p-lg ${
        empty ? 'border border-dashed border-outline-variant/50' : ''
      }`}
    >
      <div className="mb-md flex items-center justify-between gap-sm border-b border-surface-container-high pb-sm">
        <div className="flex min-w-0 items-center gap-sm">
          <Icon name={icon} className={empty ? 'text-on-surface-variant' : 'text-primary'} />
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
              className="flex items-center gap-xs rounded-full bg-primary px-3 py-1 font-label-md text-label-md text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
              title={t('dashboard.pasteMealHere')}
            >
              {pasting ? <Spinner className="h-4 w-4" /> : <Icon name="content_paste" className="text-sm" />}
              <span className="hidden sm:inline">{t('dashboard.pasteMealHere')}</span>
            </button>
          )}
          {!empty && (
            <button
              onClick={onShare}
              className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-label={t('dashboard.shareMealAria', { meal: label })}
              title={t('dashboard.shareMealAria', { meal: label })}
            >
              <Icon name="ios_share" className="text-sm" />
            </button>
          )}
          {!empty && (
            <button
              onClick={onCopy}
              className="rounded-full p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-primary"
              aria-label={t('dashboard.copyMealAria', { meal: label })}
              title={t('dashboard.copyMealAria', { meal: label })}
            >
              <Icon name="content_copy" className="text-sm" />
            </button>
          )}
          <span className="font-label-md text-label-md text-on-surface-variant">
            {t('dashboard.mealKcal', { kcal: Math.round(mealKcal) })}
          </span>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-col items-center gap-sm py-xl text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-variant text-on-surface-variant">
            <Icon name="restaurant" />
          </div>
          <p className="text-sm text-on-surface-variant">{t('dashboard.noItemsLogged')}</p>
          <button
            onClick={onAdd}
            className="mt-2 rounded-xl bg-primary-container/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-container/20"
          >
            {t('dashboard.addMeal', { meal: label })}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          {logs.map((log) => (
            <FoodLogRow key={log.id} log={log} onChanged={onChanged} />
          ))}
          <button
            onClick={onAdd}
            className="mt-sm flex w-full items-center justify-center gap-xs rounded-xl py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-container/10"
          >
            <Icon name="add_circle" className="text-sm" /> {t('dashboard.addMealItem', { meal: label })}
          </button>
        </div>
      )}
    </div>
  )
}

/** Dominant-macro color for the leading dot. */
function dominantColor(m: MacroGrams): string {
  const entries = MACROS.map((meta) => ({ meta, val: m[meta.field] }))
  entries.sort((a, b) => b.val - a.val)
  return entries[0].val > 0 ? entries[0].meta.color : '#bcc9c6'
}

function FoodLogRow({ log, onChanged }: { log: FoodLogWithFood; onChanged: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  // Edit the logged quantity as an amount in the food's serving unit (e.g.
  // grams); servings is derived from it on save.
  const loggedAmount = round(log.servings * log.food.serving_amount, 2)
  const [amount, setAmount] = useState(loggedAmount)
  const [busy, setBusy] = useState(false)

  const scaled = scaleMacros(log.food, log.servings)
  const kcal = caloriesForServings(log.food, log.servings)

  async function save() {
    setBusy(true)
    try {
      await updateLogServings(log.id, amount / log.food.serving_amount)
      setEditing(false)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await deleteFoodLog(log.id)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group flex items-center justify-between gap-md rounded-xl border border-transparent p-sm transition-colors hover:border-surface-variant hover:bg-surface-container-low">
      <div className="flex min-w-0 items-center gap-md">
        <div
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dominantColor(scaled) }}
        />
        <div className="min-w-0">
          <p className="truncate font-label-md text-label-md text-on-surface">{log.food.name}</p>
          <p className="flex items-center gap-2 truncate text-sm text-on-surface-variant">
            {loggedAmount} {log.food.serving_unit}
          </p>
          {/* Macros under the name on mobile, where the right column has no room. */}
          {!editing && (
            <div className="mt-0.5 flex items-center gap-sm text-xs text-on-surface-variant sm:hidden">
              {MACROS.map((m) => (
                <span key={m.key} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {round(scaled[m.field])}g
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-md">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
              onFocus={(e) => e.target.select()}
              aria-label={t('dashboard.amountInUnit', { unit: log.food.serving_unit })}
              className="h-9 w-20 rounded-lg border border-outline-variant bg-surface px-2 text-center font-body-md text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <span className="font-body-md text-sm text-on-surface-variant">{log.food.serving_unit}</span>
            <button
              onClick={save}
              disabled={busy || amount <= 0}
              className="rounded-full p-1 text-primary hover:bg-primary-container/10"
              aria-label={t('dashboard.saveServingsAria')}
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="text-sm" />}
            </button>
            <button
              onClick={() => {
                setAmount(loggedAmount)
                setEditing(false)
              }}
              className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container-high"
              aria-label={t('dashboard.cancelEditAria')}
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        ) : (
          <>
            <div className="hidden items-center gap-sm text-xs text-on-surface-variant sm:flex">
              {MACROS.map((m) => (
                <span key={m.key} className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                  {round(scaled[m.field])}g
                </span>
              ))}
            </div>
            <span className="w-16 text-right font-label-md text-label-md text-on-surface">
              {t('dashboard.mealKcal', { kcal: Math.round(kcal) })}
            </span>
            <div className="flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                onClick={() => setEditing(true)}
                className="p-1 text-on-surface-variant hover:text-primary"
                aria-label={t('dashboard.editAria')}
              >
                <Icon name="edit" className="text-sm" />
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="p-1 text-on-surface-variant hover:text-error"
                aria-label={t('dashboard.deleteAria')}
              >
                <Icon name="delete" className="text-sm" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

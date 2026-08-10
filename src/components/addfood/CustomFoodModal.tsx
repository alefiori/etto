import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScrollLock } from '@/hooks/useScrollLock'
import { pushOverlay } from '@/lib/nativeBootstrap'
import { Icon } from '@/components/ui/Icon'
import { Spinner, LoadingBlock } from '@/components/ui/Spinner'
import { useAppShell } from '@/context/AppShellContext'
import { useI18n } from '@/context/I18nContext'
import { useMeals } from '@/context/MealsContext'
import { MACROS, SERVING_UNITS, type MealKey } from '@/lib/constants'
import { calories } from '@/lib/macros'
import {
  createCustomFood,
  getFood,
  logFoodEntry,
  updateCustomFood,
  type CustomFoodPrefill,
} from '@/lib/foods'

const fieldClass =
  'w-full min-h-[48px] rounded-[16px] glass-field px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors'

/**
 * Create or edit a custom food, as a sheet over whatever you were doing.
 *
 * This used to be a route — /foods/new and /foods/:id/edit — with a back arrow
 * and a page heading. Nothing about it wanted to be a page: you arrive from a
 * list or from the middle of the Add Food flow, you fill in six fields, and you
 * expect to come back to where you were. Making it a destination meant the Add
 * Food overlay had to close and throw you somewhere else to create the very
 * food you were searching for.
 *
 * The overlay language is the food-info sheet's: bottom sheet on a phone,
 * centred card from `sm` up. It is taller than that sheet, so the header and
 * the actions are pinned and only the fields between them scroll — a form whose
 * save button scrolls off the bottom of a phone is a form people abandon.
 *
 * It is mounted only while open (see AppLayout), which is what resets the
 * draft: a half-typed food that reappears the next time the sheet opens reads
 * as a bug, and reopening after a save must not show the previous food.
 */
export function CustomFoodModal({
  foodId,
  prefill,
  onClose,
  onSaved,
}: {
  /** Editing an existing custom food, rather than creating one. */
  foodId?: string
  /** Seed values for a new food, copied from an imported one. */
  prefill?: CustomFoodPrefill
  onClose: () => void
  /** The library changed — whoever is listing foods should refetch. */
  onSaved: () => void
}) {
  const navigate = useNavigate()
  const titleId = useId()
  const isEdit = Boolean(foodId)
  const { selectedDate, bumpFoodLogVersion } = useAppShell()
  const { t } = useI18n()
  const { meals } = useMeals()

  const [name, setName] = useState(prefill?.name ?? '')
  const [brand, setBrand] = useState(prefill?.brand ?? '')
  const [servingAmount, setServingAmount] = useState(
    prefill ? String(prefill.serving_amount) : '100',
  )
  const [servingUnit, setServingUnit] = useState(prefill?.serving_unit ?? 'g')
  const [carbs, setCarbs] = useState(prefill ? String(prefill.carbs_g) : '0')
  const [protein, setProtein] = useState(prefill ? String(prefill.protein_g) : '0')
  const [fats, setFats] = useState(prefill ? String(prefill.fats_g) : '0')
  // Empty until the user picks one; the first meal is the implicit default,
  // since the list only arrives once the meals have loaded.
  const [meal, setMeal] = useState<MealKey>('')

  const [loading, setLoading] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useScrollLock(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // See Modal: Android sends no Escape, so back must find this too.
    const unregister = pushOverlay(onClose)
    return () => {
      window.removeEventListener('keydown', onKey)
      unregister()
    }
  }, [onClose])

  // Edit mode: load the existing custom food and fill the form.
  useEffect(() => {
    if (!foodId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getFood(foodId)
      .then((food) => {
        if (cancelled) return
        if (!food) {
          setLoadError(t('createFood.notFound'))
        } else if (!food.is_custom) {
          setLoadError(t('createFood.onlyCustomEditable'))
        } else {
          setName(food.name)
          setBrand(food.brand ?? '')
          setServingAmount(String(food.serving_amount))
          setServingUnit(food.serving_unit)
          setCarbs(String(food.carbs_g))
          setProtein(String(food.protein_g))
          setFats(String(food.fats_g))
        }
      })
      .catch((err) =>
        !cancelled && setLoadError(err instanceof Error ? err.message : t('createFood.couldNotLoad')),
      )
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [foodId])

  const macros = useMemo(
    () => ({
      carbs_g: parseFloat(carbs) || 0,
      protein_g: parseFloat(protein) || 0,
      fats_g: parseFloat(fats) || 0,
    }),
    [carbs, protein, fats],
  )
  const kcal = calories(macros)
  const selectedMeal = meal || meals[0]?.key || ''
  const setters = { carbs_g: setCarbs, protein_g: setProtein, fats_g: setFats }
  const valueOf = { carbs_g: carbs, protein_g: protein, fats_g: fats }

  function validate(): string | null {
    if (!name.trim()) return t('createFood.enterFoodName')
    if (!(parseFloat(servingAmount) > 0)) return t('createFood.servingGreaterZero')
    return null
  }

  async function save(addToday: boolean) {
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        brand: brand.trim() || null,
        serving_amount: parseFloat(servingAmount),
        serving_unit: servingUnit,
        carbs_g: macros.carbs_g,
        protein_g: macros.protein_g,
        fats_g: macros.fats_g,
      }
      const food = isEdit
        ? await updateCustomFood(foodId!, payload)
        : await createCustomFood(payload)
      onSaved()
      if (addToday) {
        await logFoodEntry({ foodId: food.id, date: selectedDate, meal: selectedMeal, servings: 1 })
        bumpFoodLogVersion()
        onClose()
        // The one case that still moves you: you asked for this food to be on
        // today's plate, and the plate is the dashboard.
        navigate('/')
      } else {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFood.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="animate-overlay-fade-in fixed inset-0 z-[70] flex items-end justify-center p-0 glass-scrim sm:items-center sm:p-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="animate-sheet-up flex max-h-[92dvh] w-full flex-col rounded-t-[36px] shadow-sheet sm:max-h-[88vh] sm:max-w-lg sm:rounded-lens glass-sheet">
        {/* Header — pinned, so the sheet always says what it is. */}
        <div className="flex shrink-0 flex-col gap-md p-lg pb-md">
          {/* Grab handle — the phone-only affordance for a sheet you can dismiss. */}
          <div className="mx-auto -mt-2 h-1 w-9 rounded-full bg-outline-variant sm:hidden" />
          <div className="flex items-start justify-between gap-sm">
            <h2 id={titleId} className="font-headline-md text-headline-md text-on-surface">
              {isEdit ? t('createFood.editTitle') : t('createFood.createTitle')}
            </h2>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full glass-chip p-2 text-on-surface transition-colors"
              aria-label={t('common.close')}
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-lg pb-lg">
            <LoadingBlock label={t('createFood.loadingFood')} />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-md px-lg pb-lg text-center">
            <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
              {loadError}
            </p>
            <button
              onClick={onClose}
              className="rounded-full bg-primary-tint/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/20"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            {/* Only the fields scroll. */}
            <form
              className="flex min-h-0 flex-1 flex-col gap-lg overflow-y-auto px-lg pb-md"
              onSubmit={(e) => e.preventDefault()}
            >
              {error && (
                <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-md">
                <div className="flex flex-col gap-2">
                  <label
                    className="font-label-md text-label-md text-on-surface-variant"
                    htmlFor="foodName"
                  >
                    {t('createFood.foodName')}
                  </label>
                  <input
                    id="foodName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('createFood.foodNamePlaceholder')}
                    className={fieldClass}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-label-md text-label-md text-on-surface-variant"
                    htmlFor="foodBrand"
                  >
                    {t('createFood.brand')}{' '}
                    <span className="text-outline">({t('common.optional')})</span>
                  </label>
                  <input
                    id="foodBrand"
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder={t('createFood.brandPlaceholder')}
                    className={fieldClass}
                  />
                </div>
                {/* `sm:` rather than `md:` throughout the sheet: the breakpoint
                    that matters is the sheet's own width, and from `sm` up it is
                    a fixed 512px card no matter how wide the window gets. */}
                <div className="flex flex-col gap-md sm:flex-row">
                  <div className="flex flex-1 flex-col gap-2">
                    <label
                      className="font-label-md text-label-md text-on-surface-variant"
                      htmlFor="servingAmount"
                    >
                      {t('createFood.servingAmount')}
                    </label>
                    <input
                      id="servingAmount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={servingAmount}
                      onChange={(e) => setServingAmount(e.target.value)}
                      placeholder="100"
                      className={fieldClass}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2">
                    <label
                      className="font-label-md text-label-md text-on-surface-variant"
                      htmlFor="servingUnit"
                    >
                      {t('createFood.servingUnit')}
                    </label>
                    <select
                      id="servingUnit"
                      value={servingUnit}
                      onChange={(e) => setServingUnit(e.target.value)}
                      className={fieldClass}
                    >
                      {SERVING_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <hr className="border-[color:var(--glass-row-border)]" />

              <div className="flex flex-col gap-md">
                <div className="flex items-end justify-between gap-sm">
                  <h3 className="font-label-md text-label-md text-on-surface-variant">
                    {t('createFood.macrosPerServing')}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline-md text-headline-md text-on-surface">
                      {Math.round(kcal)}
                    </span>
                    <span className="font-body-md text-sm text-on-surface-variant">
                      {t('common.kcal')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
                  {MACROS.map((m) => (
                    <div key={m.key} className="flex flex-col gap-2">
                      <label
                        className="flex items-center gap-2 font-label-md text-label-md"
                        style={{ color: m.color }}
                        htmlFor={`${m.key}Input`}
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />
                        {t('createFood.macroLabel', { macro: t(`macro.${m.key}`) })}
                      </label>
                      <input
                        id={`${m.key}Input`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={valueOf[m.field]}
                        onChange={(e) => setters[m.field](e.target.value)}
                        onFocus={(e) => e.target.value === '0' && e.target.select()}
                        className="min-h-[48px] w-full rounded-[16px] glass-field px-4 py-3 font-body-md text-body-md text-on-surface outline-none transition-colors"
                        style={{ caretColor: m.color }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface-variant">
                  {t('createFood.mealIfAddingToday')}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {meals.map((mm) => (
                    <button
                      key={mm.key}
                      type="button"
                      onClick={() => setMeal(mm.key)}
                      aria-pressed={selectedMeal === mm.key}
                      className={`truncate rounded-lg border py-2 font-label-md text-label-md transition-colors ${
                        selectedMeal === mm.key
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-transparent text-on-surface hover:brightness-[1.06] glass-field'
                      }`}
                    >
                      {mm.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>

            {/* Actions — pinned, so they never scroll away under a thumb. */}
            <div className="flex shrink-0 flex-col gap-sm border-t border-[color:var(--glass-row-border)] p-lg pb-[calc(theme(spacing.lg)+theme(spacing.safe-bottom))] sm:flex-row sm:pb-lg">
              <button
                type="button"
                onClick={() => save(false)}
                disabled={busy}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full font-label-md text-label-md font-semibold transition-all hover:brightness-105 active:scale-95 disabled:opacity-60 grad-primary"
              >
                {busy ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[20px]" />}
                {isEdit ? t('createFood.saveChanges') : t('createFood.saveFood')}
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy}
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-primary-tint/20 font-label-md text-label-md font-semibold text-primary transition-all hover:bg-primary-tint/30 active:scale-95 disabled:opacity-60"
              >
                <Icon name="add_task" className="text-[20px]" />
                {t('createFood.saveAddToday')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

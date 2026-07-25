import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
  'w-full min-h-[48px] rounded-lg border border-outline-variant bg-surface-bright px-4 py-3 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors'

export default function CreateCustomFood() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const { selectedDate, bumpFoodLogVersion } = useAppShell()
  const { t } = useI18n()
  const { meals } = useMeals()

  // When arriving from "Edit & save as custom" on an API food, the source
  // values ride along in router state. Create-mode only — saving always makes a
  // fresh custom row and never touches the original API/global food.
  const prefill = (location.state as { prefill?: CustomFoodPrefill } | null)?.prefill

  const [name, setName] = useState(prefill?.name ?? '')
  const [brand, setBrand] = useState(prefill?.brand ?? '')
  const [servingAmount, setServingAmount] = useState(
    prefill ? String(prefill.serving_amount) : '1',
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

  // Edit mode: load the existing custom food and prefill the form.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    getFood(id)
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
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : t('createFood.couldNotLoad')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

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
      const food = isEdit ? await updateCustomFood(id!, payload) : await createCustomFood(payload)
      if (addToday) {
        await logFoodEntry({ foodId: food.id, date: selectedDate, meal: selectedMeal, servings: 1 })
        bumpFoodLogVersion()
        navigate('/')
      } else {
        navigate('/foods')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('createFood.couldNotSave'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col px-container-margin-mobile py-lg pb-32 md:px-container-margin-desktop">
      <div className="mb-lg flex items-center gap-sm">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('createFood.goBack')}
          className="rounded-full p-2 transition-colors hover:bg-surface-container-low"
        >
          <Icon name="arrow_back" className="text-on-surface-variant" />
        </button>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface md:font-headline-lg md:text-headline-lg">
          {isEdit ? t('createFood.editTitle') : t('createFood.createTitle')}
        </h1>
      </div>

      {loading ? (
        <LoadingBlock label={t('createFood.loadingFood')} />
      ) : loadError ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-md rounded-2xl bg-surface-container-lowest p-lg text-center shadow-card">
          <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
            {loadError}
          </p>
          <button
            onClick={() => navigate('/foods')}
            className="rounded-full bg-primary-container/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-container/20"
          >
            {t('createFood.backToMyFoods')}
          </button>
        </div>
      ) : (
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-surface-container-lowest p-5 shadow-card md:p-[20px]">
        <form className="flex flex-col gap-lg" onSubmit={(e) => e.preventDefault()}>
          {error && (
            <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
              {error}
            </p>
          )}

          {/* Food details */}
          <div className="flex flex-col gap-md">
            <h2 className="font-headline-md text-headline-md font-bold text-primary">{t('createFood.foodDetails')}</h2>
            <div className="flex flex-col gap-2">
              <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="foodName">
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
              <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="foodBrand">
                {t('createFood.brand')} <span className="text-outline">({t('common.optional')})</span>
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
            <div className="flex flex-col gap-md md:flex-row">
              <div className="flex flex-1 flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="servingAmount">
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
                  placeholder="1"
                  className={fieldClass}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label className="font-label-md text-label-md text-on-surface-variant" htmlFor="servingUnit">
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

          <hr className="border-surface-container-highest" />

          {/* Macros */}
          <div className="flex flex-col gap-md">
            <div className="flex items-end justify-between">
              <h2 className="font-headline-md text-headline-md font-bold text-primary">
                {t('createFood.macrosPerServing')}
              </h2>
              <div className="flex flex-col items-end">
                <span className="font-label-md text-label-md text-on-surface-variant">{t('createFood.estCalories')}</span>
                <div className="flex items-baseline gap-1">
                  <span className="font-data-display text-data-display font-extrabold text-on-surface">
                    {Math.round(kcal)}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface-variant">{t('common.kcal')}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-md md:grid-cols-3">
              {MACROS.map((m) => (
                <div key={m.key} className="flex flex-col gap-2">
                  <label
                    className="flex items-center gap-2 font-label-md text-label-md"
                    style={{ color: m.color }}
                    htmlFor={`${m.key}Input`}
                  >
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
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
                    className="min-h-[48px] w-full rounded-lg border border-outline-variant bg-surface-bright px-4 py-3 font-body-md text-body-md text-on-surface outline-none transition-colors"
                    style={{ caretColor: m.color }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Meal (used when adding to today) */}
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
                      : 'border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                  }`}
                >
                  {mm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-md flex flex-col gap-sm sm:flex-row">
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-primary font-label-md text-label-md font-semibold text-on-primary shadow-sm transition-all hover:bg-on-primary-fixed-variant hover:shadow-md active:scale-95 disabled:opacity-60"
            >
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="save" className="text-[20px]" />}
              {isEdit ? t('createFood.saveChanges') : t('createFood.saveFood')}
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={busy}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-primary-container/20 font-label-md text-label-md font-semibold text-primary transition-all hover:bg-primary-container/30 active:scale-95 disabled:opacity-60"
            >
              <Icon name="add_task" className="text-[20px]" />
              {t('createFood.saveAddToday')}
            </button>
          </div>
        </form>
      </div>
      )}
    </div>
  )
}

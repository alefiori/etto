import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Spinner'
import { SourceTag } from '@/components/ui/SourceTag'

// Lazy-loaded so the barcode-scanning library (ZXing) stays out of the initial
// bundle and is only fetched when the user actually opens the scanner.
const BarcodeScanner = lazy(() =>
  import('@/components/addfood/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner })),
)
import { useFoodSearch, type SearchResult } from '@/hooks/useFoodSearch'
import { useAppShell } from '@/context/AppShellContext'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { useI18n } from '@/context/I18nContext'
import { useMeals } from '@/context/MealsContext'
import { MACROS, type MealKey } from '@/lib/constants'
import { calories, caloriesForServings, scaleMacros, round, type MacroGrams } from '@/lib/macros'
import { compatibleUnits, servingsFor } from '@/lib/units'
import { logFoodEntry, upsertExternalFood, type CustomFoodPrefill } from '@/lib/foods'
import { lookupBarcode } from '@/lib/foodApi'
import { formatWeekday } from '@/lib/date'
import { SOURCE_ICONS } from '@/lib/foodSources'
import type { FoodSource } from '@/lib/database.types'

interface NormalizedFood extends MacroGrams {
  name: string
  subtitle: string
  source: FoodSource
  serving_amount: number
  serving_unit: string
}

function normalize(result: SearchResult): NormalizedFood {
  const f = result.food
  return {
    name: f.name,
    subtitle: `${f.brand ? f.brand + ' • ' : ''}${f.serving_amount} ${f.serving_unit}`,
    source: f.source,
    serving_amount: f.serving_amount,
    serving_unit: f.serving_unit,
    carbs_g: f.carbs_g,
    protein_g: f.protein_g,
    fats_g: f.fats_g,
  }
}

export function AddFoodModal({
  open,
  initialMeal,
  onClose,
}: {
  open: boolean
  initialMeal?: MealKey
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { selectedDate, bumpFoodLogVersion } = useAppShell()
  const { offLanguage, locale } = useProfile()
  const { user } = useAuth()
  const { t } = useI18n()
  const { meals } = useMeals()

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [meal, setMeal] = useState<MealKey>(initialMeal ?? meals[0]?.key ?? '')
  // Quantity is entered as an amount in a unit of measure (e.g. 80 g, 10 lb).
  // It is converted to a `servings` multiplier at log time.
  const [amount, setAmount] = useState(1)
  const [amountUnit, setAmountUnit] = useState('g')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<string | null>(null)

  const { results, loading, error: searchError } = useFoodSearch(query, offLanguage)

  // Reset transient state whenever the modal opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(null)
      setMeal(initialMeal ?? meals[0]?.key ?? '')
      setAmount(1)
      setAmountUnit('g')
      setError(null)
      setScanning(false)
      setLookingUp(false)
      setLookupMsg(null)
    }
  }, [open, initialMeal])

  // The meals may still be loading when the modal opens — pick the first one as
  // soon as they arrive, without disturbing anything the user has typed.
  useEffect(() => {
    if (!meal && meals.length > 0) setMeal(initialMeal ?? meals[0].key)
  }, [meal, meals, initialMeal])

  const detail = useMemo(() => (selected ? normalize(selected) : null), [selected])
  const unitOptions = useMemo(
    () => (detail ? compatibleUnits(detail.serving_unit) : []),
    [detail],
  )
  const servings = detail
    ? servingsFor(amount, amountUnit, detail.serving_amount, detail.serving_unit)
    : 0
  const scaled = detail ? scaleMacros(detail, servings) : null
  const totalKcal = detail ? caloriesForServings(detail, servings) : 0

  // Select a food and seed the amount with its own serving size (e.g. 100 g),
  // so the default quantity equals one serving.
  const selectFood = useCallback((result: SearchResult) => {
    setSelected(result)
    setAmount(result.food.serving_amount)
    setAmountUnit(result.food.serving_unit)
    setLookupMsg(null)
  }, [])

  async function handleAdd() {
    if (!selected || !detail) return
    setSaving(true)
    setError(null)
    try {
      let foodId: string
      if (selected.kind === 'external') {
        const food = await upsertExternalFood(selected.food)
        foodId = food.id
      } else {
        foodId = selected.food.id
      }
      await logFoodEntry({ foodId, date: selectedDate, meal, servings })
      bumpFoodLogVersion()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addFood.couldNotAdd'))
    } finally {
      setSaving(false)
    }
  }

  // Look up a scanned barcode and surface it exactly like a normal external
  // search result (so adding it runs the same upsertExternalFood path).
  const handleScanned = useCallback(async (code: string) => {
    setScanning(false)
    setLookupMsg(null)
    setLookingUp(true)
    try {
      const food = await lookupBarcode(code, undefined, offLanguage)
      if (food) {
        selectFood({
          kind: 'external',
          id: `ext:${food.source}:${food.externalId}`,
          food,
        })
      } else {
        setLookupMsg(t('addFood.noProductFound', { code }))
      }
    } catch (err) {
      setLookupMsg(err instanceof Error ? err.message : t('addFood.lookupFailed'))
    } finally {
      setLookingUp(false)
    }
  }, [offLanguage, selectFood, t])

  function goCreateCustom(prefill?: CustomFoodPrefill) {
    onClose()
    navigate('/foods/new', prefill ? { state: { prefill } } : undefined)
  }

  // Copy the selected API food into the custom-food form (create mode). The
  // original API/global row is never mutated — saving always inserts a new
  // custom food via createCustomFood().
  function goEditAsCustom() {
    if (!selected || selected.kind !== 'external') return
    const f = selected.food
    goCreateCustom({
      name: f.name,
      brand: f.brand,
      serving_amount: f.serving_amount,
      serving_unit: f.serving_unit,
      carbs_g: f.carbs_g,
      protein_g: f.protein_g,
      fats_g: f.fats_g,
    })
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="add-food-title">
      <div className="relative flex h-full flex-col lg:flex-row">
        {scanning && (
          <Suspense
            fallback={
              <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black text-white">
                <Spinner className="h-6 w-6" />
              </div>
            }
          >
            <BarcodeScanner onDetected={handleScanned} onClose={() => setScanning(false)} />
          </Suspense>
        )}
        {/* Search + results column — hidden on mobile once a food is selected */}
        <section
          className={`min-h-0 flex-1 flex-col border-surface-variant lg:flex lg:border-r ${
            selected ? 'hidden' : 'flex'
          }`}
        >
          <header className="flex items-center justify-between gap-md border-b border-surface-variant p-md">
            <h2 id="add-food-title" className="font-headline-md text-headline-md text-on-surface">
              {t('addFood.title')}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full bg-surface-container-high p-2 text-on-surface transition-colors hover:bg-surface-variant"
              aria-label={t('addFood.close')}
            >
              <Icon name="close" />
            </button>
          </header>

          <div className="p-md">
            <div className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('addFood.searchAria')}
                placeholder={t('addFood.searchPlaceholder')}
                className="h-[48px] w-full rounded-lg border border-outline-variant bg-surface pl-[40px] pr-4 font-body-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {loading && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />}
            </div>

            <button
              onClick={() => {
                setLookupMsg(null)
                setScanning(true)
              }}
              className="mt-sm flex w-full items-center justify-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low py-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-high"
            >
              <Icon name="barcode_scanner" />
              {t('addFood.scanBarcode')}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-md pb-md">
            {searchError && (
              <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                {searchError}
              </p>
            )}

            {lookingUp && (
              <div className="flex items-center justify-center gap-sm py-lg text-on-surface-variant">
                <Spinner className="h-4 w-4 text-primary" />
                <span className="font-body-md text-body-md">{t('addFood.lookingUp')}</span>
              </div>
            )}

            {lookupMsg && (
              <div className="mb-md flex flex-col items-start gap-sm rounded-lg bg-surface-container-low px-md py-sm">
                <p className="flex items-center gap-2 font-label-md text-label-md text-on-surface">
                  <Icon name="info" className="text-secondary" />
                  {lookupMsg}
                </p>
                <button
                  onClick={() => goCreateCustom()}
                  className="rounded-full bg-primary-container/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-container/20"
                >
                  {t('addFood.createCustomFood')}
                </button>
              </div>
            )}

            {!query.trim() && (
              <div className="flex flex-col items-center gap-sm py-2xl text-center text-on-surface-variant">
                <Icon name="nutrition" className="text-3xl text-outline-variant" />
                <p className="font-body-md text-body-md">
                  {t('addFood.searchPrompt')}
                </p>
              </div>
            )}

            {query.trim() && !loading && results.length === 0 && !searchError && (
              <div className="flex flex-col items-center gap-sm py-2xl text-center text-on-surface-variant">
                <Icon name="search_off" className="text-3xl text-outline-variant" />
                <p className="font-body-md text-body-md">{t('addFood.noFoodsFound', { query: query.trim() })}</p>
              </div>
            )}

            {results.length > 0 && (
              <div className="sticky top-0 z-10 mb-xs flex items-center justify-between bg-surface-container-lowest py-sm">
                <h3 className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  {t('addFood.results')}
                </h3>
                <span className="font-body-md text-sm text-outline">
                  {t(results.length === 1 ? 'addFood.resultCountOne' : 'addFood.resultCountOther', {
                    count: results.length,
                  })}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-xs">
              {results.map((r) => {
                const n = normalize(r)
                const kcal = calories(n)
                const isSelected = selected?.id === r.id
                // A local row owned by someone else is a food shared to the community.
                const isCommunity =
                  r.kind === 'local' && r.food.user_id !== null && r.food.user_id !== user?.id
                return (
                  <button
                    key={r.id}
                    onClick={() => selectFood(r)}
                    className={`flex items-center justify-between gap-sm rounded-xl border p-md text-left transition-colors ${
                      isSelected
                        ? 'border-primary/20 bg-primary-container/10'
                        : 'border-transparent hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-md">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          n.source === 'custom'
                            ? 'bg-primary-container text-on-primary-container'
                            : 'bg-surface-container-high text-secondary'
                        }`}
                      >
                        <Icon
                          name={
                            isCommunity
                              ? 'group'
                              : n.source === 'custom'
                                ? 'restaurant'
                                : SOURCE_ICONS[n.source]
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-label-md text-label-md text-on-surface">{n.name}</h3>
                        <p className="flex items-center gap-2 truncate font-body-md text-sm text-on-surface-variant">
                          {n.subtitle}
                          {isCommunity && (
                            <span className="flex shrink-0 items-center gap-0.5 text-secondary">
                              <Icon name="group" className="text-[14px]" />
                              {t('common.community')}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-3 font-label-md text-sm text-secondary">
                      <span className="flex flex-col items-center">
                        <b>{Math.round(kcal)}</b>
                        <span className="text-xs font-normal">kcal</span>
                      </span>
                      {MACROS.map((m) => (
                        <span key={m.key} className="flex flex-col items-center" style={{ color: m.color }}>
                          <b>{round(n[m.field])}g</b>
                          <span className="text-xs font-normal text-on-surface-variant">{t(`macro.${m.key}Abbr`)}</span>
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-surface-variant p-md">
            <button
              onClick={() => goCreateCustom()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F0FDFA] py-3 font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-high"
            >
              <Icon name="add_circle" />
              {t('addFood.createCustomFood')}
            </button>
          </div>
        </section>

        {/* Detail / log panel — takes over the sheet on mobile when selected */}
        <section
          className={`min-h-0 w-full flex-1 flex-col bg-surface-container-lowest lg:flex lg:w-[400px] lg:flex-none ${
            selected ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!detail ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-sm p-xl text-center text-on-surface-variant">
              <Icon name="touch_app" className="text-3xl text-outline-variant" />
              <p className="font-body-md text-body-md">{t('addFood.selectToLog')}</p>
            </div>
          ) : (
            <>
              <div className="border-b border-surface-variant p-xl">
                <button
                  onClick={() => setSelected(null)}
                  className="mb-md flex items-center gap-1 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface lg:hidden"
                >
                  <Icon name="arrow_back" className="text-[20px]" />
                  {t('addFood.backToSearch')}
                </button>
                <div className="mb-md flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container text-on-primary-container">
                  <Icon name="nutrition" className="text-3xl" />
                </div>
                <h2 className="mb-xs font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
                  {detail.name}
                </h2>
                <p className="font-body-md text-body-md text-on-surface-variant">{detail.subtitle}</p>
                {detail.source !== 'custom' && (
                  <span className="mt-sm inline-block">
                    <SourceTag source={detail.source} />
                  </span>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-xl overflow-y-auto p-xl">
                {/* Live macro totals */}
                <div className="flex items-center justify-around">
                  {MACROS.map((m) => (
                    <div key={m.key} className="flex flex-col items-center">
                      <span className="font-headline-md text-headline-md text-on-surface">
                        {round(scaled![m.field])}g
                      </span>
                      <span className="font-label-md text-label-md" style={{ color: m.color }}>
                        {t(`macro.${m.key}`)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="text-center font-label-md text-label-md text-secondary">
                  {t('addFood.totalEnergy')}{' '}
                  <span className="ml-1 text-lg font-bold text-on-surface">{Math.round(totalKcal)} {t('common.kcal')}</span>
                </div>

                <hr className="border-surface-variant" />

                {/* Meal picker */}
                <div>
                  <label className="mb-2 block font-label-md text-label-md text-on-surface-variant">{t('addFood.meal')}</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {meals.map((m) => (
                      <button
                        key={m.key}
                        onClick={() => setMeal(m.key)}
                        aria-pressed={meal === m.key}
                        className={`truncate rounded-lg border py-2 font-label-md text-label-md transition-colors ${
                          meal === m.key
                            ? 'border-primary bg-primary text-on-primary'
                            : 'border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount — entered as a quantity in a unit of measure */}
                <div>
                  <label
                    htmlFor="amount-input"
                    className="mb-2 block font-label-md text-label-md text-on-surface-variant"
                  >
                    {t('addFood.amount')}
                  </label>
                  <div className="flex items-center gap-sm">
                    <input
                      id="amount-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                      onFocus={(e) => e.target.select()}
                      className="h-[48px] flex-1 rounded-lg border border-outline-variant bg-surface-container-low px-4 text-center font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                    <select
                      aria-label={t('addFood.unit')}
                      value={amountUnit}
                      onChange={(e) => setAmountUnit(e.target.value)}
                      disabled={unitOptions.length <= 1}
                      className="h-[48px] rounded-lg border border-outline-variant bg-surface-container-low px-3 font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-70"
                    >
                      {unitOptions.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 font-body-md text-xs text-on-surface-variant">
                    {t('addFood.servingHint', {
                      servings: round(servings, 2),
                      amount: detail.serving_amount,
                      unit: detail.serving_unit,
                    })}
                  </p>
                </div>

                {error && (
                  <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
                    {error}
                  </p>
                )}

                {/* Confirm — sits right under the controls */}
                <button
                  onClick={handleAdd}
                  disabled={saving || servings <= 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 font-headline-md text-headline-md text-on-primary shadow-md transition-all hover:bg-on-primary-fixed-variant active:scale-[0.98] disabled:opacity-60"
                >
                  {saving ? (
                    <Spinner className="h-5 w-5" />
                  ) : (
                    <>
                      <Icon name="check" />
                      {t('addFood.addToDay', { day: formatWeekday(selectedDate, locale) })}
                    </>
                  )}
                </button>

                {selected?.kind === 'external' && (
                  <button
                    onClick={goEditAsCustom}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-outline-variant py-3 font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container-high disabled:opacity-60"
                  >
                    <Icon name="edit" />
                    {t('addFood.editAsCustom')}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useAppShell } from '@/context/AppShellContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { FoodRow } from '@/components/ui/FoodRow'
import { LoadingBlock } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { calories } from '@/lib/macros'
import { deleteFood, setFoodPublic, type CustomFoodPrefill } from '@/lib/foods'
import type { Food } from '@/lib/database.types'

/** Map an imported API food into prefill values for a brand-new custom copy. */
function toPrefill(food: Food): CustomFoodPrefill {
  return {
    name: food.name,
    brand: food.brand,
    serving_amount: food.serving_amount,
    serving_unit: food.serving_unit,
    carbs_g: food.carbs_g,
    protein_g: food.protein_g,
    fats_g: food.fats_g,
  }
}

export default function MyFoods() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { openCustomFood, foodsVersion } = useAppShell()
  const [foods, setFoods] = useState<Food[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Food | null>(null)

  const fetchFoods = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    // Scope to the current user explicitly: RLS also admits other people's
    // shared (is_public) foods, which belong in search — not in "My Foods".
    const { data, error: err } = await supabase
      .from('foods')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setFoods((data as Food[]) ?? [])
    setLoading(false)
  }, [user])

  // Refetch when the sheet saves. It used to be a route, so saving navigated
  // back here and remounted the page; a sheet closes over a list that is still
  // mounted and would otherwise show the food as it was before the edit.
  useEffect(() => {
    fetchFoods()
  }, [fetchFoods, foodsVersion])

  async function confirmDelete() {
    const food = pendingDelete
    if (!food) return
    setPendingDelete(null)
    // Optimistic removal.
    const prev = foods
    setFoods((f) => f.filter((x) => x.id !== food.id))
    try {
      await deleteFood(food.id)
    } catch (err) {
      setFoods(prev)
      const msg = err instanceof Error ? err.message : ''
      // Raised by the prevent_delete_shared_food_in_use trigger (migration 0006).
      setError(
        msg.includes('shared_food_in_use')
          ? t('myFoods.sharedInUse')
          : msg || t('myFoods.couldNotDelete'),
      )
    }
  }

  async function togglePublic(food: Food) {
    const next = !food.is_public
    // Optimistic toggle.
    setFoods((f) => f.map((x) => (x.id === food.id ? { ...x, is_public: next } : x)))
    try {
      await setFoodPublic(food.id, next)
    } catch (err) {
      setFoods((f) => f.map((x) => (x.id === food.id ? { ...x, is_public: !next } : x)))
      setError(err instanceof Error ? err.message : t('myFoods.couldNotShare'))
    }
  }

  /**
   * What "edit" means depends on where the food came from.
   *
   * A custom food is edited in place. An imported one is not editable at all —
   * it is a copy of somebody else's record — so editing it means starting a new
   * custom food prefilled from it, which is what the row's badge is warning
   * about before you ever open the menu.
   */
  function editFood(food: Food) {
    if (food.is_custom) openCustomFood({ id: food.id })
    else openCustomFood({ prefill: toPrefill(food) })
  }

  const filtered = foods.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-lg px-container-margin-mobile py-lg md:px-container-margin-desktop md:py-xl">
      <div className="flex flex-col justify-between gap-md sm:flex-row sm:items-end">
        <div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface md:font-headline-lg md:text-headline-lg">
            {t('myFoods.title')}
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t('myFoods.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCustomFood()}
          className="settle flex h-2xl items-center justify-center gap-sm rounded-full px-lg font-label-md text-label-md hover:brightness-105 active:scale-95 grad-primary"
        >
          <Icon name="add" />
          {t('myFoods.createCustomFood')}
        </button>
      </div>

      <div className="relative rounded-lens p-2 glass">
        <Icon
          name="search"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-outline"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('myFoods.filterPlaceholder')}
          className="h-2xl w-full rounded-lg border-none bg-transparent pl-container-margin-desktop pr-4 font-body-md text-body-md text-on-surface outline-hidden focus:ring-2 focus:ring-primary"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-error-container px-md py-sm font-label-md text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {loading ? (
        <LoadingBlock label={t('myFoods.loadingFoods')} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-sm rounded-lens py-2xl text-center glass">
          <div className="flex h-12 w-12 items-center justify-center rounded-full glass-chip text-on-surface-variant">
            <Icon name="restaurant_menu" />
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            {foods.length === 0 ? t('myFoods.noFoodsYet') : t('myFoods.noFoodsMatch')}
          </p>
          {foods.length === 0 && (
            <button
              type="button"
              onClick={() => openCustomFood()}
              className="mt-2 rounded-full bg-primary-tint/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/20"
            >
              {t('myFoods.createFirstFood')}
            </button>
          )}
        </div>
      ) : (
        /* The same card-of-rows the dashboard's meal cards are, down to the
           gap and the padding — `overflow-hidden` is deliberately gone, since
           it would clip the menu a row opens. */
        <div className="flex flex-col gap-sm rounded-lens p-md md:p-lg glass">
          {filtered.map((food) => (
            <FoodRow
              key={food.id}
              name={food.name}
              amount={`${food.serving_amount} ${food.serving_unit}`}
              // A food stores its macros per serving, and the row shows one
              // serving — so unlike a log, there is nothing to scale.
              macros={food}
              kcalLabel={t('dashboard.mealKcal', { kcal: Math.round(calories(food)) })}
              // Which of the two lists a food came from decides what editing it
              // even means, so it stays on the row rather than being something
              // you discover by opening the menu.
              badge={{
                icon: food.is_custom ? 'restaurant' : 'public',
                label: food.is_custom ? t('myFoods.custom') : t('myFoods.imported'),
              }}
              menuLabel={t('myFoods.foodOptions')}
              onActivate={() => editFood(food)}
              actions={[
                ...(food.is_custom
                  ? [
                      {
                        icon: food.is_public ? 'public_off' : 'public',
                        label: food.is_public
                          ? t('myFoods.unshare')
                          : t('myFoods.shareToCommunity'),
                        onSelect: () => togglePublic(food),
                      },
                    ]
                  : []),
                {
                  icon: 'edit',
                  label: food.is_custom ? t('common.edit') : t('myFoods.editAsCustomTitle'),
                  onSelect: () => editFood(food),
                },
                {
                  icon: 'delete',
                  label: t('common.delete'),
                  destructive: true,
                  onSelect: () => setPendingDelete(food),
                },
              ]}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('myFoods.deleteTitle')}
        message={pendingDelete ? t('myFoods.deleteConfirm', { name: pendingDelete.name }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

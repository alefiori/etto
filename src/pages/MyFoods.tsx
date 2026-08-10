import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import { LoadingBlock } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { MACROS } from '@/lib/constants'
import { calories, round } from '@/lib/macros'
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

  useEffect(() => {
    fetchFoods()
  }, [fetchFoods])

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
        <Link
          to="/foods/new"
          className="flex h-[48px] items-center justify-center gap-sm rounded-full px-lg font-label-md text-label-md transition-all hover:brightness-105 active:scale-95 grad-primary"
        >
          <Icon name="add" />
          {t('myFoods.createCustomFood')}
        </Link>
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
          className="h-[48px] w-full rounded-lg border-none bg-transparent pl-[40px] pr-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
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
            <Link
              to="/foods/new"
              className="mt-2 rounded-full bg-primary-tint/10 px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary-tint/20"
            >
              {t('myFoods.createFirstFood')}
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lens glass">
          <div className="flex flex-col gap-xs p-sm">
            {filtered.map((food) => (
              <div
                key={food.id}
                className="group flex items-center justify-between gap-sm rounded-xl border border-transparent p-md transition-colors hover:bg-[color:var(--glass-chip)]"
              >
                <div className="flex min-w-0 items-center gap-md">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      food.is_custom
                        ? 'bg-primary-tint/[0.16] text-primary'
                        : 'text-on-surface-variant glass-chip'
                    }`}
                  >
                    <Icon name={food.is_custom ? 'restaurant' : 'public'} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-label-md text-label-md text-on-surface">{food.name}</h3>
                    <p className="flex items-center gap-2 truncate text-sm text-on-surface-variant">
                      {food.brand ? `${food.brand} • ` : ''}
                      {food.serving_amount} {food.serving_unit}
                      {food.is_public && (
                        <span className="flex shrink-0 items-center gap-0.5 text-secondary">
                          <Icon name="public" className="text-[14px]" />
                          {t('myFoods.shared')}
                        </span>
                      )}
                    </p>
                    {/* Macros under the name on mobile, where the right column has no room. */}
                    <div className="mt-1 flex items-center gap-sm text-xs text-on-surface-variant sm:hidden">
                      <span className="font-medium text-secondary">
                        {Math.round(calories(food))} {t('common.kcal')}
                      </span>
                      {MACROS.map((m) => (
                        <span key={m.key} className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                          {round(food[m.field])}g
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 font-label-md text-sm text-secondary sm:gap-3">
                  <div className="hidden items-center gap-2 sm:flex sm:gap-3">
                    <span className="flex flex-col items-center">
                      <b>{Math.round(calories(food))}</b>
                      <span className="text-xs font-normal text-on-surface-variant">{t('common.kcal')}</span>
                    </span>
                    {MACROS.map((m) => (
                      <span key={m.key} className="flex flex-col items-center" style={{ color: m.color }}>
                        <b>{round(food[m.field])}g</b>
                        <span className="text-xs font-normal text-on-surface-variant">{t(`macro.${m.key}Abbr`)}</span>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center transition-all sm:opacity-0 sm:group-hover:opacity-100">
                    {food.is_custom && (
                      <button
                        onClick={() => togglePublic(food)}
                        className={`rounded-full p-1 transition-colors hover:text-primary ${
                          food.is_public ? 'text-primary' : 'text-on-surface-variant'
                        }`}
                        aria-label={
                          food.is_public
                            ? t('myFoods.unshareAria', { name: food.name })
                            : t('myFoods.shareAria', { name: food.name })
                        }
                        title={food.is_public ? t('myFoods.unshare') : t('myFoods.shareToCommunity')}
                      >
                        <Icon name={food.is_public ? 'public_off' : 'public'} className="text-[20px]" />
                      </button>
                    )}
                    {food.is_custom ? (
                      <Link
                        to={`/foods/${food.id}/edit`}
                        className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-primary"
                        aria-label={t('myFoods.editAria', { name: food.name })}
                      >
                        <Icon name="edit" className="text-[20px]" />
                      </Link>
                    ) : (
                      // API foods are never edited in place — copy into a new custom food.
                      <Link
                        to="/foods/new"
                        state={{ prefill: toPrefill(food) }}
                        className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-primary"
                        aria-label={t('myFoods.editAsCustomAria', { name: food.name })}
                        title={t('myFoods.editAsCustomTitle')}
                      >
                        <Icon name="edit" className="text-[20px]" />
                      </Link>
                    )}
                    <button
                      onClick={() => setPendingDelete(food)}
                      className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-error"
                      aria-label={t('myFoods.deleteAria', { name: food.name })}
                    >
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
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

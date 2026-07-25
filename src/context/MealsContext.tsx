import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/context/I18nContext'
import { MAX_MEALS, type MealKey } from '@/lib/constants'
import {
  createMeal,
  defaultMealRows,
  deleteMeal,
  fetchMeals,
  mealKeyFromName,
  mealLabel,
  moveItem,
  renameMeal,
  saveMealOrder,
  seedDefaultMeals,
} from '@/lib/meals'
import type { Meal } from '@/lib/database.types'

/** A meal row with its display label already resolved for the active locale. */
export interface MealView extends Meal {
  label: string
}

interface MealsValue {
  /** The user's meals in display order, with labels resolved. */
  meals: MealView[]
  loading: boolean
  error: string | null
  /** Label for a meal key — falls back to the key itself for orphaned logs. */
  labelFor: (key: MealKey) => string
  /** True while the list is at {@link MAX_MEALS}. */
  atLimit: boolean
  addMeal: (name: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  move: (id: string, direction: -1 | 1) => Promise<void>
  remove: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

const MealsContext = createContext<MealsValue | undefined>(undefined)

/**
 * Loads and mutates the signed-in user's meals. Meals are editable (name, count
 * and order), so everything that renders a meal — the dashboard, the add-food
 * flow, the text export — reads them from here rather than from a constant.
 *
 * If the `meals` table can't be read the provider falls back to the built-in
 * default set so the app still works; mutations then surface an error.
 */
export function MealsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { t } = useI18n()
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Mutations need the current list without re-creating callbacks on every edit.
  const mealsRef = useRef<Meal[]>([])
  mealsRef.current = meals

  const userId = user?.id ?? null

  const load = useCallback(async () => {
    if (!userId) {
      setMeals([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      let rows = await fetchMeals(userId)
      // Accounts created before the meals migration have none yet.
      if (rows.length === 0) rows = await seedDefaultMeals(userId)
      setMeals(rows)
      setError(null)
    } catch (e) {
      setMeals(defaultMealRows(userId))
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  /** Run a mutation, then reload so local state matches the database. */
  const mutate = useCallback(
    async (fn: () => Promise<void>) => {
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        throw e
      } finally {
        await load()
      }
    },
    [load],
  )

  const addMeal = useCallback(
    async (name: string) => {
      const trimmed = name.trim()
      if (!userId || !trimmed) return
      const current = mealsRef.current
      if (current.length >= MAX_MEALS) return
      await mutate(async () => {
        await createMeal(userId, {
          name: trimmed,
          key: mealKeyFromName(
            trimmed,
            current.map((m) => m.key),
          ),
          position: current.length,
        })
      })
    },
    [mutate, userId],
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      await mutate(() => renameMeal(id, name))
    },
    [mutate],
  )

  const move = useCallback(
    async (id: string, direction: -1 | 1) => {
      const current = mealsRef.current
      const from = current.findIndex((m) => m.id === id)
      const to = from + direction
      if (from < 0 || to < 0 || to >= current.length) return
      const reordered = moveItem(current, from, to)
      setMeals(reordered.map((m, position) => ({ ...m, position }))) // optimistic
      await mutate(() => saveMealOrder(reordered))
    },
    [mutate],
  )

  const remove = useCallback(
    async (id: string) => {
      const current = mealsRef.current
      const index = current.findIndex((m) => m.id === id)
      // Never leave the user with no meal to log into.
      if (index < 0 || current.length <= 1) return
      const fallback = current[index === 0 ? 1 : index - 1]
      await mutate(() => deleteMeal(current[index], fallback.key))
    },
    [mutate],
  )

  const value = useMemo<MealsValue>(() => {
    const views: MealView[] = meals.map((m) => ({ ...m, label: mealLabel(m, t) }))
    return {
      meals: views,
      loading,
      error,
      atLimit: views.length >= MAX_MEALS,
      labelFor: (key) => views.find((m) => m.key === key)?.label ?? mealLabel({ key, name: null }, t),
      addMeal,
      rename,
      move,
      remove,
      refetch: load,
    }
  }, [meals, loading, error, t, addMeal, rename, move, remove, load])

  return <MealsContext.Provider value={value}>{children}</MealsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMeals(): MealsValue {
  const ctx = useContext(MealsContext)
  if (!ctx) throw new Error('useMeals must be used within a MealsProvider')
  return ctx
}

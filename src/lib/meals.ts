/**
 * Meal management. Meals are rows in the `meals` table — one set per user —
 * so their names, count and order are all editable (see MealsContext for the
 * React surface). `meals.key` is the stable slug food logs point at: renaming a
 * meal only changes `name`, so logged items follow the meal around.
 */
import { supabase } from './supabase'
import { DEFAULT_MEALS, DEFAULT_MEAL_ICON, isBuiltInMealKey } from './constants'
import type { Meal, MealKey } from './database.types'
import type { TranslationKey } from './i18n'

type TFunction = (key: TranslationKey, params?: Record<string, string | number>) => string

/** Sort helper: by position, then creation time so ties stay stable. */
function byPosition(a: Meal, b: Meal): number {
  return a.position - b.position || a.created_at.localeCompare(b.created_at)
}

/**
 * The label to show for a meal: the user's own name when they set one,
 * otherwise the translated built-in label. Custom meals always carry a name;
 * the raw key is only a last-resort fallback (e.g. an orphaned log).
 */
export function mealLabel(meal: Pick<Meal, 'key' | 'name'>, t: TFunction): string {
  const name = meal.name?.trim()
  if (name) return name
  return isBuiltInMealKey(meal.key) ? t(`meal.${meal.key}`) : meal.key
}

/**
 * Slugify a meal name into a URL-safe key, unique within `taken`. Keys are
 * generated once at creation and never change, so a rename can't orphan logs.
 */
export function mealKeyFromName(name: string, taken: string[] = []): MealKey {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/, '') || 'meal'
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.includes(candidate)) return candidate
  }
}

/** Move an item within a list, returning a new array (out-of-range is a no-op). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * The default meal set as unsaved rows, used as a read-only fallback when the
 * `meals` table can't be reached (e.g. the migration hasn't been applied yet) so
 * the dashboard still renders something sensible.
 */
export function defaultMealRows(userId: string): Meal[] {
  const now = new Date(0).toISOString()
  return DEFAULT_MEALS.map((m) => ({
    id: `default-${m.key}`,
    user_id: userId,
    key: m.key,
    name: null,
    icon: m.icon,
    position: m.position,
    created_at: now,
    updated_at: now,
  }))
}

export async function fetchMeals(userId: string): Promise<Meal[]> {
  const { data, error } = await supabase
    .from('meals')
    .select('*')
    .eq('user_id', userId)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Meal[]).slice().sort(byPosition)
}

/**
 * Insert the default meals for a user that has none. The database seeds these
 * on sign-up; this covers accounts created before the meals migration and the
 * race where the trigger hasn't run yet. Ignores conflicts on (user_id, key).
 */
export async function seedDefaultMeals(userId: string): Promise<Meal[]> {
  const rows = DEFAULT_MEALS.map((m) => ({
    user_id: userId,
    key: m.key,
    name: null,
    icon: m.icon,
    position: m.position,
  }))
  const { error } = await supabase
    .from('meals')
    .upsert(rows, { onConflict: 'user_id,key', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
  return fetchMeals(userId)
}

/** Append a new meal at the end of the user's list. */
export async function createMeal(
  userId: string,
  input: { name: string; key: MealKey; icon?: string; position: number },
): Promise<Meal> {
  const { data, error } = await supabase
    .from('meals')
    .insert({
      user_id: userId,
      key: input.key,
      name: input.name,
      icon: input.icon ?? DEFAULT_MEAL_ICON,
      position: input.position,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Meal
}

/**
 * Rename a meal. Passing an empty name clears it, so a built-in meal goes back
 * to its translated label.
 */
export async function renameMeal(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  const { error } = await supabase
    .from('meals')
    .update({ name: trimmed === '' ? null : trimmed })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Persist the given order, writing each meal's index as its position. */
export async function saveMealOrder(meals: Meal[]): Promise<void> {
  const changed = meals
    .map((meal, position) => ({ meal, position }))
    .filter(({ meal, position }) => meal.position !== position)
  if (changed.length === 0) return
  await Promise.all(
    changed.map(async ({ meal, position }) => {
      const { error } = await supabase.from('meals').update({ position }).eq('id', meal.id)
      if (error) throw new Error(error.message)
    }),
  )
}

/**
 * Delete a meal, moving anything logged in it to `fallbackKey` first so no food
 * log is lost (and none is left pointing at a meal that no longer exists).
 */
export async function deleteMeal(
  meal: Pick<Meal, 'id' | 'key'>,
  fallbackKey: MealKey,
): Promise<void> {
  const { error: moveErr } = await supabase
    .from('food_logs')
    .update({ meal: fallbackKey })
    .eq('meal', meal.key)
  if (moveErr) throw new Error(moveErr.message)

  const { error } = await supabase.from('meals').delete().eq('id', meal.id)
  if (error) throw new Error(error.message)
}

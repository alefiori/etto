import { currentUserId, supabase } from './supabase'
import type { Food, MealKey } from './database.types'
import type { ExternalFood } from './foodSources'

/**
 * Ensure an external food (Open Food Facts / USDA / Edamam) exists as a local
 * `foods` row and return it. De-duplicates on (source, off_id) so logs always
 * reference a stable local food and the same item isn't imported twice.
 */
export async function upsertExternalFood(food: ExternalFood): Promise<Food> {
  const userId = await currentUserId()

  const findExisting = () =>
    supabase
      .from('foods')
      .select('*')
      .eq('source', food.source)
      .eq('off_id', food.externalId)
      .limit(1)
      .maybeSingle()

  // Re-use an existing imported row if present (avoids partial-index upsert quirks).
  const { data: existing, error: selErr } = await findExisting()
  if (selErr) throw new Error(selErr.message)
  if (existing) return existing as Food

  const { data, error } = await supabase
    .from('foods')
    .insert({
      user_id: userId,
      name: food.name,
      brand: food.brand,
      serving_amount: food.serving_amount,
      serving_unit: food.serving_unit,
      carbs_g: food.carbs_g,
      protein_g: food.protein_g,
      fats_g: food.fats_g,
      source: food.source,
      off_id: food.externalId,
      is_custom: false,
    })
    .select('*')
    .single()

  // If a concurrent insert won the race, fall back to the existing row.
  if (error) {
    const { data: raced } = await findExisting()
    if (raced) return raced as Food
    throw new Error(error.message)
  }
  return data as Food
}

export interface NewCustomFood {
  name: string
  brand?: string | null
  serving_amount: number
  serving_unit: string
  carbs_g: number
  protein_g: number
  fats_g: number
}

/**
 * Values used to prefill the custom-food form — e.g. when copying an existing
 * API food (Open Food Facts / USDA) into a brand-new custom food. Carries the
 * same shape as a new custom food; the form always saves it via
 * {@link createCustomFood}, never mutating the source row.
 */
export type CustomFoodPrefill = NewCustomFood

/** Fetch a single food by id (RLS limits this to own + global rows). */
export async function getFood(id: string): Promise<Food | null> {
  const { data, error } = await supabase.from('foods').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Food) ?? null
}

export async function createCustomFood(input: NewCustomFood): Promise<Food> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('foods')
    .insert({
      user_id: userId,
      name: input.name,
      brand: input.brand ?? null,
      serving_amount: input.serving_amount,
      serving_unit: input.serving_unit,
      carbs_g: input.carbs_g,
      protein_g: input.protein_g,
      fats_g: input.fats_g,
      source: 'custom',
      off_id: null,
      is_custom: true,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Food
}

/** Update an existing custom food. RLS ensures only the owner can. */
export async function updateCustomFood(id: string, input: NewCustomFood): Promise<Food> {
  const { data, error } = await supabase
    .from('foods')
    .update({
      name: input.name,
      brand: input.brand ?? null,
      serving_amount: input.serving_amount,
      serving_unit: input.serving_unit,
      carbs_g: input.carbs_g,
      protein_g: input.protein_g,
      fats_g: input.fats_g,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as Food
}

export async function logFoodEntry(params: {
  foodId: string
  date: string
  meal: MealKey
  servings: number
}): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('food_logs').insert({
    user_id: userId,
    food_id: params.foodId,
    log_date: params.date,
    meal: params.meal,
    servings: params.servings,
  })
  if (error) throw new Error(error.message)
}

/**
 * Copy every food log from one day into another, preserving meal and servings.
 * Returns the number of entries copied. Existing entries on `toDate` are kept
 * (this appends, it doesn't replace), so pasting twice duplicates.
 */
export async function copyDayFoods(fromDate: string, toDate: string): Promise<number> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('food_logs')
    .select('food_id, meal, servings')
    .eq('log_date', fromDate)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as { food_id: string; meal: MealKey; servings: number }[]
  if (rows.length === 0) return 0

  const inserts = rows.map((r) => ({
    user_id: userId,
    food_id: r.food_id,
    log_date: toDate,
    meal: r.meal,
    servings: r.servings,
  }))
  const { error: insErr } = await supabase.from('food_logs').insert(inserts)
  if (insErr) throw new Error(insErr.message)
  return rows.length
}

/**
 * Copy the food logs of a single meal (slot) from one day into a meal on
 * another day, preserving servings. The source and target meal may differ, so a
 * copied breakfast can be pasted into any slot. Appends (doesn't replace).
 * Returns the number of entries copied.
 */
export async function copyMealFoods(
  fromDate: string,
  fromMeal: MealKey,
  toDate: string,
  toMeal: MealKey,
): Promise<number> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('food_logs')
    .select('food_id, servings')
    .eq('log_date', fromDate)
    .eq('meal', fromMeal)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as { food_id: string; servings: number }[]
  if (rows.length === 0) return 0

  const inserts = rows.map((r) => ({
    user_id: userId,
    food_id: r.food_id,
    log_date: toDate,
    meal: toMeal,
    servings: r.servings,
  }))
  const { error: insErr } = await supabase.from('food_logs').insert(inserts)
  if (insErr) throw new Error(insErr.message)
  return rows.length
}

/**
 * Copy a single logged food into a meal on a (possibly different) day,
 * preserving its servings. Appends a new food_logs row — it never mutates the
 * source entry, so the original stays put.
 */
export async function copyFoodLog(
  foodId: string,
  servings: number,
  toDate: string,
  toMeal: MealKey,
): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('food_logs').insert({
    user_id: userId,
    food_id: foodId,
    log_date: toDate,
    meal: toMeal,
    servings,
  })
  if (error) throw new Error(error.message)
}

/** Share (or unshare) a custom food to the community. RLS enforces ownership. */
export async function setFoodPublic(id: string, isPublic: boolean): Promise<void> {
  const { error } = await supabase.from('foods').update({ is_public: isPublic }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function updateLogServings(id: string, servings: number): Promise<void> {
  const { error } = await supabase.from('food_logs').update({ servings }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteFoodLog(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('foods').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

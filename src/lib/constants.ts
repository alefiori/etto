/** Shared domain constants: meals, weekdays, and macro display metadata. */

import type { MealKey } from './database.types'

export type { MealKey }

/**
 * The meal keys the app ships with. Users can rename, reorder, remove or add
 * meals (see the `meals` table), so a meal key is only *built-in* when it is
 * one of these — those get a translated label from the i18n catalog under
 * `meal.<key>`, everything else uses the name the user typed.
 */
export type BuiltInMealKey = 'breakfast' | 'lunch' | 'dinner' | 'snack'

const BUILTIN_MEAL_KEYS: BuiltInMealKey[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function isBuiltInMealKey(key: string): key is BuiltInMealKey {
  return (BUILTIN_MEAL_KEYS as string[]).includes(key)
}

export interface MealMeta {
  key: MealKey
  icon: string // Material Symbols name
  position: number
}

/**
 * The meal set every new user starts from. Snack sits third — between lunch and
 * dinner — which is when most people actually eat it. Kept in sync with
 * `public.default_meals()` in supabase/migrations/0007_meals.sql.
 */
export const DEFAULT_MEALS: MealMeta[] = [
  { key: 'breakfast', icon: 'wb_sunny', position: 0 },
  { key: 'lunch', icon: 'light_mode', position: 1 },
  { key: 'snack', icon: 'cookie', position: 2 },
  { key: 'dinner', icon: 'nights_stay', position: 3 },
]

/** Icon given to meals the user creates. */
export const DEFAULT_MEAL_ICON = 'restaurant'

/** Upper bound on how many meals a day can hold, to keep the dashboard usable. */
export const MAX_MEALS = 10

export type MacroKey = 'carbs' | 'protein' | 'fats'

export interface MacroMeta {
  key: MacroKey
  /** Display labels come from the i18n catalog under `macro.<key>`. */
  field: 'carbs_g' | 'protein_g' | 'fats_g'
  /** Bright accent for graphics only (rings, dots) — too light for text on white. */
  color: string
  /** Darkened accent that meets WCAG AA (≥4.5:1) as small text on the light surface. */
  textColor: string
  tint: string
  icon: string
}

/** Macro accent colors, used consistently everywhere (rings, dots, inputs). */
export const MACROS: MacroMeta[] = [
  { key: 'carbs', field: 'carbs_g', color: '#F59E0B', textColor: '#B45309', tint: '#FEF3C7', icon: 'bakery_dining' },
  { key: 'protein', field: 'protein_g', color: '#3B82F6', textColor: '#1D4ED8', tint: '#DBEAFE', icon: 'set_meal' },
  { key: 'fats', field: 'fats_g', color: '#EF4444', textColor: '#B91C1C', tint: '#FEE2E2', icon: 'water_drop' },
]

/**
 * Order used in the weekly-targets grid (Mon → Sun), with day_of_week index.
 * Labels come from the i18n catalog under `weekday.short.*`, never from here.
 */
/**
 * Hydration accent. Deliberately cyan rather than the protein blue in MACROS —
 * two rings side by side in the same blue would read as the same metric.
 */
export const WATER_COLOR = { color: '#06B6D4', textColor: '#0E7490', tint: '#CFFAFE' } as const

export const TARGET_DAYS: { dow: number }[] = [
  { dow: 1 },
  { dow: 2 },
  { dow: 3 },
  { dow: 4 },
  { dow: 5 },
  { dow: 6 },
  { dow: 0 },
]

export const SERVING_UNITS = ['g', 'ml', 'oz', 'cup', 'piece', 'tbsp', 'tsp', 'serving']

/**
 * Default language (ISO 639-1) for Open Food Facts results when no profile
 * preference is loaded. The selectable language list now lives in the i18n
 * module (`LOCALES`), since one preference drives both UI and OFF language.
 */
export const DEFAULT_OFF_LANGUAGE = 'en'

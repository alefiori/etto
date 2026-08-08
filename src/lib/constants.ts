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
  /** Accent variant that meets WCAG AA (≥4.5:1) as small text on the card surface. */
  textColor: string
  tint: string
  icon: string
}

/**
 * Macro accent colors, used consistently everywhere (rings, dots, inputs).
 *
 * These are `rgb(var(--…))` references rather than literals because the accents
 * are brightened for the dark scheme (see src/index.css) and every consumer
 * feeds them to an inline `style` or an SVG paint, where a Tailwind `dark:`
 * class cannot reach. Resolving through the variable means the swap is pure
 * CSS: no theme hook to thread through, and no React re-render on the flip.
 */
export const MACROS: MacroMeta[] = [
  {
    key: 'carbs',
    field: 'carbs_g',
    color: 'rgb(var(--carbs))',
    textColor: 'rgb(var(--carbs-text))',
    tint: 'rgb(var(--carbs-tint))',
    icon: 'bakery_dining',
  },
  {
    key: 'protein',
    field: 'protein_g',
    color: 'rgb(var(--protein))',
    textColor: 'rgb(var(--protein-text))',
    tint: 'rgb(var(--protein-tint))',
    icon: 'set_meal',
  },
  {
    key: 'fats',
    field: 'fats_g',
    color: 'rgb(var(--fats))',
    textColor: 'rgb(var(--fats-text))',
    tint: 'rgb(var(--fats-tint))',
    icon: 'water_drop',
  },
]

/**
 * Order used in the weekly-targets grid (Mon → Sun), with day_of_week index.
 * Labels come from the i18n catalog under `weekday.short.*`, never from here.
 */
/**
 * Hydration accent. Deliberately cyan rather than the protein blue in MACROS —
 * two rings side by side in the same blue would read as the same metric.
 */
export const WATER_COLOR = {
  color: 'rgb(var(--water))',
  textColor: 'rgb(var(--water-text))',
  tint: 'rgb(var(--water-tint))',
} as const

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

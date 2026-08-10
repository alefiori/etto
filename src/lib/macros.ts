/**
 * Shared macro math — the single source of truth for all calorie/macro
 * calculations across the app.
 *
 * Calories use the Atwater 4/4/9 model: carbs and protein = 4 kcal/g,
 * fats = 9 kcal/g.
 */

export const KCAL_PER_GRAM = { carbs: 4, protein: 4, fats: 9 } as const

export interface MacroGrams {
  carbs_g: number
  protein_g: number
  fats_g: number
}

/** Calories for a set of macro grams (carbs/protein × 4, fats × 9). */
export function calories({ carbs_g, protein_g, fats_g }: MacroGrams): number {
  return (
    (carbs_g || 0) * KCAL_PER_GRAM.carbs +
    (protein_g || 0) * KCAL_PER_GRAM.protein +
    (fats_g || 0) * KCAL_PER_GRAM.fats
  )
}

/** Round to a sensible number of decimals (default 1) without trailing zeros. */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round((n + Number.EPSILON) * f) / f
}

/**
 * Per-serving macros scaled by a number of servings.
 * Foods store macros per single serving; a log references servings.
 */
export function scaleMacros(perServing: MacroGrams, servings: number): MacroGrams {
  const s = servings || 0
  return {
    carbs_g: round(perServing.carbs_g * s),
    protein_g: round(perServing.protein_g * s),
    fats_g: round(perServing.fats_g * s),
  }
}

/** Calories for a food (per-serving macros) × servings. */
export function caloriesForServings(perServing: MacroGrams, servings: number): number {
  return calories(scaleMacros(perServing, servings))
}

/** Sum a list of macro-bearing items into a single total. */
export function sumMacros(items: MacroGrams[]): MacroGrams {
  return items.reduce<MacroGrams>(
    (acc, m) => ({
      carbs_g: acc.carbs_g + (m.carbs_g || 0),
      protein_g: acc.protein_g + (m.protein_g || 0),
      fats_g: acc.fats_g + (m.fats_g || 0),
    }),
    { carbs_g: 0, protein_g: 0, fats_g: 0 },
  )
}

/** Remaining grams toward a target; never negative. */
export function remaining(target: number, consumed: number): number {
  return Math.max(0, round(target - consumed))
}

/** Convert per-100g macro values to a given serving size in grams. */
export function per100gToServing(
  per100g: MacroGrams,
  servingGrams: number,
): MacroGrams {
  const factor = (servingGrams || 0) / 100
  return {
    carbs_g: round(per100g.carbs_g * factor),
    protein_g: round(per100g.protein_g * factor),
    fats_g: round(per100g.fats_g * factor),
  }
}

/** SVG progress-ring geometry shared by all rings. */
export const RING = {
  radius: 45,
  strokeWidth: 10,
  // 2 * PI * r ≈ 283
  circumference: 2 * Math.PI * 45,
} as const

/**
 * stroke-dashoffset that fills the ring proportionally to consumed/target.
 * Clamped to [0, circumference]; a 0 target shows an empty ring.
 */
export function ringOffset(consumed: number, target: number): number {
  if (!target || target <= 0) return RING.circumference
  const pct = Math.min(1, Math.max(0, consumed / target))
  return round(RING.circumference * (1 - pct), 2)
}

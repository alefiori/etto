/**
 * Unit-of-measure conversions for logging food by amount (e.g. "80 g",
 * "10 lb") rather than by serving count.
 *
 * Foods store macros per `serving_amount` of `serving_unit`. Converting a
 * user-entered amount into that unit and dividing by `serving_amount` yields
 * the `servings` multiplier the rest of the app already understands — so no
 * schema change is needed, only a friendlier way to enter the quantity.
 */

import type { UnitSystem } from './database.types'

export type UnitFamily = 'mass' | 'volume' | 'count'

interface UnitDef {
  family: UnitFamily
  /** How many base units (g for mass, ml for volume) one of this unit holds. */
  base: number
}

// Convertible units only. Anything not listed (piece, serving, slice…) is a
// "count" unit and is never converted across — its amount is taken as-is.
const UNITS: Record<string, UnitDef> = {
  // mass — base unit: gram
  mg: { family: 'mass', base: 0.001 },
  g: { family: 'mass', base: 1 },
  kg: { family: 'mass', base: 1000 },
  oz: { family: 'mass', base: 28.3495 },
  lb: { family: 'mass', base: 453.592 },
  // volume — base unit: millilitre
  ml: { family: 'volume', base: 1 },
  cl: { family: 'volume', base: 10 },
  l: { family: 'volume', base: 1000 },
  tsp: { family: 'volume', base: 5 },
  tbsp: { family: 'volume', base: 15 },
  cup: { family: 'volume', base: 240 },
}

function lookup(unit: string): UnitDef | undefined {
  return UNITS[unit.trim().toLowerCase()]
}

export function unitFamily(unit: string): UnitFamily {
  return lookup(unit)?.family ?? 'count'
}

/**
 * Convert `amount` from one unit to another within the same family. Returns
 * null when the units are incompatible (different families, or a count unit
 * paired with a different unit); identical units pass through unchanged.
 */
export function convertUnit(amount: number, from: string, to: string): number | null {
  const a = lookup(from)
  const b = lookup(to)
  if (a && b && a.family === b.family) return (amount * a.base) / b.base
  return from.trim().toLowerCase() === to.trim().toLowerCase() ? amount : null
}

/**
 * Units offered when logging a food whose serving is measured in `unit`.
 * Convertible units expose their whole family (so grams can be logged in
 * pounds); count/other units only allow the unit itself.
 */
export function compatibleUnits(unit: string): string[] {
  const fam = unitFamily(unit)
  if (fam === 'count') return [unit]
  return Object.keys(UNITS).filter((u) => UNITS[u].family === fam)
}

/**
 * The `servings` multiplier for `amount` of `unit`, given the food's serving
 * size. Falls back to a raw amount/serving_amount ratio if the units can't be
 * converted (shouldn't happen — the unit picker only offers compatible units).
 */
export function servingsFor(
  amount: number,
  unit: string,
  servingAmount: number,
  servingUnit: string,
): number {
  if (!(servingAmount > 0)) return 0
  const inServingUnit = convertUnit(amount, unit, servingUnit)
  return (inServingUnit ?? amount) / servingAmount
}

// ---------------------------------------------------------------------------
// Body measurements
//
// Body weight and height are stored metric (kg, cm) and shown in whatever
// `profiles.unit_system` says. These wrap convertUnit so callers never have to
// remember which direction they're converting.
// ---------------------------------------------------------------------------

/** The weight unit shown to the user. */
export function weightUnit(system: UnitSystem): 'kg' | 'lb' {
  return system === 'imperial' ? 'lb' : 'kg'
}

/** Stored kilograms -> the number to put in front of {@link weightUnit}. */
export function weightForDisplay(kg: number, system: UnitSystem): number {
  return system === 'imperial' ? (convertUnit(kg, 'kg', 'lb') ?? kg) : kg
}

/** A user-entered weight in display units -> kilograms for storage. */
export function weightToKg(value: number, system: UnitSystem): number {
  return system === 'imperial' ? (convertUnit(value, 'lb', 'kg') ?? value) : value
}

/**
 * Height is entered as cm or as feet + inches, so it doesn't round-trip through
 * a single number the way weight does. These convert the stored centimetres to
 * and from the whole-feet + inches pair the imperial input uses.
 */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54
  const feet = Math.floor(totalInches / 12)
  return { feet, inches: totalInches - feet * 12 }
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54
}

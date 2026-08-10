/**
 * Hydration: unit conversion, goal derivation, and persistence.
 *
 * Volumes are stored in millilitres and shown in ml or US fluid ounces
 * depending on `profiles.unit_system`, the same split weight uses.
 *
 * Fluid ounces are deliberately *not* added to lib/units.ts: that module's
 * `compatibleUnits` feeds the food-logging unit picker, so a new volume unit
 * there would silently change what people can log foods in.
 */

import { currentUserId, supabase } from './supabase'
import type { UnitSystem, WaterLog } from './database.types'

/** US fluid ounce. The UK one is 28.4131 ml — this app follows US convention. */
const ML_PER_FL_OZ = 29.5735

/**
 * Millilitres of water per kilogram of bodyweight, for a derived goal.
 *
 * The common guidance is 30–35 ml/kg for a sedentary-to-lightly-active adult;
 * 33 sits in the middle. It is a starting point, not a prescription — which is
 * why the user can override it.
 */
export const ML_PER_KG_BODYWEIGHT = 33

/** Used when there is no weigh-in yet to derive a goal from. */
export const DEFAULT_WATER_GOAL_ML = 2000

/** The quick-add buttons: a glass, a bottle, and a large bottle. */
export const QUICK_ADD_ML = [250, 500, 1000] as const

export function volumeUnit(system: UnitSystem): 'ml' | 'fl oz' {
  return system === 'imperial' ? 'fl oz' : 'ml'
}

export function volumeForDisplay(ml: number, system: UnitSystem): number {
  return system === 'imperial' ? ml / ML_PER_FL_OZ : ml
}

export function volumeToMl(value: number, system: UnitSystem): number {
  return system === 'imperial' ? value * ML_PER_FL_OZ : value
}

/**
 * The daily goal in ml.
 *
 * An explicit `profiles.water_goal_ml` always wins. Otherwise it is derived
 * from the latest weigh-in, so the goal tracks the user's body instead of
 * freezing at whatever they weighed the day they signed up — the same reason
 * `off_language` treats NULL as "follow the device" rather than a fixed default.
 */
export function waterGoalMl(explicitMl: number | null, latestWeightKg: number | null): number {
  if (explicitMl != null && explicitMl > 0) return explicitMl
  if (latestWeightKg != null && latestWeightKg > 0) {
    return Math.round(latestWeightKg * ML_PER_KG_BODYWEIGHT)
  }
  return DEFAULT_WATER_GOAL_ML
}

/** True when the goal shown is derived rather than chosen. */
export function isGoalDerived(explicitMl: number | null): boolean {
  return explicitMl == null || !(explicitMl > 0)
}

export function totalMl(logs: WaterLog[]): number {
  return logs.reduce((sum, l) => sum + (l.amount_ml || 0), 0)
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** A day's drinks, oldest first. RLS scopes this to the caller. */
export async function fetchWaterLogs(logDate: string): Promise<WaterLog[]> {
  const { data, error } = await supabase
    .from('water_logs')
    .select('*')
    .eq('log_date', logDate)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Append a drink. */
export async function addWater(logDate: string, amountMl: number): Promise<WaterLog> {
  if (!(amountMl > 0)) throw new Error('Amount must be greater than zero.')
  const userId = await currentUserId()

  const { data, error } = await supabase
    .from('water_logs')
    .insert({ user_id: userId, log_date: logDate, amount_ml: amountMl })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteWater(id: string): Promise<void> {
  const { error } = await supabase.from('water_logs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Weight-log persistence.
 *
 * Weights are always stored in kilograms; `profiles.unit_system` only decides
 * how they're shown. Conversion happens at the UI edge (see lib/units.ts), so
 * nothing below ever needs to know which units the user prefers.
 *
 * There is at most one row per user per day — `saveWeight` upserts on
 * (user_id, log_date) so stepping on the scale twice corrects the day rather
 * than appending a second reading.
 */

import { currentUserId, supabase } from './supabase'
import type { WeightLog } from './database.types'

/**
 * Weigh-ins from `fromISO` to `toISO` inclusive, oldest first.
 *
 * RLS scopes this to the caller, so there is no user_id filter here — the same
 * reason useTargets/useFoodLogs don't filter either.
 */
export async function fetchWeightLogs(fromISO: string, toISO: string): Promise<WeightLog[]> {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .gte('log_date', fromISO)
    .lte('log_date', toISO)
    .order('log_date', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/** Record (or correct) the weigh-in for a day. */
export async function saveWeight(logDate: string, weightKg: number): Promise<WeightLog> {
  if (!(weightKg > 0)) throw new Error('Weight must be greater than zero.')
  const userId = await currentUserId()

  const { data, error } = await supabase
    .from('weight_logs')
    .upsert({ user_id: userId, log_date: logDate, weight_kg: weightKg }, { onConflict: 'user_id,log_date' })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data
}

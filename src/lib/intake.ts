/**
 * Daily logged energy, for the adaptive engine.
 *
 * Days with nothing logged are *absent* from the result rather than present
 * with zero. That distinction is the whole point: a zero would be read as a
 * day of fasting and drag the estimated intake down, when it almost always
 * means the user simply didn't log.
 */

import { supabase } from './supabase'
import { caloriesForServings } from './macros'
import type { FoodLogWithFood } from './database.types'
import type { IntakeDay } from './tdee'

/** Logged kcal per day between the two dates inclusive, oldest first. */
export async function fetchDailyIntake(fromISO: string, toISO: string): Promise<IntakeDay[]> {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*, food:foods(*)')
    .gte('log_date', fromISO)
    .lte('log_date', toISO)

  if (error) throw new Error(error.message)

  // A joined food can come back null if it became unreadable; those rows carry
  // no macros, so they'd silently understate the day. Drop them, same as
  // useFoodLogs does.
  const logs = ((data as unknown as FoodLogWithFood[]) ?? []).filter((l) => l.food != null)

  const byDate = new Map<string, number>()
  for (const log of logs) {
    const kcal = caloriesForServings(log.food, log.servings)
    byDate.set(log.log_date, (byDate.get(log.log_date) ?? 0) + kcal)
  }

  return [...byDate.entries()]
    .map(([date, kcal]) => ({ date, kcal: Math.round(kcal) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

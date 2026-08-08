import { useCallback, useEffect, useState } from 'react'
import { useProfile } from '@/context/ProfileContext'
import { fetchWeightLogs } from '@/lib/weights'
import { fetchDailyIntake } from '@/lib/intake'
import { computeAdaptiveTarget, WINDOW_DAYS, type AdaptiveResult, type BodyProfile } from '@/lib/tdee'
import { addDays, todayISO } from '@/lib/date'
import { calories } from '@/lib/macros'
import type { MacroTarget } from '@/lib/database.types'
import type { SeriesPoint } from '@/lib/trend'

interface State {
  result: AdaptiveResult | null
  loading: boolean
  error: string | null
}

/**
 * Runs the adaptive estimate against the user's recent data.
 *
 * Recalculation happens here, client-side, when the targets page opens. A
 * scheduled Edge Function was the alternative and was rejected: it would be a
 * second writer competing with the page's own debounced autosave for the same
 * seven rows, and the user would not be present to read the explanation of why
 * their numbers moved — which is the part they are actually paying for.
 *
 * `currentTargets` supplies the previous calorie goal so the engine can cap how
 * far one recalculation moves things.
 */
export function useAdaptiveTargets(
  currentTargets: Record<number, MacroTarget>,
  enabled: boolean,
) {
  const { profile } = useProfile()
  const [state, setState] = useState<State>({ result: null, loading: false, error: null })

  const load = useCallback(async () => {
    if (!enabled || !profile) {
      setState({ result: null, loading: false, error: null })
      return
    }

    setState((s) => ({ ...s, loading: true, error: null }))
    const today = todayISO()
    // A little history beyond the window so a sparse logger still has enough
    // weigh-ins for the span check to pass.
    const from = addDays(today, -(WINDOW_DAYS + 7))

    try {
      const [weightRows, intake] = await Promise.all([
        fetchWeightLogs(from, today),
        fetchDailyIntake(from, today),
      ])

      const weights: SeriesPoint[] = weightRows.map((w) => ({
        date: w.log_date,
        value: w.weight_kg,
      }))

      const body: BodyProfile = {
        sex: profile.sex,
        birthdate: profile.birthdate,
        heightCm: profile.height_cm,
        activityLevel: profile.activity_level,
        goalDirection: profile.goal_direction,
        goalRateKgPerWeek: profile.goal_rate_kg_per_week,
      }

      const result = computeAdaptiveTarget({
        body,
        weights,
        intake,
        previousTargetKcal: previousKcal(currentTargets),
        today,
      })

      setState({ result, loading: false, error: null })
    } catch (e) {
      setState({
        result: null,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    // currentTargets is read for the step cap only; re-running on every keystroke
    // of the manual grid would be pointless since adaptive mode disables it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, profile])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, refetch: load }
}

/**
 * The calorie goal currently in force, taken from today's weekday.
 *
 * Adaptive mode writes all seven days identically, so any populated row would
 * do — but reading today's is the one that matches what the user is eating to
 * right now if they are switching over from hand-set targets.
 */
function previousKcal(byDay: Record<number, MacroTarget>): number | null {
  const rows = Object.values(byDay)
  if (rows.length === 0) return null

  const today = new Date().getDay()
  const row = byDay[today] ?? rows[0]
  const kcal = calories(row)
  return kcal > 0 ? kcal : null
}

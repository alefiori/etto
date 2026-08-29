import { useCallback, useEffect, useState } from 'react'
import { fetchWeightLogs } from '@/lib/weights'
import { addDays, todayISO } from '@/lib/date'
import type { WeightLog } from '@/lib/database.types'

interface State {
  logs: WeightLog[]
  loading: boolean
  error: string | null
}

/**
 * The current user's weigh-ins over a trailing window, oldest first.
 *
 * `version` is the same cache-invalidation counter pattern useFoodLogs uses —
 * bump it after a write to force a refetch.
 *
 * `enabled` is how a locked card opts out — see useWaterLogs. Weigh-ins are a
 * Pro feature, so a free session never asks for them.
 */
export function useWeightLogs(days: number, version: number, enabled = true) {
  const [state, setState] = useState<State>({ logs: [], loading: enabled, error: null })

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ logs: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    const today = todayISO()
    try {
      const logs = await fetchWeightLogs(addDays(today, -Math.abs(days)), today)
      setState({ logs, loading: false, error: null })
    } catch (e) {
      setState({ logs: [], loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [days, enabled])

  useEffect(() => {
    load()
  }, [load, version])

  return { ...state, refetch: load }
}

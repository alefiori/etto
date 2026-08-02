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
 */
export function useWeightLogs(days: number, version: number) {
  const [state, setState] = useState<State>({ logs: [], loading: true, error: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    const today = todayISO()
    try {
      const logs = await fetchWeightLogs(addDays(today, -Math.abs(days)), today)
      setState({ logs, loading: false, error: null })
    } catch (e) {
      setState({ logs: [], loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [days])

  useEffect(() => {
    load()
  }, [load, version])

  return { ...state, refetch: load }
}

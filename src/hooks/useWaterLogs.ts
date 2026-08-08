import { useCallback, useEffect, useState } from 'react'
import { fetchWaterLogs } from '@/lib/water'
import type { WaterLog } from '@/lib/database.types'

interface State {
  logs: WaterLog[]
  loading: boolean
  error: string | null
}

/**
 * The drinks logged on one date, oldest first.
 *
 * `version` is the shared cache-invalidation counter — the same arrangement
 * useFoodLogs has with AppShellContext's foodLogVersion.
 */
export function useWaterLogs(date: string, version: number) {
  const [state, setState] = useState<State>({ logs: [], loading: true, error: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const logs = await fetchWaterLogs(date)
      setState({ logs, loading: false, error: null })
    } catch (e) {
      setState({ logs: [], loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load, version])

  return { ...state, refetch: load }
}

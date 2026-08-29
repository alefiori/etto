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
 *
 * `enabled` is how a locked card opts out: water is a Pro feature, and a gate
 * that renders an upgrade prompt has no business spending a round trip on rows
 * it will never show. Disabled reads as an empty day that is done loading, not
 * as a spinner that never resolves.
 */
export function useWaterLogs(date: string, version: number, enabled = true) {
  const [state, setState] = useState<State>({ logs: [], loading: enabled, error: null })

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ logs: [], loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const logs = await fetchWaterLogs(date)
      setState({ logs, loading: false, error: null })
    } catch (e) {
      setState({ logs: [], loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  }, [date, enabled])

  useEffect(() => {
    load()
  }, [load, version])

  return { ...state, refetch: load }
}

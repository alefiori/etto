import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { searchExternalFoods } from '@/lib/foodApi'
import type { ExternalFood } from '@/lib/foodSources'
import type { Food } from '@/lib/database.types'
import { useDebounce } from './useDebounce'

export type SearchResult =
  | { kind: 'local'; id: string; food: Food }
  | { kind: 'external'; id: string; food: ExternalFood }

interface State {
  results: SearchResult[]
  loading: boolean
  error: string | null
}

const externalId = (source: string, id: string) => `${source}:${id}`

/**
 * Searches the user's own foods (custom + previously imported) and merges them
 * with live results from external sources (Open Food Facts, USDA, …) returned
 * by the `food-search` Edge Function, which already merges and de-duplicates
 * across those sources. The query is debounced (~350ms). Local matches come
 * first; external rows already present locally (same source + id) are
 * de-duplicated out here.
 */
export function useFoodSearch(query: string, offLanguage?: string) {
  const debounced = useDebounce(query.trim(), 350)
  const [state, setState] = useState<State>({ results: [], loading: false, error: null })

  useEffect(() => {
    if (!debounced) {
      setState({ results: [], loading: false, error: null })
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    async function run() {
      try {
        const localPromise = supabase
          .from('foods')
          .select('*')
          .ilike('name', `%${debounced}%`)
          .order('created_at', { ascending: false })
          .limit(20)

        // External sources never reject the whole search — failures degrade to [].
        const externalPromise = searchExternalFoods(
          debounced,
          controller.signal,
          offLanguage,
        ).catch(() => [])

        const [{ data: localData, error: localErr }, externalData] = await Promise.all([
          localPromise,
          externalPromise,
        ])
        if (cancelled) return

        // The local query is degraded to [] on failure, exactly like the
        // external one above — a stale/expired session token (most common on
        // an anonymous guest session, whose refresh is the flakiest) makes
        // this SELECT 401, and that must not throw away external results that
        // came back fine. Only when there is nothing at all to show does the
        // failure surface as an error.
        if (localErr && externalData.length === 0) throw new Error(localErr.message)

        const local = (localErr ? [] : (localData ?? [])) as Food[]

        // Track what's already represented so we don't show duplicates.
        const seen = new Set<string>()
        for (const f of local) {
          if (f.off_id) seen.add(externalId(f.source, f.off_id))
        }

        const externalResults: SearchResult[] = []
        for (const f of externalData) {
          const key = externalId(f.source, f.externalId)
          if (seen.has(key)) continue
          seen.add(key)
          externalResults.push({ kind: 'external', id: `ext:${key}`, food: f })
        }

        const results: SearchResult[] = [
          ...local.map((f) => ({ kind: 'local' as const, id: `local:${f.id}`, food: f })),
          ...externalResults,
        ]

        setState({ results, loading: false, error: null })
      } catch (err) {
        if (cancelled || controller.signal.aborted) return
        setState({
          results: [],
          loading: false,
          error: err instanceof Error ? err.message : 'Search failed.',
        })
      }
    }

    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [debounced, offLanguage])

  return state
}

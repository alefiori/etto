/**
 * Client for external food data. All external lookups (Open Food Facts, USDA,
 * and any future sources) go through the `food-search` Supabase Edge Function,
 * which runs them server-side — this is required because some sources serve no
 * CORS headers (Search-a-licious) and others carry secret API keys (USDA) that
 * must not ship in the browser bundle. The function normalizes everything to
 * the ExternalFood shape, so this module only builds requests and parses the
 * already-normalized response. See supabase/functions/food-search.
 */
import { fetchWithRetry } from './retry'
import { DEFAULT_OFF_LANGUAGE } from './constants'
import type { ExternalFood } from './foodSources'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/food-search`

/** Anon-key auth so the function's default JWT verification passes. */
const authHeaders = {
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  apikey: SUPABASE_ANON_KEY,
  Accept: 'application/json',
}

async function callFunction(params: URLSearchParams, signal?: AbortSignal): Promise<ExternalFood[]> {
  const res = await fetchWithRetry(
    `${FUNCTION_URL}?${params.toString()}`,
    { headers: authHeaders },
    { signal },
  )
  if (!res.ok) throw new Error(`Food search failed (${res.status})`)
  return (await res.json()) as ExternalFood[]
}

/**
 * Live text search across all external sources. Returns normalized,
 * de-duplicated, macro-complete foods (merged server-side).
 */
export async function searchExternalFoods(
  query: string,
  signal?: AbortSignal,
  lang: string = DEFAULT_OFF_LANGUAGE,
): Promise<ExternalFood[]> {
  const q = query.trim()
  if (!q) return []
  return callFunction(new URLSearchParams({ q, lang }), signal)
}

/**
 * Barcode lookup (Open Food Facts, with a USDA GTIN/UPC fallback server-side).
 * Returns the product or null when not found.
 */
export async function lookupBarcode(
  barcode: string,
  signal?: AbortSignal,
  lang: string = DEFAULT_OFF_LANGUAGE,
): Promise<ExternalFood | null> {
  const code = barcode.trim()
  if (!code) return null
  const foods = await callFunction(new URLSearchParams({ barcode: code, lang }), signal)
  return foods[0] ?? null
}

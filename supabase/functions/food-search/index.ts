// Unified server-side proxy for all external food data requests.
//
// Why this exists: the app calls food APIs directly from the browser. Some of
// those APIs can't be called client-side — Open Food Facts serves no CORS
// headers on its search endpoint, and the USDA key must not ship in the browser
// bundle. This function runs every external lookup server-side (no CORS
// enforcement, secrets stay here), normalizes results to the app's ExternalFood
// shape, and returns them with CORS headers the browser accepts.
//
// Two modes (GET query params):
//   ?q=milk&lang=en     -> text search, fans out to every source, merged+deduped
//   ?barcode=3017620...  -> single-product lookup (Open Food Facts, falling
//                           back to Edamam UPC lookup when OFF has no match)
//
// Adding a new source: write a `SearchFn` that returns ExternalFood[] and add it
// to the SOURCES array below. Read any API key via Deno.env.get(...). Nothing
// else (client, other sources) needs to change.
//
// Deploy:  supabase functions deploy food-search
//          supabase secrets set USDA_API_KEY=...   (optional; defaults to DEMO_KEY)
//          supabase secrets set EDAMAM_APP_ID=... EDAMAM_APP_KEY=...   (optional;
//          Edamam is skipped when unset — https://developer.edamam.com/food-database-api)
//          supabase secrets set OFF_USERNAME=... OFF_PASSWORD=...   (optional; a
//          regular Open Food Facts account — OFF has no API keys. When set, OFF
//          requests are sent authenticated so they skip the anonymous rate limit
//          that otherwise 503s under load. Sign up at https://world.openfoodfacts.org)
// Local:   supabase functions serve food-search

// Pure API-JSON -> ExternalFood mapping lives in ./normalize.ts so it can be
// unit-tested from Node/Vitest (it touches no Deno globals). This file keeps the
// fetch/env/rate-limit/serving concerns.
import {
  dedupe,
  normalizeEdamam,
  normalizeFdc,
  normalizeOff,
  type EdamamHit,
  type ExternalFood,
  type FdcFood,
  type OffProduct,
} from './normalize.ts'

// Text search uses Open Food Facts' Search-a-licious endpoint
// (search.openfoodfacts.org) — the search API OFF actively maintains. It stays
// responsive under the bursty traffic a debounced search box generates, whereas
// the legacy CGI search.pl 503s after only a few rapid anonymous calls. That
// throttling silently drops OFF from results (a failing source degrades to []),
// and with it any product that lives *only* in OFF — i.e. exactly the newer /
// niche foods USDA and Edamam don't cover. Barcode lookup still uses the v2
// product endpoint, which isn't affected.
const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search'
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const EDAMAM_PARSER_URL = 'https://api.edamam.com/api/food-database/v2/parser'

// OFF blocks/deprioritizes generic User-Agents and asks that heavier callers
// identify a real contact, so keep this pointed at the actual project + email.
const USER_AGENT =
  'MacroTrack/0.1 (daily macros tracker; +https://github.com/alefiori/macro-track; alefiori97@gmail.com)'
const DEFAULT_LANG = 'en'
const PAGE_SIZE = '20'
const USDA_API_KEY = Deno.env.get('USDA_API_KEY') || 'DEMO_KEY'
const EDAMAM_APP_ID = Deno.env.get('EDAMAM_APP_ID') || ''
const EDAMAM_APP_KEY = Deno.env.get('EDAMAM_APP_KEY') || ''
// Open Food Facts has no API keys; authentication is HTTP Basic Auth with a
// regular OFF account. When set, it lifts our requests out of the anonymous
// rate limit. Skipped when unset (calls stay anonymous, best-effort).
const OFF_USERNAME = Deno.env.get('OFF_USERNAME') || ''
const OFF_PASSWORD = Deno.env.get('OFF_PASSWORD') || ''

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

type SearchFn = (q: string, lang: string, signal: AbortSignal) => Promise<ExternalFood[]>

// ---------------------------------------------------------------------------
// Open Food Facts (Search-a-licious for text, v2 product for barcode)
// ---------------------------------------------------------------------------

function offFields(lang: string): string {
  return `code,product_name,product_name_${lang},brands,nutriments`
}

/**
 * Headers for every Open Food Facts request: a descriptive User-Agent (OFF
 * blocks generic ones) plus, when OFF_USERNAME/OFF_PASSWORD are configured,
 * HTTP Basic Auth so the call skips the anonymous rate limit. OFF issues no
 * API keys — a normal account is the only credential.
 */
function offHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  }
  if (OFF_USERNAME && OFF_PASSWORD) {
    headers.Authorization = `Basic ${btoa(`${OFF_USERNAME}:${OFF_PASSWORD}`)}`
  }
  return headers
}

const searchOpenFoodFacts: SearchFn = async (q, lang, signal) => {
  const params = new URLSearchParams({
    q,
    page_size: PAGE_SIZE,
    // `lang` drives which localized product_name_<lang> Search-a-licious fills in.
    lang,
    fields: offFields(lang),
  })
  const res = await fetch(`${OFF_SEARCH_URL}?${params.toString()}`, {
    headers: offHeaders(),
    signal,
  })
  // A non-2xx (e.g. a 5xx HTML page under load) is gated here so we never try to
  // JSON-parse it; the failure then degrades this source to [] upstream rather
  // than sinking the whole search.
  if (!res.ok) throw new Error(`Open Food Facts search failed (${res.status})`)
  // Search-a-licious returns matches under `hits` (the legacy CGI used `products`).
  const data = (await res.json()) as { hits?: OffProduct[] }
  return (data.hits ?? []).map((p) => normalizeOff(p, lang)).filter((f): f is ExternalFood => !!f)
}

async function lookupOffBarcode(
  code: string,
  lang: string,
  signal: AbortSignal,
): Promise<ExternalFood | null> {
  const params = new URLSearchParams({ lc: lang, fields: offFields(lang) })
  const res = await fetch(
    `${OFF_PRODUCT_URL}/${encodeURIComponent(code)}.json?${params.toString()}`,
    { headers: offHeaders(), signal },
  )
  if (!res.ok) throw new Error(`Open Food Facts lookup failed (${res.status})`)
  const data = (await res.json()) as { status?: number; product?: OffProduct }
  if (data.status !== 1 || !data.product) return null
  return normalizeOff(data.product, lang)
}

// ---------------------------------------------------------------------------
// USDA FoodData Central
// ---------------------------------------------------------------------------

const searchUsda: SearchFn = async (q, _lang, signal) => {
  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query: q,
    pageSize: PAGE_SIZE,
    // Prioritize whole foods + common branded items; complements OFF coverage.
    dataType: 'Foundation,SR Legacy,Branded,Survey (FNDDS)',
  })
  const res = await fetch(`${USDA_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`)
  const data = (await res.json()) as { foods?: FdcFood[] }
  return (data.foods ?? []).map(normalizeFdc).filter((f): f is ExternalFood => !!f)
}

// ---------------------------------------------------------------------------
// Edamam Food Database (parser endpoint)
// ---------------------------------------------------------------------------

/** Call the parser endpoint with either `ingr` (text) or `upc` (barcode). */
async function edamamParse(
  query: Record<string, string>,
  signal: AbortSignal,
): Promise<ExternalFood[]> {
  if (!EDAMAM_APP_ID || !EDAMAM_APP_KEY) return [] // credentials not configured; skip
  const params = new URLSearchParams({
    app_id: EDAMAM_APP_ID,
    app_key: EDAMAM_APP_KEY,
    'nutrition-type': 'logging',
    ...query,
  })
  const res = await fetch(`${EDAMAM_PARSER_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  // Edamam answers 404 for an unknown UPC — a miss, not a failure.
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Edamam search failed (${res.status})`)
  const data = (await res.json()) as { parsed?: EdamamHit[]; hints?: EdamamHit[] }
  // `parsed` holds exact matches, `hints` related ones; the same foodId can
  // appear in both — the shared dedupe() pass drops the repeats.
  return [...(data.parsed ?? []), ...(data.hints ?? [])]
    .map((h) => normalizeEdamam(h.food))
    .filter((f): f is ExternalFood => !!f)
    .slice(0, Number(PAGE_SIZE))
}

/** Text search via the parser endpoint. English-only, so `lang` is ignored. */
const searchEdamam: SearchFn = (q, _lang, signal) => edamamParse({ ingr: q }, signal)

async function lookupEdamamBarcode(
  code: string,
  signal: AbortSignal,
): Promise<ExternalFood | null> {
  const foods = await edamamParse({ upc: code }, signal)
  return foods[0] ?? null
}

// ---------------------------------------------------------------------------
// Source registry — add new sources here.
// ---------------------------------------------------------------------------

const SOURCES: { name: string; search: SearchFn }[] = [
  { name: 'openfoodfacts', search: searchOpenFoodFacts },
  { name: 'usda', search: searchUsda },
  { name: 'edamam', search: searchEdamam },
]

// ---------------------------------------------------------------------------
// Short-lived response cache
// ---------------------------------------------------------------------------
//
// A debounced search box fires a burst of near-identical requests as the user
// types and pauses ("mil" -> "milk"), and the same queries recur constantly
// across users. Caching merged results for a short window collapses that burst
// onto a single upstream fan-out per (query, lang): fewer round trips for the
// user, and far less pressure on the external sources' rate limits — the very
// throttling that was making OFF (and its newer foods) drop out.
const CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 200
const searchCache = new Map<string, { at: number; foods: ExternalFood[] }>()

function cacheKey(q: string, lang: string): string {
  // NUL never appears in a URL query param, so it separates lang from query
  // unambiguously — two different (lang, q) pairs can never collide on one key.
  return `${lang}\u0000${q.toLowerCase()}`
}

function cacheGet(key: string): ExternalFood[] | null {
  const hit = searchCache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    searchCache.delete(key)
    return null
  }
  // Re-insert so this key becomes most-recently-used (Map keeps insertion order).
  searchCache.delete(key)
  searchCache.set(key, hit)
  return hit.foods
}

function cacheSet(key: string, foods: ExternalFood[]): void {
  searchCache.set(key, { at: Date.now(), foods })
  // Evict the oldest (least-recently-used) entries once over the cap.
  while (searchCache.size > CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value
    if (oldest === undefined) break
    searchCache.delete(oldest)
  }
}

/** Run every source in parallel; a failing source degrades to [] (never the whole search). */
async function searchAllSources(q: string, lang: string, signal: AbortSignal): Promise<ExternalFood[]> {
  const key = cacheKey(q, lang)
  const cached = cacheGet(key)
  if (cached) return cached

  const settled = await Promise.allSettled(SOURCES.map((s) => s.search(q, lang, signal)))
  const merged: ExternalFood[] = []
  let allOk = true
  for (const r of settled) {
    if (r.status === 'fulfilled') merged.push(...r.value)
    else allOk = false
  }
  const result = dedupe(merged)
  // Only cache a clean fan-out (every source answered, request not aborted) so a
  // transient source failure is never pinned as a degraded result for the TTL.
  if (allOk && !signal.aborted) cacheSet(key, result)
  return result
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const url = new URL(req.url)
    const lang = (url.searchParams.get('lang') ?? DEFAULT_LANG).trim() || DEFAULT_LANG
    const barcode = (url.searchParams.get('barcode') ?? '').trim()

    if (barcode) {
      // Open Food Facts first (richer, localized data), then Edamam's UPC
      // lookup for products OFF doesn't know. A source erroring (not just
      // missing the product) moves on to the next instead of failing the call.
      const lookups = [
        () => lookupOffBarcode(barcode, lang, req.signal),
        () => lookupEdamamBarcode(barcode, req.signal),
      ]
      for (const lookup of lookups) {
        try {
          const food = await lookup()
          if (food) return json([food], 200)
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err
        }
      }
      return json([], 200)
    }

    const q = (url.searchParams.get('q') ?? '').trim()
    if (!q) return json([], 200)

    return json(await searchAllSources(q, lang, req.signal), 200)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(null, { status: 499, headers: CORS_HEADERS })
    }
    return json({ error: err instanceof Error ? err.message : 'Search failed.' }, 500)
  }
})

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
//                           back to a USDA GTIN/UPC lookup when OFF has no match)
//
// Adding a new external source: write a `SearchFn` that returns ExternalFood[]
// and add it to the SOURCES array below. Read any API key via Deno.env.get(...).
// A source backed by our own tables additionally needs a migration and a data
// load — see scripts/import-reference-foods.mjs.
//
// Abuse limits: every caller presents a verified JWT (this function is deployed
// *with* verification — CI passes --no-verify-jwt only to revenuecat-webhook),
// so requests are counted per `sub` against a Postgres-backed fixed window. See
// supabase/migrations/0018_search_rate_limits.sql, and ./rateLimit.ts for the
// arithmetic. That is what stops one account draining the USDA/OFF quotas; the
// LRU cache further down is a performance measure, not a limit.
//
// Deploy:  supabase functions deploy food-search
//          (needs migration 0018 applied first, or the rate limit fails open)
//          supabase secrets set USDA_API_KEY=...   (optional; defaults to DEMO_KEY)
//          supabase secrets set OFF_USERNAME=... OFF_PASSWORD=...   (optional; a
//          regular Open Food Facts account — OFF has no API keys. When set, OFF
//          requests are sent authenticated so they skip the anonymous rate limit
//          that otherwise 503s under load. Sign up at https://world.openfoodfacts.org)
// Local:   supabase functions serve food-search

// Pure API-JSON -> ExternalFood mapping lives in ./normalize.ts so it can be
// unit-tested from Node/Vitest (it touches no Deno globals). This file keeps the
// fetch/env/rate-limit/serving concerns.
import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  dedupe,
  normalizeFdc,
  normalizeOff,
  normalizeReference,
  type ExternalFood,
  type FdcFood,
  type OffProduct,
  type ReferenceRow,
} from './normalize.ts'
// Window arithmetic and the caps live in ./rateLimit.ts for the same reason
// normalization does: no Deno globals, so vitest can test them directly.
import {
  evaluateRateLimit,
  queryTooLong,
  subjectFromAuthHeader,
  MAX_QUERY_CHARS,
  SEARCH_RATE_LIMIT,
  SEARCH_RATE_WINDOW_SECONDS,
  type RateLimitVerdict,
} from './rateLimit.ts'

// Text search uses Open Food Facts' Search-a-licious endpoint
// (search.openfoodfacts.org) — the search API OFF actively maintains. It stays
// responsive under the bursty traffic a debounced search box generates, whereas
// the legacy CGI search.pl 503s after only a few rapid anonymous calls. That
// throttling silently drops OFF from results (a failing source degrades to []),
// and with it any product that lives *only* in OFF — i.e. exactly the newer /
// niche foods USDA doesn't cover. Barcode lookup still uses the v2 product
// endpoint, which isn't affected.
const OFF_SEARCH_URL = 'https://search.openfoodfacts.org/search'
const OFF_PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USDA_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'

// OFF blocks/deprioritizes generic User-Agents and asks that heavier callers
// identify a real contact, so keep this pointed at the actual project + email.
const USER_AGENT =
  'Etto/0.1 (daily macros tracker; +https://github.com/alefiori/etto; alefiori97@gmail.com)'
const DEFAULT_LANG = 'en'
const PAGE_SIZE = '20'
const USDA_API_KEY = Deno.env.get('USDA_API_KEY') || 'DEMO_KEY'
// Injected by the Edge Runtime; nothing to configure. The anon key is
// deliberate — reference_foods is world-readable by policy, and this function
// proxies user-supplied query strings, so it has no business holding a key that
// bypasses RLS.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
// Open Food Facts has no API keys; authentication is HTTP Basic Auth with a
// regular OFF account. When set, it lifts our requests out of the anonymous
// rate limit. Skipped when unset (calls stay anonymous, best-effort).
const OFF_USERNAME = Deno.env.get('OFF_USERNAME') || ''
const OFF_PASSWORD = Deno.env.get('OFF_PASSWORD') || ''

// The service role is used for exactly one thing: the rate-limit counter in
// public.search_rate_limits, which has RLS on and no policies, so nothing short
// of the service role can reach it (by design — see migration 0018). It is
// deliberately a *second* client rather than a replacement for `db` above: the
// reference-food search proxies a user-supplied query string and has no
// business running with a key that bypasses RLS.
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
//
// An explicit allowlist rather than `*`, or the reflect-any-Origin pattern that
// only looks like an allowlist. JWT verification is what actually protects this
// function, so `*` was not itself a hole — but it also let any page on the web
// spend a visitor's rate-limit budget from their browser, and there is no
// origin we want that we cannot name.
//
// Anything not on the list simply gets no Access-Control-Allow-Origin header
// back, which a browser turns into a blocked response. Non-browser callers
// (curl, the native HTTP stack, a server) send no Origin and are unaffected —
// CORS is enforced by browsers, not by us, so this is a guard against hostile
// *pages*, never an authentication mechanism.
const ALLOWED_ORIGINS = new Set([
  // Production web app: the VITE_SITE_URL default in .env.example, which
  // src/lib/legal.ts falls back to.
  'https://etto.fitness',
  // The two native shells. Capacitor serves the bundle from its own origin —
  // `capacitor://localhost` on iOS, `https://localhost` on Android — and
  // capacitor.config.ts overrides neither scheme, so these are the defaults.
  // Same strings as in the src/lib/legal.ts and externalPurchase.ts comments.
  'capacitor://localhost',
  'https://localhost',
  // Local development: `pnpm dev` (Vite's default port) against a local
  // `supabase start`, on both spellings of loopback, plus `pnpm preview:test`.
  // CI never exercises this — the e2e suite intercepts the function with
  // page.route (e2e/fixtures/supabase.ts) and no request leaves the browser.
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

/**
 * CORS headers for one request. The Allow-Origin header is present only for an
 * allowlisted Origin; `Vary: Origin` is not optional once the response varies
 * by it, or a shared cache will serve one origin's answer to another.
 */
function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
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
  // OFF answers 404 for a barcode it has no product for — a miss, not a
  // failure, so it falls through to the next source without logging noise.
  if (res.status === 404) return null
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
// USDA barcode fallback
// ---------------------------------------------------------------------------

/**
 * Barcode lookup for products Open Food Facts doesn't know. FDC exposes no
 * dedicated UPC endpoint, so this is a text search for the digits — which makes
 * the exact-match guard below load-bearing rather than defensive: without it a
 * numeric query could return an unrelated product whose description merely
 * contains the string.
 *
 * Coverage is US branded foods only. OFF remains far stronger in Europe, which
 * is why it stays first.
 */
async function lookupUsdaBarcode(code: string, signal: AbortSignal): Promise<ExternalFood | null> {
  const params = new URLSearchParams({
    api_key: USDA_API_KEY,
    query: code,
    dataType: 'Branded',
    pageSize: '5',
  })
  const res = await fetch(`${USDA_SEARCH_URL}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) throw new Error(`USDA barcode lookup failed (${res.status})`)
  const data = (await res.json()) as { foods?: FdcFood[] }
  // EAN-13 and UPC-A write the same product with a different number of leading
  // zeros, so compare without them.
  const strip = (s: string) => s.replace(/^0+/, '')
  const hit = (data.foods ?? []).find((f) => f.gtinUpc && strip(f.gtinUpc) === strip(code))
  return hit ? normalizeFdc(hit) : null
}

// ---------------------------------------------------------------------------
// Reference food-composition tables (ANSES-Ciqual, CoFID, CREA)
//
// Served from our own `reference_foods` table through the
// search_reference_foods() RPC: no external hop, no rate limit, no API key, and
// it cannot 503 the way OFF does under load. See supabase/migrations/0016.
// ---------------------------------------------------------------------------

// One client per isolate rather than per request.
const db =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null

const searchReference: SearchFn = async (q, lang, signal) => {
  if (!db) return [] // unconfigured -> skipped, never fatal
  const { data, error } = await db
    .rpc('search_reference_foods', { q, lang, max_results: Number(PAGE_SIZE) })
    .abortSignal(signal)
  if (error) throw new Error(`Reference search failed (${error.message})`)
  return ((data ?? []) as ReferenceRow[])
    .map(normalizeReference)
    .filter((f): f is ExternalFood => !!f)
}

// ---------------------------------------------------------------------------
// Source registry — add new sources here.
// ---------------------------------------------------------------------------

// Order is the ranking knob: searchAllSources concatenates in this order and
// dedupe() is first-seen-wins, so position changes order, never membership.
// The reference tables lead because they are local, instant, never rate-limited
// and macro-complete — and they simply do not match brand names, so for a
// branded query they return nothing and the other two fill the list as before.
const SOURCES: { name: string; search: SearchFn }[] = [
  { name: 'reference', search: searchReference },
  { name: 'openfoodfacts', search: searchOpenFoodFacts },
  { name: 'usda', search: searchUsda },
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
// Per-user rate limit
//
// The LRU above protects upstream from *repeated* queries. This protects it
// from one account issuing endless *distinct* ones, which is what would drain
// the USDA key's quota (DEMO_KEY when USDA_API_KEY is unset — shared with every
// other project using the default) or trip OFF's per-account limit and silently
// drop both sources out of every user's results.
//
// Deliberately not in memory: isolates are recycled and run concurrently, so an
// in-isolate counter resets at unpredictable moments and is outrun by spreading
// requests across isolates. The counter lives in Postgres instead.
// ---------------------------------------------------------------------------

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null

interface RateLimitRow {
  allowed: boolean
  request_count: number
  window_started_at: string
}

/**
 * Count this request against the caller's window and decide on it. One RPC
 * round trip; the increment, the window rollover and the comparison all happen
 * inside a single atomic statement (see migration 0018).
 *
 * Returns null — meaning "no opinion", the request proceeds — when the limit
 * cannot be evaluated. **Fail open is the deliberate choice**: this guards a
 * third-party quota, not anyone's data, so a database blip or an unapplied
 * migration must degrade to the previous behaviour rather than take food search
 * down for everybody. The console.error is what makes that state visible.
 */
async function checkRateLimit(userId: string): Promise<RateLimitVerdict | null> {
  if (!admin) return null
  const { data, error } = await admin.rpc('increment_and_check_rate_limit', {
    p_user_id: userId,
    p_limit: SEARCH_RATE_LIMIT,
    p_window_seconds: SEARCH_RATE_WINDOW_SECONDS,
  })
  if (error) {
    console.error(`rate limit check failed for ${userId}: ${error.message}`)
    return null
  }
  const row = (data as RateLimitRow[] | null)?.[0]
  if (!row) return null
  return evaluateRateLimit(
    { count: row.request_count, windowStartedAtMs: Date.parse(row.window_started_at) },
    Date.now(),
  )
}

// ---------------------------------------------------------------------------
// HTTP handler
// ---------------------------------------------------------------------------

function json(
  body: unknown,
  status: number,
  cors: Record<string, string>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, ...extra, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const url = new URL(req.url)
    const lang = (url.searchParams.get('lang') ?? DEFAULT_LANG).trim() || DEFAULT_LANG
    const barcode = (url.searchParams.get('barcode') ?? '').trim()
    const q = (url.searchParams.get('q') ?? '').trim()

    // Nothing to look up: answered before the rate limit, so an empty search box
    // never costs the user any of their budget.
    if (!barcode && !q) return json([], 200, cors)

    // `q` is forwarded verbatim to OFF and USDA, so an uncapped one turns this
    // into a free proxy for arbitrarily large upstream requests. Rejected rather
    // than truncated — a silently shortened query returns confidently wrong
    // results. See MAX_QUERY_CHARS for why the cap sits where it does.
    if (queryTooLong(q)) {
      return json({ error: `Query too long (max ${MAX_QUERY_CHARS} characters).` }, 400, cors)
    }

    // Every caller reaches this function with a platform-verified JWT, so `sub`
    // identifies who is asking — a far better key than an IP, which is shared by
    // everyone behind one carrier NAT and free to rotate. A token carrying no
    // `sub` (a bare anon key, which names the project rather than a person)
    // cannot be attributed to anyone, so there is nothing to count it against.
    const userId = subjectFromAuthHeader(req.headers.get('Authorization'))
    if (userId) {
      const verdict = await checkRateLimit(userId)
      if (verdict && !verdict.allowed) {
        // 429 + Retry-After: src/lib/retry.ts already treats 429 as retryable
        // and backs off, so the client handles this without a change.
        return json({ error: 'Too many searches. Try again shortly.' }, 429, cors, {
          'Retry-After': String(verdict.retryAfterSeconds),
        })
      }
    }

    if (barcode) {
      // Open Food Facts first (richer, localized, far better European
      // coverage), then USDA's branded GTIN/UPC data for products OFF doesn't
      // know. A source erroring (not just missing the product) moves on to the
      // next instead of failing the call.
      const lookups = [
        () => lookupOffBarcode(barcode, lang, req.signal),
        () => lookupUsdaBarcode(barcode, req.signal),
      ]
      for (const lookup of lookups) {
        try {
          const food = await lookup()
          if (food) return json([food], 200, cors)
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') throw err
          // A failing source falls through to the next rather than sinking the
          // scan, but log it: silently swallowing these made a rate-limited or
          // misconfigured source indistinguishable from "product not found".
          console.error(`barcode ${barcode}: ${err instanceof Error ? err.message : err}`)
        }
      }
      return json([], 200, cors)
    }

    return json(await searchAllSources(q, lang, req.signal), 200, cors)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return new Response(null, { status: 499, headers: cors })
    }
    return json({ error: err instanceof Error ? err.message : 'Search failed.' }, 500, cors)
  }
})

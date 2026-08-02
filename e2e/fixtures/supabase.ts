import { test as base, type Page, type Route } from '@playwright/test'

/**
 * Hermetic Supabase backend for E2E. Registers page.route handlers for the
 * three surfaces the app talks to — GoTrue auth, PostgREST, and the food-search
 * Edge Function — backed by a tiny in-memory store, so tests are deterministic
 * and never touch a real project.
 *
 * The stub host must match .env.test (https://test.supabase.co); the derived
 * project ref is `test`, so supabase-js persists the session under
 * `sb-test-auth-token` — which `seedSession()` writes to skip the login screen.
 */

export const USER_ID = '00000000-0000-4000-8000-000000000001'
const PROJECT_REF = 'test'
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`

type Row = Record<string, unknown>

export interface Store {
  profiles: Row[]
  macro_targets: Row[]
  meals: Row[]
  foods: Row[]
  food_logs: Row[]
  weight_logs: Row[]
  water_logs: Row[]
  subscriptions: Row[]
}

export function makeUser(opts: { anonymous?: boolean; email?: string } = {}) {
  const { anonymous = false, email = 'sam@example.com' } = opts
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: anonymous ? '' : email,
    phone: '',
    is_anonymous: anonymous,
    app_metadata: { provider: anonymous ? 'anonymous' : 'email', providers: [] },
    user_metadata: {},
    identities: [],
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  }
}

export function makeSession(user: ReturnType<typeof makeUser>) {
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: 'fake-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'fake-refresh-token',
    user,
  }
}

let idCounter = 0
const genId = () => `stub-${++idCounter}`

function defaultStore(): Store {
  return {
    // off_language null = no explicit choice yet, so the app follows the
    // device language (the browser context's `locale`).
    profiles: [
      {
        id: USER_ID,
        off_language: null,
        unit_system: 'metric',
        created_at: '2024-01-01',
        updated_at: '2024-01-01',
      },
    ],
    macro_targets: [],
    // Empty on purpose: the app seeds the default meals on first load, exactly
    // as it does for an account created before the meals migration.
    meals: [],
    foods: [],
    food_logs: [],
    weight_logs: [],
    water_logs: [],
    // Empty by default: a fresh account is not Pro.
    subscriptions: [],
  }
}

/**
 * Give the seeded user an active Pro entitlement.
 *
 * Mutates the store directly rather than going through any client path, which
 * mirrors production: the row is written by the RevenueCat webhook using the
 * service role, never by the app.
 */
export function seedPro(store: Store, overrides: Row = {}) {
  store.subscriptions.push({
    user_id: USER_ID,
    entitlement: 'pro',
    product_id: 'macrotrack_pro_yearly',
    store: 'app_store',
    period_type: 'normal',
    original_transaction_id: 'txn-1',
    expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
    billing_issue: false,
    last_event_id: 'evt-1',
    last_event_at: new Date().toISOString(),
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  })
}

/** Apply PostgREST-style `col=eq.value` filters from the query string. */
function applyFilters(rows: Row[], url: URL): Row[] {
  const reserved = new Set(['select', 'order', 'on_conflict', 'columns', 'limit', 'offset'])
  let out = rows
  for (const [key, value] of url.searchParams) {
    if (reserved.has(key)) continue
    if (value.startsWith('eq.')) {
      const v = value.slice(3)
      out = out.filter((r) => String(r[key]) === v)
    } else if (value.startsWith('gte.')) {
      const v = value.slice(4)
      out = out.filter((r) => String(r[key]) >= v)
    } else if (value.startsWith('lte.')) {
      const v = value.slice(4)
      out = out.filter((r) => String(r[key]) <= v)
    } else if (value.startsWith('ilike.')) {
      const needle = value.slice(6).replace(/%/g, '').toLowerCase()
      out = out.filter((r) => String(r['name'] ?? '').toLowerCase().includes(needle))
    }
  }
  return out
}

function embedFoods(rows: Row[], store: Store, select: string): Row[] {
  if (!/foods?\s*\(/.test(select) && !select.includes('foods(')) return rows
  return rows.map((r) => ({
    ...r,
    food: store.foods.find((f) => f.id === r['food_id']) ?? null,
  }))
}

function wantsSingle(route: Route): boolean {
  const accept = route.request().headers()['accept'] ?? ''
  return accept.includes('vnd.pgrst.object')
}

// Cross-origin requests from the app (localhost) to the stub host need CORS
// headers on every response — and a satisfied preflight — or the browser blocks
// them with "Failed to fetch".
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*',
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function noContent(route: Route, status = 204) {
  return route.fulfill({ status, headers: CORS_HEADERS, body: '' })
}

async function handleRest(route: Route, store: Store) {
  const req = route.request()
  const url = new URL(req.url())
  const table = url.pathname.split('/rest/v1/')[1]?.split('?')[0] as keyof Store
  if (!table || !(table in store)) return json(route, [], 200)

  const method = req.method()
  const select = url.searchParams.get('select') ?? '*'

  if (method === 'GET' || method === 'HEAD') {
    let rows = applyFilters(store[table], url)
    rows = embedFoods(rows, store, select)
    if (wantsSingle(route)) return json(route, rows[0] ?? null)
    return json(route, rows)
  }

  if (method === 'POST') {
    const bodyText = req.postData() ?? '[]'
    const parsed = JSON.parse(bodyText)
    const incoming: Row[] = Array.isArray(parsed) ? parsed : [parsed]
    const prefer = req.headers()['prefer'] ?? ''
    const ignoreDuplicates = prefer.includes('resolution=ignore-duplicates')
    const isUpsert = prefer.includes('merge-duplicates') || ignoreDuplicates || table === 'profiles'

    const saved: Row[] = incoming.map((row) => {
      if (isUpsert) {
        // Merge on a natural key: id for profiles, (user_id, day_of_week) for
        // targets, (user_id, key) for meals, (user_id, log_date) for weights.
        const match = store[table].find((r) => {
          if (table === 'macro_targets')
            return r['user_id'] === row['user_id'] && r['day_of_week'] === row['day_of_week']
          if (table === 'meals')
            return r['user_id'] === row['user_id'] && r['key'] === row['key']
          if (table === 'weight_logs')
            return r['user_id'] === row['user_id'] && r['log_date'] === row['log_date']
          return r['id'] === row['id']
        })
        if (match) {
          if (!ignoreDuplicates) Object.assign(match, row)
          return match
        }
      }
      const created: Row = {
        id: row['id'] ?? genId(),
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
        is_public: false,
        ...row,
      }
      store[table].push(created)
      return created
    })

    if (prefer.includes('return=minimal')) return noContent(route, 201)
    if (wantsSingle(route)) return json(route, saved[0] ?? null, 201)
    return json(route, saved, 201)
  }

  if (method === 'PATCH') {
    const patch = JSON.parse(req.postData() ?? '{}') as Row
    const targets = applyFilters(store[table], url)
    for (const row of targets) Object.assign(row, patch)
    if (wantsSingle(route)) return json(route, targets[0] ?? null)
    return json(route, targets)
  }

  if (method === 'DELETE') {
    const doomed = new Set(applyFilters(store[table], url))
    store[table] = store[table].filter((r) => !doomed.has(r))
    return noContent(route, 204)
  }

  return json(route, [], 200)
}

async function handleAuth(route: Route, store: Store) {
  const req = route.request()
  const url = new URL(req.url())
  const path = url.pathname

  if (path.endsWith('/logout')) return noContent(route, 204)

  if (path.endsWith('/token')) {
    // grant_type=password (sign in) or refresh_token — both yield a session.
    return json(route, makeSession(makeUser()))
  }

  if (path.endsWith('/signup')) {
    const body = JSON.parse(req.postData() ?? '{}') as {
      email?: string
      data?: { locale?: string }
    }
    // The database trigger seeds the new profile from the sign-up metadata, so
    // the language picked on the auth page survives the sign-up (0007_meals.sql).
    const locale = body.data?.locale
    if (locale) {
      const profile = store.profiles.find((p) => p['id'] === USER_ID)
      if (profile) profile['off_language'] = locale
      else store.profiles.push({ id: USER_ID, off_language: locale })
    }
    // No email → anonymous sign-in (guest); otherwise a normal auto-confirmed signup.
    const user = makeUser({ anonymous: !body.email, email: body.email })
    return json(route, makeSession(user))
  }

  if (path.endsWith('/user')) {
    // GET returns the user; PUT (upgradeAccount) returns the updated user.
    const body = req.postData() ? (JSON.parse(req.postData()!) as { email?: string }) : {}
    return json(route, makeUser({ email: body.email }))
  }

  return json(route, {}, 200)
}

async function handleFunction(route: Route) {
  // food-search Edge Function: return one deterministic external result.
  return json(route, [
    {
      source: 'openfoodfacts',
      externalId: '737628064502',
      name: 'Stub Rice Noodles',
      brand: 'Test Brand',
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 80,
      protein_g: 7,
      fats_g: 1,
    },
  ])
}

/** Install all Supabase route stubs on a page, returning the mutable store. */
export async function installSupabaseStubs(page: Page): Promise<Store> {
  const store = defaultStore()
  await page.route('**/test.supabase.co/**', async (route) => {
    // Satisfy CORS preflight for every endpoint.
    if (route.request().method() === 'OPTIONS') return noContent(route, 204)
    const path = new URL(route.request().url()).pathname
    if (path.startsWith('/auth/v1/')) return handleAuth(route, store)
    if (path.startsWith('/rest/v1/')) return handleRest(route, store)
    if (path.startsWith('/functions/v1/')) return handleFunction(route)
    return json(route, {}, 200)
  })
  return store
}

/** Pre-seed a signed-in session so protected routes render without logging in. */
export async function seedSession(page: Page, opts: { anonymous?: boolean } = {}) {
  const session = makeSession(makeUser({ anonymous: opts.anonymous }))
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key as string, value as string)
    },
    [STORAGE_KEY, JSON.stringify(session)],
  )
}

/**
 * Test fixtures: `store` installs the stubs and exposes the in-memory data.
 * Marked `auto` so the stubs are always active — even in specs that only
 * destructure `page` and never reference `store` (e.g. the auth flows).
 */
export const test = base.extend<{ store: Store }>({
  store: [
    async ({ page }, use) => {
      const store = await installSupabaseStubs(page)
      await use(store)
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'

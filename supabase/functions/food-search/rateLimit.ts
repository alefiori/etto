// Pure, runtime-agnostic rate-limit logic for the food-search Edge Function.
//
// Same split as ./normalize.ts: nothing here touches a Deno global, the network
// or Postgres, so it is imported by both the Deno function (index.ts) and the
// Node/Vitest unit tests (rateLimit.test.ts). index.ts keeps the one DB
// round-trip; this module keeps the window arithmetic, which is the part that
// is easy to get subtly wrong and impossible to notice in production until a
// user is either locked out early or never limited at all.
//
// The counter itself lives in public.search_rate_limits and is bumped by the
// public.increment_and_check_rate_limit() RPC — see
// supabase/migrations/0018_search_rate_limits.sql. applyRequest() below is a
// deliberate line-by-line mirror of what that SQL statement does, so the
// semantics the database implements are the semantics these tests pin down.

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Searches allowed per user per window.
 *
 * 120/hour is roughly two searches a minute sustained for a full hour. A person
 * logging a meal makes a handful of searches; the debounced search box collapses
 * a burst of keystrokes into a couple of requests, and the in-isolate cache in
 * index.ts absorbs the repeats on top of that. So this sits far above any real
 * session and still far below what it takes to drain the USDA key's quota —
 * which matters most when USDA_API_KEY is unset and the function falls back to
 * the shared, heavily-throttled DEMO_KEY.
 */
export const SEARCH_RATE_LIMIT = 120

/**
 * Window length in seconds. Fixed, not sliding: a fixed window can let a user
 * spend up to 2x the limit across a window boundary, which for a quota guard
 * (as opposed to a security control) is a fine trade for one integer and one
 * timestamp per user, and no per-request row growth.
 */
export const SEARCH_RATE_WINDOW_SECONDS = 3600

/**
 * Longest accepted `q`. The longest names in our own reference tables — Ciqual
 * entries like "Pâtisserie ou viennoiserie industrielle, avec fruits,
 * préemballée" — run to about 120 characters, and nobody types one in full. 256
 * is several times the realistic maximum while still being short enough that
 * the query cannot be used as a payload: `q` is forwarded verbatim to OFF and
 * USDA, so leaving it uncapped makes this function a free proxy for
 * arbitrarily large upstream requests. Rejected rather than truncated, because
 * a silently truncated query returns confidently wrong results.
 */
export const MAX_QUERY_CHARS = 256

// ---------------------------------------------------------------------------
// Window math
// ---------------------------------------------------------------------------

/** One user's fixed-window counter, as stored. */
export interface WindowState {
  /** Requests counted in the window that started at {@link windowStartedAtMs}. */
  count: number
  /** Epoch ms at which the current window opened. */
  windowStartedAtMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  /** Requests left in this window; 0 once the limit is reached. */
  remaining: number
  /** Epoch ms at which the current window expires and the count resets. */
  resetAtMs: number
  /** Whole seconds until that reset, for the Retry-After header. Always >= 1. */
  retryAfterSeconds: number
}

/**
 * Is the window that opened at `windowStartedAtMs` still the current one?
 *
 * The boundary is exclusive: at exactly one window length after it opened, the
 * window is over. That matches the SQL (`window_started_at <= now() - interval`
 * resets), so a request landing precisely on the boundary starts a fresh window
 * rather than being the last request of the old one.
 */
export function windowIsCurrent(
  windowStartedAtMs: number,
  nowMs: number,
  windowSeconds: number = SEARCH_RATE_WINDOW_SECONDS,
): boolean {
  return nowMs - windowStartedAtMs < windowSeconds * 1000
}

/**
 * Fold one request into a user's counter — the pure mirror of the upsert in
 * public.increment_and_check_rate_limit(). `null` is a user who has never
 * searched (no row yet); an expired window restarts at 1 rather than 0, because
 * the request being counted is itself the first of the new window.
 */
export function applyRequest(
  state: WindowState | null,
  nowMs: number,
  windowSeconds: number = SEARCH_RATE_WINDOW_SECONDS,
): WindowState {
  if (!state || !windowIsCurrent(state.windowStartedAtMs, nowMs, windowSeconds)) {
    return { count: 1, windowStartedAtMs: nowMs }
  }
  return { count: state.count + 1, windowStartedAtMs: state.windowStartedAtMs }
}

/** Epoch ms at which the window that opened at `windowStartedAtMs` expires. */
export function resetAtMs(
  windowStartedAtMs: number,
  windowSeconds: number = SEARCH_RATE_WINDOW_SECONDS,
): number {
  return windowStartedAtMs + windowSeconds * 1000
}

/**
 * Seconds until the window resets, for `Retry-After`.
 *
 * Rounded up, so retrying after exactly this many seconds lands inside the new
 * window rather than one millisecond short of it, and floored at 1, because
 * `Retry-After: 0` invites an immediate retry that is guaranteed to 429 again.
 * A window already in the past yields 1 rather than a negative number.
 */
export function retryAfterSeconds(
  windowStartedAtMs: number,
  nowMs: number,
  windowSeconds: number = SEARCH_RATE_WINDOW_SECONDS,
): number {
  const msLeft = resetAtMs(windowStartedAtMs, windowSeconds) - nowMs
  return Math.max(1, Math.ceil(msLeft / 1000))
}

/**
 * Decide on a counter the database has already incremented.
 *
 * `count` is the post-increment value, so the request that takes the count to
 * exactly the limit is the last one allowed, and the next one is rejected.
 */
export function evaluateRateLimit(
  state: WindowState,
  nowMs: number,
  limit: number = SEARCH_RATE_LIMIT,
  windowSeconds: number = SEARCH_RATE_WINDOW_SECONDS,
): RateLimitVerdict {
  return {
    allowed: state.count <= limit,
    remaining: Math.max(0, limit - state.count),
    resetAtMs: resetAtMs(state.windowStartedAtMs, windowSeconds),
    retryAfterSeconds: retryAfterSeconds(state.windowStartedAtMs, nowMs, windowSeconds),
  }
}

// ---------------------------------------------------------------------------
// Caller identity
// ---------------------------------------------------------------------------

/**
 * The `sub` (user id) claim of the caller's bearer token, or null.
 *
 * Read, not verified: this function is deployed *with* JWT verification (CI
 * passes --no-verify-jwt only to revenuecat-webhook), so the platform has
 * already rejected an absent, malformed, expired or wrongly-signed token before
 * any of this code runs. Re-verifying here would mean an auth round-trip on
 * every keystroke-driven search to learn something already proved.
 *
 * Returns null when the token carries no `sub` — which is exactly what a bare
 * anon/publishable key does, since it identifies a project rather than a
 * person. index.ts treats that as "this request cannot be attributed to a user".
 */
export function subjectFromAuthHeader(header: string | null | undefined): string | null {
  if (!header) return null
  const match = /^bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) return null
  const parts = match[1].split('.')
  if (parts.length !== 3) return null
  try {
    // base64url -> base64: JWT segments use - and _ and drop the padding.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as {
      sub?: unknown
    }
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    // A token that parses as three dot-separated segments but whose middle one
    // is not base64url JSON is not something to fail the search over.
    return null
  }
}

// ---------------------------------------------------------------------------
// Input caps
// ---------------------------------------------------------------------------

/** Is this `q` longer than {@link MAX_QUERY_CHARS}? */
export function queryTooLong(q: string, max: number = MAX_QUERY_CHARS): boolean {
  return q.length > max
}

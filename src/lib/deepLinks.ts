/**
 * Deep links: turning a URL the OS hands the app into an in-app action, and
 * the native listener that feeds them in.
 *
 * Today the only link that arrives this way is a password-reset email, opened
 * as a Universal Link (iOS) / App Link (Android) against the domain declared
 * in public/.well-known/ and scripts/patch-ios-project.mjs /
 * patch-android-manifest.mjs. `parseDeepLink` is written generally — routed on
 * path, one case per path — so a future link (a shared-food invite, say) is a
 * new case here rather than a reason to touch the listener again.
 *
 * ---------------------------------------------------------------------------
 * Why this reads the URL by hand instead of leaning on supabase-js
 * ---------------------------------------------------------------------------
 *
 * src/lib/supabase.ts creates the client with no `flowType` override, so it
 * uses the library's default: **implicit**, not PKCE. That single fact decides
 * everything below. `AuthContext.resetPassword` only asks for a PKCE code
 * challenge when `flowType === 'pkce'` (see `resetPasswordForEmail` in
 * @supabase/auth-js) — since this client never sets that, the email GoTrue
 * sends links to `{SITE_URL}/reset-password` with the session already
 * attached as a URL **fragment**: `#access_token=...&refresh_token=...&
 * expires_in=...&token_type=bearer&type=recovery`, or, for an expired or
 * already-used link, `#error=access_denied&error_code=otp_expired&
 * error_description=...`. There is no `?code=` to exchange —
 * `exchangeCodeForSession()` is a PKCE-only API and does not apply here.
 *
 * On the web, `detectSessionInUrl: true` means supabase-js *can* pick this up
 * on its own — but only if its own `_initialize()` runs before anything else
 * reads the fragment, its error path is not exposed anywhere a caller can
 * `await`, and it is a promise racing this page's own mount. Natively,
 * `detectSessionInUrl` is off (see the comment in supabase.ts) precisely
 * because a HashRouter fragment is not an auth callback and must not be
 * parsed as one. Parsing the fragment here — the same function on both
 * platforms — sidesteps both problems: `applyRecoverySession` below calls
 * `setSession()` explicitly with tokens this module extracted itself, which
 * is idempotent (calling it again after supabase-js's own auto-detect already
 * ran changes nothing) and works identically whether detection is on or off.
 */

import { supabase } from './supabase'
import { isNativePlatform } from './platform'

// ---------------------------------------------------------------------------
// Parsing — pure, no Capacitor/DOM API beyond the URL constructor, so this is
// unit-testable head-on (see deepLinks.test.ts), the same split
// supabase/functions/food-search/rateLimit.ts uses to keep window arithmetic
// testable outside the Deno runtime it normally runs in.
// ---------------------------------------------------------------------------

export interface RecoverySession {
  accessToken: string
  refreshToken: string
}

/**
 * What an incoming deep link resolves to.
 *
 * `'ignored'` covers every path this app does not act on yet *and* a
 * recognized path with nothing usable in it (no tokens, no error) — both are
 * "there is nothing for the deep-link handler to do", which is also the
 * correct outcome for a malformed URL rather than a thrown error: a listener
 * fed garbage by the OS should not crash the app that fed it.
 */
export type DeepLinkAction =
  | { kind: 'reset-password'; session: RecoverySession }
  | { kind: 'reset-password-expired' }
  | { kind: 'ignored' }

/** Paths this app currently acts on when they arrive as a deep link. */
const ACTIONABLE_PATHS = new Set(['/reset-password'])

/**
 * Parse a URL the OS (or, on the web, the browser navigating to it directly)
 * handed the app into a {@link DeepLinkAction}.
 *
 * Routed on `pathname` first and deliberately kept open to more cases later —
 * a path this app does not recognize is `'ignored'` rather than assumed to be
 * the one case that exists today. Recovery parameters are read from *both*
 * the query string and the fragment: GoTrue's implicit-grant redirect puts
 * them in the fragment, but reading both means a future flow that used the
 * query string instead is not a silent miss.
 */
export function parseDeepLink(rawUrl: string): DeepLinkAction {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { kind: 'ignored' }
  }

  if (!ACTIONABLE_PATHS.has(url.pathname)) return { kind: 'ignored' }

  const params = new URLSearchParams(url.search)
  for (const [key, value] of new URLSearchParams(url.hash.replace(/^#/, ''))) {
    params.set(key, value)
  }

  // GoTrue's own shape for an expired or already-consumed recovery link:
  // `#error=access_denied&error_code=otp_expired&error_description=...`.
  // Checked before the token case, and specifically — not "any failure to
  // parse a token" — so a link that is merely missing a token it was never
  // going to carry (see the "no token" test case) is not misreported as
  // expired.
  if (params.has('error') || params.has('error_code')) {
    return { kind: 'reset-password-expired' }
  }

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) {
    return { kind: 'reset-password', session: { accessToken, refreshToken } }
  }

  return { kind: 'ignored' }
}

/**
 * Hand a parsed recovery session to Supabase, establishing it as the active
 * session. The single call site both the deep-link listener below and
 * ResetPassword.tsx use, so "how a recovery link becomes a session" exists in
 * exactly one place regardless of which platform triggered it.
 */
export async function applyRecoverySession(session: RecoverySession): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Reaching React Router from outside React
// ---------------------------------------------------------------------------

type NavigateFn = (path: string) => void

let navigateRef: NavigateFn | null = null
/**
 * A path asked for before {@link setDeepLinkNavigator} had run — the cold-start
 * case, where the OS can hand `bootstrapNative()`'s listener a URL before
 * `<Router>` has mounted anything. Replayed the moment a navigator registers.
 */
let pendingNavigate: string | null = null

/**
 * Registered once by a component mounted inside `<Router>` (see App.tsx's
 * `DeepLinkNavigator`), since nothing outside the component tree holds a
 * `useNavigate()` result. `nativeBootstrap.ts` calls {@link registerDeepLinks}
 * before React ever renders, so the listener it attaches has to survive
 * existing before a navigator is available — hence the queue rather than a
 * dropped call.
 */
export function setDeepLinkNavigator(fn: NavigateFn | null): void {
  navigateRef = fn
  if (fn && pendingNavigate) {
    const path = pendingNavigate
    pendingNavigate = null
    fn(path)
  }
}

function navigate(path: string): void {
  if (navigateRef) navigateRef(path)
  else pendingNavigate = path
}

/** In-app path for a {@link DeepLinkAction}. HashRouter turns this into `#path`. */
function inAppPath(action: DeepLinkAction): string | null {
  return action.kind === 'reset-password' || action.kind === 'reset-password-expired'
    ? '/reset-password'
    : null
}

// ---------------------------------------------------------------------------
// The native listener
// ---------------------------------------------------------------------------

/**
 * Register the `appUrlOpen` listener that turns an incoming Universal
 * Link / App Link into a session and an in-app navigation.
 *
 * Same shape as every other plugin wire-up in nativeBootstrap.ts: dynamic
 * import behind a try/catch, so this both stays out of the web bundle and
 * degrades to nothing if the plugin is unavailable, rather than failing
 * start-up over a deep link nobody has tapped yet.
 */
export async function registerDeepLinks(): Promise<void> {
  if (!isNativePlatform()) return
  try {
    const { App } = await import('@capacitor/app')
    App.addListener('appUrlOpen', ({ url }) => {
      void handleIncomingUrl(url)
    })
  } catch {
    // No @capacitor/app on this shell — nothing to listen with.
  }
}

/**
 * Act on one incoming URL: establish the session a recovery link carries (or
 * note that it had expired), then navigate the in-app router there either
 * way — an expired link still has somewhere useful to land (ResetPassword.tsx
 * shows the expired state and a way back to /forgot-password), rather than
 * opening the app to whatever screen happened to be behind it.
 */
async function handleIncomingUrl(url: string): Promise<void> {
  const action = parseDeepLink(url)
  const path = inAppPath(action)
  if (!path) return

  if (action.kind === 'reset-password') {
    try {
      await applyRecoverySession(action.session)
    } catch {
      // Tokens that fail to establish a session are indistinguishable, from
      // here, from a link that was already invalid — ResetPassword.tsx's own
      // fallback (no session, no token in its URL) lands on the same expired
      // state either way.
    }
  }
  navigate(path)
}

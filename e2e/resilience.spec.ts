import { test, expect } from './fixtures/supabase'

/**
 * The route-level ErrorBoundary in App.tsx (src/components/ErrorBoundary.tsx),
 * exercised against a real lazy-chunk failure.
 *
 * What this spec deliberately does NOT attempt: reproducing AuthContext's
 * getSession() rejection (the offline-boot-hang fix) through the network.
 * supabase-js's internal refresh path retries a failed fetch with its own
 * exponential backoff before finally rejecting — real, but an implementation
 * detail of a dependency this repo doesn't control, and slow and fragile to
 * pin an E2E spec to. That path already has full, fast, deterministic coverage
 * in src/context/AuthContext.test.tsx (the rejection itself, retry() clearing
 * it, and a live auth event superseding it) and src/components/RequireAuth.test.tsx
 * (the guard skipping an auto guest sign-in while the error is up, and its own
 * retry button). What IS reliably reproducible end-to-end, with nothing but
 * Playwright's own route interception, is a chunk request failing outright —
 * so that's what this spec covers.
 */
test.describe('resilience', () => {
  test.beforeEach(async ({ page }) => {
    // The PWA service worker (registerType: 'autoUpdate', active in every
    // non-native build including this one) precaches every JS chunk —
    // Targets-*.js included — within a few seconds of the first load. Once
    // that finishes, a dynamic import() of a precached chunk is served from
    // the SW's own Cache Storage without ever reaching the network, which
    // silently defeats page.route()'s abort below: it only intercepts
    // requests that actually leave the page for the network. Blocking the
    // registration request itself, before the first navigation, is what
    // keeps these tests deterministic under load rather than flaky depending
    // on how far the SW's background precache got before the click.
    await page.route('**/sw.js', (route) => route.abort())
    await page.route('**/registerSW.js', (route) => route.abort())
  })

  test('a failed route chunk shows a reload prompt, not a blank app', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()

    // Targets is one of App.tsx's lazy() routes. Abort its chunk specifically —
    // pattern rather than an exact filename, since Vite content-hashes it.
    await page.route('**/assets/Targets-*.js', (route) => route.abort())

    await page.getByRole('link', { name: 'Weekly Targets', exact: true }).click()

    // The stale-chunk fallback, not the generic crash screen: no support link,
    // and the reload copy names picking up a newer version.
    await expect(page.getByText('A newer version is available')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
    await expect(page.getByText('Email support')).toHaveCount(0)

    // The rest of the shell survived — this crashed one route, not the app.
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible()
  })

  test('leaving the broken route clears the fallback, without a full reload', async ({ page }) => {
    await page.goto('/')
    await page.route('**/assets/Targets-*.js', (route) => route.abort())
    await page.getByRole('link', { name: 'Weekly Targets', exact: true }).click()
    await expect(page.getByText('A newer version is available')).toBeVisible()

    // The inner boundary around AppLayout's <Outlet /> is keyed on pathname, so
    // navigating away unmounts the crashed instance and mounts a fresh one at
    // the new route — the rest of the app is fully usable again, without a
    // document reload.
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByText('A newer version is available')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
  })

  test('going back to the same broken route re-fails until an actual reload', async ({ page }) => {
    // What the pathname-keyed reset does NOT do, and is not supposed to:
    // React caches a lazy() import's *rejected* promise for the life of that
    // module-level lazy() call, not per boundary instance. A fresh
    // ErrorBoundary mounting at the same path re-renders <Targets />, which
    // re-throws the same cached rejection immediately — so returning to the
    // still-broken route shows the fallback again, and only the Reload button
    // (a real document reload, which re-evaluates the lazy() call from
    // scratch) is a genuine fix. See the "cannot recover a failed lazy()
    // import" note on ErrorBoundary's `fallback` prop.
    await page.goto('/')
    await page.route('**/assets/Targets-*.js', (route) => route.abort())
    await page.getByRole('link', { name: 'Weekly Targets', exact: true }).click()
    await expect(page.getByText('A newer version is available')).toBeVisible()

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.getByRole('link', { name: 'Weekly Targets', exact: true }).click()
    await expect(page.getByText('A newer version is available')).toBeVisible()

    // Unblock the chunk and use the fallback's own Reload button — a real
    // navigation, not a soft retry — and the page comes back for good.
    await page.unroute('**/assets/Targets-*.js')
    await page.getByRole('button', { name: 'Reload' }).click()
    await expect(page.getByRole('heading', { name: 'Weekly Planner' })).toBeVisible()
  })
})

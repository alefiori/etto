import { test, expect, seedSession } from './fixtures/supabase'
import { seedShowcase } from '../store/seed'

/**
 * Visual regression: a small, deliberate baseline set, not an exhaustive one.
 *
 * The four main routes, both themes, at the two widths the rest of the suite
 * already treats as the app's two window classes — e2e/a11y.spec.ts and
 * e2e/tablet.spec.ts's phone-width block both use 390×844 ("iPhone 15"), and
 * e2e/tablet.spec.ts's "iPad landscape" block (1366×1024, "iPad Pro 12.9\"")
 * is the one that renders the full desktop-style navigation drawer rather than
 * the phone chrome or the tablet rail — the natural "desktop" counterpart.
 *
 * Content comes from store/seed.ts's seedShowcase — the same fixture the store
 * listing screenshots use — rather than the e2e suite's minimal per-test seeds:
 * a stable, realistic dataset (a full week of targets, a populated day, eight
 * weeks of weight history, partial water) makes a screenshot worth comparing,
 * where an empty account would just be four cards of empty states.
 */

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1366, height: 1024 }

const ROUTES = [
  ['/', 'Calories'],
  ['/targets', 'Weekly Planner'],
  ['/foods', 'My Foods'],
  ['/profile', 'Profile'],
] as const

/**
 * Seed, sign in, and land on a route with nothing left to settle.
 *
 * `reducedMotion: 'reduce'` freezes every animated surface in one move: the
 * card entrance fades, the macro/calorie rings drawing from empty, the weight
 * trend line tracing in, and the ambient "breathe" glow are all either plain
 * CSS disabled by the app's own `@media (prefers-reduced-motion: reduce)`
 * block, or (the rings, the trend line) a JS-driven Web Animations call that
 * checks the same media feature itself (see src/lib/motion.ts). It has to be
 * set via `page.emulateMedia` rather than the `reducedMotion` test/context
 * option — the latter left `matchMedia` reporting `false` inside the page in
 * this project's fixture setup (see e2e/a11y-axe.spec.ts for the same note).
 *
 * Nothing else in these four routes is nondeterministic: seedShowcase's
 * weight-trend wobble is a fixed sine, not Math.random, and none of the four
 * routes render a relative ("2 min ago") timestamp.
 */
async function ready(page: import('@playwright/test').Page, store: import('./fixtures/supabase').Store, path: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  seedShowcase(store, { pro: true })
  await seedSession(page)
  await page.goto(path)
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [device, viewport] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test.describe(`${colorScheme} — ${device}`, () => {
      // The exact hermetic mechanism e2e/theme.spec.ts uses: the seeded
      // profile's `theme` is null, so the app follows this context's
      // colorScheme rather than needing a UI toggle.
      test.use({ colorScheme, viewport })

      for (const [route, heading] of ROUTES) {
        test(`${route || '/'} matches its baseline`, async ({ page, store }) => {
          await ready(page, store, route)
          await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
          await page.waitForLoadState('networkidle')

          await expect(page).toHaveScreenshot(`${device}-${colorScheme}-${route.slice(1) || 'dashboard'}.png`, {
            fullPage: true,
          })
        })
      }
    })
  }
}

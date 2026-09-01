import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect, seedSession, seedPro, USER_ID, type Store } from './fixtures/supabase'

/**
 * Automated axe-core scanning, complementing e2e/a11y.spec.ts.
 *
 * That file covers the contracts a scanner cannot see — focus trap order,
 * live-region announcements, reflow at text scale. This file covers the
 * ordinary WCAG violations a scanner is good at — contrast, ARIA misuse,
 * orphaned labels — across every main authenticated route, the public auth
 * routes, and (mirroring the one modal e2e/a11y.spec.ts opens) the Add Food
 * dialog, each in both themes.
 */

const PHONE = { width: 390, height: 844 }

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * A day with targets and one logged food, so every route has real content to
 * scan rather than empty states — the same shape e2e/a11y.spec.ts seeds, for
 * the same reason: a Pro dashboard renders the water/weight cards a free one
 * only shows as upgrade prompts.
 */
function seedDay(store: Store) {
  seedPro(store)
  for (let dow = 0; dow < 7; dow++) {
    store.macro_targets.push({
      id: `t-${dow}`,
      user_id: USER_ID,
      day_of_week: dow,
      carbs_g: 220,
      protein_g: 150,
      fats_g: 70,
    })
  }
  store.foods.push({
    id: 'food-oats',
    user_id: USER_ID,
    name: 'Rolled oats',
    brand: 'Quaker',
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: 60,
    protein_g: 13,
    fats_g: 7,
    source: 'custom',
    off_id: null,
    is_custom: true,
    is_public: false,
    created_at: '2024-01-01T00:00:00.000Z',
  })
  store.food_logs.push({
    id: 'log-1',
    user_id: USER_ID,
    food_id: 'food-oats',
    log_date: todayISO(),
    meal: 'breakfast',
    servings: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  })
}

/**
 * Known, understood violations this pass is not equipped to fix — this lane
 * owns test files only, not app source (see the worktree's task brief), so a
 * real product fix has to land separately. Each entry is one axe rule id plus
 * one substring that has to appear in the node's target selector — narrow and
 * specific, never a blanket rule disable — and is dropped from the assertion
 * below rather than from the scan itself, so the full result is still
 * computed and a *new* node hitting the same rule elsewhere still fails.
 *
 * All three are the same root cause: a `text-outline` / `text-primary` on
 * `bg-primary-tint` combination that clears the 3:1 non-text bar but not the
 * 4.5:1 text bar. src/pages/Dashboard.tsx already has its own note on this at
 * the paste-meal-header comment ("the canvas says its contrast pass is still
 * to come") — this is that same gap, surfacing on elements the scanner can
 * see and a human reviewer had not yet listed. Confirmed with axe's own
 * failureSummary (foreground/background hex and the ratio short of 4.5:1),
 * not just by symptom — see the individual reasons below.
 */
const KNOWN_VIOLATIONS: { rule: string; targetContains: string; reason: string }[] = [
  {
    rule: 'color-contrast',
    targetContains: '[aria-current="page"]',
    reason:
      'The active nav destination: text-primary (#4f7458) on bg-primary-tint/[0.14] (~#e5ebe3) measures 4.36:1 against the 4.5:1 AA text minimum.',
  },
  {
    rule: 'color-contrast',
    targetContains: '.text-outline',
    reason:
      '--outline is documented in src/index.css as clearing only the 3:1 non-text bar ("Placeholder / disabled only"), but real text labels (the Goal/Consumed/Remaining strip, the macro ring caption) use it for informative text, measuring 3.53:1.',
  },
  {
    rule: 'color-contrast',
    targetContains: 'bg-primary-tint/[0.16]',
    reason:
      'The "Pro" badge chip: text-primary on bg-primary-tint/[0.16] (~#e2e9e0) measures 4.27:1 — the same near-miss family as the nav link above.',
  },
]

/** axe's target selectors CSS-escape `/`, `.`, `[`, `]` etc. with backslashes. */
function unescapeSelector(s: string): string {
  return s.replace(/\\(.)/g, '$1')
}

/**
 * Run an axe scan restricted to the WCAG 2.0/2.1 A and AA rule sets — the
 * levels the README claims — and assert zero *unexplained* violations. A
 * violation node is only ever dropped from the assertion when it matches both
 * the rule id and the targetContains substring of an entry in
 * KNOWN_VIOLATIONS above; anything else — including a node on the same rule
 * but a selector that doesn't match — still fails.
 */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()

  const unexplained = results.violations
    .map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes
        .filter((n) => {
          const targets = n.target.map(unescapeSelector)
          return !KNOWN_VIOLATIONS.some(
            (k) => k.rule === v.id && targets.some((t) => t.includes(k.targetContains)),
          )
        })
        .map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
    }))
    .filter((v) => v.nodes.length > 0)

  expect(unexplained, JSON.stringify(unexplained, null, 2)).toEqual([])
}

const AUTHENTICATED_ROUTES = [
  ['/', 'Calories'],
  ['/targets', 'Weekly Planner'],
  ['/foods', 'My Foods'],
  ['/profile', 'Profile'],
] as const

const PUBLIC_ROUTES = [
  ['/signin', 'Etto'],
  ['/forgot-password', 'Reset password'],
] as const

/**
 * Freeze the dashboard's entrance animations (`.animate-rise` /
 * `.animate-rise-in-place` in src/index.css fade cards in from opacity 0).
 * Scanning mid-fade reads the interim, near-invisible state rather than the
 * settled one, which axe correctly reports as a contrast failure that does
 * not exist once the animation finishes a moment later — a scan-timing
 * artefact, not a real violation.
 *
 * The app already has a real, deliberate answer for this: its own `@media
 * (prefers-reduced-motion: reduce)` block turns these animations off outright.
 * Reusing that mechanism (rather than an arbitrary wait) means the scan sees
 * exactly the state a reduced-motion visitor sees, which is also a real user
 * population these routes have to work for regardless.
 *
 * `test.use({ reducedMotion: 'reduce' })` sets this for the browser context,
 * but empirically left `matchMedia('(prefers-reduced-motion: reduce)')`
 * reporting `false` inside the page in this project's fixture setup — so it
 * is applied explicitly per test instead, which does take effect.
 */
async function freezeMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe scan — ${colorScheme} theme`, () => {
    // The exact mechanism e2e/theme.spec.ts uses for a hermetic theme: the
    // seeded profile's `theme` is null (see fixtures/supabase.ts), so the app
    // follows this context's colorScheme rather than needing a UI toggle.
    test.use({ colorScheme })

    for (const [route, heading] of AUTHENTICATED_ROUTES) {
      test(`${route} has no automatically detectable a11y violations`, async ({ page, store }) => {
        seedDay(store)
        await freezeMotion(page)
        await seedSession(page)
        await page.goto(route)
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
        await expectNoViolations(page)
      })
    }

    for (const [route, heading] of PUBLIC_ROUTES) {
      test(`${route} has no automatically detectable a11y violations`, async ({ page }) => {
        await freezeMotion(page)
        await page.goto(route)
        await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
        await expectNoViolations(page)
      })
    }

    test('the Add Food dialog has no automatically detectable a11y violations', async ({
      page,
      store,
    }) => {
      seedDay(store)
      await freezeMotion(page)
      await seedSession(page)
      await page.setViewportSize(PHONE)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

      await page.getByTestId('add-food-fab').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page)
    })
  })
}

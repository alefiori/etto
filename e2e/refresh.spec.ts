import { test, expect, seedSession, USER_ID, type Store } from './fixtures/supabase'
import type { Page } from '@playwright/test'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** A food, and a log of it — what "another device just logged this" looks like. */
function logOats(store: Store) {
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
 * A pull down the content lane.
 *
 * Dispatched in the page rather than through `page.touchscreen`, which can tap
 * but cannot drag. The listeners are attached to `<main>` by hand (they have to
 * be non-passive), so these events reach them exactly as a finger's would.
 */
async function pullDown(page: Page, distance: number) {
  await page.evaluate((d) => {
    const main = document.querySelector('main')!
    const at = (y: number) =>
      new Touch({ identifier: 1, target: main, clientX: 100, clientY: y })
    const fire = (type: string, y: number) =>
      main.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === 'touchend' ? [] : [at(y)],
          changedTouches: [at(y)],
        }),
      )
    fire('touchstart', 0)
    // In steps, as a finger arrives — one jump would still work, but this is
    // what the resistance curve is actually asked to handle.
    for (let y = d / 4; y <= d; y += d / 4) fire('touchmove', y)
    fire('touchend', d)
  }, distance)
}

test.describe('pull to refresh', () => {
  test.use({ hasTouch: true })

  test('a pull past the threshold picks up what changed on another device', async ({
    page,
    store,
  }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()
    await expect(page.getByText('Rolled oats')).toHaveCount(0)

    // The row lands in the database with the dashboard already on screen —
    // nothing tells the app, which is the whole reason the gesture exists.
    logOats(store)
    await pullDown(page, 200)

    await expect(page.getByText('Rolled oats')).toBeVisible()
  })

  test('a short pull is a scroll, not a refresh', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)
    await pullDown(page, 40)

    // Given a moment to be wrong in.
    await page.waitForTimeout(500)
    await expect(page.getByText('Rolled oats')).toHaveCount(0)
  })

  test('the same refresh is reachable without a touchscreen', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)
    // Invisible until focused, like the skip link — and a real target once it is.
    const refresh = page.getByRole('button', { name: 'Refresh' })
    await refresh.focus()
    await expect(refresh).toBeVisible()
    await refresh.press('Enter')

    await expect(page.getByText('Rolled oats')).toBeVisible()
  })
})

test.describe('overscroll to refresh, on a trackpad', () => {
  /**
   * Six small deltas a frame or two apart — a two-finger scroll, as Chromium
   * reports one. A single `mouse.wheel(0, -240)` covers the same distance and
   * is deliberately not enough: see the floors in usePullToRefresh.
   */
  async function overscrollUp(page: Page) {
    await page.mouse.move(700, 400)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -40)
      await page.waitForTimeout(40)
    }
  }

  test('scrolling up with nothing left to scroll refetches', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)
    await overscrollUp(page)

    await expect(page.getByText('Rolled oats')).toBeVisible()
  })

  test('one flick of a mouse wheel is not a pull', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)
    await page.mouse.move(700, 400)
    await page.mouse.wheel(0, -240)

    await page.waitForTimeout(600)
    await expect(page.getByText('Rolled oats')).toHaveCount(0)
  })
})

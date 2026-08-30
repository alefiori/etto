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
   * Wheel events down the content lane, a frame or two apart.
   *
   * Dispatched in the page rather than through `page.mouse.wheel`, and for a
   * sharper reason than `pullDown` above has: the hook infers the end of a
   * wheel gesture from a gap of WHEEL_END_MS (140ms) and zeroes the
   * accumulator when it sees one. Six `page.mouse.wheel` calls are six CDP
   * round trips whose real spacing is the runner's to decide — `waitForTimeout`
   * sets a floor, not a ceiling — so on a loaded machine one gap crosses 140ms,
   * the gesture restarts from nothing, and the remaining deltas never reach the
   * threshold. In-page, the cadence is the browser's own clock.
   *
   * Nothing scrolls under a synthetic wheel, which is if anything truer to the
   * case: the container is at the top and staying there.
   */
  async function wheelUp(page: Page, deltas: number[]) {
    await page.evaluate(async (ds) => {
      const main = document.querySelector('main')!
      for (const deltaY of ds) {
        main.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 40))
      }
    }, deltas)
  }

  /**
   * Six small deltas — a two-finger scroll, as Chromium reports one. The single
   * delta below covers the same distance and is deliberately not enough: see
   * the floors in usePullToRefresh.
   */
  const overscrollUp = (page: Page) => wheelUp(page, Array<number>(6).fill(-40))

  test('scrolling up with nothing left to scroll refetches', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)

    // Retried as a unit, because the gesture has a precondition the test cannot
    // see: the wheel listener is attached in an effect, and a heading being
    // visible does not prove that effect has run. A dropped event or two is the
    // difference between 84px of pull and 56px, which is under the threshold and
    // silently just a scroll. Retrying re-arms it — WHEEL_END_MS has long since
    // reset the accumulator between attempts, so each pass is a clean gesture,
    // and a genuinely broken wheel path still never passes.
    await expect(async () => {
      await overscrollUp(page)
      await expect(page.getByText('Rolled oats')).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 20_000 })
  })

  test('one flick of a mouse wheel is not a pull', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    logOats(store)
    await wheelUp(page, [-240])

    await page.waitForTimeout(600)
    await expect(page.getByText('Rolled oats')).toHaveCount(0)
  })
})

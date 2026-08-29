import { test, expect, seedSession, seedPro, USER_ID } from './fixtures/supabase'

/** Today in the same YYYY-MM-DD local form lib/date.ts produces. */
function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Weight is Pro in full — the weigh-in as much as the trend it feeds. Everything
 * in this block therefore runs as a subscriber; what a free user sees instead is
 * the last block in the file.
 */
test.describe('weight tracking', () => {
  test.beforeEach(async ({ store }) => seedPro(store))

  test('prompts for a first weigh-in when there is no history', async ({ page }) => {
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()
    await expect(page.getByText('Log your weight to start tracking your trend.')).toBeVisible()
  })

  test('logs a weight and stores it in kilograms', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel("Today's weight in kg").fill('82.4')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('Saved')).toBeVisible()
    expect(store.weight_logs).toHaveLength(1)
    expect(store.weight_logs[0]).toMatchObject({
      user_id: USER_ID,
      log_date: todayISO(),
      weight_kg: 82.4,
    })
  })

  test('corrects the day rather than adding a second reading', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel("Today's weight in kg").fill('82.4')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    await page.getByLabel("Today's weight in kg").fill('81.9')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('81.9 kg')).toBeVisible()
    expect(store.weight_logs).toHaveLength(1)
    expect(store.weight_logs[0]).toMatchObject({ weight_kg: 81.9 })
  })

  test('withholds the chart until there are enough readings to draw a line', async ({
    page,
    store,
  }) => {
    // One reading is a dot, not a trend. A chart frame around it reads as a
    // chart that failed to load, and the range switch under it offers to
    // re-scale nothing.
    store.weight_logs.push({
      id: 'w-1',
      user_id: USER_ID,
      log_date: todayISO(),
      weight_kg: 80,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })

    await seedSession(page)
    await page.goto('/')

    await expect(page.getByText('One reading so far')).toBeVisible()
    await expect(page.getByRole('img', { name: /Weight trend over the last/ })).toHaveCount(0)
    // Still shown, so the card doesn't grow a row the moment a third reading
    // lands — but inert, because there is nothing to re-scale.
    await expect(page.getByRole('button', { name: '30 days' })).toBeDisabled()
  })

  test('draws a trend and reports the weekly rate once there is history', async ({
    page,
    store,
  }) => {
    // A steady loss of 100 g a day over a fortnight.
    for (let i = 14; i >= 0; i--) {
      store.weight_logs.push({
        id: `w-${i}`,
        user_id: USER_ID,
        log_date: daysAgo(i),
        weight_kg: 80 + i * 0.1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      })
    }

    await seedSession(page)
    await page.goto('/')

    await expect(page.getByRole('img', { name: /Weight trend over the last/ })).toBeVisible()
    // 0.1 kg/day is 0.7 kg/week, and the reported rate must not be attenuated
    // by the smoothing used to draw the line.
    await expect(page.getByText('Down 0.7 kg/week')).toBeVisible()
    await expect(page.getByText('80 kg')).toBeVisible()
  })

  test('holds the trend steady through an overnight water spike', async ({ page, store }) => {
    // Two flat weeks at 80 kg, then the scale reads 2 kg heavier this morning —
    // the salty-dinner case that makes people abandon a diet that is working.
    for (let i = 14; i >= 0; i--) {
      store.weight_logs.push({
        id: `w-${i}`,
        user_id: USER_ID,
        log_date: daysAgo(i),
        weight_kg: i === 0 ? 82 : 80,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      })
    }

    await seedSession(page)
    await page.goto('/')

    // The raw reading is shown as-is...
    await expect(page.getByText('82 kg')).toBeVisible()
    // ...but a single day of water is not a gain.
    await expect(page.getByText('Holding steady')).toBeVisible()
  })

  test('shows weights in pounds when the profile says imperial', async ({ page, store }) => {
    store.profiles[0].unit_system = 'imperial'
    store.weight_logs.push({
      id: 'w-1',
      user_id: USER_ID,
      log_date: todayISO(),
      weight_kg: 100,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })

    await seedSession(page)
    await page.goto('/')

    await expect(page.getByLabel("Today's weight in lb")).toBeVisible()
    await expect(page.getByText('220.5 lb')).toBeVisible()
  })
})

test.describe('weight tracking behind the paywall', () => {
  /** A fortnight of readings — enough that a chart would be drawn for a subscriber. */
  function seedHistory(store: { weight_logs: Record<string, unknown>[] }) {
    for (let i = 14; i >= 0; i--) {
      store.weight_logs.push({
        id: `w-${i}`,
        user_id: USER_ID,
        log_date: daysAgo(i),
        weight_kg: 80 + i * 0.1,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      })
    }
  }

  test('the card is locked whole — the weigh-in included', async ({ page, store }) => {
    // Not a card with its chart taken out: the input that produces the data is
    // behind the same entitlement as the trend drawn from it.
    seedHistory(store)
    await seedSession(page)
    await page.goto('/')

    // The heading stays, so the dashboard still shows that weight belongs here.
    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()
    await expect(page.getByLabel("Today's weight in kg")).toHaveCount(0)
    await expect(page.getByRole('img', { name: /Weight trend over the last/ })).toHaveCount(0)
    await expect(page.getByText('Down 0.7 kg/week')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '90 days' })).toHaveCount(0)
    await expect(page.getByText(/tells real change from water weight/)).toBeVisible()
  })

  test('no history is read for a locked card', async ({ page, store }) => {
    seedHistory(store)
    const asked: string[] = []
    await seedSession(page)
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/weight_logs')) asked.push(r.url())
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible()

    expect(asked).toEqual([])
  })

  test('Pro unlocks the whole card', async ({ page, store }) => {
    seedHistory(store)
    seedPro(store)
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByLabel("Today's weight in kg")).toBeEnabled()
    await expect(page.getByRole('img', { name: /Weight trend over the last/ })).toBeVisible()
    await expect(page.getByText('Down 0.7 kg/week')).toBeVisible()
    await expect(page.getByRole('button', { name: '90 days' })).toBeVisible()
  })

  test('an expired subscription re-locks it', async ({ page, store }) => {
    seedHistory(store)
    seedPro(store, { expires_at: '2020-01-01T00:00:00.000Z' })
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByLabel("Today's weight in kg")).toHaveCount(0)
    // By the card's own locked line rather than by "Pro feature", which the
    // water card beside it now shows too.
    await expect(page.getByText(/tells real change from water weight/)).toBeVisible()
  })
})

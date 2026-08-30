import { test, expect, seedSession, seedPro, USER_ID } from './fixtures/supabase'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Hydration is Pro in full — the card, the goal, and the settings row behind it.
 * Everything in this block therefore runs as a subscriber; what a free user sees
 * instead is the last block in the file.
 */
test.describe('water tracking', () => {
  test.beforeEach(async ({ store }) => seedPro(store))

  test('starts the day empty with a default goal', async ({ page, store }) => {
    // A weigh-in is Pro too, so the derived goal has nothing to read: the
    // 2000ml fallback applies.
    expect(store.weight_logs).toHaveLength(0)
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Water' })).toBeVisible()
    await expect(page.getByText('Nothing logged yet today.')).toBeVisible()
    // No weigh-in and no explicit goal, so the 2000ml fallback applies.
    await expect(page.getByText('0 of 2,000 ml')).toBeVisible()
  })

  test('logs a quick-add drink', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel('Add 250 ml').click()

    await expect(page.getByText('250 of 2,000 ml')).toBeVisible()
    expect(store.water_logs).toHaveLength(1)
    expect(store.water_logs[0]).toMatchObject({
      user_id: USER_ID,
      log_date: todayISO(),
      amount_ml: 250,
    })
  })

  test('logs a litre from the largest quick-add', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    // Metric steps up to litres at 1000ml rather than reading "1,000 ml".
    await page.getByLabel('Add 1 L').click()

    await expect(page.getByText('1,000 of 2,000 ml')).toBeVisible()
    expect(store.water_logs).toHaveLength(1)
    expect(store.water_logs[0]).toMatchObject({ amount_ml: 1000 })
  })

  test('appends a row per drink rather than accumulating one', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel('Add 250 ml').click()
    await expect(page.getByText('250 of 2,000 ml')).toBeVisible()
    await page.getByLabel('Add 500 ml').click()

    await expect(page.getByText('750 of 2,000 ml')).toBeVisible()
    expect(store.water_logs).toHaveLength(2)
  })

  test('undoes the last drink only', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel('Add 250 ml').click()
    await expect(page.getByText('250 of 2,000 ml')).toBeVisible()
    await page.getByLabel('Add 500 ml').click()
    await expect(page.getByText('750 of 2,000 ml')).toBeVisible()

    await page.getByLabel('Remove the last drink').click()

    await expect(page.getByText('250 of 2,000 ml')).toBeVisible()
    expect(store.water_logs).toHaveLength(1)
    expect(store.water_logs[0]).toMatchObject({ amount_ml: 250 })
  })

  test('accepts a custom amount', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByLabel('Custom amount in ml').fill('330')
    await page.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(page.getByText('330 of 2,000 ml')).toBeVisible()
    expect(store.water_logs[0]).toMatchObject({ amount_ml: 330 })
  })

  test('derives the goal from the latest weigh-in', async ({ page, store }) => {
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

    // 80kg * 33ml = 2640ml, and the card says where that came from.
    await expect(page.getByText('0 of 2,640 ml')).toBeVisible()
    await expect(page.getByText('Based on your weight — set your own to override.')).toBeVisible()
  })

  test('an explicit goal overrides the derived one', async ({ page, store }) => {
    store.profiles[0].water_goal_ml = 3000
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

    await expect(page.getByText('0 of 3,000 ml')).toBeVisible()
    await expect(
      page.getByText('Based on your weight — set your own to override.'),
    ).toHaveCount(0)
  })

  test('shows fluid ounces under imperial units', async ({ page, store }) => {
    store.profiles[0].unit_system = 'imperial'
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByLabel('Custom amount in fl oz')).toBeVisible()
    // 250ml is about 8.5 US fl oz.
    await expect(page.getByLabel('Add 8.5 fl oz')).toBeVisible()
    // Imperial has no litre step, so the largest quick-add stays in fl oz.
    await expect(page.getByLabel('Add 33.8 fl oz')).toBeVisible()
  })

  test('saves an explicit goal from the profile page', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByLabel('Daily water goal (ml)')).toHaveValue('')

    await page.getByLabel('Daily water goal (ml)').fill('2500')
    await page.getByLabel('Daily water goal (ml)').blur()

    await expect.poll(() => store.profiles[0].water_goal_ml).toBe(2500)
  })

  test('clearing the goal returns it to derived', async ({ page, store }) => {
    store.profiles[0].water_goal_ml = 2500
    await seedSession(page)
    await page.goto('/profile')

    // Wait for the stored goal to land before clearing it: blurring an
    // already-empty field is correctly a no-op, so clearing too early would
    // assert nothing.
    await expect(page.getByLabel('Daily water goal (ml)')).toHaveValue('2500')

    await page.getByLabel('Daily water goal (ml)').fill('')
    await page.getByLabel('Daily water goal (ml)').blur()

    await expect.poll(() => store.profiles[0].water_goal_ml).toBeNull()
  })
})

test.describe('hydration behind the paywall', () => {
  test('the card is locked whole — the quick-adds included', async ({ page }) => {
    // Not a trimmed-down card: a free user cannot log a drink at all.
    await seedSession(page)
    await page.goto('/')

    // The heading stays, so the dashboard still shows that water belongs here.
    await expect(page.getByRole('heading', { name: 'Water' })).toBeVisible()
    await expect(page.getByLabel('Add 250 ml')).toHaveCount(0)
    await expect(page.getByLabel('Custom amount in ml')).toHaveCount(0)
    await expect(page.getByText(/Log every glass against a daily goal/)).toBeVisible()
  })

  test('asks for no rows it will never show', async ({ page }) => {
    // A locked card that still queried water_logs would be paying for a round
    // trip on every dashboard load for nothing.
    const asked: string[] = []
    await seedSession(page)
    page.on('request', (r) => {
      const url = r.url()
      if (url.includes('/rest/v1/water_logs')) asked.push(url)
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Water' })).toBeVisible()

    expect(asked).toEqual([])
  })

  test('the daily goal is locked in the profile, and names itself', async ({ page }) => {
    // A gate on a settings page has no heading of its own to hang from, so it
    // carries the row's name and the Pro chip.
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByLabel('Daily water goal (ml)')).toHaveCount(0)
    await expect(page.getByText('Daily water goal (ml)')).toBeVisible()
    await expect(page.getByText(/The daily target your water ring fills toward/)).toBeVisible()
  })

  test('the paywall opens from the locked card', async ({ page }) => {
    await seedSession(page)
    await page.goto('/')

    await page.getByRole('button', { name: 'See Pro' }).first().click()

    await expect(page.getByRole('heading', { name: 'Etto Pro', level: 2 })).toBeVisible()
  })
})

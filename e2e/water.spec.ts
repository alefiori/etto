import { test, expect, seedSession, USER_ID } from './fixtures/supabase'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

test.describe('water tracking', () => {
  test('starts the day empty with a default goal', async ({ page }) => {
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
  })

  test('saves an explicit goal from the profile page', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/profile')

    await page.getByLabel('Daily water goal (ml)').fill('2500')
    await page.getByLabel('Daily water goal (ml)').blur()

    await expect.poll(() => store.profiles[0].water_goal_ml).toBe(2500)
  })

  test('clearing the goal returns it to derived', async ({ page, store }) => {
    store.profiles[0].water_goal_ml = 2500
    await seedSession(page)
    await page.goto('/profile')

    await page.getByLabel('Daily water goal (ml)').fill('')
    await page.getByLabel('Daily water goal (ml)').blur()

    await expect.poll(() => store.profiles[0].water_goal_ml).toBeNull()
  })
})

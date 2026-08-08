import { test, expect, seedSession, seedPro, USER_ID } from './fixtures/supabase'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** A body complete enough for the formula to have something to work with. */
function completeProfile(): Record<string, unknown> {
  return {
    sex: 'male',
    birthdate: '1990-01-01',
    height_cm: 180,
    activity_level: 'moderate',
    goal_direction: 'lose',
    goal_rate_kg_per_week: 0.5,
    adaptive_targets_enabled: true,
  }
}

/** `days` weigh-ins ending today, changing linearly. */
function seedWeights(store: { weight_logs: Record<string, unknown>[] }, startKg: number, perDayKg: number, days = 15) {
  for (let i = days - 1; i >= 0; i--) {
    store.weight_logs.push({
      id: `w-${i}`,
      user_id: USER_ID,
      log_date: daysAgo(i),
      weight_kg: startKg + (days - 1 - i) * perDayKg,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })
  }
}

/**
 * `days` days of food, each a single serving of a food worth `kcal`.
 * 100g carbs = 400 kcal, so kcal/4 grams of carbohydrate gives a round number.
 */
function seedIntake(
  store: { foods: Record<string, unknown>[]; food_logs: Record<string, unknown>[] },
  kcal: number,
  days = 14,
) {
  store.foods.push({
    id: 'food-fuel',
    user_id: USER_ID,
    name: 'Fuel',
    brand: null,
    serving_amount: 1,
    serving_unit: 'serving',
    carbs_g: kcal / 4,
    protein_g: 0,
    fats_g: 0,
    source: 'custom',
    off_id: null,
    is_custom: true,
    is_public: false,
    created_at: '2024-01-01T00:00:00.000Z',
  })
  for (let i = days - 1; i >= 0; i--) {
    store.food_logs.push({
      id: `fl-${i}`,
      user_id: USER_ID,
      food_id: 'food-fuel',
      log_date: daysAgo(i),
      meal: 'breakfast',
      servings: 1,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  }
}

test.describe('adaptive targets', () => {
  test('is off by default and leaves the grid editable', async ({ page, store }) => {
    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByRole('switch', { name: 'Adaptive targets' })).not.toBeChecked()
    await expect(page.locator('#target-1-carbs')).toBeEnabled()

    await page.locator('#target-1-carbs').fill('200')
    await expect(page.getByText('All changes saved')).toBeVisible()
    expect(store.macro_targets).toHaveLength(1)
  })

  test('turning it on persists the choice and locks the manual grid', async ({ page, store }) => {
    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await page.getByRole('switch', { name: 'Adaptive targets' }).click()

    await expect.poll(() => store.profiles[0].adaptive_targets_enabled).toBe(true)
    await expect(page.locator('#target-1-carbs')).toBeDisabled()
  })

  test('asks for a goal before it will estimate anything', async ({ page, store }) => {
    store.profiles[0].adaptive_targets_enabled = true
    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText(/Set a goal in your profile/)).toBeVisible()
  })

  test('names how many days are logged when there are too few', async ({ page, store }) => {
    Object.assign(store.profiles[0], completeProfile())
    seedWeights(store, 80, -0.05)
    seedIntake(store, 2000, 3)

    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText(/Only 3 of the last two weeks have food logged/)).toBeVisible()
    // No target on offer — the logs are the problem and saying so is the point.
    await expect(page.getByRole('button', { name: 'Apply these targets' })).toHaveCount(0)
  })

  test('asks for weigh-ins when there are none at all', async ({ page, store }) => {
    Object.assign(store.profiles[0], completeProfile())
    seedIntake(store, 2000, 14)

    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    // Mifflin-St Jeor needs a bodyweight, so with no weigh-ins there is not
    // even a formula estimate to fall back to.
    await expect(page.getByText(/Log your weight for a couple of weeks/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply these targets' })).toHaveCount(0)
  })

  test('falls back to a formula estimate with too few weigh-ins to measure', async ({
    page,
    store,
  }) => {
    Object.assign(store.profiles[0], completeProfile())
    // Two readings: enough to know their weight, far too few to fit a trend.
    seedWeights(store, 80, 0, 2)
    seedIntake(store, 2000, 14)

    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText(/This is a formula estimate for now/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply these targets' })).toBeVisible()
  })

  test('measures maintenance from intake and weight change, and explains it', async ({
    page,
    store,
  }) => {
    Object.assign(store.profiles[0], completeProfile())
    // Eating 2000 and losing 0.5 kg/week means burning about 2550.
    seedWeights(store, 80, -0.5 / 7)
    seedIntake(store, 2000, 14)

    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText(/you are burning about 2,5\d\d kcal a day/)).toBeVisible()
    await expect(page.getByText(/your weight fell 0\.50 kg a week/)).toBeVisible()
    await expect(page.getByText('Measured from 14 logged days and your weight trend.')).toBeVisible()
  })

  test('applies the split to all seven days', async ({ page, store }) => {
    Object.assign(store.profiles[0], completeProfile())
    seedWeights(store, 80, -0.5 / 7)
    seedIntake(store, 2000, 14)

    seedPro(store)
    await seedSession(page)
    await page.goto('/targets')

    await page.getByRole('button', { name: 'Apply these targets' }).click()

    await expect(page.getByText('Targets updated')).toBeVisible()
    await expect.poll(() => store.macro_targets.length).toBe(7)

    const days = store.macro_targets.map((r) => r.day_of_week).sort((a, b) => Number(a) - Number(b))
    expect(days).toEqual([0, 1, 2, 3, 4, 5, 6])

    // Every day gets the same split. Protein anchors to the *latest* weigh-in —
    // 79kg after a fortnight of losing from 80 — at 1.8 g/kg.
    for (const row of store.macro_targets) {
      expect(Number(row.protein_g)).toBeCloseTo(79 * 1.8, 0)
    }
  })
})

test.describe('adaptive targets behind the paywall', () => {
  test('a free user sees an upgrade prompt instead of the panel', async ({ page }) => {
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText('Pro feature')).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Adaptive targets' })).toHaveCount(0)
    // The manual grid stays fully usable — nothing that already shipped is
    // taken away.
    await expect(page.locator('#target-1-carbs')).toBeEnabled()
  })

  test('an expired subscription does not unlock it', async ({ page, store }) => {
    seedPro(store, { expires_at: '2020-01-01T00:00:00.000Z' })
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByText('Pro feature')).toBeVisible()
  })

  test('a lifetime purchase with no expiry does unlock it', async ({ page, store }) => {
    seedPro(store, { expires_at: null, product_id: 'macrotrack_pro_lifetime' })
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByRole('switch', { name: 'Adaptive targets' })).toBeVisible()
  })

  test('the paywall opens from the prompt and lists the plans', async ({ page }) => {
    await seedSession(page)
    await page.goto('/targets')

    await page.getByRole('button', { name: 'See Pro' }).click()

    await expect(page.getByRole('heading', { name: 'MacroTrack Pro' })).toBeVisible()
    await expect(page.getByText('€24.99/year')).toBeVisible()
    // Both stores require the renewal terms on the paywall itself.
    await expect(page.getByText(/Subscriptions renew automatically/)).toBeVisible()
  })
})

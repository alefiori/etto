import type { Page } from '@playwright/test'
import { test, expect, seedSession, USER_ID, type Store } from './fixtures/supabase'

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** The meal card that owns a given heading. */
function mealCard(page: Page, meal: string) {
  return page
    .locator('div.bg-surface-container-lowest')
    .filter({ has: page.getByRole('heading', { name: meal, exact: true }) })
}

/** Put one logged food in today's breakfast, without going through the UI. */
function seedLoggedFood(store: Store) {
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
    id: 'log-oats',
    user_id: USER_ID,
    food_id: 'food-oats',
    log_date: todayISO(),
    meal: 'breakfast',
    servings: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  })
}

test.describe('logging food', () => {
  test('searches an external database and logs a result to the day', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    // Open the Add Food modal from the sidebar CTA.
    await page.getByRole('button', { name: 'Add Food' }).click()

    // Search — the stubbed food-search function returns one deterministic result.
    await page.getByLabel('Search foods').fill('noodles')
    const result = page.getByRole('button', { name: /Stub Rice Noodles/ })
    await expect(result).toBeVisible()
    await result.click()

    // Confirm logging (the button label is "Add to <weekday>").
    await page.getByRole('button', { name: /Add to / }).click()

    // The modal closes and the food now shows on the dashboard.
    await expect(page.getByLabel('Search foods')).toBeHidden()
    await expect(page.getByText('Stub Rice Noodles')).toBeVisible()

    // The log was persisted through the stubbed PostgREST layer.
    expect(store.food_logs.length).toBe(1)
    expect(store.foods.length).toBe(1)
  })
})

test.describe('a logged food row', () => {
  test('opens its sheet on a tap and saves a new quantity', async ({ page, store }) => {
    await seedSession(page)
    seedLoggedFood(store)
    await page.goto('/')

    const row = page.getByRole('button', { name: /Rolled oats/ })
    await expect(row).toContainText('100 g')
    await row.click()

    // The presets are multiples of the food's own serving.
    await page.getByRole('button', { name: '150 g' }).click()
    await expect(page.getByText('533 kcal')).toBeVisible()
    await page.getByRole('button', { name: 'Save 150 g' }).click()

    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Quantity updated')).toBeVisible()
    await expect(row).toContainText('150 g')
    // Stored as servings, which is what the amount is an editor for.
    expect(store.food_logs[0]).toMatchObject({ servings: 1.5 })
  })

  test('opens its menu on a held press and deletes from it', async ({ page, store }) => {
    await seedSession(page)
    seedLoggedFood(store)
    await page.goto('/')

    const row = page.getByRole('button', { name: /Rolled oats/ })
    const box = (await row.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    // Long enough to pass the hold threshold, and with no movement in between.
    await page.waitForTimeout(700)
    await page.mouse.up()

    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expect(page.getByText(/Rolled oats \(100 g\) will be removed/)).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByText('Entry deleted')).toBeVisible()
    await expect(row).toBeHidden()
    expect(store.food_logs).toHaveLength(0)
  })
})

test.describe('the clipboard', () => {
  test('holds one thing at a time, and a second copy replaces the first', async ({
    page,
    store,
  }) => {
    await seedSession(page)
    seedLoggedFood(store)
    await page.goto('/')

    const banner = page.getByText(/copied/i)
    const breakfast = mealCard(page, 'Breakfast')

    // Copy the meal: one banner, and every header trades its two icons for a
    // single paste target.
    await page.getByLabel('Copy Breakfast').click()
    await expect(banner).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Paste' })).toHaveCount(4)
    await expect(breakfast.getByLabel('Copy Breakfast')).toBeHidden()

    // Copy a food while the meal is still pending: it replaces it rather than
    // stacking a second banner and a second chip.
    await page.getByRole('button', { name: /Rolled oats/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy food' }).click()
    await expect(banner).toHaveCount(1)
    await expect(banner).toContainText('Rolled oats')
    await expect(page.getByRole('button', { name: 'Paste' })).toHaveCount(4)

    // With one chip in the header, the meal's own name is never truncated.
    const heading = page.getByRole('heading', { name: 'Breakfast', exact: true })
    expect(await heading.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false)
  })

  test('is consumed by pasting, which puts the meal actions back', async ({ page, store }) => {
    await seedSession(page)
    seedLoggedFood(store)
    await page.goto('/')

    await page.getByRole('button', { name: /Rolled oats/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy food' }).click()
    await mealCard(page, 'Lunch').getByRole('button', { name: 'Paste' }).click()

    await expect(page.getByText('Pasted into Lunch')).toBeVisible()
    await expect(page.getByText(/copied/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Paste' })).toHaveCount(0)
    await expect(page.getByLabel('Copy Breakfast')).toBeVisible()

    expect(store.food_logs).toHaveLength(2)
    expect(store.food_logs[1]).toMatchObject({ food_id: 'food-oats', meal: 'lunch', servings: 1 })
  })
})

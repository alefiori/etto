import { test, expect, seedSession, type Store } from './fixtures/supabase'

const DEFAULT_MEALS = ['Breakfast', 'Lunch', 'Snack', 'Dinner']

/** The meal card headings on the dashboard, in the order they're rendered. */
async function mealOrder(page: import('@playwright/test').Page, names: string[]) {
  const headings = await page.locator('h3').allInnerTexts()
  return headings.map((h) => h.trim()).filter((h) => names.includes(h))
}

test.describe('meals', () => {
  test('a new account gets the default meals, with snack third', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/')

    await expect(page.getByRole('heading', { name: 'Breakfast' })).toBeVisible()
    expect(await mealOrder(page, DEFAULT_MEALS)).toEqual(DEFAULT_MEALS)

    // Seeded through the stubbed PostgREST layer, so they persist.
    expect((store as Store).meals.map((m) => m['key'])).toEqual([
      'breakfast',
      'lunch',
      'snack',
      'dinner',
    ])
  })

  test('renaming a meal in the profile renames it on the dashboard', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    const field = page.getByLabel('Name of Snack')
    await field.fill('Merenda')
    await field.blur()
    await expect(page.getByLabel('Name of Merenda')).toBeVisible()

    // Navigate in-app (client-side) rather than reloading the whole bundle.
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Merenda' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Snack' })).toHaveCount(0)
  })

  test('a meal can be added and moved', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    // Added at the end…
    await page.getByLabel('New meal name').fill('Mid-morning')
    await page.getByRole('button', { name: 'Add meal' }).click()
    await expect(page.getByLabel('Name of Mid-morning')).toBeVisible()

    // …then moved up one place, ahead of dinner.
    await page.getByLabel('Move Mid-morning up').click()

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mid-morning' })).toBeVisible()
    expect(await mealOrder(page, [...DEFAULT_MEALS, 'Mid-morning'])).toEqual([
      'Breakfast',
      'Lunch',
      'Snack',
      'Mid-morning',
      'Dinner',
    ])
  })

  test('deleting a meal asks first and drops it from the dashboard', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    await page.getByLabel('Delete Snack').click()
    // Items logged in it move to the meal above.
    await expect(page.getByRole('alertdialog')).toContainText('moves to "Lunch"')
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByLabel('Name of Snack')).toHaveCount(0)

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Breakfast' })).toBeVisible()
    expect(await mealOrder(page, DEFAULT_MEALS)).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })
})

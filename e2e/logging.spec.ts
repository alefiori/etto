import { test, expect, seedSession } from './fixtures/supabase'

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

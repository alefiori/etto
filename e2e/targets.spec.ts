import { test, expect, seedSession } from './fixtures/supabase'

test.describe('weekly targets', () => {
  test('sets a target, copies it to every day, and saves', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByRole('heading', { name: 'Weekly Planner' })).toBeVisible()

    // Enter Monday's carbs target, then copy Monday across the whole week.
    await page.locator('#target-1-carbs').fill('200')
    await page.getByRole('button', { name: 'Copy Mon to All', exact: true }).click()
    await page.getByRole('button', { name: 'Save Targets' }).click()

    await expect(page.getByText('Targets saved.')).toBeVisible()
    // All seven days were upserted through the stubbed backend.
    expect(store.macro_targets.length).toBe(7)
    expect(store.macro_targets.every((t) => t.carbs_g === 200)).toBe(true)
  })
})

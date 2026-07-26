import { test, expect, seedSession } from './fixtures/supabase'

test.describe('weekly targets', () => {
  test('autosaves an edit without a save button', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/targets')

    await expect(page.getByRole('heading', { name: 'Weekly Planner' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Targets' })).toHaveCount(0)

    await page.locator('#target-1-carbs').fill('200')

    await expect(page.getByText('All changes saved')).toBeVisible()
    // Only the edited day was written — the rest of the week is untouched.
    expect(store.macro_targets.length).toBe(1)
    expect(store.macro_targets[0]).toMatchObject({ day_of_week: 1, carbs_g: 200 })
  })

  test('copies a day and pastes it into the days you pick', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/targets')

    await page.locator('#target-1-carbs').fill('200')
    await expect(page.getByText('All changes saved')).toBeVisible()

    // Copy arms Monday — nothing moves until a paste, same as meals.
    await page.getByRole('button', { name: 'Copy Mon' }).click()
    await expect(page.getByText('Mon copied — paste it into any other day')).toBeVisible()

    await page.getByRole('button', { name: 'Paste into Wed' }).click()
    await page.getByRole('button', { name: 'Paste into Sun' }).click()

    // The status text is already on screen from the first save, so wait on the
    // rows themselves rather than on it changing.
    await expect.poll(() => store.macro_targets.length).toBe(3)
    expect(store.macro_targets.map((t) => t.day_of_week).sort()).toEqual([0, 1, 3])
    expect(store.macro_targets.every((t) => t.carbs_g === 200)).toBe(true)

    // Clearing puts the paste buttons away again.
    await page.getByRole('button', { name: 'Clear copied day' }).click()
    await expect(page.getByRole('button', { name: /^Paste into/ })).toHaveCount(0)
  })
})

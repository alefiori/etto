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

  test('copies a day across the week from its own card, and autosaves', async ({ page, store }) => {
    await seedSession(page)
    await page.goto('/targets')

    await page.locator('#target-1-carbs').fill('200')
    await expect(page.getByText('All changes saved')).toBeVisible()

    // Monday has no special header shortcut: every card copies from its own
    // button, and only when it is clicked.
    await page.getByRole('button', { name: 'Copy Mon to all days' }).click()

    // The status text is already on screen from the first save, so wait on the
    // rows themselves rather than on it changing.
    await expect.poll(() => store.macro_targets.length).toBe(7)
    expect(store.macro_targets.every((t) => t.carbs_g === 200)).toBe(true)
  })
})

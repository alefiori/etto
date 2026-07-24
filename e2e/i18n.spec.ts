import { test, expect, seedSession } from './fixtures/supabase'

test.describe('internationalization', () => {
  test('switching the profile language translates the UI', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    // English by default.
    await expect(page.getByRole('link', { name: 'Weekly Targets' })).toBeVisible()

    // Switch to Italian — the change is applied optimistically.
    await page.getByRole('combobox').selectOption('it')

    // Nav labels are now Italian ("Weekly Targets" → "Obiettivi settimanali").
    await expect(page.getByRole('link', { name: 'Obiettivi settimanali' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Weekly Targets' })).toHaveCount(0)
  })
})

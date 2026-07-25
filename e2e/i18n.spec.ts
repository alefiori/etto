import { test, expect, seedSession } from './fixtures/supabase'

test.describe('internationalization', () => {
  test('a visitor can pick a language before signing in', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeVisible()

    await page.getByRole('combobox').selectOption('it')
    await expect(page.getByRole('button', { name: 'Continua come ospite' })).toBeVisible()
    await expect(page.getByLabel('Indirizzo email')).toBeVisible()

    // The choice is remembered for the next visit…
    await page.reload()
    await expect(page.getByRole('button', { name: 'Continua come ospite' })).toBeVisible()

    // …and it carries into the app once signed in.
    await page.getByRole('button', { name: 'Continua come ospite' }).click()
    await expect(page.getByRole('link', { name: 'Obiettivi settimanali', exact: true })).toBeVisible()
  })

  test('the reset-password page is translated too', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.getByRole('combobox').selectOption('fr')
    await expect(page.getByRole('heading', { name: 'Réinitialiser le mot de passe' })).toBeVisible()
  })

  test('switching the profile language translates the UI', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    // English by default.
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()

    // Switch to Italian — the change is applied optimistically.
    await page.getByRole('combobox').first().selectOption('it')

    // Nav labels are now Italian ("Weekly Targets" → "Obiettivi settimanali").
    await expect(page.getByRole('link', { name: 'Obiettivi settimanali', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toHaveCount(0)
  })
})

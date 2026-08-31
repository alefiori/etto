import { test, expect, seedSession } from './fixtures/supabase'
import { openSetting } from './fixtures/profile'

test.describe('internationalization', () => {
  // A device set to German, with an account that has no language of its own.
  test.describe('on a German device', () => {
    test.use({ locale: 'de-DE' })

    test('the app starts in the device language, signed out and in', async ({ page }) => {
      await page.goto('/signin')
      await expect(page.getByRole('button', { name: 'Als Gast fortfahren' })).toBeVisible()

      await seedSession(page)
      await page.goto('/profile')
      await expect(page.getByRole('link', { name: 'Wochenziele', exact: true })).toBeVisible()
      await openSetting(page, /^Sprache/)
      // …and the Profile page says the language is only following the device.
      await expect(page.getByText('Folgt der Sprache deines Geräts.')).toBeVisible()
    })

    test('an explicit choice wins over the device language', async ({ page }) => {
      await seedSession(page)
      await page.goto('/profile')
      await openSetting(page, /^Sprache/)

      await page.getByRole('combobox').first().selectOption('fr')
      await expect(page.getByRole('link', { name: 'Objectifs hebdomadaires', exact: true })).toBeVisible()
      await expect(page.getByText('Folgt der Sprache deines Geräts.')).toHaveCount(0)

      // It sticks across a reload, even though the device still says German.
      await page.reload()
      await expect(page.getByRole('link', { name: 'Objectifs hebdomadaires', exact: true })).toBeVisible()
    })
  })

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
    await openSetting(page, /^Language/)

    // English by default.
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()

    // Switch to Italian — the change is applied optimistically.
    await page.getByRole('combobox').first().selectOption('it')

    // Nav labels are now Italian ("Weekly Targets" → "Obiettivi settimanali").
    await expect(page.getByRole('link', { name: 'Obiettivi settimanali', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toHaveCount(0)
  })
})

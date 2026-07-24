import { test, expect } from './fixtures/supabase'

test.describe('authentication', () => {
  test('a visitor can continue as a guest and reach the dashboard', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue as guest' }).click()

    // Landed on the authenticated app shell.
    await expect(page.getByRole('link', { name: 'Weekly Targets' })).toBeVisible()
    // Guests are nudged to save their data (the upgrade prompt).
    await expect(page.getByRole('button', { name: 'Save my data' })).toBeVisible()
  })

  test('a user can sign in with email and password', async ({ page }) => {
    await page.goto('/signin')
    await page.getByLabel('Email Address').fill('sam@example.com')
    await page.getByLabel('Password', { exact: true }).fill('supersecret')
    // Submit the form (Enter avoids the sign-in tab / submit button ambiguity).
    await page.getByLabel('Password', { exact: true }).press('Enter')

    await expect(page.getByRole('link', { name: 'Weekly Targets' })).toBeVisible()
  })
})

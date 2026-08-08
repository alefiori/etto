import { test, expect } from './fixtures/supabase'

test.describe('authentication', () => {
  test('a first-time visitor lands in the app, not on a login wall', async ({ page }) => {
    await page.goto('/')

    // Straight into the authenticated shell — no signup demanded first.
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
    // ...as a guest, nudged to keep the data they are about to create.
    await expect(page.getByRole('button', { name: 'Save my data' })).toBeVisible()
  })

  test('a deep link works without signing in', async ({ page }) => {
    await page.goto('/targets')
    await expect(page.getByRole('heading', { name: 'Weekly Planner' })).toBeVisible()
  })

  test('the sign-in screen is still reachable on purpose', async ({ page }) => {
    await page.goto('/signin')
    await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeVisible()
    await expect(page.getByLabel('Email Address')).toBeVisible()
  })

  test('a visitor can still continue as a guest explicitly', async ({ page }) => {
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Continue as guest' }).click()

    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save my data' })).toBeVisible()
  })

  test('a user can sign in with email and password', async ({ page }) => {
    await page.goto('/signin')
    await page.getByLabel('Email Address').fill('sam@example.com')
    await page.getByLabel('Password', { exact: true }).fill('supersecret')
    // Submit the form (Enter avoids the sign-in tab / submit button ambiguity).
    await page.getByLabel('Password', { exact: true }).press('Enter')

    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
    // A real account is not nudged to save its data.
    await expect(page.getByRole('button', { name: 'Save my data' })).toHaveCount(0)
  })

  test('a guest is labelled as one rather than shown a blank email', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Guest account', { exact: true })).toBeVisible()
  })

  test('signing out reaches the sign-in screen instead of a fresh guest', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Guest account', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out' }).last().click()

    // The whole point of the suppression flag: without it the guard would hand
    // back a new anonymous account and this screen would be unreachable.
    await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeVisible()
    await expect(page).toHaveURL(/\/signin$/)
  })
})

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
    // The sidebar labels the guest too, so scope to the profile card.
    await expect(
      page.getByRole('main').getByText('Guest account', { exact: true }),
    ).toBeVisible()
  })

  test('a guest reaches the sign-in screen without signing out first', async ({ page }) => {
    await page.goto('/profile')

    // A guest has no account to sign out of; the profile offers to sign in to an
    // existing one, which opens over the still-live guest session.
    await page.getByRole('main').getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/signin$/)
    await expect(page.getByRole('button', { name: 'Continue as guest' })).toBeVisible()
  })

  test('signing out of a real account returns to guest mode, not a login wall', async ({ page }) => {
    await page.goto('/signin')
    await page.getByLabel('Email Address').fill('sam@example.com')
    await page.getByLabel('Password', { exact: true }).fill('supersecret')
    await page.getByLabel('Password', { exact: true }).press('Enter')

    // Signed in for real — no guest nudge.
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save my data' })).toHaveCount(0)

    await page.goto('/profile')
    await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()

    // Guest is the default state now: sign-out drops back into the app as a
    // fresh guest rather than onto a login wall.
    await expect(page.getByRole('button', { name: 'Save my data' })).toBeVisible()
    await expect(page).not.toHaveURL(/\/signin$/)
  })
})

import { test, expect, makeAccessToken } from './fixtures/supabase'

test.describe('password reset', () => {
  test('a well-formed recovery link lets you set a new password and lands you signed in', async ({
    page,
  }) => {
    const accessToken = makeAccessToken()
    // The exact shape a Supabase implicit-grant recovery redirect appends —
    // see src/lib/deepLinks.ts for why this project reads it by hand rather
    // than through the client's own detectSessionInUrl.
    await page.goto(
      `/reset-password#access_token=${accessToken}&refresh_token=fake-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
    )

    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

    await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password')
    await page.getByLabel('Confirm new password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Save new password' }).click()

    await expect(page.getByText('Password updated. You’re signed in.')).toBeVisible()

    // The success state navigates into the app on its own, no further click.
    await expect(page.getByRole('link', { name: 'Weekly Targets', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('mismatched passwords are rejected before anything is submitted', async ({ page }) => {
    const accessToken = makeAccessToken()
    await page.goto(
      `/reset-password#access_token=${accessToken}&refresh_token=fake-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
    )

    await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password')
    await page.getByLabel('Confirm new password').fill('does-not-match')
    await page.getByRole('button', { name: 'Save new password' }).click()

    await expect(page.getByText('Passwords do not match.')).toBeVisible()
    // Still on the form — nothing was submitted.
    await expect(page.getByRole('button', { name: 'Save new password' })).toBeVisible()
  })

  test('a password shorter than 8 characters is rejected', async ({ page }) => {
    const accessToken = makeAccessToken()
    await page.goto(
      `/reset-password#access_token=${accessToken}&refresh_token=fake-refresh-token&expires_in=3600&token_type=bearer&type=recovery`,
    )

    await page.getByLabel('New password', { exact: true }).fill('short')
    await page.getByLabel('Confirm new password').fill('short')
    await page.getByRole('button', { name: 'Save new password' }).click()

    await expect(page.getByText('Use at least 8 characters')).toBeVisible()
  })

  test('an expired or already-used link shows the expired state, not the form', async ({ page }) => {
    // GoTrue's own shape for this: the redirect carries an error instead of
    // tokens.
    await page.goto(
      '/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )

    await expect(
      page.getByText('This reset link has expired. Request a new one.'),
    ).toBeVisible()
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
  })

  test('landing on /reset-password with no token at all also shows the expired state', async ({
    page,
  }) => {
    // Not the ordinary path — the native app never lands here without a
    // session already established by lib/deepLinks.ts — but a bare visit (a
    // bookmarked link, a stale tab) must fail closed rather than show a form
    // with nothing behind it.
    await page.goto('/reset-password')

    await expect(
      page.getByText('This reset link has expired. Request a new one.'),
    ).toBeVisible()
  })
})

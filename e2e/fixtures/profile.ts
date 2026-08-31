import { expect, type Page } from '@playwright/test'

/**
 * Open one of the Profile page's settings rows.
 *
 * Every section on that page is a disclosure now — icon, name, current value,
 * chevron — so its fields are not in the document until the row is opened. See
 * src/components/profile/SettingsRow.tsx.
 *
 * `name` matches the row's accessible name, which is its label followed by
 * whatever value the row summarises ("Meals 4", "Language English"), so pass a
 * prefix pattern rather than an exact string. Appearance is not a row and
 * needs none of this.
 *
 * The click is asserted rather than fired and forgotten: a mis-typed name would
 * otherwise fail later, inside the test, as a missing field — which reads as
 * the feature being broken rather than the test opening the wrong row.
 */
export async function openSetting(page: Page, name: RegExp): Promise<void> {
  const row = page.getByRole('button', { name })
  await row.click()
  await expect(row).toHaveAttribute('aria-expanded', 'true')
}

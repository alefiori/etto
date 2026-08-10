import { test, expect, seedSession, USER_ID } from './fixtures/supabase'

/** The `dark` class on <html> is what every Tailwind `dark:` variant keys off. */
const html = 'html'

test.describe('appearance', () => {
  test.describe('on a device set to dark', () => {
    test.use({ colorScheme: 'dark' })

    test('follows the device when nothing has been chosen', async ({ page }) => {
      await seedSession(page)
      await page.goto('/')

      await expect(page.locator(html)).toHaveClass(/dark/)
      // The browser-chrome color follows the app's chrome, not the page.
      await expect(page.locator('#app-theme-color')).toHaveAttribute('content', '#0c0c14')
    })

    test('is already dark on the very first paint, before React mounts', async ({ page }) => {
      // The bundle is a module, so it only runs after the document is parsed.
      // Without the inline bootstrap in index.html this would be a white flash.
      await page.route('**/assets/*.js', (route) => route.abort())
      await page.goto('/signin')

      await expect(page.locator(html)).toHaveClass(/dark/)
    })

    test('an explicit light choice wins over the device', async ({ page, store }) => {
      await seedSession(page)
      await page.goto('/profile')

      await page.getByRole('radio', { name: 'Light' }).click()

      await expect(page.locator(html)).not.toHaveClass(/dark/)
      await expect(page.locator('#app-theme-color')).toHaveAttribute('content', '#f7f7fb')
      expect(store.profiles.find((p) => p['id'] === USER_ID)).toMatchObject({ theme: 'light' })

      // And it sticks across a reload, even though the device still says dark.
      await page.reload()
      await expect(page.locator(html)).not.toHaveClass(/dark/)
      await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked()
    })
  })

  test.describe('on a device set to light', () => {
    test.use({ colorScheme: 'light' })

    test('starts light and switches to dark on demand', async ({ page }) => {
      await seedSession(page)
      await page.goto('/profile')

      await expect(page.locator(html)).not.toHaveClass(/dark/)
      await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()

      await page.getByRole('radio', { name: 'Dark' }).click()
      await expect(page.locator(html)).toHaveClass(/dark/)

      // The page ground and the cards on it are both repainted, and stay
      // distinguishable — the dark scheme steps the card up from the page
      // rather than relying on a shadow that would be invisible there.
      //
      // The card's fill is on its `::before` (see the glass note in
      // index.css), so read that layer rather than the element: the card
      // itself is transparent by design in both schemes.
      const page_bg = await background(page, 'body')
      const card_bg = await backgroundOfLens(page, 'main .glass')
      expect(page_bg).not.toBe(card_bg)
    })

    test('returning to System hands control back to the device', async ({ page, store }) => {
      await seedSession(page)
      await page.goto('/profile')

      await page.getByRole('radio', { name: 'Dark' }).click()
      await expect(page.locator(html)).toHaveClass(/dark/)

      await page.getByRole('radio', { name: 'System' }).click()
      await expect(page.locator(html)).not.toHaveClass(/dark/)
      // NULL, not the word "system": the choice has to be re-resolved on every
      // load rather than frozen at whatever the device is right now.
      expect(store.profiles.find((p) => p['id'] === USER_ID)).toMatchObject({ theme: null })

      // Flipping the OS switch now moves the app with it, without a reload.
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator(html)).toHaveClass(/dark/)
    })

    test('an account preference applies on a device that has never seen it', async ({
      page,
      store,
    }) => {
      store.profiles[0]['theme'] = 'dark'
      await seedSession(page)
      await page.goto('/')

      await expect(page.locator(html)).toHaveClass(/dark/)
    })
  })
})

function background(page: import('@playwright/test').Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** The fill of a glass surface, which lives on its `::before` layer. */
function backgroundOfLens(page: import('@playwright/test').Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
}

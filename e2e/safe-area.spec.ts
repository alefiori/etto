import type { Locator, Page } from '@playwright/test'
import { test, expect, seedSession } from './fixtures/supabase'
import { openSetting } from './fixtures/profile'

/**
 * Safe areas, with a notch faked in.
 *
 * On an iPhone the status bar and the home indicator sit *over* the WebView —
 * anything drawn at y=0 is under the notch and untappable, which is how the
 * close buttons on the full-screen modals went missing. Chromium reports no
 * insets, so `env(safe-area-inset-*)` is 0 here and none of this would be
 * exercised. The layout reads its insets from the custom properties defined in
 * src/index.css instead, so setting those on <html> stands in for the hardware.
 *
 * The assertions are geometric on purpose: every control has to land inside the
 * safe rectangle, whatever markup happens to put it there.
 */

/** iPhone 15 in portrait, in CSS pixels. */
const INSETS = { top: 59, bottom: 34 }

async function fakeNotch(page: Page): Promise<void> {
  // addInitScript rather than a style tag: the insets have to be in place
  // before first paint, or the layout gets measured mid-correction.
  await page.addInitScript((insets) => {
    const apply = () => {
      const s = document.documentElement.style
      s.setProperty('--safe-top', `${insets.top}px`)
      s.setProperty('--safe-bottom', `${insets.bottom}px`)
    }
    // The script runs at document creation, where <html> may not exist yet.
    if (document.documentElement) apply()
    else document.addEventListener('readystatechange', apply, { once: true })
  }, INSETS)
}

/** Assert nothing of the element is behind the status bar. */
async function expectBelowNotch(target: Locator, label: string) {
  await expect(target, `${label} should be visible`).toBeVisible()
  const box = (await target.boundingBox())!
  expect(box.y, `${label} starts under the notch`).toBeGreaterThanOrEqual(INSETS.top)
}

/** Assert nothing of the element is behind the home indicator. */
async function expectAboveHomeIndicator(page: Page, target: Locator, label: string) {
  await expect(target, `${label} should be visible`).toBeVisible()
  const box = (await target.boundingBox())!
  const viewport = page.viewportSize()!
  expect(
    box.y + box.height,
    `${label} runs under the home indicator`,
  ).toBeLessThanOrEqual(viewport.height - INSETS.bottom)
}

test.describe('safe areas on a notched phone', () => {
  test.use({ viewport: { width: 393, height: 852 } }) // iPhone 15

  test.beforeEach(async ({ page }) => {
    await fakeNotch(page)
  })

  test('the top app bar clears the status bar', async ({ page }) => {
    await page.goto('/')

    // Scoped to the bar that carries the wordmark — the bottom nav has a
    // Profile link of its own. It is a `<header>` (a banner landmark) rather
    // than a fourth `<nav>`: it holds the wordmark and one link, and three
    // navigation landmarks were already competing in the landmark list.
    const topBar = page
      .locator('header')
      .filter({ has: page.getByRole('heading', { name: 'Etto' }) })
    await expectBelowNotch(topBar.getByRole('link'), 'the top bar profile button')
    await expectBelowNotch(
      page.getByRole('heading', { name: 'Etto' }),
      'the top bar wordmark',
    )
  })

  test('the bottom nav and FAB clear the home indicator', async ({ page }) => {
    await page.goto('/')

    await expectAboveHomeIndicator(
      page,
      page.getByRole('link', { name: 'Targets', exact: true }),
      'the bottom nav',
    )
    await expectAboveHomeIndicator(
      page,
      page.locator('button[aria-label="Add Food"]:visible'),
      'the floating action button',
    )
  })

  test("the add-food modal's close button is not under the notch", async ({ page }) => {
    await page.goto('/')
    await page.locator('button[aria-label="Add Food"]:visible').click()

    // The modal is full-bleed on a phone, which is exactly the case that used
    // to put its header — and so its only way out — behind the status bar.
    await expectBelowNotch(
      page.getByRole('button', { name: 'Close' }),
      "the add-food modal's close button",
    )
  })

  test('a confirmation sheet keeps its actions off the home indicator', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')
    await openSetting(page, /^Meals/)
    await page.getByLabel('Delete Snack').click()

    await expect(page.getByRole('alertdialog')).toBeVisible()
    await expectAboveHomeIndicator(
      page,
      page.getByRole('button', { name: 'Delete', exact: true }),
      "the confirmation sheet's delete button",
    )
  })

  test('the sign-in screen sits below the notch and scrolls itself', async ({ page }) => {
    await page.goto('/signin')

    // This route renders outside AppLayout, so nothing else insets it. The
    // language picker is its topmost control.
    await expectBelowNotch(page.getByLabel('Language'), 'the language picker')

    // It also has to own its scrolling: the iOS shell turns off the WebView's
    // own, so a page relying on the document scrolling would strand its submit
    // button off-screen on a short phone.
    const scrollable = await page.evaluate(() => {
      const el = document.querySelector('main')?.parentElement
      if (!el) return false
      const style = getComputedStyle(el)
      return (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        el.scrollHeight >= el.clientHeight
      )
    })
    expect(scrollable, 'the auth route should own its scrolling').toBe(true)
  })
})

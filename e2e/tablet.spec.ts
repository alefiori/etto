import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/supabase'

/**
 * Layout across window sizes, which on iPadOS is not just "portrait vs
 * landscape" — Split View and Stage Manager hand the app arbitrary widths, so
 * the breakpoints have to hold at every one of them.
 *
 * The chrome is identified by the width of whichever <aside> is displayed:
 * 280px is the desktop drawer, 80px the tablet rail, and none at all means the
 * phone layout with its top bar and bottom nav. Only one is ever shown, so this
 * reads the actual rendered result rather than asserting on class names.
 */
async function visibleChromeWidth(page: Page): Promise<number | null> {
  const aside = page.locator('aside:visible')
  if ((await aside.count()) === 0) return null
  const box = await aside.first().boundingBox()
  return box?.width ?? null
}

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } }) // iPhone 15

  test('shows the bottom nav and no side chrome', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

    expect(await visibleChromeWidth(page)).toBeNull()
    // The bottom nav uses the short labels; the drawer and rail use the long ones.
    await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()
    // The floating action button belongs to the phone layout only — the rail
    // and drawer put the same action inside themselves.
    await expect(page.locator('button[aria-label="Add Food"]:visible')).toHaveCount(1)
  })

  test('hides the floating action button on the custom food form', async ({ page }) => {
    await page.goto('/foods/new')
    await expect(page.getByRole('heading', { name: 'Create Custom Food' })).toBeVisible()

    // The page is an add-food flow already, with its own save actions at the
    // bottom — a FAB opening the add-food modal over it only covers them up.
    await expect(page.locator('button[aria-label="Add Food"]:visible')).toHaveCount(0)
    // The rest of the phone chrome stays put.
    await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()
  })
})

test.describe('iPad portrait', () => {
  test.use({ viewport: { width: 820, height: 1180 } }) // iPad 10.9"

  test('shows the navigation rail instead of stretched phone chrome', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'MacroTrack' })).toBeVisible()

    // 80px rail, not the 280px drawer and not the phone layout.
    expect(await visibleChromeWidth(page)).toBeCloseTo(80, 0)
  })

  test('leaves no content hidden under the rail', async ({ page }) => {
    await page.goto('/')
    const heading = page.getByRole('heading', { name: 'Today' })
    await expect(heading).toBeVisible()

    const box = await heading.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(80)
  })

  test('lays the week out in a grid rather than one long column', async ({ page }) => {
    await page.goto('/targets')
    await expect(page.locator('#target-1-carbs')).toBeVisible()

    // Monday and Tuesday should sit side by side, not stacked.
    const monday = await page.locator('#target-1-carbs').boundingBox()
    const tuesday = await page.locator('#target-2-carbs').boundingBox()
    expect(monday!.y).toBeCloseTo(tuesday!.y, 0)
    expect(tuesday!.x).toBeGreaterThan(monday!.x)
  })
})

test.describe('iPad landscape', () => {
  test.use({ viewport: { width: 1366, height: 1024 } }) // iPad Pro 12.9"

  test('shows the full navigation drawer', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Health Companion')).toBeVisible()

    expect(await visibleChromeWidth(page)).toBeCloseTo(280, 0)
  })
})

test.describe('iPad Split View, half width', () => {
  test.use({ viewport: { width: 507, height: 1024 } })

  test('falls back to the phone layout', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

    // Below the rail's breakpoint, the phone chrome is the right answer.
    expect(await visibleChromeWidth(page)).toBeNull()
    await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()
  })
})

test.describe('iPad Slide Over', () => {
  test.use({ viewport: { width: 320, height: 1024 } })

  test('stays usable at the narrowest window iPadOS hands out', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

    // Nothing may overflow horizontally — a sideways-scrolling app in Slide
    // Over is the classic sign of a phone layout that was never checked here.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

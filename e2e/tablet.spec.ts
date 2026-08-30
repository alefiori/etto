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
    // Exactly one add button is reachable at any window class. On a phone it
    // is the tile at the right-hand end of the tab bar; the rail and the drawer
    // carry their own.
    await expect(page.locator('button[aria-label="Add Food"]:visible')).toHaveCount(1)

    // The tab bar is chrome content scrolls *under*, so it has to be an opaque
    // surface or the list reads straight through it. Grove dropped the backdrop
    // blur the old glass used for this; the fill is a solid colour now, so an
    // opaque `background-color` (`rgb(...)`, no alpha) is what proves the cover.
    await expect(page.locator('nav.glass-chrome')).toHaveCSS('background-color', /^rgb\(/)
  })

  test('keeps the phone chrome behind the custom food sheet', async ({ page }) => {
    await page.goto('/foods')
    await page.getByRole('button', { name: 'Create custom food' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // The form was a route once, and the add button had to stand down on it or
    // it covered the save buttons. As a sheet it simply draws over the chrome,
    // which stays where it is underneath.
    await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()
    await expect(page.locator('button[aria-label="Add Food"]:visible')).toHaveCount(1)
  })
})

test.describe('iPad portrait', () => {
  test.use({ viewport: { width: 820, height: 1180 } }) // iPad 10.9"

  test('shows the navigation rail instead of stretched phone chrome', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Etto' })).toBeVisible()

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

  test('does not scroll the rail sideways when a destination is hovered', async ({ page }) => {
    await page.goto('/')
    // Same trap as the drawer, one window class down: the rail scrolls its
    // destinations vertically, so the hover lift needs room inside the
    // scrollport or it turns into a horizontal scrollbar down the rail.
    const nav = page.locator('aside:visible nav')
    await nav.getByRole('link', { name: 'Targets' }).hover()

    const overflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
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

  test('does not scroll the drawer sideways when a destination is hovered', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Health Companion')).toBeVisible()

    // The destinations scroll vertically (they have to, at a large text size),
    // which makes their column a scroll container on *both* axes — CSS gives
    // `overflow-x: visible` no meaning next to an `auto`. The hover lift moves
    // each destination a couple of pixels towards the pointer, and without room
    // for it that lift is horizontal overflow: a scrollbar appears across the
    // drawer for as long as the pointer rests on a link.
    const nav = page.locator('aside:visible nav')
    await nav.getByRole('link', { name: 'Weekly Targets' }).hover()

    const overflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
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

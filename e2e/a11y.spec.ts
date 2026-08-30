import type { Page } from '@playwright/test'
import { test, expect, seedSession, seedPro, USER_ID, type Store } from './fixtures/supabase'

/**
 * The accessibility contracts that are easy to break by accident and invisible
 * in a screenshot: keyboard focus, live regions, landmarks, and the app's
 * behaviour at the reader's own text size.
 *
 * Text scaling gets the most attention here because it is the one that used to
 * be answered by refusing it — `text-size-adjust: 100%` plus `setTextZoom(100)`
 * in the Android shell. The layout absorbs it now, and "absorbs" means
 * something specific and checkable: no content ends up underneath the fixed
 * chrome, and the page never grows a horizontal scrollbar.
 */

const PHONE = { width: 390, height: 844 }

/**
 * The narrowest viewport the app has to hold, which is not a phone model.
 *
 * Android's *Display size* raises the screen density without changing the
 * panel, so the WebView's viewport shrinks in CSS pixels — a 360dp phone at the
 * largest display size lands near 320. It is also the width WCAG 1.4.10 names,
 * so one number covers both. Paired with 200% text it is the worst case the
 * layout is asked for, and the one a low-vision reader is most likely to be in:
 * display size and font size are separate settings, and they turn up both.
 */
const NARROW_PHONE = { width: 320, height: 640 }

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * A day with targets and one logged food, so the dashboard has real content.
 *
 * Pro as well, because the water and weight cards are behind it: a free
 * dashboard reflows two upgrade prompts where a subscriber's reflows a quick-add
 * row, a ring, a number field and a chart — and it is the latter that these
 * contracts have to hold for.
 */
function seedDay(store: Store) {
  seedPro(store)
  for (let dow = 0; dow < 7; dow++) {
    store.macro_targets.push({
      id: `t-${dow}`,
      user_id: USER_ID,
      day_of_week: dow,
      carbs_g: 220,
      protein_g: 150,
      fats_g: 70,
    })
  }
  store.foods.push({
    id: 'food-oats',
    user_id: USER_ID,
    name: 'Rolled oats',
    brand: 'Quaker',
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: 60,
    protein_g: 13,
    fats_g: 7,
    source: 'custom',
    off_id: null,
    is_custom: true,
    is_public: false,
    created_at: '2024-01-01T00:00:00.000Z',
  })
  store.food_logs.push({
    id: 'log-1',
    user_id: USER_ID,
    food_id: 'food-oats',
    log_date: todayISO(),
    meal: 'breakfast',
    servings: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  })
}

/**
 * Scale text the way a platform would: by moving the root font size.
 *
 * This is what Android's `textZoom` and the browser's own default-font setting
 * amount to, and what lib/textScale.ts writes for iOS. Everything in the app is
 * sized against it, so this is the honest stand-in for all three.
 */
async function setTextScale(page: Page, scale: number) {
  await page.addStyleTag({
    content: `html { font-size: ${scale * 16}px !important; }`,
  })
  // Past the threshold the chrome sheds its micro-labels; that decision is made
  // in JS because CSS cannot compare a custom property to a number.
  await page.evaluate((s) => {
    document.documentElement.dataset.textScale = s > 1.35 ? 'large' : 'base'
  }, scale)
  // Let the ResizeObserver in useChromeMetrics report the new chrome height.
  await page.waitForTimeout(150)
}

test.describe('keyboard and screen-reader contracts', () => {
  test('the first Tab reaches a skip link that moves focus past the navigation', async ({
    page,
    store,
  }) => {
    seedDay(store)
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    // Invisible until focused, and a real target once it is — not an off-screen
    // link the user is told about but cannot see.
    await expect(skip).toBeVisible()

    await page.keyboard.press('Enter')
    await expect(page.locator('main')).toBeFocused()
  })

  test('each navigation landmark is named, and the page has one banner', async ({
    page,
    store,
  }) => {
    seedDay(store)
    await seedSession(page)
    await page.setViewportSize(PHONE)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    // Three navs are in the markup (drawer, rail, tab bar) but only the one for
    // this width is rendered; whichever it is has to carry a name.
    const navs = page.locator('nav:visible')
    for (const nav of await navs.all()) {
      expect(await nav.getAttribute('aria-label')).toBe('Main navigation')
    }
    // The top bar is a banner, not a fourth navigation.
    await expect(page.locator('header:visible').first()).toBeVisible()
  })

  test('focus is trapped inside a dialog and returned when it closes', async ({ page, store }) => {
    seedDay(store)
    await seedSession(page)
    await page.goto('/')

    const opener = page.getByTestId('add-food-fab')
    await page.setViewportSize(PHONE)
    await opener.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Tab all the way round; focus must never leave the dialog.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const inside = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]')
        return !!d && d.contains(document.activeElement)
      })
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true)
    }

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    // Back where the user was, not dumped on <body>.
    await expect(opener).toBeFocused()
  })

  test('a failed action is announced, not just drawn', async ({ page, store }) => {
    seedDay(store)
    await seedSession(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    // Break the write, then take an action that needs it. The message used to
    // appear as an ordinary paragraph: visible, and completely silent to a
    // screen reader, which is the failure mode this checks for.
    await page.route('**/rest/v1/water_logs**', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, body: '{"message":"nope"}' })
        : route.continue(),
    )
    await page.getByRole('button', { name: /Add \d/ }).first().click()

    const alert = page.locator('[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).not.toBeEmpty()
  })

  test('the macro rings read as one figure each', async ({ page, store }) => {
    seedDay(store)
    await seedSession(page)
    await page.goto('/')
    // "84 g" and "/220g" used to be announced as two unrelated fragments.
    await expect(
      page.getByRole('img', { name: /Carbs: .* g of .* g, .* g remaining/ }),
    ).toBeVisible()
  })
})

test.describe('text scaling', () => {
  for (const scale of [1, 1.5, 2]) {
    test(`nothing is clipped or cut off at ${scale * 100}% text`, async ({ page, store }) => {
      seedDay(store)
      await seedSession(page)
      await page.setViewportSize(PHONE)
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()
      await setTextScale(page, scale)

      // 1. The page must reflow, not pan. A horizontal scrollbar at any text
      //    size is WCAG 1.4.10 (Reflow) failing.
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement!
        return el.scrollWidth - el.clientWidth
      })
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1)

      // 2. The content lane must reserve the chrome's *actual* height. This is
      //    what the fixed 72px/112px constants got wrong once the chrome could
      //    grow: the first and last cards slid underneath it.
      const clearance = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const style = getComputedStyle(main)
        const bar = document.querySelector('nav[aria-label]')
        const header = document.querySelector('header')
        return {
          padTop: parseFloat(style.paddingTop),
          padBottom: parseFloat(style.paddingBottom),
          barHeight: bar?.getBoundingClientRect().height ?? 0,
          headerHeight: header?.getBoundingClientRect().height ?? 0,
        }
      })
      expect(clearance.padTop).toBeGreaterThanOrEqual(clearance.headerHeight)
      expect(clearance.padBottom).toBeGreaterThanOrEqual(clearance.barHeight)

      // 3. The destinations stay reachable and correctly named at every scale,
      //    even where the tab bar has dropped its visible micro-labels.
      await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()

      await page.screenshot({
        path: `test-results/a11y-scale-${scale}.png`,
        fullPage: false,
      })
    })
  }

  // The dashboard is the busiest page, but it is not the only one that has to
  // reflow. These sweep the other three at the WCAG figure.
  for (const [route, landmark] of [
    ['/targets', 'Weekly Planner'],
    ['/foods', 'My Foods'],
    ['/profile', 'Profile'],
  ] as const) {
    test(`${route} reflows at 200% text`, async ({ page, store }) => {
      seedDay(store)
      await seedSession(page)
      await page.setViewportSize(PHONE)
      await page.goto(route)
      await expect(page.getByRole('heading', { name: landmark }).first()).toBeVisible()
      await setTextScale(page, 2)

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement!
        return el.scrollWidth - el.clientWidth
      })
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1)

      // Nothing may sit wider than the viewport either — a card that overflows
      // its own container without scrolling the page still loses its right edge.
      const tooWide = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        return Array.from(document.querySelectorAll('main *'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.right > vw + 1 || r.left < -1)
          })
          .slice(0, 5)
          .map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 50)}`)
      })
      expect(tooWide, 'content extends past the viewport').toEqual([])

      await page.screenshot({ path: `test-results/a11y-200-${route.slice(1)}.png` })
    })
  }

  /**
   * Both Android settings at once, on every route.
   *
   * The 390px sweep above misses this: the failure is a control whose own
   * minimum width is larger than the lane, which only bites once the lane is
   * narrow *and* the text is large. It also does not show up as a scrollbar —
   * the app shell is `overflow: hidden`, so anything past the edge is cut off
   * rather than scrolled to, which is the worse half of 1.4.10.
   *
   * Decoration that an ancestor deliberately clips (the blurred blobs on the
   * calorie and water cards sit outside their card on purpose) is not a
   * failure, so the sweep walks up to `main` and skips anything already inside
   * an `overflow` that is not `visible`.
   */
  for (const [route, landmark] of [
    ['/', 'Calories'],
    ['/targets', 'Weekly Planner'],
    ['/foods', 'My Foods'],
    ['/profile', 'Profile'],
  ] as const) {
    test(`${route} reflows at 320px with 200% text`, async ({ page, store }) => {
      seedDay(store)
      await seedSession(page)
      await page.setViewportSize(NARROW_PHONE)
      await page.goto(route)
      await expect(page.getByRole('heading', { name: landmark }).first()).toBeVisible()
      await setTextScale(page, 2)

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement!
        return el.scrollWidth - el.clientWidth
      })
      expect(overflow, 'the page scrolls horizontally').toBeLessThanOrEqual(1)

      const cutOff = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        const main = document.querySelector('main')!
        const clipped = (el: Element) => {
          let parent = el.parentElement
          while (parent && parent !== main) {
            if (getComputedStyle(parent).overflowX !== 'visible') return true
            parent = parent.parentElement
          }
          return false
        }
        return Array.from(main.querySelectorAll('*'))
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !clipped(el)
          })
          .slice(0, 5)
          .map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 60)}`)
      })
      expect(cutOff, 'content is cut off by the viewport edge').toEqual([])

      await page.screenshot({ path: `test-results/a11y-narrow-${route.slice(1) || 'dashboard'}.png` })
    })
  }

  test('the tab bar sheds its micro-labels rather than truncating them', async ({ page, store }) => {
    seedDay(store)
    await seedSession(page)
    await page.setViewportSize(PHONE)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Calories' })).toBeVisible()

    const label = page.locator('nav:visible .chrome-label').first()
    await expect(label).toBeVisible()

    await setTextScale(page, 2)
    // Clipped to a 1px box rather than removed — `display: none` here would
    // strip the link's only accessible name, since the icon is aria-hidden.
    const box = await label.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(1)
    // Hidden to the eye, unchanged to a screen reader: the name comes from the
    // link's text, which is still there.
    await expect(page.getByRole('link', { name: 'Targets', exact: true })).toBeVisible()
  })
})

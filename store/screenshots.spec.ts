import { test, seedSession, type Store } from '../e2e/fixtures/supabase'
import type { Page, TestInfo } from '@playwright/test'
import { seedShowcase } from './seed'

/**
 * Store listing screenshots.
 *
 * Not part of `npm run e2e` — this has its own config
 * (playwright.store.config.ts) because it asserts nothing and exists to emit
 * PNGs. Run it with `npm run store:screenshots`.
 *
 * Why generate them rather than take them by hand on a device: the listing
 * needs the same screens at four exact pixel sizes, in up to seven languages,
 * and every one has to be retaken whenever a screen changes. By hand that is an
 * afternoon nobody has — which is how listings end up showing an app from two
 * releases ago. Driven from the hermetic fixtures the e2e suite already has,
 * it is one command with no device, no account and no network.
 *
 * The output is gitignored: it is a build artifact of the current UI, and 140
 * PNGs of it do not belong in history.
 */

const LOCALE = process.env.STORE_LOCALE ?? 'en'

/** `store/screenshots/<locale>/<device>/<name>.png` — one folder per upload. */
function shotPath(info: TestInfo, name: string): string {
  return `store/screenshots/${LOCALE}/${info.project.name}/${name}.png`
}

/**
 * Sign in, load a route, and let it settle.
 *
 * The wait is not laziness: the macro rings and the weight trend animate in
 * from zero, so a screenshot taken on `load` catches a half-drawn chart — the
 * one artifact that makes a listing look broken.
 */
async function ready(page: Page, store: Store, path: string) {
  seedShowcase(store, { pro: true })
  await seedSession(page)
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
}

test.describe('store screenshots', () => {
  test.use({ locale: LOCALE })

  test('dashboard', async ({ page, store }, info) => {
    await ready(page, store, '/')
    await page.screenshot({ path: shotPath(info, '01-dashboard') })
  })

  test('weekly targets', async ({ page, store }, info) => {
    await ready(page, store, '/targets')
    await page.screenshot({ path: shotPath(info, '02-targets') })
  })

  test('add food', async ({ page, store }, info) => {
    await ready(page, store, '/')
    // By test id, not by label: the label is translated and this spec runs in
    // seven languages. Above the phone breakpoint the FAB is hidden and the
    // rail (tablet) or drawer (desktop-width iPad) carries the action instead —
    // one as an aria-label, the other as button text, which is why the fallback
    // goes through the accessible name rather than getByLabel.
    const fab = page.getByTestId('add-food-fab')
    if (await fab.isVisible()) {
      await fab.click()
    } else {
      const label = (await fab.getAttribute('aria-label')) ?? ''
      await page.getByRole('button', { name: label }).filter({ visible: true }).first().click()
    }
    await page.waitForTimeout(800)
    await page.screenshot({ path: shotPath(info, '03-add-food') })
  })

  test('my foods', async ({ page, store }, info) => {
    await ready(page, store, '/foods')
    await page.screenshot({ path: shotPath(info, '04-my-foods') })
  })

  test('profile', async ({ page, store }, info) => {
    await ready(page, store, '/profile')
    await page.screenshot({ path: shotPath(info, '05-profile') })
  })
})

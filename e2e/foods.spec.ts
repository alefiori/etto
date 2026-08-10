import { test, expect, seedSession, USER_ID } from './fixtures/supabase'
import type { Store } from './fixtures/supabase'

/**
 * My Foods: the list, and the custom-food form it leads to.
 *
 * The list rows are {@link FoodRow}, shared with the dashboard's meal cards —
 * the whole row is the target, and its actions live in a press-and-hold menu
 * rather than in a strip of icons that only appeared on hover.
 */

const CUSTOM = {
  id: 'f-1',
  user_id: USER_ID,
  name: 'Greek yogurt, plain',
  brand: 'Fage',
  serving_amount: 200,
  serving_unit: 'g',
  carbs_g: 7.2,
  protein_g: 20.6,
  fats_g: 10,
  is_custom: true,
  is_public: false,
  source: 'custom',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

const IMPORTED = {
  ...CUSTOM,
  id: 'f-2',
  name: 'Chicken breast, grilled',
  brand: null,
  serving_amount: 150,
  carbs_g: 0,
  protein_g: 46.5,
  fats_g: 5.4,
  is_custom: false,
  source: 'off',
}

function seed(store: Store) {
  store.foods.push({ ...CUSTOM }, { ...IMPORTED })
}

test.describe('my foods', () => {
  test('opens the custom food form as a sheet, over the list', async ({ page, store }) => {
    // Opened by a *click*, never by page.goto. The form was a route until it
    // became a sheet, and AppLayout used to hide the FAB on that route with a
    // pair of useMatch calls combined by `||` — which skipped the second hook
    // the moment the first matched, and React only rejects that when there is a
    // previous render to disagree with. A full page load has none, so
    // goto('/foods/new') passed while every link to it tore the app down. The
    // route is gone now; entering by click is still how this must be tested.
    const crashes: string[] = []
    page.on('pageerror', (e) => crashes.push(e.message.split('\n')[0]))

    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: 'Create custom food' }).click()

    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Create Custom Food' })).toBeVisible()
    await expect(page.getByLabel('Food name')).toBeVisible()
    // The list is still there underneath — that is what makes it a sheet.
    await expect(page).toHaveURL(/\/foods$/)
    await expect(page.getByRole('heading', { name: 'My Foods' })).toBeVisible()
    expect(crashes).toEqual([])
  })

  test('closes the sheet without leaving the list', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: 'Create custom food' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page).toHaveURL(/\/foods$/)
  })

  test('starts from an empty draft each time it opens', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')

    await page.getByRole('button', { name: 'Create custom food' }).click()
    await page.getByLabel('Food name').fill('Half-typed thing')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'Create custom food' }).click()
    await expect(page.getByLabel('Food name')).toHaveValue('')
  })

  test('saves a new food and shows it in the list behind the sheet', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: 'Create custom food' }).click()

    await page.getByLabel('Food name').fill('Cottage cheese')
    await page.getByLabel('Serving amount').fill('100')
    await page.getByLabel('Carbs (g)').fill('3.4')
    await page.getByLabel('Protein (g)').fill('11')
    await page.getByLabel('Fats (g)').fill('4.3')
    await page.getByRole('button', { name: 'Save food' }).click()

    // The sheet closes over a list that never unmounted, so the list has to
    // refetch itself rather than relying on a navigation to remount it.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Cottage cheese/ })).toBeVisible()
    await expect.poll(() => store.foods.some((f) => f.name === 'Cottage cheese')).toBe(true)
  })

  test('hands over from the Add Food overlay without leaving it behind', async ({ page }) => {
    // The reason the form stopped being a route. Searching for a food, deciding
    // to adapt it, and being thrown onto a separate page to do so meant the
    // search you were in the middle of was gone. Now one sheet replaces the
    // other and the page underneath never changes.
    await seedSession(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Add Food' }).click()
    await page.getByLabel('Search foods').fill('noodles')
    await page.getByRole('button', { name: /Stub Rice Noodles/ }).click()
    await page.getByRole('button', { name: 'Edit & save as custom' }).click()

    // The search overlay is gone and the form is up, seeded from the result.
    await expect(page.getByLabel('Search foods')).toHaveCount(0)
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Create Custom Food' }),
    ).toBeVisible()
    await expect(page.getByLabel('Food name')).toHaveValue('Stub Rice Noodles')
    await expect(page.getByLabel('Carbs (g)')).toHaveValue('80')
    // Still on the dashboard the whole time.
    await expect(page).toHaveURL(/\/$/)
  })

  test('shows a food as one row: name, serving, macros and calories', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')

    const row = page.getByRole('button', { name: /Greek yogurt/ })
    await expect(row).toBeVisible()
    // 7.2×4 + 20.6×4 + 10×9 = 201
    await expect(row).toContainText('201 kcal')
    await expect(row).toContainText('200 g')
    await expect(row).toContainText('7.2g')
    await expect(row).toContainText('20.6g')
    await expect(row).toContainText('10g')
  })

  test('tapping a custom food edits it in place', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Greek yogurt/ }).click()

    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Edit Custom Food' })).toBeVisible()
    await expect(page.getByLabel('Food name')).toHaveValue('Greek yogurt, plain')
    await expect(page).toHaveURL(/\/foods$/)
  })

  test('tapping an imported food opens a new custom food prefilled from it', async ({
    page,
    store,
  }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Chicken breast/ }).click()

    // Imported foods are copies of someone else's record, so they are never
    // edited in place — "edit" means starting a custom food from their values.
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Create Custom Food' })).toBeVisible()
    await expect(page.getByLabel('Food name')).toHaveValue('Chicken breast, grilled')
    await expect(page.getByLabel('Serving amount')).toHaveValue('150')
  })

  test('offers share, edit and delete on a held row', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    // Right-click reaches the same menu as a long press, and is what a desktop
    // browser can actually drive.
    await page.getByRole('button', { name: /Greek yogurt/ }).click({ button: 'right' })

    const menu = page.getByRole('menu', { name: 'Food options' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Share to community' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  })

  test('does not offer to share a food that is not yours to share', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Chicken breast/ }).click({ button: 'right' })

    const menu = page.getByRole('menu', { name: 'Food options' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Share to community' })).toHaveCount(0)
    await expect(menu.getByRole('menuitem', { name: 'Edit & save as custom' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  })

  test('shares a custom food from the menu', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Greek yogurt/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Share to community' }).click()

    await expect
      .poll(() => store.foods.find((f) => f.id === 'f-1')?.is_public)
      .toBe(true)
    // The menu now offers the other direction.
    await page.getByRole('button', { name: /Greek yogurt/ }).click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Unshare' })).toBeVisible()
  })

  test('deletes a food after confirming', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Greek yogurt/ }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete' }).click()

    await expect(page.getByRole('heading', { name: 'Delete food?' })).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByRole('button', { name: /Greek yogurt/ })).toHaveCount(0)
    await expect.poll(() => store.foods.some((f) => f.id === 'f-1')).toBe(false)
  })

  test('escape closes the menu without running anything', async ({ page, store }) => {
    seed(store)
    await seedSession(page)
    await page.goto('/foods')
    await page.getByRole('button', { name: /Greek yogurt/ }).click({ button: 'right' })
    await expect(page.getByRole('menu')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(page).toHaveURL(/\/foods$/)
  })
})

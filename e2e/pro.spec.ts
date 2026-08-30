import { test, expect, seedSession, seedPro, USER_ID } from './fixtures/supabase'

/**
 * The Pro surfaces on the Profile page: the subscription card, hydration
 * reminders, and the data export.
 *
 * Purchasing itself is not exercised here and cannot be — there is no store in a
 * browser, which is exactly what `purchasesAvailable()` reports and what the
 * paywall says. What *is* exercised is everything that decides who gets what:
 * the entitlement read, the three gates, and the settings each gated feature
 * writes.
 */

function todayISO(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

test.describe('the subscription card', () => {
  test('tells a free user they are on the free plan and offers the paywall', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByText('You’re on the free plan.')).toBeVisible()
    await page.getByRole('button', { name: 'See Pro' }).first().click()
    // By level: the card's own heading carries the same words as the paywall's.
    await expect(page.getByRole('heading', { name: 'Etto Pro', level: 2 })).toBeVisible()
    await expect(page.getByText('€24.99/year')).toBeVisible()
  })

  test('names the renewal date for a subscriber', async ({ page, store }) => {
    seedPro(store, { expires_at: '2027-03-04T00:00:00.000Z' })
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByText('Pro until March 4, 2027')).toBeVisible()
  })

  test('reads a null expiry as the lifetime unlock, not as long expired', async ({ page, store }) => {
    seedPro(store, { expires_at: null, product_id: 'etto_pro_lifetime' })
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByText('Pro — lifetime')).toBeVisible()
  })

  test('warns loudly about a billing problem without revoking access', async ({ page, store }) => {
    // The store keeps the entitlement alive through its grace period, so the app
    // must not lock the user out — it must tell them to fix the card.
    seedPro(store, { billing_issue: true })
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByText(/problem with your payment method/)).toBeVisible()
    await expect(page.getByText('Export your data')).toBeVisible()
  })

  test('offers restore to everyone, subscriber or not', async ({ page }) => {
    // The person who needs restore most has already paid — a reinstall, a new
    // phone — and has no reason to open a paywall to find it.
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: 'Restore purchases' })).toBeVisible()
  })
})

test.describe('the paywall on the web', () => {
  test('opens by itself on ?checkout=pro', async ({ page }) => {
    // Where the native apps' external-purchase link lands, in the regions the
    // stores permit one. It has to arrive at a checkout, not a dashboard.
    await seedSession(page)
    await page.goto('/?checkout=pro')

    await expect(page.getByRole('heading', { name: 'Etto Pro', level: 2 })).toBeVisible()
  })

  test('strips the parameter so a refresh does not reopen it', async ({ page }) => {
    await seedSession(page)
    await page.goto('/?checkout=pro')
    await expect(page.getByRole('heading', { name: 'Etto Pro', level: 2 })).toBeVisible()

    await expect.poll(() => new URL(page.url()).search).toBe('')

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Etto Pro', level: 2 })).toHaveCount(0)
  })

  test('says purchases need the mobile apps while Web Billing is unconfigured', async ({
    page,
  }) => {
    // .env.test sets no VITE_REVENUECAT_WEB_KEY, which is the honest state for a
    // hermetic build — and the message must name the browser, not claim the
    // build is broken.
    await seedSession(page)
    await page.goto('/?checkout=pro')

    await expect(page.getByText(/Purchases aren’t available in this browser yet/)).toBeVisible()
    // The prices still render: a paywall that shows nothing sells nothing, and
    // these are the real list prices.
    await expect(page.getByText('€24.99/year')).toBeVisible()
  })

  test('never offers the external-purchase link in a browser', async ({ page }) => {
    // On the web the paywall *is* the web checkout; a link to it would be a loop.
    await seedSession(page)
    await page.goto('/?checkout=pro')

    await expect(page.getByText('Subscribe on the web instead')).toHaveCount(0)
  })
})

test.describe('hydration reminders', () => {
  test('are locked for a free user', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByRole('switch', { name: 'Hydration reminders' })).toHaveCount(0)
    await expect(page.getByText(/A nudge every couple of hours/)).toBeVisible()
  })

  test('turning them on persists the choice and reveals the schedule', async ({ page, store }) => {
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    await page.getByRole('switch', { name: 'Hydration reminders' }).click()

    await expect.poll(() => store.profiles[0].water_reminders_enabled).toBe(true)
    // The window and interval only matter once something is being scheduled.
    await expect(page.getByLabel('From')).toBeVisible()
    await expect(page.getByLabel('Until')).toBeVisible()
    await expect(page.getByText('6 reminders a day')).toBeVisible()
  })

  test('the reminder count follows the interval', async ({ page, store }) => {
    // The honest summary of the three controls: "every 30 minutes" is 24
    // notifications, and the user should see that before agreeing to it.
    store.profiles[0].water_reminders_enabled = true
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    await page.getByRole('radio', { name: '1h' }).click()

    await expect.poll(() => store.profiles[0].water_reminder_interval_minutes).toBe(60)
    await expect(page.getByText('12 reminders a day')).toBeVisible()
  })

  test('keeps the window from inverting when the start passes the end', async ({ page, store }) => {
    // 0015 rejects start >= end outright, so the UI must never send one.
    store.profiles[0].water_reminders_enabled = true
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    await page.getByLabel('From').selectOption('22')

    await expect.poll(() => store.profiles[0].water_reminder_start_hour).toBe(22)
    await expect.poll(() => store.profiles[0].water_reminder_end_hour).toBe(23)
  })

  test('say plainly that a browser tab cannot deliver them', async ({ page, store }) => {
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByText(/Reminders arrive in the iOS and Android apps/)).toBeVisible()
  })
})

test.describe('data export', () => {
  /** One logged food, one weigh-in and one drink — enough to fill every table. */
  function seedSomething(store: {
    foods: Record<string, unknown>[]
    food_logs: Record<string, unknown>[]
    weight_logs: Record<string, unknown>[]
    water_logs: Record<string, unknown>[]
  }) {
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
      id: 'fl-1',
      user_id: USER_ID,
      food_id: 'food-oats',
      log_date: todayISO(),
      meal: 'breakfast',
      servings: 1.5,
      created_at: '2024-01-01T00:00:00.000Z',
    })
    store.weight_logs.push({
      id: 'w-1',
      user_id: USER_ID,
      log_date: todayISO(),
      weight_kg: 80,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })
    store.water_logs.push({
      id: 'wa-1',
      user_id: USER_ID,
      log_date: todayISO(),
      amount_ml: 500,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  }

  test('is locked for a free user', async ({ page }) => {
    await seedSession(page)
    await page.goto('/profile')

    await expect(page.getByRole('button', { name: /Food log \(CSV\)/ })).toHaveCount(0)
    await expect(page.getByText(/as a spreadsheet, or as the complete record/)).toBeVisible()
  })

  test('downloads the food log as a CSV', async ({ page, store }) => {
    seedSomething(store)
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Food log \(CSV\)/ }).click()
    const file = await download

    expect(file.suggestedFilename()).toMatch(/^etto-food-log-\d{4}-\d{2}-\d{2}\.csv$/)
    await expect(page.getByText('Downloaded.')).toBeVisible()
  })

  test('the CSV holds a header and the macros scaled to what was logged', async ({
    page,
    store,
  }) => {
    seedSomething(store)
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Food log \(CSV\)/ }).click()
    const stream = await (await download).createReadStream()
    const csv = (await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      stream.on('data', (c: Buffer) => chunks.push(c))
      stream.on('end', () => resolve(Buffer.concat(chunks)))
      stream.on('error', reject)
    })).toString('utf8')

    const [header, row] = csv.split('\r\n')
    expect(header).toBe(
      'date,meal,food,brand,source,servings,amount,unit,kcal,carbs_g,protein_g,fats_g',
    )
    // 1.5 servings of a 100 g basis food: 150 g, and 533 kcal from 90/19.5/10.5.
    expect(row).toContain('Rolled oats,Quaker,custom,1.5,150,g,533,90,19.5,10.5')
  })

  test('downloads everything as JSON, billing excepted', async ({ page, store }) => {
    seedSomething(store)
    seedPro(store)
    await seedSession(page)
    await page.goto('/profile')

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Everything \(JSON\)/ }).click()
    const file = await download
    const stream = await file.createReadStream()
    const json = JSON.parse(
      (await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', (c: Buffer) => chunks.push(c))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })).toString('utf8'),
    )

    expect(file.suggestedFilename()).toMatch(/^etto-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(json.app).toBe('Etto')
    expect(json.foodLogs).toHaveLength(1)
    expect(json.weightLogs).toHaveLength(1)
    expect(json.waterLogs).toHaveLength(1)
    // Store-side transaction state is not the user's own logging, and an export
    // is not the place to hand it back to them.
    expect(json.subscriptions).toBeUndefined()
  })
})

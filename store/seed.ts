import { USER_ID, type Store, seedPro } from '../e2e/fixtures/supabase'

/**
 * A plausible account, for the store screenshots.
 *
 * Screenshots of an empty app sell nothing — every store listing that converts
 * shows the product mid-use. But invented numbers have to stay *consistent*:
 * the rings, the calorie totals and the weight trend are all computed by the
 * real app from these rows, so a lazy dataset produces a screenshot with a
 * ring at 140% or a trend line that zig-zags. What follows is a normal day
 * against normal targets, and eight weeks of a gentle, noisy cut.
 *
 * Deliberately not a fixture shared with the e2e specs: those assert on exact
 * values and want the smallest dataset that proves a behaviour, which is the
 * opposite of what a screenshot needs.
 */

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const TODAY = isoDaysAgo(0)

/** Per-serving macros, all on the 100 g basis the app imports foods with. */
const FOODS = [
  { id: 'f-oats', name: 'Rolled oats', brand: 'Quaker', c: 60, p: 13, f: 7 },
  { id: 'f-yog', name: 'Greek yogurt 0%', brand: 'Fage', c: 4, p: 10, f: 0 },
  { id: 'f-ban', name: 'Banana', brand: null, c: 23, p: 1, f: 0 },
  { id: 'f-chick', name: 'Chicken breast', brand: null, c: 0, p: 31, f: 4 },
  { id: 'f-rice', name: 'Basmati rice, cooked', brand: null, c: 28, p: 3, f: 0 },
  { id: 'f-broc', name: 'Broccoli', brand: null, c: 7, p: 3, f: 0 },
  { id: 'f-alm', name: 'Almonds', brand: null, c: 22, p: 21, f: 50 },
  { id: 'f-salm', name: 'Salmon fillet', brand: null, c: 0, p: 20, f: 13 },
  { id: 'f-pot', name: 'Sweet potato', brand: null, c: 20, p: 2, f: 0 },
  { id: 'f-oil', name: 'Olive oil', brand: null, c: 0, p: 0, f: 100 },
]

/** meal, food, servings — a day that lands just under the targets below. */
const TODAYS_LOG: [string, string, number][] = [
  ['breakfast', 'f-oats', 0.8],
  ['breakfast', 'f-yog', 1.5],
  ['breakfast', 'f-ban', 1.2],
  ['lunch', 'f-chick', 1.8],
  ['lunch', 'f-rice', 2.0],
  ['lunch', 'f-broc', 1.5],
  ['snack', 'f-alm', 0.3],
  ['dinner', 'f-salm', 1.6],
  ['dinner', 'f-pot', 2.2],
  ['dinner', 'f-oil', 0.1],
]

/**
 * A downward trend with real day-to-day noise in it.
 *
 * Flat, clean numbers would hide the thing the weight card exists to show —
 * that the smoothed line and the raw dots disagree, and that a single overnight
 * jump is not a gain. The wobble is deterministic rather than random so the
 * screenshot is reproducible.
 */
function weightSeries(): { day: number; kg: number }[] {
  const out: { day: number; kg: number }[] = []
  for (let day = 56; day >= 0; day--) {
    const trend = 84.6 - (56 - day) * 0.055
    const wobble = Math.sin(day * 1.7) * 0.35 + Math.sin(day * 0.6) * 0.2
    // Not every day has a weigh-in; a perfect streak looks synthetic.
    if (day % 7 === 3) continue
    out.push({ day, kg: Math.round((trend + wobble) * 10) / 10 })
  }
  return out
}

export function seedShowcase(store: Store, opts: { pro?: boolean } = {}) {
  // Targets for every weekday, so the Targets screen is full rather than zeroed.
  for (let dow = 0; dow < 7; dow++) {
    const weekend = dow === 0 || dow === 6
    store.macro_targets.push({
      id: `mt-${dow}`,
      user_id: USER_ID,
      day_of_week: dow,
      carbs_g: weekend ? 210 : 240,
      protein_g: 165,
      fats_g: weekend ? 70 : 65,
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    })
  }

  for (const food of FOODS) {
    store.foods.push({
      id: food.id,
      user_id: USER_ID,
      name: food.name,
      brand: food.brand,
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: food.c,
      protein_g: food.p,
      fats_g: food.f,
      source: 'custom',
      off_id: null,
      is_custom: true,
      is_public: false,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  }

  TODAYS_LOG.forEach(([meal, foodId, servings], i) => {
    store.food_logs.push({
      id: `fl-${i}`,
      user_id: USER_ID,
      food_id: foodId,
      log_date: TODAY,
      meal,
      servings,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  })

  for (const { day, kg } of weightSeries()) {
    store.weight_logs.push({
      id: `wl-${day}`,
      user_id: USER_ID,
      log_date: isoDaysAgo(day),
      weight_kg: kg,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  }

  // Part-way to the goal: a full ring and an empty one both hide the control.
  for (let i = 0; i < 5; i++) {
    store.water_logs.push({
      id: `wa-${i}`,
      user_id: USER_ID,
      log_date: TODAY,
      amount_ml: i < 3 ? 250 : 500,
      created_at: '2024-01-01T00:00:00.000Z',
    })
  }

  if (opts.pro) seedPro(store)
}

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFood } from '@/test/utils'
import type { ExternalFood } from './foodSources'

// Hoisted mock state so the vi.mock factory (hoisted above imports) can see it.
const h = vi.hoisted(() => {
  const state: { builder: unknown } = { builder: null }
  return {
    state,
    auth: { getUser: vi.fn() },
    from: vi.fn(() => state.builder),
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: h.auth, from: h.from },
}))

import {
  upsertExternalFood,
  copyDayFoods,
  copyMealFoods,
  setFoodPublic,
} from './foods'

/**
 * A chainable Supabase query-builder mock. Chainable methods return the builder;
 * terminal reads (`maybeSingle`, `single`) and direct `await` (thenable) consume
 * the queued results in order.
 */
function builderYielding(...results: unknown[]) {
  let i = 0
  const nextResult = () => {
    const r = results[Math.min(i, results.length - 1)]
    i++
    return Promise.resolve(r)
  }
  const b = {
    select: vi.fn(() => b),
    insert: vi.fn(() => b),
    update: vi.fn(() => b),
    delete: vi.fn(() => b),
    eq: vi.fn(() => b),
    limit: vi.fn(() => b),
    maybeSingle: vi.fn(() => nextResult()),
    single: vi.fn(() => nextResult()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      nextResult().then(resolve, reject),
  }
  return b
}

const externalFood: ExternalFood = {
  source: 'usda',
  externalId: 'fdc-123',
  name: 'Banana',
  brand: null,
  serving_amount: 100,
  serving_unit: 'g',
  carbs_g: 23,
  protein_g: 1,
  fats_g: 0.3,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
})

describe('upsertExternalFood', () => {
  it('reuses an existing imported row without inserting', async () => {
    const existing = makeFood({ source: 'usda', off_id: 'fdc-123', is_custom: false })
    h.state.builder = builderYielding({ data: existing, error: null })

    const result = await upsertExternalFood(externalFood)

    expect(result).toBe(existing)
    expect(h.state.builder.insert).not.toHaveBeenCalled()
  })

  it('inserts a new row when none exists, de-duplicating on (source, off_id)', async () => {
    const inserted = makeFood({ source: 'usda', off_id: 'fdc-123', is_custom: false })
    // 1st terminal: findExisting → none; 2nd terminal: insert → new row.
    h.state.builder = builderYielding(
      { data: null, error: null },
      { data: inserted, error: null },
    )

    const result = await upsertExternalFood(externalFood)

    expect(result).toBe(inserted)
    expect(h.state.builder.insert).toHaveBeenCalledTimes(1)
    const insertArg = h.state.builder.insert.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg).toMatchObject({
      source: 'usda',
      off_id: 'fdc-123',
      is_custom: false,
      user_id: 'user-1',
    })
  })

  it('throws when the lookup errors', async () => {
    h.state.builder = builderYielding({ data: null, error: { message: 'boom' } })
    await expect(upsertExternalFood(externalFood)).rejects.toThrow('boom')
  })
})

describe('copyDayFoods', () => {
  it('copies each log to the target date and returns the count', async () => {
    const rows = [
      { food_id: 'f1', meal: 'breakfast', servings: 1 },
      { food_id: 'f2', meal: 'lunch', servings: 2 },
    ]
    // 1st terminal: select source rows; 2nd terminal: insert result.
    h.state.builder = builderYielding({ data: rows, error: null }, { error: null })

    const count = await copyDayFoods('2024-01-01', '2024-01-02')

    expect(count).toBe(2)
    const inserted = h.state.builder.insert.mock.calls[0][0] as Record<string, unknown>[]
    expect(inserted).toHaveLength(2)
    expect(inserted[0]).toMatchObject({
      food_id: 'f1',
      meal: 'breakfast',
      servings: 1,
      log_date: '2024-01-02',
      user_id: 'user-1',
    })
  })

  it('returns 0 and inserts nothing when the source day is empty', async () => {
    h.state.builder = builderYielding({ data: [], error: null })
    const count = await copyDayFoods('2024-01-01', '2024-01-02')
    expect(count).toBe(0)
    expect(h.state.builder.insert).not.toHaveBeenCalled()
  })
})

describe('copyMealFoods', () => {
  it('copies a meal into a (possibly different) target meal slot', async () => {
    const rows = [{ food_id: 'f1', servings: 1.5 }]
    h.state.builder = builderYielding({ data: rows, error: null }, { error: null })

    const count = await copyMealFoods('2024-01-01', 'breakfast', '2024-01-02', 'snack')

    expect(count).toBe(1)
    const inserted = h.state.builder.insert.mock.calls[0][0] as Record<string, unknown>[]
    expect(inserted[0]).toMatchObject({
      food_id: 'f1',
      servings: 1.5,
      meal: 'snack',
      log_date: '2024-01-02',
    })
  })
})

describe('setFoodPublic', () => {
  it('updates is_public for the given food', async () => {
    h.state.builder = builderYielding({ error: null })
    await setFoodPublic('food-1', true)
    expect(h.state.builder.update).toHaveBeenCalledWith({ is_public: true })
    expect(h.state.builder.eq).toHaveBeenCalledWith('id', 'food-1')
  })

  it('throws when the update errors', async () => {
    h.state.builder = builderYielding({ error: { message: 'denied' } })
    await expect(setFoodPublic('food-1', false)).rejects.toThrow('denied')
  })
})

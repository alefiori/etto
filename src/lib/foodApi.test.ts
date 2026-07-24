import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ExternalFood } from './foodSources'

const h = vi.hoisted(() => ({ fetchWithRetry: vi.fn() }))
vi.mock('./retry', () => ({ fetchWithRetry: h.fetchWithRetry }))

import { searchExternalFoods, lookupBarcode } from './foodApi'

const food: ExternalFood = {
  source: 'openfoodfacts',
  externalId: '737628064502',
  name: 'Thai Kitchen Rice Noodles',
  brand: 'Thai Kitchen',
  serving_amount: 100,
  serving_unit: 'g',
  carbs_g: 82,
  protein_g: 7,
  fats_g: 1,
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response
}

beforeEach(() => vi.clearAllMocks())

describe('searchExternalFoods', () => {
  it('returns [] for an empty/whitespace query without calling the function', async () => {
    expect(await searchExternalFoods('   ')).toEqual([])
    expect(h.fetchWithRetry).not.toHaveBeenCalled()
  })

  it('calls the edge function with q + lang and returns the parsed foods', async () => {
    h.fetchWithRetry.mockResolvedValue(jsonResponse([food]))

    const result = await searchExternalFoods('noodles', undefined, 'it')

    expect(result).toEqual([food])
    const calledUrl = h.fetchWithRetry.mock.calls[0][0] as string
    expect(calledUrl).toContain('/functions/v1/food-search?')
    expect(calledUrl).toContain('q=noodles')
    expect(calledUrl).toContain('lang=it')
  })

  it('throws when the function responds with a non-ok status', async () => {
    h.fetchWithRetry.mockResolvedValue(jsonResponse([], false, 500))
    await expect(searchExternalFoods('noodles')).rejects.toThrow(/500/)
  })
})

describe('lookupBarcode', () => {
  it('returns null for an empty barcode', async () => {
    expect(await lookupBarcode('')).toBeNull()
    expect(h.fetchWithRetry).not.toHaveBeenCalled()
  })

  it('returns the first matching food', async () => {
    h.fetchWithRetry.mockResolvedValue(jsonResponse([food]))
    const result = await lookupBarcode('737628064502')
    expect(result).toEqual(food)
    const calledUrl = h.fetchWithRetry.mock.calls[0][0] as string
    expect(calledUrl).toContain('barcode=737628064502')
  })

  it('returns null when the barcode has no match', async () => {
    h.fetchWithRetry.mockResolvedValue(jsonResponse([]))
    expect(await lookupBarcode('000000000000')).toBeNull()
  })
})

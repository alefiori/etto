import { describe, it, expect } from 'vitest'
import {
  dedupe,
  normalizeFdc,
  normalizeOff,
  normalizeReference,
  type ExternalFood,
  type OffProduct,
} from './normalize.ts'

// A fully-specified OFF product; individual tests override just what they probe.
function offProduct(overrides: Partial<OffProduct> = {}): OffProduct {
  return {
    code: '3017620422003',
    product_name: 'Nutella',
    brands: ['Ferrero'],
    nutriments: {
      carbohydrates_100g: 57.5,
      proteins_100g: 6.3,
      fat_100g: 30.9,
    },
    ...overrides,
  }
}

describe('normalizeOff', () => {
  it('maps a complete product to a 100 g basis', () => {
    expect(normalizeOff(offProduct(), 'en')).toEqual<ExternalFood>({
      source: 'openfoodfacts',
      externalId: '3017620422003',
      name: 'Nutella',
      brand: 'Ferrero',
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 57.5,
      protein_g: 6.3,
      fats_g: 30.9,
    })
  })

  // Option D: newer / community-entered OFF products often have only some
  // macros filled in. They used to be dropped entirely (any null macro -> null),
  // which is what made them "missing" from search. Now they're kept, with the
  // blank macros treated as 0.
  it('keeps a product with only some macros, filling the blanks with 0', () => {
    const food = normalizeOff(
      offProduct({ nutriments: { carbohydrates_100g: 12 } }),
      'en',
    )
    expect(food).not.toBeNull()
    expect(food).toMatchObject({ carbs_g: 12, protein_g: 0, fats_g: 0 })
  })

  it('still drops a product with no macro data at all', () => {
    expect(normalizeOff(offProduct({ nutriments: {} }), 'en')).toBeNull()
    expect(normalizeOff(offProduct({ nutriments: undefined }), 'en')).toBeNull()
  })

  it('treats a zero macro as present (not missing)', () => {
    const food = normalizeOff(
      offProduct({ nutriments: { carbohydrates_100g: 0, proteins_100g: 0, fat_100g: 0 } }),
      'en',
    )
    expect(food).toMatchObject({ carbs_g: 0, protein_g: 0, fats_g: 0 })
  })

  it('parses string-valued nutriments', () => {
    const food = normalizeOff(
      offProduct({ nutriments: { carbohydrates_100g: '57.5', proteins_100g: '6.3', fat_100g: '30.9' } }),
      'en',
    )
    expect(food).toMatchObject({ carbs_g: 57.5, protein_g: 6.3, fats_g: 30.9 })
  })

  it('drops a product missing a code or a name', () => {
    expect(normalizeOff(offProduct({ code: undefined }), 'en')).toBeNull()
    expect(normalizeOff(offProduct({ product_name: '' }), 'en')).toBeNull()
  })

  it('prefers the localized name when present, falling back to product_name', () => {
    const p = offProduct({ product_name: 'Nutella', product_name_it: 'Nutella alla nocciola' })
    expect(normalizeOff(p, 'it')?.name).toBe('Nutella alla nocciola')
    expect(normalizeOff(p, 'fr')?.name).toBe('Nutella') // no fr localization -> fallback
  })

  it('reads the first brand from an array (Search-a-licious) or a CSV string (v2)', () => {
    expect(normalizeOff(offProduct({ brands: ['Ferrero', 'Nutella'] }), 'en')?.brand).toBe('Ferrero')
    expect(normalizeOff(offProduct({ brands: 'Nutella, Ferrero' }), 'en')?.brand).toBe('Nutella')
    expect(normalizeOff(offProduct({ brands: undefined }), 'en')?.brand).toBeNull()
  })
})

describe('normalizeFdc', () => {
  it('maps nutrients by FDC number and title-cases ALL-CAPS names', () => {
    const food = normalizeFdc({
      fdcId: 123,
      description: 'CHOCOLATE HAZELNUT SPREAD',
      brandOwner: 'Ferrero',
      foodNutrients: [
        { nutrientNumber: '205', value: 57.5 },
        { nutrientNumber: '203', value: 6.3 },
        { nutrientNumber: '204', value: 30.9 },
      ],
    })
    expect(food).toMatchObject({
      source: 'usda',
      externalId: '123',
      name: 'Chocolate Hazelnut Spread',
      brand: 'Ferrero',
      carbs_g: 57.5,
      protein_g: 6.3,
      fats_g: 30.9,
    })
  })

  it('drops a USDA food missing any of the three macros', () => {
    const food = normalizeFdc({
      fdcId: 123,
      description: 'Mystery food',
      foodNutrients: [{ nutrientNumber: '205', value: 10 }],
    })
    expect(food).toBeNull()
  })
})

describe('normalizeReference', () => {
  // Rows arrive from our own search_reference_foods() RPC, already validated by
  // the import pipeline, so this mapper is strict where normalizeOff is lenient.
  const row = {
    source: 'ciqual',
    external_id: '1000',
    name: 'Poulet, blanc, cru',
    serving_amount: 100,
    serving_unit: 'g',
    carbs_g: 0,
    protein_g: 23.1,
    fats_g: 1.2,
  }

  it('maps a row onto ExternalFood with no brand', () => {
    expect(normalizeReference(row)).toEqual({
      source: 'ciqual',
      externalId: '1000',
      name: 'Poulet, blanc, cru',
      // A composition-table entry is a generic food, never a branded product.
      brand: null,
      serving_amount: 100,
      serving_unit: 'g',
      carbs_g: 0,
      protein_g: 23.1,
      fats_g: 1.2,
    })
  })

  it('carries CoFID millilitre servings through instead of restating them as grams', () => {
    const beer = normalizeReference({
      ...row,
      source: 'cofid',
      external_id: '17-200',
      name: 'Beer, bitter, draught',
      serving_unit: 'ml',
    })
    expect(beer).toMatchObject({ source: 'cofid', serving_unit: 'ml', serving_amount: 100 })
  })

  it('drops a row missing any macro, rather than filling it with 0 as the OFF adapter does', () => {
    // The importer guarantees all three, so absence means the RPC contract
    // changed — publishing 0 would invent a nutrition value.
    expect(normalizeReference({ ...row, protein_g: undefined })).toBeNull()
  })

  it('drops rows with an unrecognised source, a missing id or a missing name', () => {
    expect(normalizeReference({ ...row, source: 'openfoodfacts' })).toBeNull()
    expect(normalizeReference({ ...row, source: 'evil' })).toBeNull()
    expect(normalizeReference({ ...row, external_id: '  ' })).toBeNull()
    expect(normalizeReference({ ...row, name: '' })).toBeNull()
    expect(normalizeReference(undefined)).toBeNull()
  })

  it('falls back to a 100 g basis when the serving is absent or nonsensical', () => {
    expect(normalizeReference({ ...row, serving_amount: 0 })).toMatchObject({ serving_amount: 100 })
    expect(normalizeReference({ ...row, serving_unit: 'oz' })).toMatchObject({ serving_unit: 'g' })
  })
})

describe('dedupe', () => {
  it('removes repeats by source+externalId, preserving first-seen order', () => {
    const a: ExternalFood = {
      source: 'openfoodfacts', externalId: '1', name: 'A', brand: null,
      serving_amount: 100, serving_unit: 'g', carbs_g: 1, protein_g: 1, fats_g: 1,
    }
    const aDup = { ...a, name: 'A (dup)' }
    const b = { ...a, externalId: '2', name: 'B' }
    const sameIdOtherSource = { ...a, source: 'usda' as const, name: 'A-usda' }

    const out = dedupe([a, b, aDup, sameIdOtherSource])
    expect(out.map((f) => f.name)).toEqual(['A', 'B', 'A-usda'])
  })
})

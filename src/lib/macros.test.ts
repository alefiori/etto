import { describe, it, expect } from 'vitest'
import {
  calories,
  round,
  scaleMacros,
  caloriesForServings,
  sumMacros,
  remaining,
  per100gToServing,
  ringOffset,
  RING,
  KCAL_PER_GRAM,
} from './macros'

describe('calories', () => {
  it('applies the Atwater 4/4/9 model', () => {
    expect(calories({ carbs_g: 10, protein_g: 10, fats_g: 10 })).toBe(170)
    expect(KCAL_PER_GRAM).toEqual({ carbs: 4, protein: 4, fats: 9 })
  })

  it('treats missing/NaN macros as zero', () => {
    expect(calories({ carbs_g: NaN, protein_g: 0, fats_g: 0 })).toBe(0)
    expect(calories({ carbs_g: 0, protein_g: 0, fats_g: 0 })).toBe(0)
  })
})

describe('round', () => {
  it('rounds to one decimal by default without trailing zeros', () => {
    expect(round(1.24)).toBe(1.2)
    expect(round(1.25)).toBe(1.3)
    expect(round(2)).toBe(2)
  })

  it('honours a custom precision', () => {
    expect(round(1.2345, 2)).toBe(1.23)
    expect(round(1.005, 2)).toBe(1.01)
  })
})

describe('scaleMacros', () => {
  it('scales per-serving macros by servings', () => {
    expect(scaleMacros({ carbs_g: 10, protein_g: 5, fats_g: 2 }, 2)).toEqual({
      carbs_g: 20,
      protein_g: 10,
      fats_g: 4,
    })
  })

  it('treats falsy servings as zero', () => {
    expect(scaleMacros({ carbs_g: 10, protein_g: 5, fats_g: 2 }, 0)).toEqual({
      carbs_g: 0,
      protein_g: 0,
      fats_g: 0,
    })
  })
})

describe('caloriesForServings', () => {
  it('multiplies per-serving calories by servings', () => {
    // 10c+5p+2f per serving = 40+20+18 = 78 kcal; ×1.5 = 117
    expect(caloriesForServings({ carbs_g: 10, protein_g: 5, fats_g: 2 }, 1.5)).toBe(117)
  })
})

describe('sumMacros', () => {
  it('sums a list of macro items', () => {
    expect(
      sumMacros([
        { carbs_g: 10, protein_g: 5, fats_g: 2 },
        { carbs_g: 3, protein_g: 1, fats_g: 4 },
      ]),
    ).toEqual({ carbs_g: 13, protein_g: 6, fats_g: 6 })
  })

  it('returns zeros for an empty list', () => {
    expect(sumMacros([])).toEqual({ carbs_g: 0, protein_g: 0, fats_g: 0 })
  })
})

describe('remaining', () => {
  it('returns the gap toward a target', () => {
    expect(remaining(100, 40)).toBe(60)
  })

  it('never goes negative', () => {
    expect(remaining(100, 140)).toBe(0)
  })
})

describe('per100gToServing', () => {
  it('scales per-100g values to a serving size in grams', () => {
    expect(per100gToServing({ carbs_g: 20, protein_g: 10, fats_g: 5 }, 50)).toEqual({
      carbs_g: 10,
      protein_g: 5,
      fats_g: 2.5,
    })
  })

  it('handles a zero serving size', () => {
    expect(per100gToServing({ carbs_g: 20, protein_g: 10, fats_g: 5 }, 0)).toEqual({
      carbs_g: 0,
      protein_g: 0,
      fats_g: 0,
    })
  })
})

describe('ringOffset', () => {
  it('returns a full offset (empty ring) for a zero/negative target', () => {
    expect(ringOffset(10, 0)).toBe(RING.circumference)
    expect(ringOffset(10, -5)).toBe(RING.circumference)
  })

  it('is zero when consumed meets or exceeds the target (full ring)', () => {
    expect(ringOffset(100, 100)).toBe(0)
    expect(ringOffset(150, 100)).toBe(0)
  })

  it('is half the circumference at 50% progress', () => {
    expect(ringOffset(50, 100)).toBe(round(RING.circumference / 2, 2))
  })
})

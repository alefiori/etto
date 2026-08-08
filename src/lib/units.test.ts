import { describe, it, expect } from 'vitest'
import {
  unitFamily,
  convertUnit,
  compatibleUnits,
  servingsFor,
  weightUnit,
  weightForDisplay,
  weightToKg,
  cmToFeetInches,
  feetInchesToCm,
} from './units'

describe('unitFamily', () => {
  it('classifies mass and volume units', () => {
    expect(unitFamily('g')).toBe('mass')
    expect(unitFamily('kg')).toBe('mass')
    expect(unitFamily('ml')).toBe('volume')
    expect(unitFamily('cup')).toBe('volume')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(unitFamily(' G ')).toBe('mass')
  })

  it('treats unknown units as count', () => {
    expect(unitFamily('serving')).toBe('count')
    expect(unitFamily('slice')).toBe('count')
  })
})

describe('convertUnit', () => {
  it('converts within the mass family', () => {
    expect(convertUnit(1, 'kg', 'g')).toBe(1000)
    expect(convertUnit(1000, 'g', 'kg')).toBe(1)
    expect(convertUnit(1, 'lb', 'g')).toBeCloseTo(453.592, 3)
  })

  it('converts within the volume family', () => {
    expect(convertUnit(1, 'l', 'ml')).toBe(1000)
    expect(convertUnit(1, 'tbsp', 'ml')).toBe(15)
  })

  it('returns null across incompatible families', () => {
    expect(convertUnit(1, 'g', 'ml')).toBeNull()
    expect(convertUnit(1, 'g', 'serving')).toBeNull()
  })

  it('passes identical (incl. count) units through unchanged', () => {
    expect(convertUnit(3, 'serving', 'serving')).toBe(3)
    expect(convertUnit(3, 'SERVING', 'serving')).toBe(3)
  })
})

describe('compatibleUnits', () => {
  it('exposes the whole family for a convertible unit', () => {
    const units = compatibleUnits('g')
    expect(units).toContain('g')
    expect(units).toContain('kg')
    expect(units).toContain('lb')
    expect(units).not.toContain('ml')
  })

  it('offers only the unit itself for a count unit', () => {
    expect(compatibleUnits('serving')).toEqual(['serving'])
  })
})

describe('servingsFor', () => {
  it('converts an amount into the servings multiplier', () => {
    // 150 g of a food whose serving is 100 g → 1.5 servings
    expect(servingsFor(150, 'g', 100, 'g')).toBe(1.5)
    // 0.15 kg → 150 g → 1.5 servings
    expect(servingsFor(0.15, 'kg', 100, 'g')).toBe(1.5)
  })

  it('returns 0 for a non-positive serving amount', () => {
    expect(servingsFor(150, 'g', 0, 'g')).toBe(0)
  })

  it('falls back to a raw ratio when units are incompatible', () => {
    // ml can't convert to g, so it uses amount / serving_amount directly
    expect(servingsFor(200, 'ml', 100, 'g')).toBe(2)
  })
})

describe('body weight units', () => {
  it('labels the unit for each system', () => {
    expect(weightUnit('metric')).toBe('kg')
    expect(weightUnit('imperial')).toBe('lb')
  })

  it('passes kilograms straight through in metric', () => {
    expect(weightForDisplay(80, 'metric')).toBe(80)
    expect(weightToKg(80, 'metric')).toBe(80)
  })

  it('converts to and from pounds in imperial', () => {
    expect(weightForDisplay(100, 'imperial')).toBeCloseTo(220.462, 3)
    expect(weightToKg(220.462, 'imperial')).toBeCloseTo(100, 3)
  })

  it('round-trips a weight through the display units', () => {
    for (const system of ['metric', 'imperial'] as const) {
      expect(weightToKg(weightForDisplay(72.5, system), system)).toBeCloseTo(72.5, 6)
    }
  })
})

describe('height units', () => {
  it('splits centimetres into whole feet plus inches', () => {
    const { feet, inches } = cmToFeetInches(180)
    expect(feet).toBe(5)
    expect(inches).toBeCloseTo(10.866, 3)
  })

  it('keeps inches under twelve', () => {
    for (const cm of [150, 165, 175, 183, 200]) {
      const { inches } = cmToFeetInches(cm)
      expect(inches).toBeGreaterThanOrEqual(0)
      expect(inches).toBeLessThan(12)
    }
  })

  it('round-trips through feet and inches', () => {
    const { feet, inches } = cmToFeetInches(177.8)
    expect(feetInchesToCm(feet, inches)).toBeCloseTo(177.8, 6)
  })

  it('converts a whole-foot height exactly', () => {
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 6)
  })
})

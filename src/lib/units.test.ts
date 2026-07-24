import { describe, it, expect } from 'vitest'
import { unitFamily, convertUnit, compatibleUnits, servingsFor } from './units'

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

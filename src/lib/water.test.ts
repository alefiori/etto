import { describe, it, expect } from 'vitest'
import {
  volumeUnit,
  volumeForDisplay,
  volumeToMl,
  waterGoalMl,
  isGoalDerived,
  totalMl,
  DEFAULT_WATER_GOAL_ML,
  ML_PER_KG_BODYWEIGHT,
} from './water'
import type { WaterLog } from './database.types'

function log(amount_ml: number, id = String(amount_ml)): WaterLog {
  return {
    id,
    user_id: 'u1',
    log_date: '2026-01-01',
    amount_ml,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('volume units', () => {
  it('labels the unit for each system', () => {
    expect(volumeUnit('metric')).toBe('ml')
    expect(volumeUnit('imperial')).toBe('fl oz')
  })

  it('passes millilitres through in metric', () => {
    expect(volumeForDisplay(500, 'metric')).toBe(500)
    expect(volumeToMl(500, 'metric')).toBe(500)
  })

  it('converts to US fluid ounces in imperial', () => {
    expect(volumeForDisplay(500, 'imperial')).toBeCloseTo(16.907, 3)
    expect(volumeToMl(16.907, 'imperial')).toBeCloseTo(500, 2)
  })

  it('round-trips a volume through the display units', () => {
    for (const system of ['metric', 'imperial'] as const) {
      expect(volumeToMl(volumeForDisplay(750, system), system)).toBeCloseTo(750, 6)
    }
  })
})

describe('waterGoalMl', () => {
  it('uses an explicit goal when there is one', () => {
    expect(waterGoalMl(3000, 80)).toBe(3000)
  })

  it('prefers the explicit goal over the derived one', () => {
    expect(waterGoalMl(1500, 100)).toBe(1500)
  })

  it('derives from bodyweight when no goal is set', () => {
    expect(waterGoalMl(null, 80)).toBe(Math.round(80 * ML_PER_KG_BODYWEIGHT))
  })

  it('follows the weight as it changes, rather than freezing', () => {
    expect(waterGoalMl(null, 90)).toBeGreaterThan(waterGoalMl(null, 80))
  })

  it('falls back to a sane default with neither a goal nor a weigh-in', () => {
    expect(waterGoalMl(null, null)).toBe(DEFAULT_WATER_GOAL_ML)
  })

  it('treats a zero or negative stored goal as unset', () => {
    expect(waterGoalMl(0, null)).toBe(DEFAULT_WATER_GOAL_ML)
    expect(waterGoalMl(-100, null)).toBe(DEFAULT_WATER_GOAL_ML)
  })

  it('ignores a zero weight rather than deriving a zero goal', () => {
    expect(waterGoalMl(null, 0)).toBe(DEFAULT_WATER_GOAL_ML)
  })
})

describe('isGoalDerived', () => {
  it('is true with no explicit goal', () => {
    expect(isGoalDerived(null)).toBe(true)
    expect(isGoalDerived(0)).toBe(true)
  })

  it('is false once a goal is chosen', () => {
    expect(isGoalDerived(2500)).toBe(false)
  })
})

describe('totalMl', () => {
  it('is zero for a day with nothing logged', () => {
    expect(totalMl([])).toBe(0)
  })

  it('sums every drink', () => {
    expect(totalMl([log(250), log(500), log(330)])).toBe(1080)
  })

  it('survives a row with a missing amount', () => {
    const broken = { ...log(250), amount_ml: undefined as unknown as number }
    expect(totalMl([broken, log(500)])).toBe(500)
  })
})

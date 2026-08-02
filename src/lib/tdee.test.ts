import { describe, it, expect } from 'vitest'
import {
  ageOn,
  mifflinStJeorBmr,
  formulaTdee,
  goalDailyOffsetKcal,
  computeAdaptiveTarget,
  macroSplit,
  KCAL_PER_KG,
  MAX_STEP_KCAL,
  MIN_TARGET_KCAL,
  MIN_CREDIBLE_DAY_KCAL,
  type BodyProfile,
  type IntakeDay,
} from './tdee'
import { calories } from './macros'
import type { SeriesPoint } from './trend'

const TODAY = '2026-06-01'

function body(overrides: Partial<BodyProfile> = {}): BodyProfile {
  return {
    sex: 'male',
    birthdate: '1990-06-01',
    heightCm: 180,
    activityLevel: 'moderate',
    goalDirection: 'lose',
    goalRateKgPerWeek: 0.5,
    ...overrides,
  }
}

/** Weigh-ins for the last `days` days, newest last, changing linearly. */
function weighIns(startKg: number, perDayKg: number, days = 15): SeriesPoint[] {
  const out: SeriesPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(2026, 5, 1)
    d.setDate(d.getDate() - i)
    out.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      value: startKg + (days - 1 - i) * perDayKg,
    })
  }
  return out
}

function intakeDays(kcal: number, days = 14): IntakeDay[] {
  const out: IntakeDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(2026, 5, 1)
    d.setDate(d.getDate() - i)
    out.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      kcal,
    })
  }
  return out
}

describe('ageOn', () => {
  it('is null without a birthdate', () => {
    expect(ageOn(null, TODAY)).toBeNull()
  })

  it('counts whole years', () => {
    expect(ageOn('1990-06-01', TODAY)).toBe(36)
  })

  it('does not count a birthday that has not happened yet', () => {
    expect(ageOn('1990-12-31', TODAY)).toBe(35)
  })

  it('rejects a birthdate in the future', () => {
    expect(ageOn('2030-01-01', TODAY)).toBeNull()
  })

  it('rejects an implausible age', () => {
    expect(ageOn('1800-01-01', TODAY)).toBeNull()
  })
})

describe('mifflinStJeorBmr', () => {
  it('matches the published equation for a man', () => {
    // 10*80 + 6.25*180 - 5*36 + 5 = 1750
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 36 })).toBeCloseTo(1750, 6)
  })

  it('matches the published equation for a woman', () => {
    // 10*65 + 6.25*165 - 5*30 - 161 = 1370.25
    expect(mifflinStJeorBmr({ sex: 'female', weightKg: 65, heightCm: 165, age: 30 })).toBeCloseTo(1370.25, 6)
  })

  it('refuses a partial body rather than guessing', () => {
    expect(mifflinStJeorBmr({ sex: null, weightKg: 80, heightCm: 180, age: 36 })).toBeNull()
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: null, heightCm: 180, age: 36 })).toBeNull()
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: null, age: 36 })).toBeNull()
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: 180, age: null })).toBeNull()
  })

  it('rejects nonsense measurements', () => {
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 0, heightCm: 180, age: 36 })).toBeNull()
    expect(mifflinStJeorBmr({ sex: 'male', weightKg: 80, heightCm: -1, age: 36 })).toBeNull()
  })
})

describe('formulaTdee', () => {
  it('applies the activity multiplier', () => {
    expect(formulaTdee(body(), 80, TODAY)).toBeCloseTo(1750 * 1.55, 4)
  })

  it('is null without an activity level', () => {
    expect(formulaTdee(body({ activityLevel: null }), 80, TODAY)).toBeNull()
  })

  it('is null without a weight to anchor to', () => {
    expect(formulaTdee(body(), null, TODAY)).toBeNull()
  })

  it('rises with activity', () => {
    const sedentary = formulaTdee(body({ activityLevel: 'sedentary' }), 80, TODAY)!
    const active = formulaTdee(body({ activityLevel: 'very_active' }), 80, TODAY)!
    expect(active).toBeGreaterThan(sedentary)
  })
})

describe('goalDailyOffsetKcal', () => {
  it('is a deficit for loss', () => {
    expect(goalDailyOffsetKcal(body({ goalDirection: 'lose', goalRateKgPerWeek: 0.5 }))).toBeCloseTo(
      -(0.5 * KCAL_PER_KG) / 7,
      6,
    )
  })

  it('is a surplus for gain', () => {
    expect(goalDailyOffsetKcal(body({ goalDirection: 'gain', goalRateKgPerWeek: 0.25 }))).toBeGreaterThan(0)
  })

  it('is zero for maintain, regardless of any stored rate', () => {
    expect(goalDailyOffsetKcal(body({ goalDirection: 'maintain', goalRateKgPerWeek: 0.5 }))).toBe(0)
  })

  it('is null without a goal', () => {
    expect(goalDailyOffsetKcal(body({ goalDirection: null }))).toBeNull()
  })

  it('is null when a direction has no rate', () => {
    expect(goalDailyOffsetKcal(body({ goalDirection: 'lose', goalRateKgPerWeek: null }))).toBeNull()
    expect(goalDailyOffsetKcal(body({ goalDirection: 'lose', goalRateKgPerWeek: 0 }))).toBeNull()
  })
})

describe('computeAdaptiveTarget — refusals', () => {
  it('asks for a goal before anything else', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: null }),
      weights: weighIns(80, -0.05),
      intake: intakeDays(2200),
      today: TODAY,
    })
    expect(r.status).toBe('needs-goal')
    expect(r.targetKcal).toBeNull()
  })

  it('falls back to the formula while there are too few weigh-ins', () => {
    const r = computeAdaptiveTarget({
      body: body(),
      weights: weighIns(80, 0, 15).slice(-2),
      intake: intakeDays(2200),
      today: TODAY,
    })
    expect(r.status).toBe('estimated')
    expect(r.tdeeKcal).toBeCloseTo(1750 * 1.55, 0)
    expect(r.targetKcal).toBeGreaterThan(0)
  })

  it('refuses outright when there are too few weigh-ins and no usable body', () => {
    const r = computeAdaptiveTarget({
      body: body({ heightCm: null }),
      weights: [],
      intake: intakeDays(2200),
      today: TODAY,
    })
    expect(r.status).toBe('needs-weigh-ins')
    expect(r.targetKcal).toBeNull()
  })

  it('will not measure from weigh-ins crammed into a few days', () => {
    const r = computeAdaptiveTarget({
      body: body(),
      weights: weighIns(80, -0.05, 15).slice(-4), // 4 readings, 4-day span
      intake: intakeDays(2200),
      today: TODAY,
    })
    expect(r.status).toBe('estimated')
  })

  it('refuses to measure when too few days were logged', () => {
    const r = computeAdaptiveTarget({
      body: body(),
      weights: weighIns(80, -0.05),
      intake: intakeDays(2200, 4),
      today: TODAY,
    })
    expect(r.status).toBe('needs-food-logs')
    // No target at all — quietly using the formula would hide the real problem.
    expect(r.targetKcal).toBeNull()
  })

  it('treats implausibly small days as partial logs, not as fasting', () => {
    // Fourteen days logged, but most are a forgotten-dinner 500 kcal.
    const partial = intakeDays(2200).map((d, i) => (i % 2 === 0 ? { ...d, kcal: 500 } : d))
    const r = computeAdaptiveTarget({
      body: body(),
      weights: weighIns(80, -0.05),
      intake: partial,
      today: TODAY,
    })
    expect(r.status).toBe('needs-food-logs')
    expect(r.loggedDays).toBeLessThan(10)
  })

  it('counts a day exactly on the credibility threshold', () => {
    const r = computeAdaptiveTarget({
      body: body(),
      weights: weighIns(80, -0.05),
      intake: intakeDays(MIN_CREDIBLE_DAY_KCAL),
      today: TODAY,
    })
    expect(r.loggedDays).toBe(14)
  })
})

describe('computeAdaptiveTarget — measurement', () => {
  it('recovers a known TDEE from intake and weight change', () => {
    // Eating 2000, losing 0.5 kg/week => burning 2000 + 550 = 2550.
    const perDayKg = -0.5 / 7
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, perDayKg),
      intake: intakeDays(2000),
      today: TODAY,
    })
    expect(r.status).toBe('ok')
    expect(r.tdeeKcal).toBeCloseTo(2550, -2)
    expect(r.meanIntakeKcal).toBe(2000)
  })

  it('reports maintenance as the target for a maintain goal', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, 0),
      intake: intakeDays(2400),
      today: TODAY,
    })
    expect(r.targetKcal).toBeCloseTo(r.tdeeKcal!, -2)
  })

  it('subtracts the goal deficit for weight loss', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'lose', goalRateKgPerWeek: 0.5 }),
      weights: weighIns(80, 0),
      intake: intakeDays(2400),
      today: TODAY, // first run, so nothing to step away from
    })
    // Weight flat on 2400 means maintenance is 2400; a 0.5kg/wk deficit is 550.
    expect(r.targetKcal).toBeCloseTo(2400 - 550, -2)
  })

  it('walks toward that deficit rather than dropping straight to it', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'lose', goalRateKgPerWeek: 0.5 }),
      weights: weighIns(80, 0),
      intake: intakeDays(2400),
      previousTargetKcal: 2400,
      today: TODAY,
    })
    // 550 in one move is exactly what the step cap is for.
    expect(r.clamped).toBe(true)
    expect(r.targetKcal).toBe(2400 - MAX_STEP_KCAL)
  })

  it('reports the measured weekly change', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, -0.1),
      intake: intakeDays(2000),
      today: TODAY,
    })
    expect(r.weeklyChangeKg).toBeCloseTo(-0.7, 1)
  })

  it('raises the estimate when weight is climbing on the same intake', () => {
    const gaining = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, 0.05),
      intake: intakeDays(2200),
      today: TODAY,
    })
    const losing = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, -0.05),
      intake: intakeDays(2200),
      today: TODAY,
    })
    // Gaining on 2200 means they burn less than someone losing on 2200.
    expect(gaining.tdeeKcal!).toBeLessThan(losing.tdeeKcal!)
  })

  it('ignores weigh-ins from before the window', () => {
    const stale: SeriesPoint[] = [{ date: '2020-01-01', value: 120 }, ...weighIns(80, 0)]
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: stale,
      intake: intakeDays(2200),
      today: TODAY,
    })
    expect(r.weeklyChangeKg).toBeCloseTo(0, 1)
  })
})

describe('computeAdaptiveTarget — guard rails', () => {
  it('caps how far one recalculation can move the target', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, 0),
      intake: intakeDays(3500),
      previousTargetKcal: 2000,
      today: TODAY,
    })
    expect(r.clamped).toBe(true)
    expect(r.targetKcal).toBe(2000 + MAX_STEP_KCAL)
  })

  it('caps downward moves too', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, 0),
      intake: intakeDays(1500),
      previousTargetKcal: 3000,
      today: TODAY,
    })
    expect(r.targetKcal).toBe(3000 - MAX_STEP_KCAL)
  })

  it('does not flag a within-cap move as clamped', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'maintain' }),
      weights: weighIns(80, 0),
      intake: intakeDays(2100),
      previousTargetKcal: 2000,
      today: TODAY,
    })
    expect(r.clamped).toBe(false)
  })

  it('never returns a target below the floor', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'lose', goalRateKgPerWeek: 1.5 }),
      weights: weighIns(50, -0.2),
      intake: intakeDays(1000),
      today: TODAY,
    })
    expect(r.targetKcal).toBeGreaterThanOrEqual(MIN_TARGET_KCAL)
  })

  it('keeps the floor even when the step cap would go lower', () => {
    const r = computeAdaptiveTarget({
      body: body({ goalDirection: 'lose', goalRateKgPerWeek: 1 }),
      weights: weighIns(50, -0.3),
      intake: intakeDays(900),
      previousTargetKcal: 1300,
      today: TODAY,
    })
    expect(r.targetKcal).toBeGreaterThanOrEqual(MIN_TARGET_KCAL)
  })
})

describe('macroSplit', () => {
  it('produces macros whose calories match the target', () => {
    const split = macroSplit(2200, 80)
    expect(calories(split)).toBeCloseTo(2200, 0)
  })

  it('anchors protein to bodyweight', () => {
    expect(macroSplit(2200, 80).protein_g).toBeCloseTo(144, 0)
    expect(macroSplit(2200, 60).protein_g).toBeCloseTo(108, 0)
  })

  it('keeps protein constant as calories change', () => {
    expect(macroSplit(1800, 80).protein_g).toBeCloseTo(macroSplit(2600, 80).protein_g, 1)
  })

  it('flexes carbohydrate with the calorie target', () => {
    expect(macroSplit(2600, 80).carbs_g).toBeGreaterThan(macroSplit(1800, 80).carbs_g)
  })

  it('holds a fat floor at low calories rather than driving fat to zero', () => {
    const split = macroSplit(1300, 80)
    expect(split.fats_g).toBeGreaterThanOrEqual(80 * 0.6 - 0.1)
  })

  it('never returns a negative macro', () => {
    for (const kcal of [1200, 1500, 2000, 3500]) {
      const split = macroSplit(kcal, 90)
      expect(split.carbs_g).toBeGreaterThanOrEqual(0)
      expect(split.protein_g).toBeGreaterThanOrEqual(0)
      expect(split.fats_g).toBeGreaterThanOrEqual(0)
    }
  })

  it('falls back to fractions without a bodyweight', () => {
    const split = macroSplit(2000, null)
    expect(calories(split)).toBeCloseTo(2000, 0)
    expect(split.protein_g).toBeGreaterThan(0)
  })

  it('returns zeros for a non-positive target', () => {
    expect(macroSplit(0, 80)).toEqual({ carbs_g: 0, protein_g: 0, fats_g: 0 })
    expect(macroSplit(-100, 80)).toEqual({ carbs_g: 0, protein_g: 0, fats_g: 0 })
  })
})

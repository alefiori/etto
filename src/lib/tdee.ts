/**
 * Adaptive energy targets.
 *
 * The idea, and why it is not a BMR calculator: every free app multiplies
 * Mifflin-St Jeor by an activity factor and calls the result your maintenance
 * calories. That number is wrong for most people — the activity multipliers are
 * coarse, and individual metabolic variation at a given body composition runs
 * to several hundred kcal a day. It also never learns.
 *
 * Instead this measures. Over a trailing window, if someone averaged 2,200 kcal
 * and their weight fell by 0.4 kg, they burned about
 * 2,200 + (0.4 x 7,700 / 14) = 2,420 kcal a day. That estimate is specific to
 * them and it improves as data accumulates. Mifflin-St Jeor is used only to
 * cold-start, before there is enough data to measure anything.
 *
 * The hard part is not the arithmetic — it is refusing to answer. Under-logging
 * is the dominant failure mode: someone who logs 3 days out of 14 looks like
 * they are eating 600 kcal and gaining weight, which would produce a dangerous
 * recommendation. Most of this module is the checks that return "no adjustment"
 * instead. Every threshold below is a deliberate refusal boundary, not a knob.
 */

import { diffDays, todayISO } from './date'
import { robustTrendPerDay, type SeriesPoint } from './trend'
import { KCAL_PER_GRAM, round, type MacroGrams } from './macros'
import type { ActivityLevel, GoalDirection, Sex } from './database.types'

/**
 * Energy density of body-mass change, kcal per kg.
 *
 * The familiar 7,700 figure is for pure adipose tissue. Real weight change is a
 * mix of fat, lean tissue and glycogen-bound water, so this over-estimates fat
 * loss slightly — which is the safe direction here: it makes the TDEE estimate
 * conservative rather than aggressive.
 */
export const KCAL_PER_KG = 7700

/** Trailing window the estimate is measured over. */
export const WINDOW_DAYS = 14

/**
 * Refusal thresholds. Each one exists because violating it produces a
 * confidently wrong answer rather than a slightly noisy one.
 */
export const MIN_WEIGH_INS = 4
/** Weigh-ins must span at least this many days, or the slope is meaningless. */
export const MIN_WEIGH_IN_SPAN_DAYS = 10
/** Days in the window that must have food logged. */
export const MIN_LOGGED_DAYS = 10
/**
 * A logged day under this is treated as a partial log, not a fast. People
 * forget dinner far more often than they eat 500 kcal.
 */
export const MIN_CREDIBLE_DAY_KCAL = 800
/** How far a single recalculation may move the target. */
export const MAX_STEP_KCAL = 250
/** Absolute floor, whatever the maths says. */
export const MIN_TARGET_KCAL = 1200

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export interface BodyProfile {
  sex: Sex | null
  birthdate: string | null
  heightCm: number | null
  activityLevel: ActivityLevel | null
  goalDirection: GoalDirection | null
  goalRateKgPerWeek: number | null
}

/** One day's logged energy. Days with nothing logged are absent, not zero. */
export interface IntakeDay {
  date: string
  kcal: number
}

export type AdaptiveStatus =
  | 'ok'
  /** Cold start: not enough measurement yet, so the estimate is the formula's. */
  | 'estimated'
  | 'needs-body-data'
  | 'needs-weigh-ins'
  | 'needs-food-logs'
  | 'needs-goal'

export interface AdaptiveResult {
  status: AdaptiveStatus
  /** Estimated daily maintenance, or null when we refuse to guess. */
  tdeeKcal: number | null
  /** What to eat to hit the goal, after clamping. Null when unusable. */
  targetKcal: number | null
  /** Measured weight change per week over the window, for the explanation. */
  weeklyChangeKg: number | null
  /** Mean logged intake over the window. */
  meanIntakeKcal: number | null
  /** Most recent weigh-in inside the window — what macroSplit anchors protein to. */
  latestWeightKg: number | null
  /** How many of the window's days had a credible log. */
  loggedDays: number
  /** True when the step was capped by MAX_STEP_KCAL. */
  clamped: boolean
}

/** Whole years old on `today`, or null if the birthdate is unknown/absurd. */
export function ageOn(birthdate: string | null, today = todayISO()): number | null {
  if (!birthdate) return null
  const days = diffDays(birthdate, today)
  if (days < 0) return null
  const years = Math.floor(days / 365.2425)
  return years >= 0 && years < 130 ? years : null
}

/**
 * Mifflin-St Jeor resting metabolic rate, kcal/day.
 *
 * Null unless sex, height, age and weight are all known — a partial body gives
 * a number that looks authoritative and isn't.
 */
export function mifflinStJeorBmr(opts: {
  sex: Sex | null
  weightKg: number | null
  heightCm: number | null
  age: number | null
}): number | null {
  const { sex, weightKg, heightCm, age } = opts
  if (!sex || weightKg == null || heightCm == null || age == null) return null
  if (!(weightKg > 0) || !(heightCm > 0) || !(age >= 0)) return null

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

/** The cold-start maintenance estimate: BMR x an activity multiplier. */
export function formulaTdee(body: BodyProfile, weightKg: number | null, today = todayISO()): number | null {
  const bmr = mifflinStJeorBmr({
    sex: body.sex,
    weightKg,
    heightCm: body.heightCm,
    age: ageOn(body.birthdate, today),
  })
  if (bmr == null || !body.activityLevel) return null
  return bmr * ACTIVITY_MULTIPLIERS[body.activityLevel]
}

/** Daily energy offset implied by the goal. Negative for loss. */
export function goalDailyOffsetKcal(body: BodyProfile): number | null {
  if (!body.goalDirection) return null
  if (body.goalDirection === 'maintain') return 0

  const rate = body.goalRateKgPerWeek
  if (rate == null || !(rate > 0)) return null

  const perDay = (rate * KCAL_PER_KG) / 7
  return body.goalDirection === 'lose' ? -perDay : perDay
}

/**
 * Estimate maintenance and a target from measured intake and weight change.
 *
 * `previousTargetKcal` is what the user is currently eating to; the result is
 * capped to MAX_STEP_KCAL away from it so a noisy fortnight can't swing someone
 * by 800 kcal overnight. Pass null on the first run.
 */
export function computeAdaptiveTarget(opts: {
  body: BodyProfile
  /** Raw weigh-ins in kg, any order. */
  weights: SeriesPoint[]
  /** Days with food logged. Days with nothing logged must be omitted. */
  intake: IntakeDay[]
  previousTargetKcal?: number | null
  today?: string
}): AdaptiveResult {
  const { body, previousTargetKcal = null, today = todayISO() } = opts

  const empty: AdaptiveResult = {
    status: 'ok',
    tdeeKcal: null,
    targetKcal: null,
    weeklyChangeKg: null,
    meanIntakeKcal: null,
    latestWeightKg: null,
    loggedDays: 0,
    clamped: false,
  }

  const offset = goalDailyOffsetKcal(body)
  if (offset == null) return { ...empty, status: 'needs-goal' }

  // Only the trailing window counts. Older data describes a different body.
  const inWindow = (date: string) => {
    const age = diffDays(date, today)
    return age >= 0 && age <= WINDOW_DAYS
  }
  const weights = opts.weights
    .filter((w) => inWindow(w.date))
    .sort((a, b) => a.date.localeCompare(b.date))
  const credible = opts.intake.filter(
    (d) => d.kcal >= MIN_CREDIBLE_DAY_KCAL && inWindow(d.date),
  )

  const latestWeight = weights.length > 0 ? weights[weights.length - 1].value : null
  const formula = formulaTdee(body, latestWeight, today)

  // Cold start / refusals. Order matters: report the most actionable gap first.
  if (weights.length < MIN_WEIGH_INS) {
    return {
      ...empty,
      status: formula != null ? 'estimated' : 'needs-weigh-ins',
      tdeeKcal: formula,
      targetKcal: formula != null ? clampTarget(formula + offset, null) : null,
      latestWeightKg: latestWeight,
      loggedDays: credible.length,
    }
  }

  const span = diffDays(weights[0].date, weights[weights.length - 1].date)
  if (span < MIN_WEIGH_IN_SPAN_DAYS) {
    return {
      ...empty,
      status: formula != null ? 'estimated' : 'needs-weigh-ins',
      tdeeKcal: formula,
      targetKcal: formula != null ? clampTarget(formula + offset, null) : null,
      latestWeightKg: latestWeight,
      loggedDays: credible.length,
    }
  }

  if (credible.length < MIN_LOGGED_DAYS) {
    return {
      ...empty,
      status: 'needs-food-logs',
      tdeeKcal: formula,
      // Deliberately no target: a measured estimate is impossible and silently
      // falling back to the formula would hide that the logs are the problem.
      targetKcal: null,
      latestWeightKg: latestWeight,
      loggedDays: credible.length,
    }
  }

  // Theil-Sen on the raw readings. Smoothing first and then fitting would lag
  // the trend and report roughly half the true rate, which lands as a few
  // hundred kcal a day of error once multiplied by KCAL_PER_KG.
  const perDay = robustTrendPerDay(weights)
  if (perDay == null) {
    return {
      ...empty,
      status: formula != null ? 'estimated' : 'needs-weigh-ins',
      tdeeKcal: formula,
      targetKcal: formula != null ? clampTarget(formula + offset, null) : null,
      latestWeightKg: latestWeight,
      loggedDays: credible.length,
    }
  }

  const meanIntake = credible.reduce((sum, d) => sum + d.kcal, 0) / credible.length
  // Energy balance: intake - expenditure = the energy the body banked, so
  // expenditure = intake - banked. Losing weight (perDay < 0) therefore *raises*
  // the estimate above what they ate, and gaining lowers it.
  const tdee = meanIntake - perDay * KCAL_PER_KG

  const raw = tdee + offset
  const target = clampTarget(raw, previousTargetKcal)

  return {
    status: 'ok',
    tdeeKcal: Math.round(tdee),
    targetKcal: target,
    weeklyChangeKg: round(perDay * 7, 2),
    meanIntakeKcal: Math.round(meanIntake),
    latestWeightKg: latestWeight,
    loggedDays: credible.length,
    clamped: previousTargetKcal != null && Math.abs(raw - previousTargetKcal) > MAX_STEP_KCAL,
  }
}

/** Apply the step cap and the absolute floor. */
function clampTarget(raw: number, previousKcal: number | null): number {
  let next = raw
  if (previousKcal != null) {
    const delta = raw - previousKcal
    if (Math.abs(delta) > MAX_STEP_KCAL) next = previousKcal + Math.sign(delta) * MAX_STEP_KCAL
  }
  return Math.max(MIN_TARGET_KCAL, Math.round(next))
}

/**
 * Turn a calorie target into grams of each macro.
 *
 * Protein is anchored per kilogram of bodyweight because that is how the
 * evidence is expressed and because it is the macro worth protecting in a
 * deficit. Fats take a percentage with a floor — going very low is unpleasant
 * and hormonally unwise. Carbohydrate is whatever is left, which is the right
 * way round: it is the macro people flex.
 *
 * `macro_targets` stores grams only, so this inverse is what lets an adaptive
 * calorie goal be written into the existing schema at all.
 */
export const PROTEIN_G_PER_KG = 1.8
export const FAT_FRACTION_OF_KCAL = 0.27
export const MIN_FAT_G_PER_KG = 0.6

export function macroSplit(targetKcal: number, weightKg: number | null): MacroGrams {
  if (!(targetKcal > 0)) return { carbs_g: 0, protein_g: 0, fats_g: 0 }

  // Without a weight there is nothing to anchor to, so fall back to fractions
  // that are reasonable across body sizes rather than refusing outright.
  const proteinG =
    weightKg != null && weightKg > 0
      ? weightKg * PROTEIN_G_PER_KG
      : (targetKcal * 0.3) / KCAL_PER_GRAM.protein

  const fatFloorG = weightKg != null && weightKg > 0 ? weightKg * MIN_FAT_G_PER_KG : 0
  const fatsG = Math.max(fatFloorG, (targetKcal * FAT_FRACTION_OF_KCAL) / KCAL_PER_GRAM.fats)

  const usedKcal = proteinG * KCAL_PER_GRAM.protein + fatsG * KCAL_PER_GRAM.fats
  const carbsG = Math.max(0, (targetKcal - usedKcal) / KCAL_PER_GRAM.carbs)

  return {
    carbs_g: round(carbsG),
    protein_g: round(proteinG),
    fats_g: round(fatsG),
  }
}

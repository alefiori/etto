import { describe, it, expect, afterEach, vi } from 'vitest'
import { formatMealText, formatDayText, shareText } from './exportText'
import type { TranslationKey } from './i18n'
import { makeFoodLogWithFood } from '@/test/utils'

/** Fake translator: maps the handful of keys exportText uses to short tokens. */
const T: Record<string, string> = {
  'macro.carbsAbbr': 'C',
  'macro.proteinAbbr': 'P',
  'macro.fatsAbbr': 'F',
  'macro.carbs': 'Carbs',
  'macro.protein': 'Protein',
  'macro.fats': 'Fats',
  'common.kcal': 'kcal',
  'meal.breakfast': 'Breakfast',
  'meal.lunch': 'Lunch',
  'meal.dinner': 'Dinner',
  'meal.snack': 'Snack',
  'export.total': 'Total',
}
const t = (key: TranslationKey) => T[key] ?? key

const oats = makeFoodLogWithFood(
  { meal: 'breakfast', servings: 1.5 },
  { name: 'Oats', serving_amount: 100, serving_unit: 'g', carbs_g: 60, protein_g: 12, fats_g: 7 },
)
const eggs = makeFoodLogWithFood(
  { meal: 'lunch', servings: 2 },
  { name: 'Eggs', serving_amount: 50, serving_unit: 'g', carbs_g: 1, protein_g: 6, fats_g: 5 },
)
const nuts = makeFoodLogWithFood(
  { meal: 'mid-morning', servings: 1 },
  { name: 'Nuts', serving_amount: 30, serving_unit: 'g', carbs_g: 2, protein_g: 5, fats_g: 18 },
)

/** The user's meals, in their own order — what the dashboard passes in. */
const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'mid-morning', label: 'Mid-morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
]

describe('formatMealText', () => {
  it('returns an empty string when there are no logs', () => {
    expect(formatMealText(MEALS[0], [], '2024-01-01', 'en-US', t)).toBe('')
  })

  it('renders a header, a bullet per food, and a totals line', () => {
    const text = formatMealText(MEALS[0], [oats], '2023-10-26', 'en-US', t)
    expect(text).toContain('🌅 Breakfast — Thursday, October 26')
    // 1.5 × 100 g = 150 g; macros scaled ×1.5: C 90 / P 18 / F 10.5
    expect(text).toContain('• Oats — 150 g')
    expect(text).toContain('C 90g · P 18g · F 10.5g')
    expect(text).toContain('Total:')
    expect(text).toContain('kcal')
  })
})

describe('formatDayText', () => {
  it('returns an empty string when there are no logs', () => {
    expect(formatDayText([], '2024-01-01', 'en-US', t, MEALS)).toBe('')
  })

  it('groups by meal, skips empty meals, and prints a day total', () => {
    const text = formatDayText([oats, eggs], '2023-10-26', 'en-US', t, MEALS)
    expect(text).toContain('📅 Thursday, October 26')
    expect(text).toContain('Breakfast')
    expect(text).toContain('Lunch')
    expect(text).not.toContain('Dinner') // empty meal skipped
    expect(text).not.toContain('Snack')
    expect(text).toContain('Carbs') // day-total line uses full macro names
    expect(text).toContain('Total:')
  })

  it('uses the meal names and order it is given, including custom meals', () => {
    const text = formatDayText([oats, eggs, nuts], '2023-10-26', 'en-US', t, MEALS)
    const sections = ['Breakfast', 'Mid-morning', 'Lunch'].map((name) => text.indexOf(name))
    expect(sections).toEqual([...sections].sort((a, b) => a - b))
    // A user-created meal has no emoji of its own, so it gets the neutral one.
    expect(text).toContain('🍽️ Mid-morning')
  })

  it('renders a custom meal name instead of a built-in label', () => {
    const renamed = [{ key: 'breakfast', label: 'Colazione' }]
    const text = formatDayText([oats], '2023-10-26', 'en-US', t, renamed)
    expect(text).toContain('🌅 Colazione')
    expect(text).not.toContain('Breakfast')
  })
})

describe('shareText', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    expect(await shareText('hi')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hi' })
  })

  it('reports dismissal when the share sheet is cancelled', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    vi.stubGlobal('navigator', { share })
    expect(await shareText('hi')).toBe('dismissed')
  })

  it('falls back to the clipboard when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await shareText('hi')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hi')
  })

  it('falls back to the clipboard when share fails for a non-abort reason', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('nope', 'NotAllowedError'))
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    expect(await shareText('hi')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hi')
  })
})

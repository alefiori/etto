import { describe, it, expect } from 'vitest'
import { defaultMealRows, mealKeyFromName, mealLabel, moveItem } from './meals'
import type { TranslationKey } from './i18n'

const t = ((key: TranslationKey) => `T:${key}`) as (key: TranslationKey) => string

describe('mealLabel', () => {
  it('uses the translated label for a built-in meal with no name', () => {
    expect(mealLabel({ key: 'snack', name: null }, t)).toBe('T:meal.snack')
  })

  it('prefers the name the user typed', () => {
    expect(mealLabel({ key: 'snack', name: 'Merenda' }, t)).toBe('Merenda')
  })

  it('treats a blank name as no name', () => {
    expect(mealLabel({ key: 'lunch', name: '   ' }, t)).toBe('T:meal.lunch')
  })

  it('falls back to the key for an unknown meal with no name', () => {
    expect(mealLabel({ key: 'mid-morning', name: null }, t)).toBe('mid-morning')
  })
})

describe('mealKeyFromName', () => {
  it('slugifies the name', () => {
    expect(mealKeyFromName('Mid Morning')).toBe('mid-morning')
  })

  it('strips diacritics and punctuation', () => {
    expect(mealKeyFromName('Café / Merenda!')).toBe('cafe-merenda')
  })

  it('suffixes until the key is free', () => {
    expect(mealKeyFromName('Snack', ['snack'])).toBe('snack-2')
    expect(mealKeyFromName('Snack', ['snack', 'snack-2'])).toBe('snack-3')
  })

  it('falls back to a usable key when the name has nothing to slugify', () => {
    expect(mealKeyFromName('🍕')).toBe('meal')
  })

  it('never ends with a separator, even when truncated', () => {
    const key = mealKeyFromName('a'.repeat(30) + ' second word')
    expect(key.length).toBeLessThanOrEqual(32)
    expect(key.endsWith('-')).toBe(false)
  })
})

describe('moveItem', () => {
  it('moves an item to the target index', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 2)).toEqual(['a', 'b', 'd', 'c'])
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('returns the list untouched for a no-op or out-of-range move', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, 0, 2)).toBe(list)
    expect(moveItem(list, -1, 0)).toBe(list)
  })
})

describe('defaultMealRows', () => {
  it('puts snack third, between lunch and dinner', () => {
    expect(defaultMealRows('user-1').map((m) => m.key)).toEqual([
      'breakfast',
      'lunch',
      'snack',
      'dinner',
    ])
  })

  it('numbers the positions from zero and leaves names translated', () => {
    const rows = defaultMealRows('user-1')
    expect(rows.map((m) => m.position)).toEqual([0, 1, 2, 3])
    expect(rows.every((m) => m.name === null)).toBe(true)
    expect(rows.every((m) => m.user_id === 'user-1')).toBe(true)
  })
})

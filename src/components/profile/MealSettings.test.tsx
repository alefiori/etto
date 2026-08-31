import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  addMeal: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  meals: [] as { id: string; key: string; name: string | null; icon: string; label: string }[],
  atLimit: false,
}))

vi.mock('@/context/MealsContext', () => ({
  useMeals: () => ({
    meals: h.meals,
    loading: false,
    error: null,
    atLimit: h.atLimit,
    labelFor: (key: string) => key,
    addMeal: h.addMeal,
    rename: h.rename,
    move: h.move,
    remove: h.remove,
    refetch: vi.fn(),
  }),
}))

import { MealSettings } from './MealSettings'

beforeEach(() => {
  vi.clearAllMocks()
  h.atLimit = false
  h.meals = [
    { id: 'm1', key: 'breakfast', name: null, icon: 'wb_sunny', label: 'Breakfast' },
    { id: 'm2', key: 'lunch', name: null, icon: 'light_mode', label: 'Lunch' },
    { id: 'm3', key: 'snack', name: 'Merenda', icon: 'cookie', label: 'Merenda' },
  ]
})

/**
 * The section is a disclosure row now, so it opens before anything inside it
 * can be asserted on. `fireEvent` rather than `userEvent` so the tests that do
 * not otherwise await anything stay synchronous. See SettingsRow.
 */
function renderOpen() {
  const result = render(<MealSettings />)
  // Scoped to this render's own container: a test that renders the
  // component twice would otherwise find two row triggers.
  fireEvent.click(within(result.container).getByRole('button', { name: /^Meals/ }))
  return result
}

describe('MealSettings', () => {
  it('lists the meals in order', () => {
    renderOpen()
    const names = screen.getAllByRole('textbox').map((i) => (i as HTMLInputElement).placeholder)
    // Built-in meals show their translated label as a placeholder; the renamed
    // one holds its own name, and the last field is the "add meal" input.
    expect(names.slice(0, 3)).toEqual(['Breakfast', 'Lunch', 'Merenda'])
  })

  it('renames a meal when its field loses focus', async () => {
    h.rename.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderOpen()

    const field = screen.getByLabelText('Name of Breakfast')
    await user.type(field, 'Colazione')
    await user.tab()

    expect(h.rename).toHaveBeenCalledWith('m1', 'Colazione')
  })

  it('does not save when the name is unchanged', async () => {
    const user = userEvent.setup()
    renderOpen()

    await user.click(screen.getByLabelText('Name of Lunch'))
    await user.tab()

    expect(h.rename).not.toHaveBeenCalled()
  })

  it('adds a meal', async () => {
    h.addMeal.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderOpen()

    await user.type(screen.getByLabelText('New meal name'), 'Mid-morning')
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    expect(h.addMeal).toHaveBeenCalledWith('Mid-morning')
  })

  it('reorders meals, with the ends disabled', async () => {
    const user = userEvent.setup()
    renderOpen()

    expect(screen.getByLabelText('Move Breakfast up')).toBeDisabled()
    expect(screen.getByLabelText('Move Merenda down')).toBeDisabled()

    await user.click(screen.getByLabelText('Move Merenda up'))
    expect(h.move).toHaveBeenCalledWith('m3', -1)
  })

  it('deletes a meal only after confirming, naming where its items go', async () => {
    h.remove.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderOpen()

    await user.click(screen.getByLabelText('Delete Merenda'))
    expect(h.remove).not.toHaveBeenCalled()
    // Items logged in it move to the meal above.
    expect(screen.getByRole('alertdialog')).toHaveTextContent(/moves to "Lunch"/)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(h.remove).toHaveBeenCalledWith('m3')
  })

  it('blocks adding once the limit is reached', () => {
    h.atLimit = true
    renderOpen()
    expect(screen.getByLabelText('New meal name')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add meal' })).toBeDisabled()
  })
})

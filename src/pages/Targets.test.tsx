import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const h = vi.hoisted(() => ({
  upsert: vi.fn(),
  // Stable identity: the real hook keeps this in state, and the page re-seeds
  // its inputs whenever it changes.
  byDay: {},
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert: h.upsert }) },
}))
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
vi.mock('@/hooks/useTargets', () => ({
  useTargets: () => ({ byDay: h.byDay, loading: false, error: null, refetch: vi.fn() }),
}))

import Targets from './Targets'

/** Rows handed to the nth upsert call. */
type Row = { user_id: string; day_of_week: number; carbs_g: number }
const rowsOf = (call: number) => h.upsert.mock.calls[call][0] as Row[]

// The autosave debounce is 700ms, so give the assertions room to clear it.
const waitOpts = { timeout: 3000 }

beforeEach(() => {
  vi.clearAllMocks()
  h.upsert.mockResolvedValue({ error: null })
})

describe('Targets page', () => {
  it('autosaves an edit instead of offering a save button', async () => {
    const user = userEvent.setup()
    render(<Targets />)

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()
    expect(screen.getByText('Changes save automatically')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Carbs (g)', { selector: '#target-1-carbs' }), '200')

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1), waitOpts)
    // Only the day that changed is written back.
    expect(rowsOf(0)).toEqual([
      { user_id: 'user-1', day_of_week: 1, carbs_g: 200, protein_g: 0, fats_g: 0 },
    ])
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })

  it('copies a day and pastes it into one other day at a time', async () => {
    const user = userEvent.setup()
    render(<Targets />)

    await user.type(screen.getByLabelText('Carbs (g)', { selector: '#target-1-carbs' }), '200')
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1), waitOpts)
    // Typing into Monday leaves every other day alone.
    expect(rowsOf(0)).toHaveLength(1)

    // Nothing to paste until a day is copied.
    expect(screen.queryByRole('button', { name: /^Paste into/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Copy Mon' }))
    expect(screen.getByText('Mon copied — paste it into any other day')).toBeInTheDocument()
    // The copied day offers no paste button to itself, so six remain.
    expect(screen.getAllByRole('button', { name: /^Paste into/ })).toHaveLength(6)

    await user.click(screen.getByRole('button', { name: 'Paste into Wed' }))

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2), waitOpts)
    // Only Wednesday was written — the rest of the week is untouched.
    expect(rowsOf(1)).toEqual([
      { user_id: 'user-1', day_of_week: 3, carbs_g: 200, protein_g: 0, fats_g: 0 },
    ])
    expect(screen.getByLabelText('Carbs (g)', { selector: '#target-3-carbs' })).toHaveValue(200)
  })

  it('keeps the copied day until it is cleared, so it can be pasted repeatedly', async () => {
    const user = userEvent.setup()
    render(<Targets />)

    await user.type(screen.getByLabelText('Carbs (g)', { selector: '#target-1-carbs' }), '200')
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1), waitOpts)

    await user.click(screen.getByRole('button', { name: 'Copy Mon' }))
    await user.click(screen.getByRole('button', { name: 'Paste into Tue' }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2), waitOpts)

    await user.click(screen.getByRole('button', { name: 'Paste into Sun' }))
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(3), waitOpts)
    expect(rowsOf(2)[0].day_of_week).toBe(0)

    await user.click(screen.getByRole('button', { name: 'Clear copied day' }))
    expect(screen.queryByRole('button', { name: /^Paste into/ })).toBeNull()
  })

  it('surfaces a failed autosave and retries on demand', async () => {
    const user = userEvent.setup()
    h.upsert.mockResolvedValueOnce({ error: { message: 'network down' } })
    render(<Targets />)

    await user.type(screen.getByLabelText('Carbs (g)', { selector: '#target-1-carbs' }), '150')

    expect(await screen.findByText('network down', {}, waitOpts)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2), waitOpts)
    expect(rowsOf(1)).toEqual([
      { user_id: 'user-1', day_of_week: 1, carbs_g: 150, protein_g: 0, fats_g: 0 },
    ])
    expect(await screen.findByText('All changes saved')).toBeInTheDocument()
  })
})

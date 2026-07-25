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

  it('copies a day to the whole week only when its copy button is used', async () => {
    const user = userEvent.setup()
    render(<Targets />)

    await user.type(screen.getByLabelText('Carbs (g)', { selector: '#target-1-carbs' }), '200')
    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(1), waitOpts)
    // Typing into Monday leaves every other day alone.
    expect(rowsOf(0)).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Copy Mon to all days' }))

    await waitFor(() => expect(h.upsert).toHaveBeenCalledTimes(2), waitOpts)
    // The other six days now match Monday (Monday itself was already saved).
    const rows = rowsOf(1)
    expect(rows).toHaveLength(6)
    expect(rows.every((r) => r.carbs_g === 200)).toBe(true)
    expect(rows.map((r) => r.day_of_week).sort()).toEqual([0, 2, 3, 4, 5, 6])
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

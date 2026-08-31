import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Profile } from '@/lib/database.types'

const h = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  state: null as unknown as {
    profile: Partial<Profile> | null
    unitSystem: string
    loading: boolean
    updateProfile: (patch: Record<string, unknown>) => Promise<void>
  },
}))

vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => h.state,
}))

import { BodyMetrics } from './BodyMetrics'

function stub(profile: Partial<Profile> | null = null, unitSystem = 'metric') {
  return { profile, unitSystem, loading: false, updateProfile: h.updateProfile }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.updateProfile.mockResolvedValue(undefined)
  h.state = stub()
})

/**
 * The section is a disclosure row now, so it opens before anything inside it
 * can be asserted on. `fireEvent` rather than `userEvent` so the tests that do
 * not otherwise await anything stay synchronous. See SettingsRow.
 */
function renderOpen() {
  const result = render(<BodyMetrics />)
  // Scoped to this render's own container: a test that renders the
  // component twice would otherwise find two row triggers.
  fireEvent.click(within(result.container).getByRole('button', { name: /^Body & goal/ }))
  return result
}

describe('BodyMetrics', () => {
  it('renders every field empty for a profile that has answered nothing', () => {
    renderOpen()
    expect(screen.getByLabelText('Sex')).toHaveValue('')
    expect(screen.getByLabelText('Daily activity')).toHaveValue('')
    expect(screen.getByLabelText('Goal')).toHaveValue('')
    expect(screen.getByLabelText('Height')).toHaveValue(null)
  })

  it('saves a sex selection', async () => {
    const user = userEvent.setup()
    renderOpen()

    await user.selectOptions(screen.getByLabelText('Sex'), 'female')
    expect(h.updateProfile).toHaveBeenCalledWith({ sex: 'female' })
  })

  it('clears a value back to null rather than saving an empty string', async () => {
    h.state = stub({ sex: 'male' })
    const user = userEvent.setup()
    renderOpen()

    await user.selectOptions(screen.getByLabelText('Sex'), '')
    expect(h.updateProfile).toHaveBeenCalledWith({ sex: null })
  })

  it('commits height on blur, not on every keystroke', async () => {
    const user = userEvent.setup()
    renderOpen()

    const input = screen.getByLabelText('Height')
    await user.type(input, '178')
    expect(h.updateProfile).not.toHaveBeenCalled()

    await user.tab()
    expect(h.updateProfile).toHaveBeenCalledWith({ height_cm: 178 })
  })

  it('converts an imperial height to centimetres', async () => {
    h.state = stub(null, 'imperial')
    const user = userEvent.setup()
    renderOpen()

    await user.type(screen.getByLabelText('Height in feet'), '5')
    // Moving between the two boxes must not commit a half-typed height.
    expect(h.updateProfile).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Height in inches'), '10')
    await user.tab()

    expect(h.updateProfile).toHaveBeenCalledTimes(1)
    const [patch] = h.updateProfile.mock.calls[0]
    expect(patch.height_cm).toBeCloseTo(177.8, 3)
  })

  it('shows a stored height in feet and inches under imperial units', () => {
    h.state = stub({ height_cm: 182.88 }, 'imperial')
    renderOpen()

    expect(screen.getByLabelText('Height in feet')).toHaveValue(6)
    expect(screen.getByLabelText('Height in inches')).toHaveValue(0)
  })

  it('hides the rate field until a direction is chosen', () => {
    renderOpen()
    expect(screen.queryByLabelText(/^Rate/)).not.toBeInTheDocument()
  })

  it('hides the rate field for a maintain goal, which has no rate', () => {
    h.state = stub({ goal_direction: 'maintain' })
    renderOpen()
    expect(screen.queryByLabelText(/^Rate/)).not.toBeInTheDocument()
  })

  it('shows the rate field in the display units once losing or gaining', () => {
    h.state = stub({ goal_direction: 'lose' })
    renderOpen()
    expect(screen.getByLabelText('Rate (kg per week)')).toBeInTheDocument()

    h.state = stub({ goal_direction: 'lose' }, 'imperial')
    renderOpen()
    expect(screen.getByLabelText('Rate (lb per week)')).toBeInTheDocument()
  })

  it('clamps a goal rate to the 1.5 kg/week the column allows', async () => {
    h.state = stub({ goal_direction: 'lose' })
    const user = userEvent.setup()
    renderOpen()

    await user.type(screen.getByLabelText('Rate (kg per week)'), '5')
    await user.tab()
    expect(h.updateProfile).toHaveBeenCalledWith({ goal_rate_kg_per_week: 1.5 })
  })

  it('surfaces a save failure without throwing', async () => {
    h.updateProfile.mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    renderOpen()

    await user.selectOptions(screen.getByLabelText('Sex'), 'male')
    expect(await screen.findByText('Could not save. Please try again.')).toBeInTheDocument()
  })
})

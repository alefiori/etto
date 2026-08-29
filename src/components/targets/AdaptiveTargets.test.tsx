import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AdaptiveResult } from '@/lib/tdee'

const h = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  onApply: vi.fn(),
  openPaywall: vi.fn(),
  isPro: true,
  profile: { adaptive_targets_enabled: true } as Record<string, unknown> | null,
  adaptive: null as unknown as { result: AdaptiveResult | null; loading: boolean; error: string | null },
}))

vi.mock('@/context/ProfileContext', () => ({
  useProfile: () => ({ profile: h.profile, updateProfile: h.updateProfile }),
}))
vi.mock('@/hooks/useAdaptiveTargets', () => ({
  useAdaptiveTargets: () => h.adaptive,
}))
vi.mock('@/context/EntitlementContext', () => ({
  useEntitlement: () => ({ isPro: h.isPro }),
}))
vi.mock('@/context/AppShellContext', () => ({
  useAppShell: () => ({ openPaywall: h.openPaywall }),
}))

import { AdaptiveTargets } from './AdaptiveTargets'

function result(overrides: Partial<AdaptiveResult> = {}): AdaptiveResult {
  return {
    status: 'ok',
    tdeeKcal: 2550,
    targetKcal: 2000,
    weeklyChangeKg: -0.5,
    meanIntakeKcal: 2100,
    latestWeightKg: 80,
    loggedDays: 13,
    clamped: false,
    ...overrides,
  }
}

function renderPanel() {
  return render(<AdaptiveTargets byDay={{}} onApply={h.onApply} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.updateProfile.mockResolvedValue(undefined)
  h.onApply.mockResolvedValue(undefined)
  h.profile = { adaptive_targets_enabled: true }
  h.adaptive = { result: result(), loading: false, error: null }
  h.isPro = true
})

describe('AdaptiveTargets', () => {
  it('reflects the stored mode in the switch', () => {
    renderPanel()
    expect(screen.getByRole('switch', { name: 'Adaptive targets' })).toBeChecked()
  })

  it('turns the mode on', async () => {
    h.profile = { adaptive_targets_enabled: false }
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('switch'))
    expect(h.updateProfile).toHaveBeenCalledWith({ adaptive_targets_enabled: true })
  })

  it('shows nothing but the switch while the mode is off', () => {
    h.profile = { adaptive_targets_enabled: false }
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Apply these targets' })).not.toBeInTheDocument()
  })

  it('explains where the number came from', () => {
    renderPanel()
    expect(
      screen.getByText(
        'You averaged 2,100 kcal a day and your weight fell 0.50 kg a week, so you are burning about 2,550 kcal a day.',
      ),
    ).toBeInTheDocument()
  })

  it('describes a change inside scale noise as steady rather than as a direction', () => {
    h.adaptive = { result: result({ weeklyChangeKg: -0.02 }), loading: false, error: null }
    renderPanel()
    expect(screen.getByText(/your weight held steady/)).toBeInTheDocument()
  })

  it('says a rise is a rise', () => {
    h.adaptive = { result: result({ weeklyChangeKg: 0.4 }), loading: false, error: null }
    renderPanel()
    expect(screen.getByText(/your weight rose 0.40 kg a week/)).toBeInTheDocument()
  })

  it('applies the split to every day', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Apply these targets' }))
    expect(h.onApply).toHaveBeenCalledTimes(1)
    const [macros] = h.onApply.mock.calls[0]
    // Protein is anchored to the 80kg bodyweight.
    expect(macros.protein_g).toBeCloseTo(144, 0)
  })

  it('mentions when the step was capped', () => {
    h.adaptive = { result: result({ clamped: true }), loading: false, error: null }
    renderPanel()
    expect(screen.getByText(/Moving gradually/)).toBeInTheDocument()
  })

  it('asks for a goal when there is none', () => {
    h.adaptive = {
      result: result({ status: 'needs-goal', targetKcal: null, tdeeKcal: null }),
      loading: false,
      error: null,
    }
    renderPanel()
    expect(screen.getByText(/Set a goal in your profile/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply these targets' })).not.toBeInTheDocument()
  })

  it('names the missing logs, with the count, rather than a generic error', () => {
    h.adaptive = {
      result: result({ status: 'needs-food-logs', targetKcal: null, loggedDays: 4 }),
      loading: false,
      error: null,
    }
    renderPanel()
    expect(
      screen.getByText(/Only 4 of the last two weeks have food logged/),
    ).toBeInTheDocument()
    // Crucially, no target is offered — falling back to a formula here would
    // hide that the logs are the problem.
    expect(screen.queryByRole('button', { name: 'Apply these targets' })).not.toBeInTheDocument()
  })

  it('flags a cold-start estimate as a formula rather than a measurement', () => {
    h.adaptive = { result: result({ status: 'estimated' }), loading: false, error: null }
    renderPanel()
    expect(screen.getByText(/This is a formula estimate for now/)).toBeInTheDocument()
    // A target is still offered — it is better than nothing at this stage.
    expect(screen.getByRole('button', { name: 'Apply these targets' })).toBeInTheDocument()
  })

  it('surfaces a load failure', () => {
    h.adaptive = { result: null, loading: false, error: 'boom' }
    renderPanel()
    expect(screen.getByText('Could not load your recent data.')).toBeInTheDocument()
  })

  it('surfaces a failure to apply without throwing', async () => {
    h.onApply.mockRejectedValue(new Error('nope'))
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Apply these targets' }))
    expect(
      await screen.findByText('Could not update your targets. Please try again.'),
    ).toBeInTheDocument()
  })

  it('always carries the not-medical-advice line while enabled', () => {
    renderPanel()
    expect(screen.getByText(/not medical advice/)).toBeInTheDocument()
  })
})

describe('AdaptiveTargets for a free user', () => {
  beforeEach(() => {
    h.isPro = false
  })

  it('shows an upgrade prompt instead of the panel', () => {
    renderPanel()
    // The locked state still names the feature and marks it as paid — a bare
    // description would leave the row with nothing to attach to.
    expect(screen.getByText('Adaptive targets')).toBeInTheDocument()
    expect(screen.getByText('Pro')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('opens the paywall from the prompt', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'See Pro' }))
    expect(h.openPaywall).toHaveBeenCalledTimes(1)
  })

  it('says what the feature is, so the lock can convert', () => {
    renderPanel()
    expect(
      screen.getByText(/Work out your targets from what you actually eat/),
    ).toBeInTheDocument()
  })
})

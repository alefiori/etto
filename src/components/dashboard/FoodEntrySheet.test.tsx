import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoodEntrySheet } from './FoodEntrySheet'
import { makeFood } from '@/test/utils'

/** 100 g serving, 10 C / 5 P / 2 F — so one 5 g step is a tenth of a serving. */
const food = makeFood({ name: 'Rolled oats', serving_amount: 100, serving_unit: 'g' })

const baseProps = {
  open: true,
  food,
  servings: 1,
  saving: false,
  error: null,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onCopy: vi.fn(),
  onDelete: vi.fn(),
}

describe('FoodEntrySheet', () => {
  it('renders nothing when closed', () => {
    render(<FoodEntrySheet {...baseProps} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on the logged amount and offers multiples of a serving', () => {
    render(<FoodEntrySheet {...baseProps} />)
    expect(screen.getByLabelText('Amount in g')).toHaveValue(100)
    for (const preset of ['50 g', '100 g', '150 g', '200 g']) {
      expect(screen.getByRole('button', { name: preset })).toBeInTheDocument()
    }
  })

  it('steps grams by 5 and rescales the macros with the amount', async () => {
    const user = userEvent.setup()
    render(<FoodEntrySheet {...baseProps} />)

    await user.click(screen.getByLabelText('Increase amount'))

    expect(screen.getByLabelText('Amount in g')).toHaveValue(105)
    expect(screen.getByText('82 kcal')).toBeInTheDocument()
    expect(screen.getByText('10.5g')).toBeInTheDocument()
  })

  it('commits the edit as servings, not as an amount', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FoodEntrySheet {...baseProps} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '150 g' }))
    await user.click(screen.getByRole('button', { name: 'Save 150 g' }))

    expect(onSave).toHaveBeenCalledWith(1.5)
  })

  it('just closes when nothing was changed', async () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<FoodEntrySheet {...baseProps} onClose={onClose} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: 'Done' }))

    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('steps counted units by a half instead of by 5', async () => {
    const user = userEvent.setup()
    const pieces = makeFood({ serving_amount: 1, serving_unit: 'piece' })
    render(<FoodEntrySheet {...baseProps} food={pieces} />)

    await user.click(screen.getByLabelText('Increase amount'))

    expect(screen.getByLabelText('Amount in piece')).toHaveValue(1.5)
  })

  it('surfaces a failed save next to the actions', () => {
    render(<FoodEntrySheet {...baseProps} error="Could not update this entry." />)
    expect(screen.getByText('Could not update this entry.')).toBeInTheDocument()
  })
})

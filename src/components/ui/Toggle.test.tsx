import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toggle } from './Toggle'

describe('Toggle', () => {
  it('exposes its state through the switch role', () => {
    render(<Toggle checked onChange={() => {}} label="Adaptive targets" />)
    expect(screen.getByRole('switch', { name: 'Adaptive targets' })).toBeChecked()
  })

  it('reports unchecked when off', () => {
    render(<Toggle checked={false} onChange={() => {}} label="Adaptive targets" />)
    expect(screen.getByRole('switch', { name: 'Adaptive targets' })).not.toBeChecked()
  })

  it('asks for the opposite of its current state', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Toggle checked={false} onChange={onChange} label="Adaptive targets" />)

    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('turns off again', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Toggle checked onChange={onChange} label="Adaptive targets" />)

    await user.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not fire while disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Toggle checked={false} onChange={onChange} label="Adaptive targets" disabled />)

    await user.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

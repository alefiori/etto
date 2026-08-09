import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FoodLogRow } from './FoodLogRow'
import { makeFoodLogWithFood } from '@/test/utils'

const { deleteFoodLog, updateLogServings } = vi.hoisted(() => ({
  deleteFoodLog: vi.fn(async () => {}),
  updateLogServings: vi.fn(async () => {}),
}))

vi.mock('@/lib/foods', () => ({ deleteFoodLog, updateLogServings }))

const log = makeFoodLogWithFood({ servings: 1 }, { name: 'Rolled oats', serving_amount: 100 })

function renderRow(overrides: Partial<Parameters<typeof FoodLogRow>[0]> = {}) {
  const props = {
    log,
    onChanged: vi.fn(),
    onCopy: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  }
  render(<FoodLogRow {...props} />)
  return props
}

/** The row itself — the only target on it, and named by its own contents. */
const row = () => screen.getByRole('button', { name: /Rolled oats/ })

beforeEach(() => {
  deleteFoodLog.mockClear()
  updateLogServings.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FoodLogRow', () => {
  it('shows the amount, macros and calories on one row', () => {
    renderRow()
    expect(row()).toHaveTextContent('100 g')
    expect(row()).toHaveTextContent('10g') // carbs for one serving
    expect(row()).toHaveTextContent('78 kcal')
  })

  it('opens the entry sheet when the row is tapped', async () => {
    const user = userEvent.setup()
    renderRow()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(row())

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount in g')).toHaveValue(100)
  })

  it('opens the context menu on a held press, not on a quick tap', async () => {
    vi.useFakeTimers()
    renderRow()

    fireEvent.pointerDown(row(), { button: 0, isPrimary: true })
    act(() => vi.advanceTimersByTime(500))
    fireEvent.pointerUp(row())

    expect(screen.getByRole('menu')).toBeInTheDocument()
    for (const name of ['Details', 'Copy food', 'Delete']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument()
    }
    // The click that trails a long press must not also open the sheet.
    fireEvent.click(row())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels the press when the finger moves into a scroll', () => {
    vi.useFakeTimers()
    renderRow()

    fireEvent.pointerDown(row(), { button: 0, isPrimary: true, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(row(), { clientX: 0, clientY: 40 })
    act(() => vi.advanceTimersByTime(500))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('reaches the same menu from a right-click', async () => {
    const user = userEvent.setup()
    const { onCopy } = renderRow()

    fireEvent.contextMenu(row())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Copy food' }))

    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('confirms before deleting, then reports it', async () => {
    const user = userEvent.setup()
    const { onChanged, onNotice } = renderRow()

    fireEvent.contextMenu(row())
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/Rolled oats \(100 g\) will be removed/)).toBeInTheDocument()
    expect(deleteFoodLog).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete', exact: true }))

    await waitFor(() => expect(deleteFoodLog).toHaveBeenCalledWith(log.id))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onNotice).toHaveBeenCalledWith('Entry deleted')
  })

  it('saves an edited quantity as servings and reports it', async () => {
    const user = userEvent.setup()
    const { onChanged, onNotice } = renderRow()

    await user.click(row())
    await user.click(screen.getByRole('button', { name: '150 g' }))
    await user.click(screen.getByRole('button', { name: 'Save 150 g' }))

    await waitFor(() => expect(updateLogServings).toHaveBeenCalledWith(log.id, 1.5))
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(onNotice).toHaveBeenCalledWith('Quantity updated')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the sheet open and says so when a save fails', async () => {
    updateLogServings.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    const { onChanged } = renderRow()

    await user.click(row())
    await user.click(screen.getByRole('button', { name: '150 g' }))
    await user.click(screen.getByRole('button', { name: 'Save 150 g' }))

    expect(await screen.findByText('Could not update this entry.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('closes the menu on Escape', () => {
    renderRow()
    fireEvent.contextMenu(row())
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

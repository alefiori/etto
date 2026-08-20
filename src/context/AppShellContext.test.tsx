import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AppShellProvider, useAppShell } from './AppShellContext'

function Probe() {
  const { selectedDate, setSelectedDate } = useAppShell()
  return (
    <div>
      <span data-testid="date">{selectedDate}</span>
      <button onClick={() => setSelectedDate('2026-08-14')}>pick past day</button>
    </div>
  )
}

/** Pretend the app was brought back to the foreground. */
function resume() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('AppShellProvider — day rollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 22, 0, 0))
  })

  afterEach(() => vi.useRealTimers())

  it('starts on today', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>,
    )
    expect(screen.getByTestId('date')).toHaveTextContent('2026-08-20')
  })

  it('moves to the new day when the app is re-opened after midnight', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>,
    )

    vi.setSystemTime(new Date(2026, 7, 21, 8, 0, 0))
    resume()

    expect(screen.getByTestId('date')).toHaveTextContent('2026-08-21')
  })

  it('leaves a deliberately picked day alone when no day has passed', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'pick past day' }))
    vi.setSystemTime(new Date(2026, 7, 20, 23, 30, 0))
    resume()

    expect(screen.getByTestId('date')).toHaveTextContent('2026-08-14')
  })

  it('snaps a picked past day to today after a rollover', () => {
    render(
      <AppShellProvider>
        <Probe />
      </AppShellProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'pick past day' }))
    vi.setSystemTime(new Date(2026, 7, 21, 8, 0, 0))
    resume()

    expect(screen.getByTestId('date')).toHaveTextContent('2026-08-21')
  })
})

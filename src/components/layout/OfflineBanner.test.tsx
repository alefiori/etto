import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { OfflineBanner } from './OfflineBanner'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

function fire(type: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(type))
  })
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setNavigatorOnLine(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    setNavigatorOnLine(true)
  })

  it('renders nothing while online and no outage has happened yet', () => {
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the offline message once the connection drops', () => {
    render(<OfflineBanner />)
    setNavigatorOnLine(false)
    fire('offline')

    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(/you.re offline/i)
  })

  it('switches to "back online" and then dismisses itself', () => {
    render(<OfflineBanner />)
    setNavigatorOnLine(false)
    fire('offline')
    setNavigatorOnLine(true)
    fire('online')

    expect(screen.getByRole('status')).toHaveTextContent('Back online')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('does not greet a session that opened online with "back online"', () => {
    render(<OfflineBanner />)
    // No outage this session — coming online again (e.g. a spurious event)
    // must not be treated as a recovery.
    fire('online')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('cancels a pending dismiss timer if it goes offline again first', () => {
    render(<OfflineBanner />)
    setNavigatorOnLine(false)
    fire('offline')
    setNavigatorOnLine(true)
    fire('online')
    expect(screen.getByRole('status')).toHaveTextContent('Back online')

    // Offline again before the 3s "back online" window elapses.
    setNavigatorOnLine(false)
    fire('offline')
    expect(screen.getByRole('status')).toHaveTextContent(/you.re offline/i)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    // The stale timer must not have fired and hidden the still-relevant
    // offline banner.
    expect(screen.getByRole('status')).toHaveTextContent(/you.re offline/i)
  })

  it('is aria-live polite, not an alert', () => {
    render(<OfflineBanner />)
    setNavigatorOnLine(false)
    fire('offline')
    const banner = screen.getByRole('status')
    expect(banner).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

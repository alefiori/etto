import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef } from 'react'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders as render } from '@/test/utils'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefresh } from '@/components/layout/PullToRefresh'

/**
 * The shell, reduced to the two things this gesture needs: a scroll container
 * and a handler. `<main>` in the real app; a div with the same contract here.
 */
function Harness({
  onRefresh,
  enabled = true,
}: {
  onRefresh: () => Promise<unknown>
  enabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pull = usePullToRefresh({ scrollRef: ref, onRefresh, enabled })
  return (
    <div ref={ref} data-testid="scroller">
      <PullToRefresh
        phase={pull.phase}
        distance={pull.distance}
        progress={pull.progress}
        announce={pull.announce}
        onRefresh={pull.refresh}
        enabled={enabled}
      />
      <p>content</p>
    </div>
  )
}

/**
 * jsdom has no TouchEvent, and the listeners are attached to the element by
 * hand (they have to be, to be non-passive), so a plain Event carrying the one
 * field the handler reads is the whole fixture.
 */
function touch(el: Element, type: string, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [{ clientY }],
  })
  act(() => {
    el.dispatchEvent(event)
  })
  return event
}

/** A pull of `distance` finger-pixels, from the top. */
function pullDown(el: Element, distance: number) {
  touch(el, 'touchstart', 0)
  const move = touch(el, 'touchmove', distance)
  touch(el, 'touchend', distance)
  return move
}

describe('pull to refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes when the pull passes the threshold', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)

    // 64px of indicator travel, at half a pixel per finger-pixel.
    pullDown(screen.getByTestId('scroller'), 140)

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('ignores a pull that stops short of it', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)

    // A flick this size is someone starting to scroll a list that is already
    // at the top — refreshing on it would make the page unusable.
    pullDown(screen.getByTestId('scroller'), 40)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores a pull that starts partway down the page', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    // jsdom does not lay anything out, so scrollTop is set rather than scrolled.
    Object.defineProperty(scroller, 'scrollTop', { value: 300, writable: true })

    pullDown(scroller, 200)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('claims the gesture from the container so it cannot overscroll too', () => {
    render(<Harness onRefresh={vi.fn().mockResolvedValue(undefined)} />)

    const move = pullDown(screen.getByTestId('scroller'), 100)

    // Without this the lane rubber-bands behind the indicator, and on an
    // Android install Chrome's own pull-to-refresh answers the same gesture.
    expect(move.defaultPrevented).toBe(true)
  })

  it('gives everyone without a touchscreen a button for it', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Harness onRefresh={onRefresh} />)

    // sr-only until focused, so it is found by role rather than by sight.
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('says out loud that it is refreshing, and then that it is done', async () => {
    let land: () => void = () => {}
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => (land = resolve)))
    render(<Harness onRefresh={onRefresh} />)

    pullDown(screen.getByTestId('scroller'), 200)

    expect(await screen.findByText('Refreshing…')).toBeInTheDocument()
    await act(async () => {
      land()
    })
    // The indicator holds for a beat after the data lands; the announcement
    // follows it rather than the promise.
    expect(await screen.findByText('Updated')).toBeInTheDocument()
  })

  it('stays out of the way while an overlay is open', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    // What useScrollLock does — the guest banner's sheet is inside the content
    // lane, so its own drags reach these listeners.
    document.body.style.position = 'fixed'

    pullDown(screen.getByTestId('scroller'), 200)

    expect(onRefresh).not.toHaveBeenCalled()
    document.body.style.position = ''
  })

  it('does nothing on a page that has registered no handler', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} enabled={false} />)

    pullDown(screen.getByTestId('scroller'), 200)

    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
  })

  describe('on a trackpad', () => {
    // The wheel path is built on the gaps between events, so this drives the
    // clock rather than waiting on it.
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    function wheel(el: Element, deltaY: number) {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
      act(() => {
        el.dispatchEvent(event)
      })
      return event
    }

    /** A two-finger scroll upwards: many small deltas, milliseconds apart. */
    function overscroll(el: Element, { events = 6, deltaY = -40, gap = 50 } = {}) {
      const fired: WheelEvent[] = []
      for (let i = 0; i < events; i++) {
        fired.push(wheel(el, deltaY))
        act(() => {
          vi.advanceTimersByTime(gap)
        })
      }
      return fired
    }

    it('refreshes when the scroll keeps going with nothing left to scroll', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(<Harness onRefresh={onRefresh} />)

      overscroll(screen.getByTestId('scroller'))

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('takes the gesture from the page so it cannot overscroll too', () => {
      render(<Harness onRefresh={vi.fn().mockResolvedValue(undefined)} />)

      const fired = overscroll(screen.getByTestId('scroller'), { events: 2 })

      expect(fired[1].defaultPrevented).toBe(true)
    })

    it('leaves a downward scroll alone', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(<Harness onRefresh={onRefresh} />)

      const event = wheel(screen.getByTestId('scroller'), 40)

      expect(event.defaultPrevented).toBe(false)
      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('is not fooled by one flick of a mouse wheel', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(<Harness onRefresh={onRefresh} />)

      // A single notch carries further than the whole threshold. Distance
      // alone cannot be what decides this.
      wheel(screen.getByTestId('scroller'), -300)

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('ignores a flick that started partway down and coasted into the top', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(<Harness onRefresh={onRefresh} />)
      const scroller = screen.getByTestId('scroller')
      Object.defineProperty(scroller, 'scrollTop', { value: 300, writable: true })

      // The gesture begins as an ordinary scroll up the page...
      wheel(scroller, -60)
      act(() => {
        vi.advanceTimersByTime(50)
      })
      // ...which reaches the top and keeps coasting. Momentum, not intent.
      ;(scroller as HTMLElement).scrollTop = 0
      overscroll(scroller, { events: 8 })

      expect(onRefresh).not.toHaveBeenCalled()
    })

    it('starts a new gesture once the fingers have come off', () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(<Harness onRefresh={onRefresh} />)
      const scroller = screen.getByTestId('scroller')

      // Short of the threshold, then a pause long enough to end the gesture.
      overscroll(scroller, { events: 2 })
      act(() => {
        vi.advanceTimersByTime(300)
      })
      overscroll(scroller)

      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDayRollover } from './useDayRollover'

/** Pretend the app was resumed the way the web does it. */
function resume() {
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

describe('useDayRollover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 22, 0, 0))
    setHidden(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('stays quiet when the app is resumed on the same day', () => {
    const onRollover = vi.fn()
    renderHook(() => useDayRollover(onRollover))

    vi.setSystemTime(new Date(2026, 7, 20, 23, 59, 59))
    resume()

    expect(onRollover).not.toHaveBeenCalled()
  })

  it('reports the new day when the app is resumed after midnight', () => {
    const onRollover = vi.fn()
    renderHook(() => useDayRollover(onRollover))

    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    resume()

    expect(onRollover).toHaveBeenCalledExactlyOnceWith('2026-08-21')
  })

  it('fires on window focus too, for the desktop window that is never hidden', () => {
    const onRollover = vi.fn()
    renderHook(() => useDayRollover(onRollover))

    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(onRollover).toHaveBeenCalledExactlyOnceWith('2026-08-21')
  })

  it('ignores the hidden half of a visibility change', () => {
    const onRollover = vi.fn()
    renderHook(() => useDayRollover(onRollover))

    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    setHidden(true)
    resume()

    expect(onRollover).not.toHaveBeenCalled()
  })

  it('fires once per rollover, not once per resume', () => {
    const onRollover = vi.fn()
    renderHook(() => useDayRollover(onRollover))

    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    resume()
    resume()
    // Both signals landing on one resume must not count twice either.
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(onRollover).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date(2026, 7, 22, 7, 0, 0))
    resume()

    expect(onRollover).toHaveBeenCalledTimes(2)
    expect(onRollover).toHaveBeenLastCalledWith('2026-08-22')
  })

  it('uses the latest callback without re-subscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ fn }) => useDayRollover(fn), {
      initialProps: { fn: first },
    })

    rerender({ fn: second })
    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    resume()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('stops listening once unmounted', () => {
    const onRollover = vi.fn()
    const { unmount } = renderHook(() => useDayRollover(onRollover))

    unmount()
    vi.setSystemTime(new Date(2026, 7, 21, 8, 30, 0))
    resume()

    expect(onRollover).not.toHaveBeenCalled()
  })
})

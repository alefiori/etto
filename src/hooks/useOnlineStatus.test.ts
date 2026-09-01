import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

function fire(type: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(type))
  })
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    setNavigatorOnLine(true)
  })

  it('starts from navigator.onLine', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
  })

  it('defaults to online when navigator.onLine is undefined', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => undefined })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('flips to false on an "offline" event', () => {
    setNavigatorOnLine(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)

    setNavigatorOnLine(false)
    fire('offline')
    expect(result.current).toBe(false)
  })

  it('flips back to true on an "online" event', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)

    setNavigatorOnLine(true)
    fire('online')
    expect(result.current).toBe(true)
  })

  it('removes its listeners on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useOnlineStatus())

    const addedTypes = addSpy.mock.calls.map((c) => c[0])
    expect(addedTypes).toEqual(expect.arrayContaining(['online', 'offline']))

    unmount()
    const removedTypes = removeSpy.mock.calls.map((c) => c[0])
    expect(removedTypes).toEqual(expect.arrayContaining(['online', 'offline']))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })
})

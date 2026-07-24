import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithRetry } from './retry'

/** Minimal Response-like stub. */
function res(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response
}

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns immediately on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(200))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test')
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a retryable status and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(429))
      .mockResolvedValueOnce(res(503))
      .mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test', {}, { baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry a non-retryable status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(404))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test', {}, { baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns the last response after exhausting retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(500))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test', {}, { retries: 2, baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    const r = await promise

    // Out of attempts → the final 500 is returned rather than thrown.
    expect(r.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('propagates an AbortError without retrying', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test', {}, { baseDelayMs: 1 })
    const assertion = expect(promise).rejects.toThrow('Aborted')
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a thrown network error then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(res(200))
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchWithRetry('https://x.test', {}, { baseDelayMs: 1 })
    await vi.runAllTimersAsync()
    const r = await promise

    expect(r.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

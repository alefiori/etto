import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary, DefaultErrorFallback, isChunkLoadError } from './ErrorBoundary'

/** Throws on render whenever `shouldThrow` is true; renders "ok" otherwise. */
function Bomb({ shouldThrow, error }: { shouldThrow: boolean; error?: Error }) {
  if (shouldThrow) throw error ?? new Error('boom')
  return <p>ok</p>
}

describe('isChunkLoadError', () => {
  it('recognizes the webpack/Rollup name', () => {
    const e = new Error('any message')
    e.name = 'ChunkLoadError'
    expect(isChunkLoadError(e)).toBe(true)
  })

  it.each([
    'Failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'Importing a module script failed',
    'Loading chunk 3 failed',
  ])('recognizes the message shape %j', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true)
  })

  it('is false for an ordinary crash', () => {
    expect(isChunkLoadError(new Error('undefined is not a function'))).toBe(false)
  })

  it('is false for a nullish error', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('ErrorBoundary', () => {
  // React logs the caught error to the console by default; the component also
  // does its own console.error. Silence both so a passing test doesn't spam.
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('renders the default fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    expect(screen.queryByText('ok')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('shows the stale-chunk copy, without a support link, for a chunk-load failure', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} error={Object.assign(new Error('x'), { name: 'ChunkLoadError' })} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('A newer version is available')).toBeInTheDocument()
    expect(screen.queryByText('Email support')).not.toBeInTheDocument()
  })

  it('offers a support link for a genuine crash', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    )
    const link = screen.getByText('Email support').closest('a')
    expect(link).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
  })

  it('renders a custom fallback and passes it a working reset', () => {
    render(
      <ErrorBoundary fallback={(error, reset) => <button onClick={reset}>recover: {error.message}</button>}>
        <Bomb shouldThrow={true} error={new Error('custom')} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('recover: custom')).toBeInTheDocument()
  })

  it('re-renders children after reset, when the child no longer throws', () => {
    let shouldThrow = true
    function Toggle() {
      return <Bomb shouldThrow={shouldThrow} />
    }
    render(
      <ErrorBoundary fallback={(_e, reset) => <button onClick={reset}>reset</button>}>
        <Toggle />
      </ErrorBoundary>,
    )
    expect(screen.getByText('reset')).toBeInTheDocument()

    shouldThrow = false
    fireEvent.click(screen.getByText('reset'))
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('logs the error and the label for debugging', () => {
    consoleSpy.mockClear()
    render(
      <ErrorBoundary label="test-boundary">
        <Bomb shouldThrow={true} error={new Error('logged')} />
      </ErrorBoundary>,
    )
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('test-boundary'),
      expect.any(Error),
      expect.anything(),
    )
  })
})

describe('DefaultErrorFallback', () => {
  it('has role="alert"', () => {
    render(<DefaultErrorFallback error={new Error('x')} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('reloads the page when Reload is clicked', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    render(<DefaultErrorFallback error={new Error('x')} />)
    fireEvent.click(screen.getByText('Reload'))
    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })
})

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TrendChart } from './TrendChart'
import type { SeriesPoint } from '@/lib/trend'

function series(count: number): SeriesPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    // 2026-01-01 onwards, one reading a day.
    date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    value: 80 - i * 0.1,
  }))
}

function renderChart(count: number) {
  const points = series(count)
  return render(
    <TrendChart trend={points} raw={points} color="#6E56F8" tint="#fff" label="weight trend" />,
  )
}

function delaysOf(container: HTMLElement): number[] {
  return [...container.querySelectorAll('circle.animate-pop')].map((el) =>
    Number.parseFloat((el as SVGCircleElement).style.animationDelay),
  )
}

describe('TrendChart', () => {
  it('normalises the line so the trace keyframe can talk in fractions of it', () => {
    const { container } = renderChart(10)
    const line = container.querySelector('path.animate-trace') as SVGPathElement

    expect(line).toBeTruthy()
    expect(line.getAttribute('pathLength')).toBe('1')
    // One dash as long as the whole path: the finished state is unbroken, and
    // only the offset moves.
    expect(line.style.strokeDasharray).toBe('1')
    expect(line.style.strokeDashoffset).toBe('0')
  })

  it('lands the readings left to right', () => {
    const delays = delaysOf(renderChart(10).container)
    const sorted = [...delays].sort((a, b) => a - b)
    expect(delays).toEqual(sorted)
    expect(new Set(delays).size).toBeGreaterThan(1)
  })

  it('keeps the sequence bounded however many readings there are', () => {
    // A year of daily weigh-ins. At a fixed interval per point this would run
    // for half a minute; the stagger is a window the points are spread across,
    // so it finishes in about the same time as a ten-point sketch.
    const longest = Math.max(...delaysOf(renderChart(365).container))
    const short = Math.max(...delaysOf(renderChart(10).container))
    expect(longest).toBe(short)
    expect(longest).toBeLessThanOrEqual(1000)
  })

  it('renders nothing when there is no series to draw', () => {
    const { container } = render(
      <TrendChart trend={[]} color="#6E56F8" tint="#fff" label="weight trend" />,
    )
    expect(container.querySelector('svg')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { ewma, trendPerDay, chartGeometry, type SeriesPoint } from './trend'

/** Build a daily series starting at 2026-01-01. */
function daily(values: number[], startDay = 1): SeriesPoint[] {
  return values.map((value, i) => ({
    date: `2026-01-${String(startDay + i).padStart(2, '0')}`,
    value,
  }))
}

describe('ewma', () => {
  it('returns an empty series unchanged', () => {
    expect(ewma([])).toEqual([])
  })

  it('passes the first point through untouched', () => {
    const out = ewma(daily([80, 81, 82]))
    expect(out[0]).toEqual({ date: '2026-01-01', value: 80 })
  })

  it('returns one smoothed point per input, keeping the dates', () => {
    const input = daily([80, 81, 82, 83])
    const out = ewma(input)
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.date)).toEqual(input.map((p) => p.date))
  })

  it('holds steady through a one-day spike', () => {
    // A 2kg overnight jump is water, not fat. The trend should barely move.
    const out = ewma(daily([80, 80, 82, 80, 80]))
    const spikeDay = out[2].value
    expect(spikeDay).toBeGreaterThan(80)
    expect(spikeDay).toBeLessThan(80.3)
  })

  it('converges toward a sustained change', () => {
    const out = ewma(daily(Array(30).fill(85)).map((p, i) => (i === 0 ? { ...p, value: 80 } : p)))
    // Each 7-day half-life halves the remaining gap, so after 29 days about
    // 0.5^(29/7) ≈ 5.7% of the original 5kg is left — i.e. ~84.7, closing on 85
    // without ever quite touching it.
    const last = out[out.length - 1].value
    expect(last).toBeGreaterThan(84.5)
    expect(last).toBeLessThan(85)
  })

  it('halves the remaining gap over one half-life', () => {
    const out = ewma(daily(Array(8).fill(90)).map((p, i) => (i === 0 ? { ...p, value: 80 } : p)), 7)
    // Seven days after the step, half of the 10kg gap should be closed.
    expect(out[7].value).toBeCloseTo(85, 1)
  })

  it('weights by elapsed days, not by sample index', () => {
    // Same two readings; the second series has a two-week gap before the last
    // one, so that reading should dominate far more.
    const dense = ewma([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-02', value: 90 },
    ])
    const sparse = ewma([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-15', value: 90 },
    ])
    expect(sparse[1].value).toBeGreaterThan(dense[1].value)
  })

  it('treats same-day points as one day apart rather than ignoring them', () => {
    const out = ewma([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-01', value: 90 },
    ])
    expect(out[1].value).toBeGreaterThan(80)
  })

  it('rejects a non-positive half-life', () => {
    expect(() => ewma(daily([80, 81]), 0)).toThrow()
  })
})

describe('trendPerDay', () => {
  it('returns null with fewer than two points', () => {
    expect(trendPerDay([])).toBeNull()
    expect(trendPerDay(daily([80]))).toBeNull()
  })

  it('returns null when every point shares one date', () => {
    expect(
      trendPerDay([
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-01', value: 81 },
      ]),
    ).toBeNull()
  })

  it('measures a steady daily loss', () => {
    // 100 g/day down.
    const out = trendPerDay(daily([80, 79.9, 79.8, 79.7, 79.6]))
    expect(out).toBeCloseTo(-0.1, 5)
  })

  it('is zero for a flat series', () => {
    expect(trendPerDay(daily([80, 80, 80, 80]))).toBeCloseTo(0, 10)
  })

  it('handles gaps in the series', () => {
    const out = trendPerDay([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-11', value: 79 },
    ])
    expect(out).toBeCloseTo(-0.1, 5)
  })
})

describe('chartGeometry', () => {
  it('produces nothing to draw for an empty series', () => {
    const g = chartGeometry([])
    expect(g.line).toBe('')
    expect(g.area).toBe('')
    expect(g.points).toEqual([])
  })

  it('places the oldest point on the left and the newest on the right', () => {
    const g = chartGeometry(daily([80, 81, 82]), { width: 100, height: 50, padding: 0 })
    expect(g.points[0].x).toBe(0)
    expect(g.points[2].x).toBe(100)
  })

  it('inverts the y axis so a higher value sits higher on screen', () => {
    const g = chartGeometry(daily([80, 90]), { width: 100, height: 50, padding: 0 })
    expect(g.points[1].y).toBeLessThan(g.points[0].y)
  })

  it('keeps every point inside the padded box', () => {
    const g = chartGeometry(daily([80, 95, 70, 88]), { width: 200, height: 100, padding: 4 })
    for (const p of g.points) {
      expect(p.x).toBeGreaterThanOrEqual(4)
      expect(p.x).toBeLessThanOrEqual(196)
      expect(p.y).toBeGreaterThanOrEqual(4)
      expect(p.y).toBeLessThanOrEqual(96)
    }
  })

  it('centres a flat series instead of dividing by a zero range', () => {
    const g = chartGeometry(daily([80, 80, 80]), { width: 100, height: 50, padding: 0 })
    for (const p of g.points) expect(p.y).toBeCloseTo(25, 5)
    expect(Number.isFinite(g.min)).toBe(true)
    expect(Number.isFinite(g.max)).toBe(true)
  })

  it('spaces points by date, leaving a gap where days are missing', () => {
    const g = chartGeometry(
      [
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-02', value: 81 },
        { date: '2026-01-11', value: 82 },
      ],
      { width: 100, height: 50, padding: 0 },
    )
    // Day 2 of 10 sits a tenth of the way across, not a third.
    expect(g.points[1].x).toBeCloseTo(10, 5)
  })

  it('starts the path with a move and closes the area along the baseline', () => {
    const g = chartGeometry(daily([80, 81]), { width: 100, height: 50, padding: 0 })
    expect(g.line.startsWith('M')).toBe(true)
    expect(g.area.endsWith('Z')).toBe(true)
  })

  it('handles a single point without producing NaN', () => {
    const g = chartGeometry(daily([80]), { width: 100, height: 50, padding: 0 })
    expect(g.points).toHaveLength(1)
    expect(g.line).not.toContain('NaN')
  })
})

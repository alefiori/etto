import { describe, it, expect } from 'vitest'
import {
  ewma,
  trendPerDay,
  robustTrendPerDay,
  chartGeometry,
  sharedDomain,
  type SeriesPoint,
} from './trend'

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

describe('chartGeometry with an explicit domain', () => {
  it('uses the given range instead of deriving one', () => {
    const g = chartGeometry(daily([80, 82]), {
      width: 100,
      height: 100,
      padding: 0,
      domain: { min: 70, max: 90 },
    })
    expect(g.min).toBe(70)
    expect(g.max).toBe(90)
    // 80 sits halfway up a 70-90 range, so halfway down a 100-tall box.
    expect(g.points[0].y).toBeCloseTo(50, 5)
  })

  it('puts two series on the same scale so they line up', () => {
    const trend = daily([80, 81])
    const raw = daily([78, 83])
    const domain = sharedDomain(trend, raw)
    const opts = { width: 100, height: 100, padding: 0, domain }
    const a = chartGeometry(trend, opts)
    const b = chartGeometry(raw, opts)
    expect(a.min).toBe(b.min)
    expect(a.max).toBe(b.max)
    // The raw low is below the trend low on screen (larger y = lower).
    expect(b.points[0].y).toBeGreaterThan(a.points[0].y)
  })

  it('survives a caller-supplied zero-width domain', () => {
    const g = chartGeometry(daily([80]), {
      width: 100,
      height: 100,
      padding: 0,
      domain: { min: 80, max: 80 },
    })
    expect(Number.isFinite(g.points[0].y)).toBe(true)
    expect(g.line).not.toContain('NaN')
  })

  it('honours an explicit date span so a short series keeps its position', () => {
    const g = chartGeometry(
      [
        { date: '2026-01-05', value: 80 },
        { date: '2026-01-06', value: 81 },
      ],
      {
        width: 100,
        height: 50,
        padding: 0,
        dateSpan: { from: '2026-01-01', to: '2026-01-11' },
      },
    )
    // Day 5 of an 10-day span is 40% across, not at the left edge.
    expect(g.points[0].x).toBeCloseTo(40, 5)
  })
})

describe('sharedDomain', () => {
  it('is undefined when every series is empty', () => {
    expect(sharedDomain([], [])).toBeUndefined()
  })

  it('spans the extremes of all series with padding', () => {
    const d = sharedDomain(daily([80, 81]), daily([75, 90]))!
    expect(d.min).toBeLessThan(75)
    expect(d.max).toBeGreaterThan(90)
  })

  it('pads a single flat value into a usable range', () => {
    const d = sharedDomain(daily([80]))!
    expect(d.max).toBeGreaterThan(d.min)
  })
})

describe('robustTrendPerDay', () => {
  it('returns null with fewer than two points', () => {
    expect(robustTrendPerDay([])).toBeNull()
    expect(robustTrendPerDay(daily([80]))).toBeNull()
  })

  it('returns null when every reading shares one date', () => {
    expect(
      robustTrendPerDay([
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-01', value: 81 },
      ]),
    ).toBeNull()
  })

  it('recovers a steady rate exactly', () => {
    expect(robustTrendPerDay(daily([80, 79.9, 79.8, 79.7, 79.6]))).toBeCloseTo(-0.1, 10)
  })

  it('is zero for a flat series', () => {
    expect(robustTrendPerDay(daily([80, 80, 80, 80]))).toBeCloseTo(0, 10)
  })

  it('shrugs off a single spike that tilts least squares', () => {
    // Two flat weeks, then one 2kg water day at the end — highest leverage.
    const series = daily([...Array(14).fill(80), 82])
    // Least squares reads this as a real gain...
    expect(Math.abs(trendPerDay(series)!)).toBeGreaterThan(0.04)
    // ...the median of pairwise slopes does not.
    expect(robustTrendPerDay(series)).toBeCloseTo(0, 6)
  })

  it('does not attenuate a real trend the way smoothing does', () => {
    // A steady 0.1/day fall over a fortnight.
    const series = daily(Array.from({ length: 15 }, (_, i) => 80 - i * 0.1))
    expect(robustTrendPerDay(series)).toBeCloseTo(-0.1, 6)
    // Fitting the EWMA instead reports roughly half the true rate — the bias
    // this estimator exists to avoid.
    expect(Math.abs(trendPerDay(ewma(series))!)).toBeLessThan(0.07)
  })

  it('handles gaps between readings', () => {
    expect(
      robustTrendPerDay([
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-11', value: 79 },
        { date: '2026-01-21', value: 78 },
      ]),
    ).toBeCloseTo(-0.1, 6)
  })

  it('ignores same-day pairs rather than dividing by zero', () => {
    const out = robustTrendPerDay([
      { date: '2026-01-01', value: 80 },
      { date: '2026-01-01', value: 81 },
      { date: '2026-01-11', value: 79 },
    ])
    expect(Number.isFinite(out!)).toBe(true)
  })
})

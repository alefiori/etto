/**
 * Weight-trend smoothing and line-chart geometry.
 *
 * Two concerns, both pure, both here for the same reason `RING`/`ringOffset`
 * sit in lib/macros.ts rather than inside ProgressRing: the maths is worth
 * unit-testing and the component that draws it should stay dumb.
 *
 *   1. `ewma` turns a noisy scale reading into a trend line. Day-to-day weight
 *      moves several hundred grams on water and gut content alone, which is far
 *      larger than the ~100 g/day a real deficit produces — so the raw series is
 *      close to useless for judging progress, and Phase 2's energy-balance
 *      estimate would be dominated by noise if fed the raw numbers.
 *   2. `chartGeometry` maps a series onto SVG coordinates.
 */

import { diffDays } from './date'

export interface SeriesPoint {
  date: string // YYYY-MM-DD
  value: number
}

/**
 * Exponentially-weighted moving average, weighted by *elapsed days* rather than
 * by sample index.
 *
 * A plain EWMA assumes evenly spaced samples. Real weigh-ins are not: people
 * skip days, and a fortnight-old reading should not carry the same weight as
 * yesterday's just because it happens to be the previous element in the array.
 * Decaying by the actual gap makes the result independent of how often the user
 * stepped on the scale, which is also why this is preferred over a fixed-width
 * moving average — no window to fill, so it degrades gracefully when data is
 * sparse instead of returning nothing.
 *
 * `halfLifeDays` is how long it takes a reading's influence to halve. 7 days is
 * a reasonable default: responsive enough to show a real trend change within a
 * couple of weeks, slow enough to flatten a salty weekend.
 *
 * Expects `series` sorted oldest-first; returns one smoothed point per input.
 */
export function ewma(series: SeriesPoint[], halfLifeDays = 7): SeriesPoint[] {
  if (series.length === 0) return []
  if (!(halfLifeDays > 0)) throw new Error('halfLifeDays must be greater than zero.')

  const tau = halfLifeDays / Math.LN2
  const out: SeriesPoint[] = [{ date: series[0].date, value: series[0].value }]
  let smoothed = series[0].value

  for (let i = 1; i < series.length; i++) {
    // Same-day or out-of-order points are treated as one day apart rather than
    // zero, which would make alpha 0 and silently drop the reading.
    const gap = Math.max(1, diffDays(series[i - 1].date, series[i].date))
    const alpha = 1 - Math.exp(-gap / tau)
    smoothed += alpha * (series[i].value - smoothed)
    out.push({ date: series[i].date, value: smoothed })
  }

  return out
}

/**
 * Least-squares slope of `series` in units per day, or null when there are
 * fewer than two distinct dates to fit through.
 *
 * Run this on a smoothed series — fitting the raw one just measures noise.
 */
export function trendPerDay(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null

  const origin = series[0].date
  const xs = series.map((p) => diffDays(origin, p.date))
  if (xs[xs.length - 1] === xs[0]) return null

  const n = series.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = series.reduce((a, p) => a + p.value, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    num += dx * (series[i].value - meanY)
    den += dx * dx
  }

  return den === 0 ? null : num / den
}

export interface ChartPoint extends SeriesPoint {
  x: number
  y: number
}

export interface ChartGeometry {
  width: number
  height: number
  /** `d` for the trend polyline. Empty string when there is nothing to draw. */
  line: string
  /** `d` for the filled area under the line, closed along the baseline. */
  area: string
  points: ChartPoint[]
  /** The value range actually plotted, after padding. */
  min: number
  max: number
}

export interface ChartOptions {
  width?: number
  height?: number
  /** Inset in user units, so stroke width and dots aren't clipped at the edges. */
  padding?: number
}

/**
 * Map a series onto an SVG viewBox, oldest on the left.
 *
 * The y-scale is padded by 5% of the range so the extremes don't sit exactly on
 * the border, and a flat series (every value identical, which is common with
 * only two weigh-ins) is centred rather than divided by a zero range.
 */
export function chartGeometry(series: SeriesPoint[], options: ChartOptions = {}): ChartGeometry {
  const { width = 320, height = 120, padding = 4 } = options

  if (series.length === 0) {
    return { width, height, line: '', area: '', points: [], min: 0, max: 0 }
  }

  const values = series.map((p) => p.value)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  // A flat line still needs a non-zero range to divide by; half a unit either
  // side keeps it centred without exaggerating the scale.
  const pad = rawMax === rawMin ? 0.5 : (rawMax - rawMin) * 0.05
  const min = rawMin - pad
  const max = rawMax + pad

  const innerW = Math.max(0, width - padding * 2)
  const innerH = Math.max(0, height - padding * 2)
  const origin = series[0].date
  const span = Math.max(1, diffDays(origin, series[series.length - 1].date))

  const points: ChartPoint[] = series.map((p) => ({
    ...p,
    x: padding + (diffDays(origin, p.date) / span) * innerW,
    y: padding + (1 - (p.value - min) / (max - min)) * innerH,
  }))

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ')
  const baseline = height - padding
  const area =
    points.length > 0
      ? `${line} L${round(points[points.length - 1].x)},${round(baseline)} L${round(points[0].x)},${round(baseline)} Z`
      : ''

  return { width, height, line, area, points, min, max }
}

/** Two decimals is plenty for path data and keeps the DOM readable. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

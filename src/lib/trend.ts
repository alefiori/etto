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
 * Two cautions, both of which cost real accuracy if ignored:
 *
 *   - **Do not fit this to an EWMA-smoothed series.** Smoothing lags a
 *     sustained trend, so the fitted slope comes out systematically shallow —
 *     for a steady 0.1 kg/day loss over a fortnight it reports roughly half the
 *     true rate. Least squares is already a noise-averaging estimator; running
 *     it over raw readings is unbiased, running it over smoothed ones is not.
 *   - It is sensitive to an outlier at either end, where leverage is highest.
 *     One 2 kg water spike on the most recent day tilts a flat fortnight into a
 *     false 0.35 kg/week gain.
 *
 * When either matters — and for weight it always does — use
 * {@link robustTrendPerDay} instead. This remains for cases where the series is
 * already clean and the classic fit is what's wanted.
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

/**
 * Theil–Sen slope: the median of the slopes between every pair of points, in
 * units per day. Null when no two points sit on different dates.
 *
 * This is the estimator to use for weight. It is unbiased for a genuine linear
 * trend — so, unlike fitting a smoothed series, it reports the real rate — and
 * it tolerates outliers up to roughly a third of the data, so a single water
 * spike moves the median hardly at all. Both properties matter here: the number
 * feeds an energy-balance calculation where a 2x error is a few hundred
 * calories a day, and bathroom-scale readings are full of one-day artefacts.
 *
 * O(n^2) in the number of readings, which is nothing at the scale of a year of
 * daily weigh-ins.
 */
export function robustTrendPerDay(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null

  const origin = series[0].date
  const points = series.map((p) => ({ x: diffDays(origin, p.date), y: p.value }))

  const slopes: number[] = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x
      // Two readings on the same day say nothing about a rate.
      if (dx === 0) continue
      slopes.push((points[j].y - points[i].y) / dx)
    }
  }

  if (slopes.length === 0) return null
  slopes.sort((a, b) => a - b)
  const mid = slopes.length >> 1
  return slopes.length % 2 === 1 ? slopes[mid] : (slopes[mid - 1] + slopes[mid]) / 2
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
  /**
   * Plot against this value range instead of the series' own.
   *
   * Needed whenever two series share one chart: without it each would derive
   * its own scale and the overlay would silently misalign.
   */
  domain?: { min: number; max: number }
  /** Likewise for the x axis — the date range the width represents. */
  dateSpan?: { from: string; to: string }
}

/**
 * Map a series onto an SVG viewBox, oldest on the left.
 *
 * The y-scale is padded by 5% of the range so the extremes don't sit exactly on
 * the border, and a flat series (every value identical, which is common with
 * only two weigh-ins) is centred rather than divided by a zero range.
 */
export function chartGeometry(series: SeriesPoint[], options: ChartOptions = {}): ChartGeometry {
  const { width = 320, height = 120, padding = 4, domain, dateSpan } = options

  if (series.length === 0) {
    return {
      width,
      height,
      line: '',
      area: '',
      points: [],
      min: domain?.min ?? 0,
      max: domain?.max ?? 0,
    }
  }

  let min: number
  let max: number
  if (domain) {
    ;({ min, max } = domain)
  } else {
    const values = series.map((p) => p.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    // A flat line still needs a non-zero range to divide by; half a unit either
    // side keeps it centred without exaggerating the scale.
    const pad = rawMax === rawMin ? 0.5 : (rawMax - rawMin) * 0.05
    min = rawMin - pad
    max = rawMax + pad
  }
  // Guard against a caller-supplied zero-width domain.
  if (max === min) {
    min -= 0.5
    max += 0.5
  }

  const innerW = Math.max(0, width - padding * 2)
  const innerH = Math.max(0, height - padding * 2)
  const origin = dateSpan?.from ?? series[0].date
  const end = dateSpan?.to ?? series[series.length - 1].date
  const span = Math.max(1, diffDays(origin, end))

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

/**
 * A padded value range covering every given series, for charts that overlay
 * more than one (raw weigh-ins behind a smoothed trend, say). Pass the result
 * as `ChartOptions.domain` to every series so they share one scale.
 */
export function sharedDomain(...series: SeriesPoint[][]): { min: number; max: number } | undefined {
  const values = series.flat().map((p) => p.value)
  if (values.length === 0) return undefined

  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const pad = rawMax === rawMin ? 0.5 : (rawMax - rawMin) * 0.05
  return { min: rawMin - pad, max: rawMax + pad }
}

/** Two decimals is plenty for path data and keeps the DOM readable. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

import { useId } from 'react'
import { chartGeometry, sharedDomain, type SeriesPoint } from '@/lib/trend'

/**
 * A small line chart over a dated series — raw readings as dots, the smoothed
 * trend as the line.
 *
 * All the maths lives in lib/trend.ts; this only turns coordinates into SVG,
 * the same division ProgressRing keeps with RING/ringOffset. The chart scales
 * to its container (`preserveAspectRatio="none"` is deliberately *not* used, so
 * the stroke stays even) and is labelled for screen readers by `label`, since
 * the series itself conveys nothing to them.
 *
 * Paints go through `style` rather than the `fill`/`stroke`/`stop-color`
 * presentation attributes: callers pass `rgb(var(--…))` references so the chart
 * follows the theme, and var() is not substituted inside those attributes.
 *
 * The line traces itself and the readings pop in behind it — the Trace token in
 * src/lib/motion.ts. Switching the range remounts the points (they are keyed by
 * date), so the chart re-draws on every range change, which is the moment the
 * shape of the series actually changes and is worth watching.
 */

/** Head start before the first reading lands, so the line is already moving. */
const POP_LEAD_MS = 300
/**
 * How long the readings take to arrive, end to end.
 *
 * Fixed rather than a per-point interval: a year's range holds several hundred
 * dots, and 85ms apiece — which is what a 10-point sketch wants — would take
 * half a minute to finish. Spreading a constant window across however many
 * points there are keeps the sequence readable at 10 and bounded at 365.
 */
const POP_SPREAD_MS = 700

/** When the `i`th of `count` readings lands, in ms from the chart appearing. */
function popDelay(i: number, count: number): number {
  return POP_LEAD_MS + (count > 1 ? (i / (count - 1)) * POP_SPREAD_MS : 0)
}
export function TrendChart({
  trend,
  raw = [],
  color,
  tint,
  label,
  height = 120,
  className,
}: {
  /** The smoothed series — what the line is drawn through. */
  trend: SeriesPoint[]
  /** Optional raw readings, drawn as faint dots behind the line. */
  raw?: SeriesPoint[]
  color: string
  tint: string
  label: string
  height?: number
  className?: string
}) {
  const gradientId = useId()
  const width = 320

  // Both series must be plotted on one scale, or the dots drift off the line.
  const all = [...raw, ...trend].sort((a, b) => a.date.localeCompare(b.date))
  const domain = sharedDomain(trend, raw)
  const dateSpan =
    all.length > 0 ? { from: all[0].date, to: all[all.length - 1].date } : undefined
  const opts = { width, height, padding: 6, domain, dateSpan }

  const geo = chartGeometry(trend, opts)
  const rawGeo = chartGeometry(raw, opts)

  if (geo.points.length === 0) return null

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className ?? ''}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      <path className="animate-trace-fill" d={geo.area} fill={`url(#${gradientId})`} />

      {/* Raw weigh-ins: visible enough to show the scatter the trend smooths
          out, faint enough not to compete with the line. They land left to
          right, under the line that is drawing over them.

          `transform-origin` is in user units, not a percentage: a percentage
          would resolve against the dot's own 4px box and scale it about a
          corner of the viewBox instead of about itself. */}
      {rawGeo.points.map((p, i) => (
        <circle
          key={p.date}
          className="animate-pop"
          cx={p.x}
          cy={p.y}
          r={2}
          strokeWidth={1}
          style={{
            fill: tint,
            stroke: color,
            transformOrigin: `${p.x}px ${p.y}px`,
            animationDelay: `${popDelay(i, rawGeo.points.length)}ms`,
          }}
        />
      ))}

      <path
        className="animate-trace"
        d={geo.line}
        fill="none"
        // pathLength normalises the line to 1 unit long, so the dash pattern —
        // and the keyframe that animates it — can be written as a fraction
        // without measuring the path. The dasharray is one full-length dash, so
        // the finished state is an unbroken line.
        pathLength={1}
        style={{ stroke: color, strokeDasharray: 1, strokeDashoffset: 0 }}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The most recent point, emphasised — it's the number the user came for.
          Its halo is the card it sits on rather than white, so the dot still
          reads as lifted off the surface in the dark scheme. It pops last, as
          the line reaches it. */}
      <circle
        className="animate-pop stroke-[rgb(var(--trend-dot))]"
        cx={geo.points[geo.points.length - 1].x}
        cy={geo.points[geo.points.length - 1].y}
        r={4}
        style={{
          fill: color,
          transformOrigin: `${geo.points[geo.points.length - 1].x}px ${geo.points[geo.points.length - 1].y}px`,
          animationDelay: `${POP_LEAD_MS + POP_SPREAD_MS}ms`,
        }}
        strokeWidth={2}
      />
    </svg>
  )
}

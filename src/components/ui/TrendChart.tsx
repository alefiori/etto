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
 */
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
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={geo.area} fill={`url(#${gradientId})`} />

      {/* Raw weigh-ins: visible enough to show the scatter the trend smooths
          out, faint enough not to compete with the line. */}
      {rawGeo.points.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r={2} fill={tint} stroke={color} strokeWidth={1} />
      ))}

      <path
        d={geo.line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* The most recent point, emphasised — it's the number the user came for. */}
      <circle
        cx={geo.points[geo.points.length - 1].x}
        cy={geo.points[geo.points.length - 1].y}
        r={4}
        fill={color}
        stroke="#ffffff"
        strokeWidth={2}
      />
    </svg>
  )
}

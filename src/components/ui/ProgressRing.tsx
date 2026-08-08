import { RING, ringOffset } from '@/lib/macros'

/**
 * SVG macro progress ring — viewBox 100×100, r=45, stroke-width 10,
 * circumference ≈283, rounded linecaps, tinted track in the macro color.
 * The progress arc's stroke-dashoffset is driven by consumed/target.
 *
 * `color` and `trackColor` are applied through `style` rather than the `stroke`
 * presentation attribute so that a `rgb(var(--carbs))` reference resolves:
 * var() substitution does not happen inside presentation attributes, which is
 * how the accents in lib/constants.ts are expressed so they can flip with the
 * theme.
 */
export function ProgressRing({
  consumed,
  target,
  color,
  trackColor,
  size = 120,
  className,
  children,
}: {
  consumed: number
  target: number
  color: string
  trackColor: string
  size?: number
  className?: string
  children?: React.ReactNode
}) {
  const offset = ringOffset(consumed, target)

  return (
    <div
      className={`relative ${className ?? ''}`}
      style={className ? undefined : { width: size, height: size }}
    >
      <svg className="h-full w-full" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={RING.radius}
          fill="none"
          style={{ stroke: trackColor }}
          strokeWidth={RING.strokeWidth}
        />
        <circle
          className="macro-ring"
          cx="50"
          cy="50"
          r={RING.radius}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={RING.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={RING.circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

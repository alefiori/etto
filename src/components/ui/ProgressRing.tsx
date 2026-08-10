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
      {/* overflow-visible so the arc's halo isn't clipped: at r=45 with a 10
          stroke the ring already reaches the edge of the 100×100 viewBox. */}
      <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100">
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
          // The arc glows in its own colour. On glass a flat stroke sits *in*
          // the card rather than on it; the halo is what puts it in front of
          // the blur, and it has to be inline because the colour is a prop.
          style={{
            stroke: color,
            filter: `drop-shadow(0 1px 4px color-mix(in srgb, ${color} 42%, transparent))`,
          }}
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

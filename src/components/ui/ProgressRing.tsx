import { useEffect, useRef } from 'react'
import { RING, ringOffset } from '@/lib/macros'
import { MOTION, prefersReducedMotion } from '@/lib/motion'

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
 *
 * The arc draws itself once, from empty, the first time it has anything to
 * draw. See the Draw token in src/lib/motion.ts.
 */
export function ProgressRing({
  consumed,
  target,
  color,
  trackColor,
  size = 120,
  drawDelay = 120,
  className,
  children,
}: {
  consumed: number
  target: number
  color: string
  trackColor: string
  size?: number
  /** Stagger, in ms, for a row of dials. See `drawDelay()` in lib/motion.ts. */
  drawDelay?: number
  className?: string
  children?: React.ReactNode
}) {
  const offset = ringOffset(consumed, target)
  const arcRef = useRef<SVGCircleElement>(null)
  const drawnRef = useRef(false)

  /**
   * Draw the arc from empty, once.
   *
   * Not a mount effect, because at mount there is usually nothing to draw: the
   * dial renders as soon as the day's *targets* resolve, and the logs that fill
   * it land a moment later. Firing on mount would spend the entrance sweeping
   * zero to zero and leave the real numbers to appear by transition. So it
   * waits for the first offset that describes an actual arc, and the ordinary
   * `.macro-ring` transition carries every change after that.
   *
   * "An actual arc" is asked of the inputs rather than of `offset`, because
   * `ringOffset` rounds to two decimals: an empty ring comes back as 282.74
   * against a circumference of 282.7433…, so comparing the two would call every
   * empty dial a drawable one and burn the entrance on it.
   *
   * A day with no target never produces an arc either, which is correct —
   * there is no progress to report, and an empty ring drawing an empty ring is
   * a waste of frame budget on a phone that is still fetching.
   */
  const hasArc = target > 0 && consumed > 0

  useEffect(() => {
    const arc = arcRef.current
    if (drawnRef.current || !arc || !hasArc) return
    drawnRef.current = true
    // jsdom has no Web Animations, and a reduced-motion user gets the finished
    // arc. Both leave `drawnRef` set: the entrance is spent either way, and a
    // later data change must not be mistaken for a first paint.
    if (prefersReducedMotion() || typeof arc.animate !== 'function') return
    arc.animate([{ strokeDashoffset: RING.circumference }, { strokeDashoffset: offset }], {
      duration: MOTION.draw.duration,
      delay: drawDelay,
      easing: MOTION.draw.easing,
      // Holds the empty ring through the stagger, and hands the property back
      // to the stylesheet the moment the sweep lands.
      fill: 'backwards',
    })
  }, [hasArc, offset, drawDelay])

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
          ref={arcRef}
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

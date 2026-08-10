/**
 * The motion system, for the animations that have to be driven from JavaScript.
 *
 * Glass moves like glass: nothing snaps. Everything settles on a decelerating
 * curve, dials draw rather than appear, and the ambient light behind the lenses
 * breathes on a slow loop so the chrome never feels frozen.
 *
 * There are five named tokens, and every animation in the app is one of them:
 *
 *   Settle  320ms   Hover lifts, tab and rail selection, press rebound
 *   Draw   1250ms   Macro and calorie dials filling from zero on load
 *   Trace  1100ms   Weight trend line, with points popping in sequence
 *   Rise    650ms   Cards entering — 16px up, staggered by group
 *   Breathe 6.5–8s  Ambient glow behind each lens, looping
 *
 * Most of them are pure CSS and live in src/index.css as `--dur-*` / `--ease-*`
 * pairs and the `.animate-*` classes; the values here are the same numbers for
 * the two that cannot be: a ring drawing from empty to *its own* offset, and a
 * per-point stagger whose length depends on how many points there are. Keep the
 * two sides in step — a token that means 650ms in CSS and 600ms here is worse
 * than no token at all.
 */
export const MOTION = {
  settle: { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
  draw: { duration: 1250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  trace: { duration: 1100, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
  rise: { duration: 650, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
} as const

/**
 * The stagger for a row of dials: 120ms before the first, then 70ms between
 * each, restarting every third so a fourth ring in a *different* column doesn't
 * inherit a delay earned by the row next to it.
 */
export function drawDelay(index: number): number {
  return 120 + (index % 3) * 70
}

/**
 * Read the user's motion preference at call time rather than through a hook.
 *
 * The CSS half of the system is switched off by a `prefers-reduced-motion`
 * block in src/index.css, which needs no JavaScript at all; this exists only so
 * the two Web Animations calls can bail out the same way. It is deliberately
 * not reactive — the answer only matters at the instant an entrance animation
 * would start, and a mid-flight change of preference has nothing to re-render.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

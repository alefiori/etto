import { useI18n } from '@/context/I18nContext'
import { Icon } from '@/components/ui/Icon'
import type { PullPhase } from '@/hooks/usePullToRefresh'

interface Props {
  phase: PullPhase
  distance: number
  /** 0…1 towards the point where releasing fires. */
  progress: number
  /** What the live region should say, or null for silence. */
  announce: 'refreshing' | 'refreshed' | null
  /** Fires the same refresh the gesture does. */
  onRefresh: () => void
  /** False on a page with nothing to refresh — the whole affordance goes. */
  enabled: boolean
}

/**
 * The pull-to-refresh affordance: an indicator that follows the finger, and a
 * button for everyone not using one.
 *
 * The indicator is all that moves. A pull that pushed the page down with it
 * would feel more native, but the transform that takes it there would also make
 * the content lane a containing block for its `position: fixed` descendants —
 * the same trap documented on `.glass::before` and worked around in the
 * entrance animations, and here it would catch every dialog on the page for as
 * long as the gesture lasts. A spinner sliding out from under the top bar reads
 * clearly enough on its own; iOS Safari's own does no more.
 *
 * The button is `sr-only` until focused, the pattern the skip link already
 * uses. The gesture answers a finger and a trackpad, and neither is universal:
 * a keyboard or switch user can perform neither, and in the native builds
 * there is no F5 to fall back on. Visible chrome for it would mean a button on
 * every page that most people would never press.
 */
export function PullToRefresh({
  phase,
  distance,
  progress,
  announce,
  onRefresh,
  enabled,
}: Props) {
  const { t } = useI18n()

  if (!enabled) return null

  const refreshing = phase === 'refreshing'
  // Past the threshold the arrow has turned over: half a turn while you pull,
  // and the flip at the end is the "let go now" signal.
  const spin = refreshing ? 0 : progress * 180

  return (
    <>
      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:font-label-md focus:text-label-md focus:text-on-primary"
      >
        {t('common.refresh')}
      </button>

      {/* `h-0`: the indicator is drawn over the top of the page rather than
          pushing it down, so nothing reflows while the finger moves. */}
      {/* Hidden from assistive tech throughout: the spinner says nothing the
          live region below does not say better. */}
      {/* `z-30`: the cards below are glass — `backdrop-filter` makes each one
          a stacking context of its own, and in document order they paint over
          an indicator that shares their z-index. Under the top bar (z-40), so
          it still emerges from beneath it. */}
      <div className="pointer-events-none relative z-30 h-0" aria-hidden>
        <div
          // `settle` while it springs back or holds, nothing while a finger is
          // on it — a transition during the drag lags the gesture. It also
          // means the spring-back honours prefers-reduced-motion, which an
          // inline transition would not.
          className={`absolute left-1/2 top-0 flex h-10 w-10 items-center justify-center rounded-full text-primary glass-chrome ${
            phase === 'pulling' ? '' : 'settle'
          }`}
          style={{
            // translate(-50%) here rather than as a class, since the pull
            // distance has to go in the same transform.
            transform: `translate(-50%, ${distance - 44}px) scale(${0.7 + progress * 0.3})`,
            opacity: refreshing ? 1 : progress,
          }}
        >
          {refreshing ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Icon
              name="refresh"
              className="text-[1.25rem]"
              style={{ transform: `rotate(${spin}deg)` }}
            />
          )}
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce === 'refreshing' ? t('common.refreshing') : ''}
        {announce === 'refreshed' ? t('common.refreshed') : ''}
      </span>
    </>
  )
}

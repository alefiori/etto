import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** How far the indicator travels before the gesture will fire. */
const THRESHOLD = 64
/** Where it stops, however hard the pull is. */
const MAX = 96
/** Where it rests while the handler runs. */
const REST = 56
/**
 * A finger travels twice the distance the indicator does. Rubber-banding is
 * what tells you the surface is resisting rather than scrolling — without it
 * the indicator arrives instantly and the gesture fires on any stray downward
 * flick at the top of a list.
 */
const DAMPING = 0.5
/**
 * The same resistance for a trackpad, a little firmer. A two-finger scroll
 * reports its delta in scrolled pixels, which are cheaper to produce than
 * dragged ones — the surface has to push back harder to feel the same.
 */
const WHEEL_DAMPING = 0.35
/**
 * A wheel gesture has no end event, so one is inferred: this long without a
 * `wheel` and the fingers are off the trackpad.
 */
const WHEEL_END_MS = 140
/**
 * And no start event either, which is what these two are for. A trackpad
 * reports a pull as a stream of small deltas over hundreds of milliseconds; a
 * mouse reports one flick of the wheel as a single delta of 100 or so. Without
 * a floor under both, one notch of a wheel at the top of the dashboard would
 * refetch it.
 */
const WHEEL_MIN_MS = 150
const WHEEL_MIN_EVENTS = 3
/**
 * A refresh over a warm cache can finish in 40ms, which reads as a flicker
 * rather than as an answer. Holding the indicator for a beat makes it a
 * response — and the delay is *after* the data lands, so nothing waits on it.
 */
const MIN_VISIBLE = 450

export type PullPhase = 'idle' | 'pulling' | 'refreshing'

interface Options {
  /** The scroll container the gesture reads — `<main>`, in this app. */
  scrollRef: RefObject<HTMLElement | null>
  /** What refreshing means here. Rejections are swallowed; see below. */
  onRefresh: () => Promise<unknown>
  /** False on a page that has registered no handler. */
  enabled: boolean
}

/**
 * Pull down at the top of a scroll container to refetch — the gesture every
 * mobile browser and native app has trained people to expect, and its
 * trackpad equivalent: keep two-finger scrolling up once there is nothing left
 * to scroll.
 *
 * It is implemented rather than inherited because there is nothing to inherit:
 * the native gesture belongs to whatever is scrolling the *document*, and in
 * this app the document does not scroll. `<main>` does, inside a `h-dvh
 * overflow-hidden` shell, and on iOS the WebView's own scrolling is switched
 * off entirely (`scrollEnabled: false` in capacitor.config.ts). So Chrome's
 * pull-to-refresh never fires here, and in the native builds there is no
 * browser chrome to reload from at all.
 *
 * Both gestures answer to the same state, because they are the same gesture:
 * the surface has run out and you keep going. What differs is where the ends
 * are. A finger announces both of them, and a wheel announces neither, so the
 * wheel path infers them from the gaps between events — and refuses to start
 * unless the container was *already* at the top when the gesture began, which
 * is what keeps a fast flick up from the middle of a long list from refreshing
 * the page as it lands.
 *
 * Neither one is a substitute for a control: a wheel is not universal either.
 * The button `PullToRefresh` renders is what a keyboard or switch user gets.
 *
 * The listeners are attached by hand rather than through JSX because the move
 * handlers have to `preventDefault()` — React registers `touchmove` and
 * `wheel` at the root as passive, where that call is a no-op and the container
 * rubber-bands out from under the indicator.
 */
export function usePullToRefresh({ scrollRef, onRefresh, enabled }: Options) {
  const [phase, setPhase] = useState<PullPhase>('idle')
  const [distance, setDistance] = useState(0)
  /** True for a few seconds after a refresh lands — see the note on `announce`. */
  const [justRefreshed, setJustRefreshed] = useState(false)

  // The gesture reads the handler on every touchmove, and a stale one would
  // refetch the page the user has already navigated away from.
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  // The touch listeners are plain DOM handlers with no access to the render's
  // `phase`, so it is mirrored here — written only alongside the state, never
  // during a render.
  const phaseRef = useRef<PullPhase>('idle')
  const applyPhase = useCallback((next: PullPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const announceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(holdTimer.current)
      clearTimeout(announceTimer.current)
    }
  }, [])

  const run = useCallback(async () => {
    if (phaseRef.current === 'refreshing') return
    applyPhase('refreshing')
    setDistance(REST)
    setJustRefreshed(false)
    const started = Date.now()
    try {
      await onRefreshRef.current()
    } catch {
      // Deliberately swallowed. Every page's refetch reports its own failure in
      // its own error state — an empty list says "couldn't load your foods"
      // where this could only say "something went wrong". What this owes the
      // user is that the spinner stops either way.
    }
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(
      () => {
        if (!alive.current) return
        applyPhase('idle')
        setDistance(0)
        // The spinner stopping is the sighted answer; this is the other one.
        setJustRefreshed(true)
        clearTimeout(announceTimer.current)
        announceTimer.current = setTimeout(() => {
          if (alive.current) setJustRefreshed(false)
        }, 3000)
      },
      Math.max(0, MIN_VISIBLE - (Date.now() - started)),
    )
  }, [applyPhase])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !enabled) return

    // Null except while a pull that started at the top is still live.
    let startY: number | null = null
    let pulled = 0

    const reset = () => {
      startY = null
      pulled = 0
    }

    const onStart = (e: TouchEvent) => {
      // A second finger means a pinch or a two-finger scroll, neither of which
      // is this gesture; and a refresh already running owns the indicator.
      if (e.touches.length !== 1 || phaseRef.current === 'refreshing') return reset()
      if (el.scrollTop > 0) return reset()
      // An overlay owns the screen. Most of them render as siblings of the
      // content lane, so their touches never reach these listeners at all —
      // but the guest banner's sheet is inside it, and a drag down its face
      // would otherwise refresh the page behind it. `position: fixed` on the
      // body is what useScrollLock sets, and every overlay goes through it.
      if (document.body.style.position === 'fixed') return reset()
      startY = e.touches[0].clientY
      pulled = 0
    }

    const onMove = (e: TouchEvent) => {
      if (startY === null || e.touches.length !== 1) return
      // Scrolled away mid-gesture (momentum from a previous flick, say): this
      // is a scroll, not a pull, and the container should have it.
      if (el.scrollTop > 0) {
        if (pulled) setDistance(0)
        return reset()
      }
      const raw = e.touches[0].clientY - startY
      if (raw <= 0) {
        // Pulled down, then back up past the start: let go of the gesture
        // rather than holding the container hostage for the rest of the drag.
        if (pulled) {
          setDistance(0)
          applyPhase('idle')
        }
        return reset()
      }
      // Without this the container overscrolls behind the indicator — a bounce
      // on iOS, Chrome's own pull-to-refresh on an Android install.
      if (e.cancelable) e.preventDefault()
      pulled = Math.min(MAX, raw * DAMPING)
      setDistance(pulled)
      if (phaseRef.current !== 'pulling') applyPhase('pulling')
    }

    const onEnd = () => {
      if (startY === null) return
      const far = pulled >= THRESHOLD
      reset()
      if (far) {
        void run()
      } else {
        applyPhase('idle')
        setDistance(0)
      }
    }


    // The same gesture on a trackpad: keep scrolling up with nothing left to
    // scroll. Its whole difficulty is that a wheel stream has no edges — see
    // the note at the top of the file.
    let wheelPulled = 0
    let wheelEvents = 0
    let wheelStarted = 0
    /** Null between gestures. False for one that began partway down the page. */
    let mayPull: boolean | null = null
    let wheelIdle: ReturnType<typeof setTimeout> | undefined

    const springBack = () => {
      wheelPulled = 0
      if (phaseRef.current === 'pulling') {
        applyPhase('idle')
        setDistance(0)
      }
    }

    /** No wheel events for a beat: the fingers are off the trackpad. */
    const endWheel = () => {
      wheelIdle = undefined
      mayPull = null
      wheelEvents = 0
      // Only ever the spring-back: a gesture that reached the threshold fired
      // there and then, rather than here.
      springBack()
    }

    const onWheel = (e: WheelEvent) => {
      if (phaseRef.current === 'refreshing') return
      if (document.body.style.position === 'fixed') return

      // First event of a gesture. Whether it is allowed to pull at all is
      // decided once, here: a flick that starts halfway down a long list and
      // coasts into the top is a scroll arriving, not a pull.
      if (mayPull === null) {
        mayPull = el.scrollTop <= 0
        wheelStarted = Date.now()
        wheelEvents = 0
        wheelPulled = 0
      }
      clearTimeout(wheelIdle)
      wheelIdle = setTimeout(endWheel, WHEEL_END_MS)

      // deltaY < 0 is a scroll upwards. Anything else — scrolling down, or a
      // gesture that never qualified — leaves the container to it.
      if (!mayPull || e.deltaY >= 0 || el.scrollTop > 0) {
        if (wheelPulled) springBack()
        return
      }

      if (e.cancelable) e.preventDefault()
      wheelEvents += 1
      wheelPulled = Math.min(MAX, wheelPulled - e.deltaY * WHEEL_DAMPING)
      setDistance(wheelPulled)
      if (phaseRef.current !== 'pulling') applyPhase('pulling')

      if (
        wheelPulled >= THRESHOLD &&
        wheelEvents >= WHEEL_MIN_EVENTS &&
        Date.now() - wheelStarted >= WHEEL_MIN_MS
      ) {
        // Fires on the crossing rather than at the end of the gesture, because
        // there is no end to wait for that the user would recognise: trackpad
        // momentum keeps the events coming for a second after they have let
        // go, and a full indicator sitting there through it reads as a hang.
        mayPull = false
        wheelPulled = 0
        void run()
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    // Non-passive: these two call preventDefault().
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      clearTimeout(wheelIdle)
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [scrollRef, enabled, run, applyPhase])

  // A page can unregister its handler (or the user can navigate) mid-pull.
  useEffect(() => {
    if (!enabled && phaseRef.current === 'pulling') {
      applyPhase('idle')
      setDistance(0)
    }
  }, [enabled, applyPhase])

  return {
    phase,
    distance,
    /** 0…1 towards the threshold — what the indicator draws itself from. */
    progress: Math.min(1, distance / THRESHOLD),
    /**
     * What to say out loud, if anything. A screen reader user gets no spinner,
     * so the refresh has to announce both that it started and that it finished
     * — and "finished" has no event of its own to hang on.
     */
    announce: (phase === 'refreshing' ? 'refreshing' : justRefreshed ? 'refreshed' : null) as
      | 'refreshing'
      | 'refreshed'
      | null,
    /** The same refresh, for the button that pointer and keyboard users get. */
    refresh: run,
  }
}

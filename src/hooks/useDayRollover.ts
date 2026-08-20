import { useEffect, useRef } from 'react'
import { todayISO } from '@/lib/date'
import { isNativePlatform } from '@/lib/platform'

/**
 * Call `onRollover` when the app comes back to the foreground on a later day
 * than the one it was left on.
 *
 * Backgrounding doesn't tear the app down — the WebView is suspended and
 * resumed with every bit of state intact — so someone who logs dinner and
 * re-opens the app at breakfast lands on yesterday, silently adding today's
 * food to yesterday's totals. Re-reading the clock on resume is what closes
 * that gap.
 *
 * Only a *changed* day fires: glancing at a notification and coming straight
 * back must not yank someone off the past day they were deliberately reading.
 * Nothing fires while the app is in the foreground either — midnight arriving
 * mid-edit is no reason to move the ground under a half-finished entry.
 */
export function useDayRollover(onRollover: (today: string) => void): void {
  // Kept in a ref so a caller passing an inline closure doesn't re-subscribe on
  // every render — the listeners only ever need the latest callback. Updated in
  // an effect rather than during render: the listeners can only fire after a
  // commit, so there is nothing to gain from writing it earlier.
  const callback = useRef(onRollover)
  useEffect(() => {
    callback.current = onRollover
  })

  useEffect(() => {
    let lastSeen = todayISO()

    function check() {
      const today = todayISO()
      if (today === lastSeen) return
      lastSeen = today
      callback.current(today)
    }

    // The web (and installed PWA) path: a hidden tab, a locked phone, a
    // switched window. `focus` covers the desktop case where the window is
    // never actually hidden, only sent behind another one.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', check)

    // The native shells report their own lifecycle, which is the reliable
    // signal there — iOS in particular can suspend the WebView without a
    // visibilitychange ever reaching it. Both paths run `check`, and it is
    // idempotent, so firing twice on one resume is harmless.
    let removeNative: (() => void) | undefined
    let cancelled = false
    if (isNativePlatform()) {
      void (async () => {
        try {
          const { App } = await import('@capacitor/app')
          const handle = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) check()
          })
          if (cancelled) void handle.remove()
          else removeNative = () => void handle.remove()
        } catch {
          // No App plugin: the DOM listeners above are all there is.
        }
      })()
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', check)
      removeNative?.()
    }
  }, [])
}

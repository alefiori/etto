import { useEffect, type RefObject } from 'react'

/**
 * Publish the phone chrome's real height, so the content lane can reserve
 * exactly it.
 *
 * `--spacing-topbar` and `--spacing-bottomnav` used to be constants — 72px and
 * 112px — measured off the design once and then trusted forever. That held
 * only because the chrome could not change size, which in turn held only
 * because the app refused the reader's text-size setting. Now that it honours
 * it (see lib/textScale.ts), a top bar holding a scaled wordmark is taller than
 * 72px, and a tab bar holding scaled labels is taller than 68px. Keeping the
 * constants would mean the first card sliding under the bar at the top and the
 * last one under the tab bar at the bottom — text hidden behind chrome, which
 * is the failure the constants were originally protecting against.
 *
 * So the numbers are measured instead of assumed. A `ResizeObserver` on each
 * piece writes its height to a custom property on `<html>`, and the spacing
 * tokens in index.css are `calc()`s over those. It costs two observers and
 * fires only when the chrome actually changes shape — a text-size change, an
 * orientation change, a longer label in a different language.
 *
 * Both properties keep the old constants as `var()` fallbacks, so the layout is
 * correct on the first paint, before either observer has reported, and stays
 * correct at widths where the chrome isn't rendered at all.
 */
export function useChromeMetrics(
  topRef: RefObject<HTMLElement | null>,
  bottomRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const root = document.documentElement
    // `ResizeObserver` is in every browser this app targets, but not in jsdom,
    // where the unit tests render the whole shell.
    if (typeof ResizeObserver === 'undefined') return

    const watch = (el: HTMLElement | null, prop: string) => {
      if (!el) return () => {}
      const observer = new ResizeObserver(([entry]) => {
        // `borderBoxSize` over `getBoundingClientRect`, because the tab bar is
        // `scale`d on press and a rect would report the animating size.
        const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
        if (height > 0) root.style.setProperty(prop, `${Math.ceil(height)}px`)
      })
      observer.observe(el)
      return () => {
        observer.disconnect()
        // Hand the token back to its fallback rather than leaving a stale
        // measurement behind — at desktop widths this chrome unmounts, and a
        // remembered phone height would pad the page for chrome that is gone.
        root.style.removeProperty(prop)
      }
    }

    const stopTop = watch(topRef.current, '--chrome-top')
    const stopBottom = watch(bottomRef.current, '--chrome-bottom')
    return () => {
      stopTop()
      stopBottom()
    }
  }, [topRef, bottomRef])
}

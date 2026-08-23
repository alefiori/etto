/**
 * Honour the reader's preferred text size.
 *
 * The app used to refuse it. `text-size-adjust: 100%` in the stylesheet and
 * `setTextZoom(100)` in the Android shell together pinned every glyph at the
 * size the design drew it, because a larger system font overflowed chrome
 * built out of fixed pixel heights. That is a hard failure of WCAG 1.4.4: the
 * one accessibility setting a low-vision reader is most likely to have already
 * turned on was the one the app went out of its way to ignore.
 *
 * The chrome is fluid now (see useChromeMetrics and the rem type scale in
 * index.css), so the scale can be let through. Each platform delivers it
 * differently, and this module's job is to end up with one number regardless:
 *
 *  - **Web.** The browser's default-font-size setting moves the root font size,
 *    and every size in the app is expressed against it. Nothing to apply.
 *  - **Android.** WebView multiplies *computed* font sizes by the system font
 *    scale once the native pin is gone, so `rem` follows it for free. Nothing
 *    to apply — but it has to be detected, because the number is not visible in
 *    any style value, only in what actually gets rendered.
 *  - **iOS.** WKWebView ignores Dynamic Type outright, and there is no setting
 *    to flip. What it does support is the `-apple-system-body` font keyword,
 *    which resolves to the reader's chosen body size — so the scale is measured
 *    off a probe and applied to the root here.
 *
 * Capped at 200%. iOS accessibility sizes reach ~3.1× against a 17px default,
 * and at that point a phone shows two words a line and the app is unusable in a
 * different way. WCAG asks for 200%, so 200% is what is built and tested for;
 * past that the OS zoom serves the reader better, because it pans rather than
 * reflows.
 */

/** iOS's default body size, which `-apple-system-body` reports at 1×. */
const IOS_BODY_BASELINE_PX = 17

/** The size the probe asks for, and therefore what 1× renders as. */
const PROBE_BASELINE_PX = 16

/** The range the layout is built to absorb. 1.0 is the drawn design. */
export const MIN_TEXT_SCALE = 1
export const MAX_TEXT_SCALE = 2

/**
 * Where the chrome stops showing its micro-labels.
 *
 * The tab bar and the rail label their destinations at 10px under a 24px icon.
 * Scaled past roughly a third larger, four of those labels plus the add button
 * no longer share a phone's width, and the choice is between truncating them to
 * two letters and dropping them. Dropping them is the better trade: the icons
 * are distinct, the accessible name is unchanged either way (it comes from the
 * text, which stays in the DOM), and two letters of a word help nobody.
 */
export const CHROME_LABEL_MAX_SCALE = 1.35

/** Clamp to the supported range, and reject anything that isn't a number. */
export function clampScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale))
}

/**
 * The reader's Dynamic Type scale, measured off an off-screen probe.
 *
 * Returns 1 anywhere the keyword is not honoured — every engine but WebKit,
 * including jsdom — because there the probe inherits the ordinary font size and
 * the ratio comes out at or below the baseline.
 */
export function measureIOSTextScale(doc: Document = document): number {
  return withProbe(doc, 'font:-apple-system-body', (probe) => {
    const measured = parseFloat(getComputedStyle(probe).fontSize)
    if (!Number.isFinite(measured) || measured <= 0) return 1
    return measured / IOS_BODY_BASELINE_PX
  })
}

/**
 * The scale actually being rendered at, measured off what a known size draws as.
 *
 * This is the Android case, and it cannot be read from a style value: WebView's
 * `textZoom` multiplies font sizes during layout, so a span that *asks* for
 * 16px still reports 16px to `getComputedStyle` while rendering at 24. The only
 * honest measurement is the box it ends up occupying — hence `line-height: 1`,
 * which makes the rendered height equal to the rendered font size.
 *
 * It picks up a browser's default-font-size setting on the web too, for free.
 */
export function measureRenderedTextScale(doc: Document = document): number {
  return withProbe(
    doc,
    `font-size:${PROBE_BASELINE_PX}px;line-height:1;display:block`,
    (probe) => {
      probe.textContent = 'M'
      const height = probe.getBoundingClientRect().height
      if (!Number.isFinite(height) || height <= 0) return 1
      return height / PROBE_BASELINE_PX
    },
  )
}

/** The scale to lay out at: whichever signal reports the larger one. */
export function measureTextScale(doc: Document = document): number {
  return clampScale(Math.max(measureIOSTextScale(doc), measureRenderedTextScale(doc)))
}

/**
 * Apply a scale to the document root.
 *
 * Written as a font-size on `<html>` rather than a transform, so the app
 * reflows into the space it has instead of being magnified and clipped. Every
 * type size, and every chrome dimension that has to hold type, is expressed in
 * `rem` for exactly this reason.
 *
 * Two things are published alongside it: `--text-scale`, for the rare rule that
 * wants the number, and `data-text-scale`, which is what the chrome styles off
 * — CSS has no way to compare a custom property against a threshold, so the
 * comparison is made here and the answer written as an attribute.
 */
export function applyTextScale(scale: number, doc: Document = document): void {
  const clamped = clampScale(scale)
  const root = doc.documentElement

  root.style.setProperty('--text-scale', String(clamped))
  root.dataset.textScale = clamped > CHROME_LABEL_MAX_SCALE ? 'large' : 'base'

  // Only iOS needs the root moved: everywhere else the platform has already
  // scaled what it renders, and setting a size here would multiply it again.
  const needsRootScale = measureIOSTextScale(doc) > 1
  // 1 means "whatever the browser's own default is" — on the web that is the
  // reader's browser setting, and overwriting it would be the same refusal in a
  // new place.
  //
  // The unit is `rem` deliberately, despite this *being* the root: on the root
  // element `rem` resolves against the initial font size, i.e. the browser's
  // own default. So `1.4rem` is "40% larger than this reader's default", which
  // composes with a browser setting rather than replacing it. `px` would not.
  if (!needsRootScale || clamped === 1) root.style.removeProperty('font-size')
  else root.style.fontSize = `${clamped}rem`
}

/**
 * Measure at start-up, and again whenever the platform re-lays-out.
 *
 * Returns a teardown. Safe to call anywhere: where nothing scales, the
 * measurement is 1 and applying it is a no-op.
 */
export function initTextScale(win: Window = window): () => void {
  const sync = () => applyTextScale(measureTextScale(win.document), win.document)
  sync()

  // No platform fires a "text size changed" event a web view can hear, so
  // re-measure on the two moments that bracket a trip to Settings and back:
  // `pageshow` when the document is restored, and `resize`, which both WebViews
  // fire when they re-lay-out at the new metrics.
  win.addEventListener('resize', sync)
  win.addEventListener('pageshow', sync)

  return () => {
    win.removeEventListener('resize', sync)
    win.removeEventListener('pageshow', sync)
  }
}

/** Run `read` against a throwaway element, and always clean it up. */
function withProbe(doc: Document, css: string, read: (probe: HTMLElement) => number): number {
  const body = doc.body
  if (!body) return 1
  const probe = doc.createElement('span')
  // Out of flow and invisible: it must not reflow anything or be seen, and it
  // is gone again before this function returns.
  probe.style.cssText = `position:fixed;top:-9999px;left:-9999px;visibility:hidden;${css}`
  body.appendChild(probe)
  try {
    const value = read(probe)
    return Number.isFinite(value) && value > 0 ? value : 1
  } finally {
    probe.remove()
  }
}

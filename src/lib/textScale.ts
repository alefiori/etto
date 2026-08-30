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
 *  - **Android.** WebView's `textZoom` — which is where the system font-size
 *    setting arrives — is implemented in Chromium as the text-autosizing font
 *    scale factor, and `text-size-adjust: none` (which the app sets, see below)
 *    switches that off along with everything else automatic. So the number is
 *    invisible twice over: it is not in any style value, and with autosizing
 *    suppressed it is not in what gets rendered either. It is read off a probe
 *    that opts *back in* — `measureAdjustedTextScale` — and applied here.
 *  - **iOS.** WKWebView ignores Dynamic Type outright, and there is no setting
 *    to flip. What it does support is the `-apple-system-body` font keyword,
 *    which resolves to the reader's chosen body size — so the scale is measured
 *    off a probe and applied to the root here.
 *
 * **Why measure and apply rather than let the engine do it.** `text-size-adjust`
 * stays `none` in index.css deliberately. Chromium's automatic adjustment
 * inflates *font sizes* during layout and nothing else, so a `rem` padding, a
 * measured chrome height or a ring's stroke would stay at 1× while the text
 * inside them grew — and it tapers above 16px (the "pleasant size" curve), so
 * body copy would grow by the full factor and a headline by roughly half of it.
 * Writing one number to the root font size instead moves type and the rem-based
 * layout together, which is the behaviour the whole app is built on and what
 * `e2e/a11y.spec.ts` drives at 150% and 200%.
 *
 * Capped at 200%. iOS accessibility sizes reach ~3.1× against a 17px default,
 * and Android OEM skins go past the platform's own 200%; at that point a phone
 * shows two words a line and the app is unusable in a different way. WCAG asks
 * for 200%, so 200% is what is built and tested for; past that the OS zoom
 * serves the reader better, because it pans rather than reflows.
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
 * The scale the document is *already* being rendered at, whatever the app did.
 *
 * It cannot be read from a style value: an engine that inflates text does it
 * during layout, so a span that *asks* for 16px still reports 16px to
 * `getComputedStyle` while rendering at 24. The only honest measurement is the
 * box it ends up occupying — hence `line-height: 1`, which makes the rendered
 * height equal to the rendered font size.
 *
 * With `text-size-adjust: none` in force this is 1 on every engine that
 * respects it, which is the point: it is the guard that keeps `applyTextScale`
 * from scaling on top of an engine that has already scaled (an older browser
 * ignoring the declaration, or a future Chromium that stops letting authors
 * override an accessibility setting with it).
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

/**
 * How much text a probe has to hold before Chromium will autosize it.
 *
 * Blink only inflates a block whose text is "enough to be worth it", measured
 * as `characters × font-size >= 4 × block width`. At the 16px the probe asks
 * for, that is a quarter of the viewport width in characters; 512 covers a
 * 2048px one, which is past any phone or tablet this runs on. Newer Chromium
 * applies `text-size-adjust` as a plain multiplier with no such threshold, so
 * the padding costs nothing there.
 */
const ADJUST_PROBE_TEXT = 'M'.repeat(512)

/**
 * The OS font scale Android would apply if the document let it.
 *
 * The probe re-enables the automatic adjustment `html` turns off, spans the
 * viewport (Blink's multiplier is scaled by block width over frame width, so a
 * narrow probe would under-report), and asks for exactly 16px — the size
 * Blink's taper treats as unmodified, so the height it renders at is the raw
 * factor and not a curve applied to it.
 *
 * Returns 1 everywhere nothing is inflating text: desktop browsers, iOS with a
 * `width=device-width` viewport (WebKit disables autosizing per document for a
 * mobile-optimised page), and jsdom, which lays nothing out at all.
 */
export function measureAdjustedTextScale(doc: Document = document): number {
  return withProbe(
    doc,
    // `left/right: 0` for the viewport-width span; `nowrap` + `overflow: hidden`
    // so 512 characters stay on the one line whose height is being measured and
    // cannot widen anything.
    'left:0;right:0;display:block;white-space:nowrap;overflow:hidden;' +
      `font-size:${PROBE_BASELINE_PX}px;line-height:1;` +
      '-webkit-text-size-adjust:auto;text-size-adjust:auto',
    (probe) => {
      probe.textContent = ADJUST_PROBE_TEXT
      const height = probe.getBoundingClientRect().height
      if (!Number.isFinite(height) || height <= 0) return 1
      return height / PROBE_BASELINE_PX
    },
  )
}

/** The scale to lay out at: whichever signal reports the largest one. */
export function measureTextScale(doc: Document = document): number {
  return clampScale(
    Math.max(
      measureIOSTextScale(doc),
      measureRenderedTextScale(doc),
      measureAdjustedTextScale(doc),
    ),
  )
}

/**
 * Whether the app has to write the scale itself.
 *
 * Yes when there is a scale to write and nothing has written it yet — iOS and
 * Android both land here. No when the engine is already rendering the document
 * larger on its own (`rendered > 1`): a browser's default-font-size setting has
 * moved the root already, and setting a size here would multiply it a second
 * time.
 */
export function needsRootScale(scale: number, rendered: number): boolean {
  return scale > 1 && rendered <= 1
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
export function applyTextScale(
  scale: number,
  doc: Document = document,
  rendered: number = measureRenderedTextScale(doc),
): void {
  const clamped = clampScale(scale)
  const root = doc.documentElement

  root.style.setProperty('--text-scale', String(clamped))
  root.dataset.textScale = clamped > CHROME_LABEL_MAX_SCALE ? 'large' : 'base'

  // The unit is `rem` deliberately, despite this *being* the root: on the root
  // element `rem` resolves against the initial font size, i.e. the browser's
  // own default. So `1.4rem` is "40% larger than this reader's default", which
  // composes with a browser setting rather than replacing it. `px` would not.
  if (needsRootScale(clamped, rendered)) root.style.fontSize = `${clamped}rem`
  else root.style.removeProperty('font-size')
}

/**
 * Measure at start-up, and again whenever the platform re-lays-out.
 *
 * Returns a teardown. Safe to call anywhere: where nothing scales, the
 * measurement is 1 and applying it is a no-op.
 */
export function initTextScale(win: Window = window): () => void {
  const sync = () => {
    const doc = win.document
    // Measured before the root is touched, and reused by both steps: `rendered`
    // is what decides whether writing a root size would double-apply, and
    // re-reading it afterwards would see the app's own scale.
    const rendered = measureRenderedTextScale(doc)
    const scale = clampScale(
      Math.max(measureIOSTextScale(doc), rendered, measureAdjustedTextScale(doc)),
    )
    applyTextScale(scale, doc, rendered)
  }
  sync()

  // No platform fires a "text size changed" event a web view can hear, so
  // re-measure on the two moments that bracket a trip to Settings and back:
  // `pageshow` when the document is restored, and `resize`, which both WebViews
  // fire when they re-lay-out at the new metrics. Android's Display size
  // setting arrives the same way — it changes the WebView's density, so the
  // viewport gets narrower and `resize` fires.
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

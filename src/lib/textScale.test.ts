import { describe, it, expect, afterEach } from 'vitest'
import {
  CHROME_LABEL_MAX_SCALE,
  MAX_TEXT_SCALE,
  MIN_TEXT_SCALE,
  applyTextScale,
  clampScale,
  measureAdjustedTextScale,
  measureIOSTextScale,
  measureRenderedTextScale,
  measureTextScale,
  needsRootScale,
} from './textScale'

afterEach(() => {
  document.documentElement.style.removeProperty('font-size')
  document.documentElement.style.removeProperty('--text-scale')
  delete document.documentElement.dataset.textScale
})

describe('clampScale', () => {
  it('passes a scale inside the supported range through', () => {
    expect(clampScale(1.4)).toBe(1.4)
  })

  it('never shrinks text below the drawn design', () => {
    // A reader who has *reduced* their system font still gets the layout the
    // app was built for; shrinking further only costs legibility.
    expect(clampScale(0.8)).toBe(MIN_TEXT_SCALE)
  })

  it('caps at 200%, the figure WCAG 1.4.4 asks for', () => {
    // iOS accessibility sizes reach ~3.1×, where a phone shows two words a
    // line. Past the cap the OS zoom serves the reader better.
    expect(clampScale(3.1)).toBe(MAX_TEXT_SCALE)
    expect(MAX_TEXT_SCALE).toBe(2)
  })

  it('falls back to 1 for a value that is not a usable number', () => {
    expect(clampScale(NaN)).toBe(1)
    expect(clampScale(0)).toBe(1)
    expect(clampScale(-2)).toBe(1)
  })
})

describe('measureIOSTextScale', () => {
  it('reports no enlargement where `-apple-system-body` is not honoured', () => {
    // Which is every engine but WebKit — including jsdom, and every browser the
    // web build runs in. There the probe inherits the ordinary font size, so
    // the ratio lands at or under 1 and `measureTextScale`'s floor takes over.
    // Deliberately not clamped here: the raw ratio is what tells applyTextScale
    // whether iOS is the platform doing the scaling.
    expect(measureIOSTextScale()).toBeLessThanOrEqual(1)
  })

  it('leaves no probe behind in the document', () => {
    const before = document.body.childElementCount
    measureIOSTextScale()
    expect(document.body.childElementCount).toBe(before)
  })
})

describe('measureRenderedTextScale', () => {
  it('reports 1 where nothing scales what is rendered', () => {
    // jsdom lays nothing out, so the probe measures zero and the guard in
    // withProbe returns the baseline rather than a nonsense ratio.
    expect(measureRenderedTextScale()).toBe(1)
  })
})

describe('measureAdjustedTextScale', () => {
  it('reports 1 where nothing is inflating text', () => {
    // This is the Android signal: a probe that re-enables the automatic
    // adjustment `html` turns off, so a system font scale shows up in the box
    // it renders at. Nowhere else inflates it — desktop browsers, iOS behind a
    // device-width viewport, and jsdom, which lays nothing out.
    expect(measureAdjustedTextScale()).toBe(1)
  })

  it('leaves no probe behind in the document', () => {
    const before = document.body.childElementCount
    measureAdjustedTextScale()
    expect(document.body.childElementCount).toBe(before)
  })
})

describe('measureTextScale', () => {
  it('takes the largest of the three signals, clamped', () => {
    // None of them reports a scale here, so this is the 1× floor — the point
    // is that it resolves to a usable number rather than NaN when every probe
    // comes back empty.
    expect(measureTextScale()).toBe(1)
  })
})

describe('needsRootScale', () => {
  it('writes the scale where nothing else has', () => {
    // iOS and Android both land here: WKWebView never applies Dynamic Type,
    // and `text-size-adjust: none` stops Chromium applying the Android font
    // scale, so in both cases the document is still rendering at 1×.
    expect(needsRootScale(1.5, 1)).toBe(true)
  })

  it('stays out of the way once the engine has already scaled the render', () => {
    // A browser's default-font-size setting has moved the root already, and an
    // engine that ignores `text-size-adjust: none` for an accessibility
    // setting would have too. Writing a root size on top multiplies it twice.
    expect(needsRootScale(1.5, 1.5)).toBe(false)
  })

  it('has nothing to write at 1×', () => {
    expect(needsRootScale(1, 1)).toBe(false)
  })
})

describe('applyTextScale', () => {
  it('publishes the scale for the CSS that needs the number itself', () => {
    applyTextScale(1.5)
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe('1.5')
  })

  it('leaves the root font size alone at 1×', () => {
    applyTextScale(1.5)
    applyTextScale(1)
    expect(document.documentElement.style.fontSize).toBe('')
  })

  it('writes the scale to the root where the platform has not', () => {
    // Which is iOS and Android both: neither has moved the render, so the app
    // moves it, in `rem` so it composes with the reader's browser default
    // rather than replacing it.
    applyTextScale(1.5)
    expect(document.documentElement.style.fontSize).toBe('1.5rem')
  })

  it('clamps what it publishes', () => {
    applyTextScale(9)
    expect(document.documentElement.style.getPropertyValue('--text-scale')).toBe(
      String(MAX_TEXT_SCALE),
    )
  })

  it('flags a large scale for the chrome to style off', () => {
    // CSS cannot compare a custom property against a threshold, so the
    // comparison happens here and the answer is an attribute. Past it, the tab
    // bar drops its micro-labels rather than truncating them to two letters.
    applyTextScale(CHROME_LABEL_MAX_SCALE + 0.1)
    expect(document.documentElement.dataset.textScale).toBe('large')

    applyTextScale(CHROME_LABEL_MAX_SCALE)
    expect(document.documentElement.dataset.textScale).toBe('base')
  })

  it('does not move the root where the platform already scaled the render', () => {
    // A browser's own default-font-size setting has applied the reader's
    // choice before the app sees it; scaling the root as well would multiply
    // it twice. jsdom lays nothing out, so the measurement is passed in.
    applyTextScale(1.5, document, 1.5)
    expect(document.documentElement.style.fontSize).toBe('')
  })
})

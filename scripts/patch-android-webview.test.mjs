import { describe, it, expect } from 'vitest'
import { MAX_TEXT_ZOOM, javaSource, kotlinSource, packageOf } from './patch-android-webview.mjs'

describe('MAX_TEXT_ZOOM', () => {
  it('is the 200% WCAG 1.4.4 asks for, matching MAX_TEXT_SCALE on iOS', () => {
    expect(MAX_TEXT_ZOOM).toBe(200)
  })
})

describe('packageOf', () => {
  it('reads the package from a Java source', () => {
    expect(packageOf('package app.macrotrack;\n\npublic class MainActivity {}')).toBe('app.macrotrack')
  })

  it('reads the package from a Kotlin source (no semicolon)', () => {
    expect(packageOf('package app.macrotrack\n\nclass MainActivity')).toBe('app.macrotrack')
  })

  it('returns null when there is no package line', () => {
    expect(packageOf('class MainActivity {}')).toBeNull()
  })
})

describe('javaSource', () => {
  const src = javaSource('app.macrotrack')

  it('keeps the original package', () => {
    expect(src).toContain('package app.macrotrack;')
  })

  it('extends BridgeActivity and imports it', () => {
    expect(src).toContain('import com.getcapacitor.BridgeActivity;')
    expect(src).toContain('public class MainActivity extends BridgeActivity {')
  })

  it('clamps the WebView text zoom rather than pinning it', () => {
    expect(src).toContain('super.onStart();')
    expect(src).toContain(`settings.setTextZoom(Math.min(settings.getTextZoom(), ${MAX_TEXT_ZOOM}));`)
    expect(src).toContain('import android.webkit.WebSettings;')
  })

  it('never pins the zoom at 100%, which would ignore the system setting', () => {
    expect(src).not.toContain('setTextZoom(100)')
  })
})

describe('kotlinSource', () => {
  const src = kotlinSource('app.macrotrack')

  it('keeps the package without a semicolon', () => {
    expect(src).toContain('package app.macrotrack\n')
    expect(src).not.toContain('package app.macrotrack;')
  })

  it('clamps the WebView text zoom rather than pinning it', () => {
    expect(src).toContain('override fun onStart()')
    expect(src).toContain(`settings.textZoom = minOf(settings.textZoom, ${MAX_TEXT_ZOOM})`)
  })

  it('never pins the zoom at 100%, which would ignore the system setting', () => {
    expect(src).not.toContain('textZoom = 100')
  })
})

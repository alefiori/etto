import { describe, it, expect } from 'vitest'
import { javaSource, kotlinSource, packageOf } from './patch-android-webview.mjs'

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

  it('pins the WebView text zoom to 100 after super.onStart', () => {
    expect(src).toContain('super.onStart();')
    expect(src).toContain('getBridge().getWebView().getSettings().setTextZoom(100);')
  })
})

describe('kotlinSource', () => {
  const src = kotlinSource('app.macrotrack')

  it('keeps the package without a semicolon', () => {
    expect(src).toContain('package app.macrotrack\n')
    expect(src).not.toContain('package app.macrotrack;')
  })

  it('pins the WebView text zoom to 100', () => {
    expect(src).toContain('override fun onStart()')
    expect(src).toContain('bridge.webView.settings.textZoom = 100')
  })
})

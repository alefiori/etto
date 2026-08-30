import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CAMERA_BLOCK,
  hasCameraPermission,
  withCameraPermission,
} from './patch-android-manifest.mjs'

/** Capacitor's stock template, which is what `pnpm exec cap add android` writes. */
const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" android:exported="true" />
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`

describe('withCameraPermission', () => {
  const patched = withCameraPermission(TEMPLATE)

  it('declares the CAMERA permission the WebView request needs', () => {
    // Without this Android denies the request without prompting, and the
    // scanner reports a denial the user was never asked to make.
    expect(patched).toContain('<uses-permission android:name="android.permission.CAMERA" />')
  })

  it('marks both implied camera features optional, so Play does not delist', () => {
    // Declaring CAMERA implies android.hardware.camera *and* .autofocus as
    // required; scanning is only one way to add a food here.
    expect(patched).toContain(
      '<uses-feature android:name="android.hardware.camera" android:required="false" />',
    )
    expect(patched).toContain(
      '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />',
    )
  })

  it('inserts inside the manifest element, not after it', () => {
    expect(patched.indexOf('android.permission.CAMERA')).toBeLessThan(
      patched.indexOf('</manifest>'),
    )
    expect(patched.trimEnd().endsWith('</manifest>')).toBe(true)
  })

  it('keeps what the template already declared', () => {
    expect(patched).toContain('<uses-permission android:name="android.permission.INTERNET" />')
    expect(patched).toContain('<activity android:name=".MainActivity"')
  })

  it('is idempotent, since the build re-runs it over a synced project', () => {
    expect(withCameraPermission(patched)).toBe(patched)
  })

  it('leaves a manifest that already declares CAMERA untouched', () => {
    // A future Capacitor template or a plugin's merged manifest may cover it.
    const already = TEMPLATE.replace(
      '<!-- Permissions -->',
      '<uses-permission android:name="android.permission.CAMERA" />',
    )
    expect(withCameraPermission(already)).toBe(already)
  })

  it('leaves a manifest it cannot parse untouched rather than corrupting it', () => {
    const junk = '<?xml version="1.0"?>\n<manifest>'
    expect(withCameraPermission(junk)).toBe(junk)
  })

  it('says where it came from, since android/ is regenerated', () => {
    expect(patched).toContain('scripts/patch-android-manifest.mjs')
  })
})

describe('hasCameraPermission', () => {
  it('is false for the stock template', () => {
    expect(hasCameraPermission(TEMPLATE)).toBe(false)
  })

  it('is true once patched', () => {
    expect(hasCameraPermission(withCameraPermission(TEMPLATE))).toBe(true)
  })

  it('is not fooled by the camera uses-feature lines alone', () => {
    expect(hasCameraPermission(CAMERA_BLOCK.replace(/<uses-permission[^>]*>/, ''))).toBe(false)
  })
})

describe('the native build', () => {
  it('runs this after cap sync', () => {
    // android/ is regenerated on every build, so a script that is never invoked
    // is the same as no script at all.
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['sync:native']).toContain('scripts/patch-android-manifest.mjs')
  })
})

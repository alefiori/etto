import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CAMERA_BLOCK,
  hasCameraPermission,
  withCameraPermission,
  APP_LINK_HOST,
  APP_LINK_PATHS,
  hasAppLinkIntentFilter,
  withAppLinks,
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

/**
 * The MainActivity shape `pnpm exec cap add android` actually writes as of
 * the Capacitor CLI version this repo pins — confirmed by running it for
 * real, not assumed. Multi-line, multiple attributes with `android:name` in
 * the middle rather than first, not self-closing, and already carrying the
 * stock MAIN/LAUNCHER intent-filter as a body. The first version of
 * `withAppLinks` was written against {@link TEMPLATE} above (self-closing,
 * one attribute) and silently matched nothing against this shape — these
 * tests exist so that regression cannot come back quietly.
 */
const REAL_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>
    </application>

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

describe('withAppLinks', () => {
  const patched = withAppLinks(TEMPLATE)

  it('declares android:autoVerify="true", the App Links verification handshake', () => {
    expect(patched).toContain('<intent-filter android:autoVerify="true">')
  })

  it('declares the VIEW action and the DEFAULT/BROWSABLE categories a deep link needs', () => {
    expect(patched).toContain('<action android:name="android.intent.action.VIEW" />')
    expect(patched).toContain('<category android:name="android.intent.category.DEFAULT" />')
    expect(patched).toContain('<category android:name="android.intent.category.BROWSABLE" />')
  })

  it('declares every actionable path against the app domain', () => {
    for (const path of APP_LINK_PATHS) {
      expect(patched).toContain(
        `<data android:scheme="https" android:host="${APP_LINK_HOST}" android:path="${path}" />`,
      )
    }
  })

  it('inserts the filter inside MainActivity, not as a sibling element', () => {
    const activityStart = patched.indexOf('<activity android:name=".MainActivity"')
    const activityEnd = patched.indexOf('</activity>')
    const filterIndex = patched.indexOf('<intent-filter')
    expect(filterIndex).toBeGreaterThan(activityStart)
    expect(filterIndex).toBeLessThan(activityEnd)
  })

  it('expands a self-closing MainActivity tag into an open/close pair', () => {
    expect(patched).toContain('<activity android:name=".MainActivity" android:exported="true" >')
    expect(patched).toContain('</activity>')
  })

  it('keeps what the template already declared', () => {
    expect(patched).toContain('<uses-permission android:name="android.permission.INTERNET" />')
    expect(patched).toContain('android:label="@string/app_name"')
  })

  it('is idempotent, since the build re-runs it over a synced project', () => {
    expect(withAppLinks(patched)).toBe(patched)
  })

  it('leaves a manifest that already declares the filter untouched', () => {
    expect(withAppLinks(patched)).toBe(patched)
  })

  it('adds a body to MainActivity when it already has one, rather than assuming it is empty', () => {
    const withBody = TEMPLATE.replace(
      '<activity android:name=".MainActivity" android:exported="true" />',
      '<activity android:name=".MainActivity" android:exported="true">\n            <meta-data android:name="x" android:value="y" />\n        </activity>',
    )
    const out = withAppLinks(withBody)
    expect(out).toContain('<meta-data android:name="x" android:value="y" />')
    expect(out).toContain('<intent-filter android:autoVerify="true">')
    expect(withAppLinks(out)).toBe(out)
  })

  it('leaves a manifest with no MainActivity untouched rather than guessing at an anchor', () => {
    const noActivity = TEMPLATE.replace(
      '<activity android:name=".MainActivity" android:exported="true" />',
      '',
    )
    expect(withAppLinks(noActivity)).toBe(noActivity)
  })

  it('says where it came from, since android/ is regenerated', () => {
    expect(patched).toContain('scripts/patch-android-manifest.mjs')
  })

  describe('against the real cap add android output (REAL_TEMPLATE)', () => {
    const real = withAppLinks(REAL_TEMPLATE)

    it('finds MainActivity despite android:name not being the first attribute', () => {
      expect(hasAppLinkIntentFilter(real)).toBe(true)
    })

    it('inserts inside MainActivity, after its existing MAIN/LAUNCHER filter, not replacing it', () => {
      expect(real).toContain('<action android:name="android.intent.action.MAIN" />')
      expect(real).toContain('<category android:name="android.intent.category.LAUNCHER" />')
      const mainFilterIndex = real.indexOf('android.intent.action.MAIN')
      const appLinkFilterIndex = real.indexOf('android:autoVerify="true"')
      const activityEnd = real.indexOf('</activity>')
      expect(mainFilterIndex).toBeLessThan(appLinkFilterIndex)
      expect(appLinkFilterIndex).toBeLessThan(activityEnd)
    })

    it('is idempotent against the real shape too', () => {
      expect(withAppLinks(real)).toBe(real)
    })
  })
})

describe('hasAppLinkIntentFilter', () => {
  it('is false for the stock template', () => {
    expect(hasAppLinkIntentFilter(TEMPLATE)).toBe(false)
  })

  it('is true once patched', () => {
    expect(hasAppLinkIntentFilter(withAppLinks(TEMPLATE))).toBe(true)
  })

  it('is not fooled by autoVerify or the host appearing alone', () => {
    expect(hasAppLinkIntentFilter('android:autoVerify="true"')).toBe(false)
    expect(hasAppLinkIntentFilter(`android:host="${APP_LINK_HOST}"`)).toBe(false)
  })
})

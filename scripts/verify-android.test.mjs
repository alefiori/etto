import { describe, it, expect } from 'vitest'
import {
  tagAttributes,
  hasCameraPermission,
  featureRequirement,
  hasOptionalFeature,
  notificationIcons,
  checkAll,
  OPTIONAL_FEATURES,
} from './verify-android.mjs'
import { withCameraPermission } from './patch-android-manifest.mjs'

/** Capacitor's template manifest, which declares only INTERNET. */
const TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="Etto"></application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>`

/** The manifest as scripts/patch-android-manifest.mjs leaves it. */
const PATCHED = withCameraPermission(TEMPLATE)

/** A res/ listing as scripts/patch-android-notification-icon.mjs leaves it. */
const RES_WITH_ICON = [
  'drawable/ic_stat_water_drop.xml',
  'mipmap-hdpi/ic_launcher.png',
  'values/strings.xml',
]
const RES_WITHOUT_ICON = ['mipmap-hdpi/ic_launcher.png', 'values/strings.xml']

describe('tagAttributes', () => {
  it('reads the attributes of every matching tag', () => {
    expect(tagAttributes(PATCHED, 'uses-feature')).toEqual([
      { 'android:name': 'android.hardware.camera', 'android:required': 'false' },
      { 'android:name': 'android.hardware.camera.autofocus', 'android:required': 'false' },
    ])
  })

  it('is empty when no such tag exists', () => {
    expect(tagAttributes(TEMPLATE, 'uses-feature')).toEqual([])
  })

  it('does not match a tag whose name merely starts the same', () => {
    // <uses-permission> must not be picked up by a search for <uses-feature>,
    // nor <application> by one for <app>.
    expect(tagAttributes('<application android:label="Etto">', 'app')).toEqual([])
  })
})

describe('hasCameraPermission', () => {
  it('fails on the untouched Capacitor template', () => {
    expect(hasCameraPermission(TEMPLATE)).toBe(false)
  })

  it('passes once the patch script has run', () => {
    expect(hasCameraPermission(PATCHED)).toBe(true)
  })

  it('accepts the permission whatever the attribute order', () => {
    // A merged plugin manifest is free to write the attributes in any order,
    // and the app is equally correct either way.
    const reordered =
      '<manifest><uses-permission android:maxSdkVersion="32" ' +
      'android:name="android.permission.CAMERA" /></manifest>'
    expect(hasCameraPermission(reordered)).toBe(true)
  })

  it('is not fooled by a different permission', () => {
    const other =
      '<manifest><uses-permission android:name="android.permission.CAMERA_ROLL" /></manifest>'
    expect(hasCameraPermission(other)).toBe(false)
  })
})

describe('featureRequirement', () => {
  it('reads the declared value', () => {
    expect(featureRequirement(PATCHED, 'android.hardware.camera')).toBe('false')
  })

  it('is null when the feature is not declared at all', () => {
    expect(featureRequirement(TEMPLATE, 'android.hardware.camera')).toBeNull()
  })

  it("treats an omitted android:required as Android's default of true", () => {
    // This is the delisting case, so it must not read as optional.
    const bare = '<manifest><uses-feature android:name="android.hardware.camera" /></manifest>'
    expect(featureRequirement(bare, 'android.hardware.camera')).toBe('true')
  })

  it('does not confuse the autofocus feature with the plain one', () => {
    expect(featureRequirement(PATCHED, 'android.hardware.camera.autofocus')).toBe('false')
  })
})

describe('hasOptionalFeature', () => {
  it('passes for both features on a patched manifest', () => {
    for (const f of OPTIONAL_FEATURES) expect(hasOptionalFeature(PATCHED, f)).toBe(true)
  })

  it('fails when the feature is declared required', () => {
    const required =
      '<manifest><uses-feature android:name="android.hardware.camera" ' +
      'android:required="true" /></manifest>'
    expect(hasOptionalFeature(required, 'android.hardware.camera')).toBe(false)
  })
})

describe('notificationIcons', () => {
  it('finds the vector drawable the patch script writes', () => {
    expect(notificationIcons(RES_WITH_ICON)).toEqual(['drawable/ic_stat_water_drop.xml'])
  })

  it('is empty when the icon was never written', () => {
    expect(notificationIcons(RES_WITHOUT_ICON)).toEqual([])
  })

  it('accepts any drawable qualifier and any extension', () => {
    // The icon may become five PNG densities, or gain a -night variant, without
    // that being a regression.
    const densities = [
      'drawable-hdpi/ic_stat_water_drop.png',
      'drawable-xxhdpi/ic_stat_water_drop.png',
      'drawable-night/ic_stat_water_drop.xml',
    ]
    expect(notificationIcons(densities)).toHaveLength(3)
  })

  it('does not match the launcher icon', () => {
    expect(notificationIcons(['mipmap-hdpi/ic_launcher.png'])).toEqual([])
  })
})

describe('checkAll', () => {
  it('reports nothing once both patch scripts have run', () => {
    expect(checkAll(PATCHED, RES_WITH_ICON)).toEqual([])
  })

  it('reports every problem separately for an unpatched project', () => {
    // The exact state the release workflow was shipping: `cap sync android` and
    // nothing else.
    const failures = checkAll(TEMPLATE, RES_WITHOUT_ICON)
    expect(failures).toHaveLength(4)
    expect(failures.join(' ')).toMatch(/android\.permission\.CAMERA/)
    expect(failures.join(' ')).toMatch(/android\.hardware\.camera\b/)
    expect(failures.join(' ')).toMatch(/android\.hardware\.camera\.autofocus/)
    expect(failures.join(' ')).toMatch(/ic_stat_water_drop/)
  })

  it('passes when a plugin contributed the permission instead of the patch script', () => {
    // A future ML-Kit barcode plugin would merge the permission in, at which
    // point patch-android-manifest.mjs no-ops by design. The shipped app is
    // still correct, so this must still pass.
    const fromPlugin = TEMPLATE.replace(
      '</manifest>',
      `<uses-permission android:name="android.permission.CAMERA" />
       <uses-feature android:name="android.hardware.camera" android:required="false" />
       <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
       </manifest>`,
    )
    expect(checkAll(fromPlugin, RES_WITH_ICON)).toEqual([])
  })

  it('flags a camera feature that Play would read as required', () => {
    const required = PATCHED.replace(
      '<uses-feature android:name="android.hardware.camera" android:required="false" />',
      '<uses-feature android:name="android.hardware.camera" android:required="true" />',
    )
    const failures = checkAll(required, RES_WITH_ICON)
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatch(/delist/)
  })
})

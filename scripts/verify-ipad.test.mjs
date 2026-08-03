import { describe, it, expect } from 'vitest'
import {
  deviceFamilies,
  targetsIpad,
  plistArray,
  supportsIpadLandscape,
  requiresFullScreen,
  checkAll,
} from './verify-ipad.mjs'

/** Two build configurations, as Capacitor's template generates them. */
const PBXPROJ_BOTH = `
    buildSettings = {
      TARGETED_DEVICE_FAMILY = "1,2";
    };
    buildSettings = {
      TARGETED_DEVICE_FAMILY = "1,2";
    };
`
const PBXPROJ_IPHONE_ONLY = `
    buildSettings = {
      TARGETED_DEVICE_FAMILY = "1";
    };
`
const PBXPROJ_MIXED = `
    buildSettings = {
      TARGETED_DEVICE_FAMILY = "1,2";
    };
    buildSettings = {
      TARGETED_DEVICE_FAMILY = "1";
    };
`

function plist(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>${body}</dict></plist>`
}

const IPAD_ORIENTATIONS = `
  <key>UISupportedInterfaceOrientations~ipad</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationPortraitUpsideDown</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>`

describe('deviceFamilies', () => {
  it('reads every declared family', () => {
    expect(deviceFamilies(PBXPROJ_BOTH)).toEqual([
      ['1', '2'],
      ['1', '2'],
    ])
  })

  it('handles an unquoted single value', () => {
    expect(deviceFamilies('TARGETED_DEVICE_FAMILY = 1;')).toEqual([['1']])
  })

  it('is empty when the setting is absent', () => {
    expect(deviceFamilies('buildSettings = { };')).toEqual([])
  })
})

describe('targetsIpad', () => {
  it('passes when every configuration includes iPad', () => {
    expect(targetsIpad(PBXPROJ_BOTH)).toBe(true)
  })

  it('fails for an iPhone-only project', () => {
    expect(targetsIpad(PBXPROJ_IPHONE_ONLY)).toBe(false)
  })

  it('fails when only some configurations include iPad', () => {
    // Release shipping iPhone-only while Debug looks fine is exactly the kind
    // of drift this is meant to catch.
    expect(targetsIpad(PBXPROJ_MIXED)).toBe(false)
  })

  it('fails when the setting is missing entirely', () => {
    expect(targetsIpad('buildSettings = { };')).toBe(false)
  })
})

describe('plistArray', () => {
  it('reads the values of an array key', () => {
    expect(plistArray(plist(IPAD_ORIENTATIONS), 'UISupportedInterfaceOrientations~ipad')).toEqual([
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ])
  })

  it('returns null for a key that is not there', () => {
    expect(plistArray(plist(''), 'UISupportedInterfaceOrientations~ipad')).toBeNull()
  })

  it('does not confuse the ~ipad key with the plain one', () => {
    const both = plist(`
      <key>UISupportedInterfaceOrientations</key>
      <array><string>UIInterfaceOrientationPortrait</string></array>
      ${IPAD_ORIENTATIONS}`)
    expect(plistArray(both, 'UISupportedInterfaceOrientations')).toEqual([
      'UIInterfaceOrientationPortrait',
    ])
    expect(plistArray(both, 'UISupportedInterfaceOrientations~ipad')).toHaveLength(4)
  })
})

describe('supportsIpadLandscape', () => {
  it('passes for the full orientation set', () => {
    expect(supportsIpadLandscape(plist(IPAD_ORIENTATIONS))).toBe(true)
  })

  it('fails when the iPad key is missing', () => {
    expect(supportsIpadLandscape(plist(''))).toBe(false)
  })

  it('fails when locked to portrait', () => {
    const portraitOnly = plist(`
      <key>UISupportedInterfaceOrientations~ipad</key>
      <array><string>UIInterfaceOrientationPortrait</string></array>`)
    expect(supportsIpadLandscape(portraitOnly)).toBe(false)
  })

  it('fails when only one landscape direction is allowed', () => {
    const oneWay = plist(`
      <key>UISupportedInterfaceOrientations~ipad</key>
      <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
      </array>`)
    expect(supportsIpadLandscape(oneWay)).toBe(false)
  })
})

describe('requiresFullScreen', () => {
  it('is false when the key is absent', () => {
    expect(requiresFullScreen(plist(''))).toBe(false)
  })

  it('detects the key being set, which would kill Split View', () => {
    expect(requiresFullScreen(plist('<key>UIRequiresFullScreen</key><true/>'))).toBe(true)
  })

  it('accepts the key explicitly set to false', () => {
    expect(requiresFullScreen(plist('<key>UIRequiresFullScreen</key><false/>'))).toBe(false)
  })
})

describe('checkAll', () => {
  it('reports nothing for a correct project', () => {
    expect(checkAll(PBXPROJ_BOTH, plist(IPAD_ORIENTATIONS))).toEqual([])
  })

  it('reports each problem separately', () => {
    const failures = checkAll(
      PBXPROJ_IPHONE_ONLY,
      plist('<key>UIRequiresFullScreen</key><true/>'),
    )
    expect(failures).toHaveLength(3)
    expect(failures.join(' ')).toMatch(/TARGETED_DEVICE_FAMILY/)
    expect(failures.join(' ')).toMatch(/UISupportedInterfaceOrientations~ipad/)
    expect(failures.join(' ')).toMatch(/UIRequiresFullScreen/)
  })
})

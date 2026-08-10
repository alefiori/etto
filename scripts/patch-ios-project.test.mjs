import { describe, it, expect } from 'vitest'
import {
  LOCALES,
  CAMERA_USAGE,
  hasPlistKey,
  insertPlistEntries,
  patchInfoPlist,
  privacyManifest,
  patchPbxproj,
  patchSigning,
  checkAll,
} from './patch-ios-project.mjs'
import { LOCALES as I18N_LOCALES } from '../src/lib/i18n/index.ts'

/** Capacitor's iOS template, trimmed to the parts this script touches. */
const TEMPLATE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>MacroTrack</string>
	<key>UIViewControllerBasedStatusBarAppearance</key>
	<true/>
</dict>
</plist>
`

const TEMPLATE_PBXPROJ = `// !$*UTF8*$!
{
/* Begin PBXBuildFile section */
		2FAD9763203C412B000D30F8 /* config.xml in Resources */ = {isa = PBXBuildFile; fileRef = 2FAD9762203C412B000D30F8 /* config.xml */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		504EC3131FED79650016851F /* Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXGroup section */
		504EC3061FED79650016851F /* App */ = {
			isa = PBXGroup;
			children = (
				504EC3131FED79650016851F /* Info.plist */,
				2FAD9762203C412B000D30F8 /* config.xml */,
			);
			path = App;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXResourcesBuildPhase section */
		504EC3021FED79650016851F /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				2FAD9763203C412B000D30F8 /* config.xml in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		504EC3181FED79650016851F /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = "";
				PRODUCT_BUNDLE_IDENTIFIER = app.macrotrack;
			};
			name = Debug;
		};
		504EC3191FED79650016851F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				DEVELOPMENT_TEAM = "";
				PRODUCT_BUNDLE_IDENTIFIER = app.macrotrack;
			};
			name = Release;
		};
/* End XCBuildConfiguration section */
}
`

describe('hasPlistKey', () => {
  it('finds a declared key and misses an absent one', () => {
    expect(hasPlistKey(TEMPLATE_PLIST, 'CFBundleDisplayName')).toBe(true)
    expect(hasPlistKey(TEMPLATE_PLIST, 'NSCameraUsageDescription')).toBe(false)
  })
})

describe('insertPlistEntries', () => {
  it('inserts before the closing dict, not the opening one', () => {
    const out = insertPlistEntries(TEMPLATE_PLIST, ['\t<key>X</key>\n\t<string>y</string>\n'])
    expect(out.indexOf('<key>X</key>')).toBeGreaterThan(out.indexOf('<key>CFBundleDisplayName</key>'))
    expect(out.indexOf('<key>X</key>')).toBeLessThan(out.indexOf('</dict>'))
  })

  it('is a no-op with nothing to insert', () => {
    expect(insertPlistEntries(TEMPLATE_PLIST, [])).toBe(TEMPLATE_PLIST)
  })

  it('throws on a plist it does not recognise rather than writing nonsense', () => {
    expect(() => insertPlistEntries('not a plist', ['<key>X</key>'])).toThrow(/closing/)
  })
})

describe('patchInfoPlist', () => {
  const patched = patchInfoPlist(TEMPLATE_PLIST)

  it('adds the camera usage description', () => {
    // Without this iOS terminates the app the moment the scanner opens.
    expect(patched).toContain('<key>NSCameraUsageDescription</key>')
    expect(patched).toContain(CAMERA_USAGE)
  })

  it('declares every supported language', () => {
    expect(patched).toContain('<key>CFBundleLocalizations</key>')
    for (const locale of LOCALES) expect(patched).toContain(`<string>${locale}</string>`)
  })

  it('is idempotent — a second run adds nothing', () => {
    expect(patchInfoPlist(patched)).toBe(patched)
  })

  it('leaves the template keys alone', () => {
    expect(patched).toContain('<key>UIViewControllerBasedStatusBarAppearance</key>')
    expect(patched.trimEnd().endsWith('</plist>')).toBe(true)
  })

  it('names a reason, since Apple rejects a bare "needs camera access"', () => {
    expect(CAMERA_USAGE).toMatch(/barcode/i)
    expect(CAMERA_USAGE.length).toBeGreaterThan(40)
  })
})

describe('the declared localizations', () => {
  it('match the languages the app actually ships', () => {
    // Drifting apart means the App Store advertises a language the app lacks,
    // or hides one it has.
    expect([...LOCALES].sort()).toEqual(I18N_LOCALES.map((l) => l.code).sort())
  })
})

describe('privacyManifest', () => {
  const manifest = privacyManifest()

  it('declares no tracking and no tracking domains', () => {
    expect(manifest).toContain('<key>NSPrivacyTracking</key>\n\t<false/>')
    expect(manifest).toContain('<key>NSPrivacyTrackingDomains</key>\n\t<array/>')
  })

  it('declares the health and fitness data the app collects', () => {
    expect(manifest).toContain('NSPrivacyCollectedDataTypeHealth')
    expect(manifest).toContain('NSPrivacyCollectedDataTypeFitness')
    expect(manifest).toContain('NSPrivacyCollectedDataTypeEmailAddress')
    expect(manifest).toContain('NSPrivacyCollectedDataTypeUserID')
    expect(manifest).toContain('NSPrivacyCollectedDataTypePurchaseHistory')
  })

  it('declares every collected type as linked, untracked and app-functionality', () => {
    const dicts = manifest.split('<key>NSPrivacyCollectedDataType</key>').slice(1)
    expect(dicts).toHaveLength(5)
    for (const dict of dicts) {
      expect(dict).toContain('<key>NSPrivacyCollectedDataTypeLinked</key>\n\t\t\t<true/>')
      expect(dict).toContain('<key>NSPrivacyCollectedDataTypeTracking</key>\n\t\t\t<false/>')
      expect(dict).toContain('NSPrivacyCollectedDataTypePurposeAppFunctionality')
    }
  })

  it('gives a reason for UserDefaults, which @capacitor/preferences uses', () => {
    // The plugin ships no manifest of its own, so the app has to declare it.
    expect(manifest).toContain('NSPrivacyAccessedAPICategoryUserDefaults')
    expect(manifest).toContain('<string>CA92.1</string>')
  })
})

describe('patchPbxproj', () => {
  const patched = patchPbxproj(TEMPLATE_PBXPROJ)

  it('registers the manifest in the Resources build phase', () => {
    // The edit that actually matters: an unregistered file is never copied
    // into the bundle, and a manifest outside the bundle does not exist.
    const phase = patched.slice(patched.indexOf('PBXResourcesBuildPhase'))
    expect(phase).toContain('PrivacyInfo.xcprivacy in Resources')
  })

  it('adds the file reference and the build file', () => {
    expect(patched).toMatch(/isa = PBXFileReference;.*path = PrivacyInfo\.xcprivacy;/)
    expect(patched).toMatch(/isa = PBXBuildFile; fileRef = \w+ \/\* PrivacyInfo\.xcprivacy \*\//)
  })

  it('shows it in the App group, so it is visible in Xcode', () => {
    const group = patched.slice(
      patched.indexOf('/* Begin PBXGroup section */'),
      patched.indexOf('/* End PBXGroup section */'),
    )
    expect(group).toContain('PrivacyInfo.xcprivacy')
  })

  it('is idempotent — a second run adds no duplicate object', () => {
    expect(patchPbxproj(patched)).toBe(patched)
    expect(patched.match(/PrivacyInfo\.xcprivacy in Resources/g)).toHaveLength(2)
  })

  it('uses 24-character hex ids, as the format expects', () => {
    const ids = [...patched.matchAll(/(\w{24}) \/\* PrivacyInfo\.xcprivacy/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(id).toMatch(/^[0-9A-F]{24}$/)
  })
})

describe('patchSigning', () => {
  const TEAM = 'A1B2C3D4E5'

  it('sets the team on every build configuration', () => {
    const { pbxproj, count } = patchSigning(TEMPLATE_PBXPROJ, TEAM)
    expect(count).toBe(2)
    expect(pbxproj).not.toMatch(/DEVELOPMENT_TEAM = "";/)
    expect([...pbxproj.matchAll(/DEVELOPMENT_TEAM = A1B2C3D4E5;/g)]).toHaveLength(2)
  })

  it('is idempotent — a second run over a patched project changes nothing', () => {
    const once = patchSigning(TEMPLATE_PBXPROJ, TEAM).pbxproj
    expect(patchSigning(once, TEAM).pbxproj).toBe(once)
  })

  it('replaces an id that has changed rather than ignoring the new one', () => {
    // The whole point of matching on any value: someone switching from a
    // personal team to an organisation must not have to delete ios/ first.
    const once = patchSigning(TEMPLATE_PBXPROJ, TEAM).pbxproj
    const { pbxproj } = patchSigning(once, 'Z9Y8X7W6V5')
    expect(pbxproj).toMatch(/DEVELOPMENT_TEAM = Z9Y8X7W6V5;/)
    expect(pbxproj).not.toMatch(/A1B2C3D4E5/)
  })

  it('leaves the rest of the build settings alone', () => {
    const { pbxproj } = patchSigning(TEMPLATE_PBXPROJ, TEAM)
    expect(pbxproj).toMatch(/CODE_SIGN_STYLE = Automatic;/)
    expect(pbxproj).toMatch(/PRODUCT_BUNDLE_IDENTIFIER = app\.macrotrack;/)
  })

  it('reports zero when the template stops declaring the key', () => {
    // Not a throw: checkAll is what turns this into a build failure, and it
    // does so with a message naming the setting rather than a stack trace.
    const stripped = TEMPLATE_PBXPROJ.replace(/\s*DEVELOPMENT_TEAM = "";/g, '')
    expect(patchSigning(stripped, TEAM).count).toBe(0)
  })

  it.each([
    ['too short', 'A1B2C3D4'],
    ['lowercase', 'a1b2c3d4e5'],
    ['quoted by a copy-paste', '"A1B2C3D4E5"'],
    ['with a trailing newline', 'A1B2C3D4E5\n'],
    ['empty', ''],
  ])('refuses a team id that is %s', (_why, bad) => {
    // A malformed value written into the pbxproj corrupts the project file,
    // and Xcode's error for that names neither this script nor the variable.
    expect(() => patchSigning(TEMPLATE_PBXPROJ, bad)).toThrow(/APPLE_TEAM_ID/)
  })
})

describe('checkAll', () => {
  it('passes a fully patched project', () => {
    expect(checkAll(patchInfoPlist(TEMPLATE_PLIST), patchPbxproj(TEMPLATE_PBXPROJ), true)).toEqual([])
  })

  it('reports each thing a Capacitor template change could break', () => {
    const failures = checkAll(TEMPLATE_PLIST, TEMPLATE_PBXPROJ, false)
    expect(failures).toHaveLength(5)
    expect(failures.join(' ')).toMatch(/NSCameraUsageDescription/)
  })

  it('says nothing about signing when no team was asked for', () => {
    // CI's simulator build is unsigned on purpose, and a contributor with no
    // Apple account must still get a clean run.
    expect(checkAll(patchInfoPlist(TEMPLATE_PLIST), patchPbxproj(TEMPLATE_PBXPROJ), true)).toEqual(
      [],
    )
  })

  it('catches a team that was asked for but did not land', () => {
    expect(
      checkAll(
        patchInfoPlist(TEMPLATE_PLIST),
        patchPbxproj(TEMPLATE_PBXPROJ),
        true,
        'A1B2C3D4E5',
      ),
    ).toEqual([
      'DEVELOPMENT_TEAM was not set to A1B2C3D4E5 — Xcode will refuse to sign for a device.',
    ])
  })

  it('passes a project that was signed as well as patched', () => {
    const { pbxproj } = patchSigning(patchPbxproj(TEMPLATE_PBXPROJ), 'A1B2C3D4E5')
    expect(checkAll(patchInfoPlist(TEMPLATE_PLIST), pbxproj, true, 'A1B2C3D4E5')).toEqual([])
  })

  it('catches a project where only the group insertion missed', () => {
    // The two pbxproj edits match on different anchors, so a template change
    // can break one and leave the other working.
    const patched = patchPbxproj(TEMPLATE_PBXPROJ)
    const groupStart = patched.indexOf('/* Begin PBXGroup section */')
    const groupEnd = patched.indexOf('/* End PBXGroup section */')
    const withoutGroupEntry =
      patched.slice(0, groupStart) +
      patched.slice(groupStart, groupEnd).replace(/^.*PrivacyInfo\.xcprivacy.*\n/m, '') +
      patched.slice(groupEnd)

    expect(checkAll(patchInfoPlist(TEMPLATE_PLIST), withoutGroupEntry, true)).toEqual([
      'PrivacyInfo.xcprivacy is not in the App group, so it is invisible in Xcode.',
    ])
  })
})

import { describe, it, expect } from 'vitest'
import {
  APP_ID,
  APP_PATHS,
  appleAppSiteAssociation,
  assetlinks,
  resolveValues,
  strictFailures,
  PLACEHOLDER_TEAM_ID,
  PLACEHOLDER_FINGERPRINT,
} from './generate-well-known.mjs'

const TEAM = 'A1B2C3D4E5'
const FP1 = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99'
const FP2 = '11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11'

describe('appleAppSiteAssociation', () => {
  it('declares the app id as teamId.bundleId and every actionable path', () => {
    const doc = appleAppSiteAssociation(TEAM)
    expect(doc.applinks.details).toHaveLength(1)
    expect(doc.applinks.details[0].appID).toBe(`${TEAM}.${APP_ID}`)
    expect(doc.applinks.details[0].paths).toEqual(APP_PATHS)
  })

  it('declares no legacy apps array entries', () => {
    // Deprecated by Apple but still a required key in the document shape.
    expect(appleAppSiteAssociation(TEAM).applinks.apps).toEqual([])
  })
})

describe('assetlinks', () => {
  it('declares the Android package and every given fingerprint', () => {
    const doc = assetlinks([FP1, FP2])
    expect(doc).toHaveLength(1)
    expect(doc[0].target.package_name).toBe(APP_ID)
    expect(doc[0].target.sha256_cert_fingerprints).toEqual([FP1, FP2])
    expect(doc[0].relation).toEqual(['delegate_permission/common.handle_all_urls'])
  })
})

describe('resolveValues', () => {
  it('is empty when nothing is configured', () => {
    expect(resolveValues({})).toEqual({ teamId: '', fingerprints: [] })
  })

  it('reads a configured team id and fingerprint list', () => {
    expect(
      resolveValues({
        APPLE_TEAM_ID: TEAM,
        ANDROID_ASSETLINKS_SHA256_FINGERPRINTS: `${FP1}, ${FP2}`,
      }),
    ).toEqual({ teamId: TEAM, fingerprints: [FP1, FP2] })
  })

  it('allows a single fingerprint with no trailing comma', () => {
    expect(resolveValues({ ANDROID_ASSETLINKS_SHA256_FINGERPRINTS: FP1 }).fingerprints).toEqual([
      FP1,
    ])
  })

  it('rejects a malformed team id', () => {
    expect(() => resolveValues({ APPLE_TEAM_ID: 'not-a-team-id' })).toThrow(/APPLE_TEAM_ID/)
  })

  it('rejects a fingerprint that is not colon-hex SHA-256 shaped', () => {
    expect(() =>
      resolveValues({ ANDROID_ASSETLINKS_SHA256_FINGERPRINTS: 'not-a-fingerprint' }),
    ).toThrow(/ANDROID_ASSETLINKS_SHA256_FINGERPRINTS/)
  })

  it('rejects one bad fingerprint even among good ones', () => {
    expect(() =>
      resolveValues({ ANDROID_ASSETLINKS_SHA256_FINGERPRINTS: `${FP1},nope` }),
    ).toThrow(/ANDROID_ASSETLINKS_SHA256_FINGERPRINTS/)
  })
})

describe('strictFailures', () => {
  it('rejects both unset values', () => {
    const failures = strictFailures({ teamId: '', fingerprints: [] })
    expect(failures).toHaveLength(2)
    expect(failures.join(' ')).toMatch(/APPLE_TEAM_ID/)
    expect(failures.join(' ')).toMatch(/ANDROID_ASSETLINKS_SHA256_FINGERPRINTS/)
  })

  it('passes once both are configured', () => {
    expect(strictFailures({ teamId: TEAM, fingerprints: [FP1] })).toEqual([])
  })

  it('rejects a team id with no fingerprint, and vice versa', () => {
    expect(strictFailures({ teamId: TEAM, fingerprints: [] })).toHaveLength(1)
    expect(strictFailures({ teamId: '', fingerprints: [FP1] })).toHaveLength(1)
  })
})

describe('the placeholder values', () => {
  it('are shaped like the real thing so the rendered file is still valid JSON with the right shape', () => {
    expect(() => appleAppSiteAssociation(PLACEHOLDER_TEAM_ID)).not.toThrow()
    expect(PLACEHOLDER_TEAM_ID).toMatch(/^[A-Z0-9]{10}$/)
    expect(PLACEHOLDER_FINGERPRINT).toMatch(/^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/)
  })

  it('cannot verify against any real app or certificate', () => {
    // Best-effort documentation of intent, not a security property: nothing
    // stops a real team id from coincidentally matching, but this one reads
    // unmistakably as a placeholder rather than a plausible real value.
    expect(PLACEHOLDER_TEAM_ID).toBe('TEAMID0000')
    expect(PLACEHOLDER_FINGERPRINT).toBe(Array(32).fill('00').join(':'))
  })
})

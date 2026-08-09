import { describe, it, expect } from 'vitest'
import { parseVersion, versionCode, versionName, resolve } from './native-version.mjs'

describe('parseVersion', () => {
  it('accepts a tag ref, a bare tag and a plain version', () => {
    for (const input of ['refs/tags/v1.4.2', 'v1.4.2', '1.4.2']) {
      expect(parseVersion(input)).toEqual({ major: 1, minor: 4, patch: 2 })
    }
  })

  it('rejects anything that is not X.Y.Z', () => {
    // A release must not silently fall back to a default here: that is exactly
    // how both stores end up seeing version 1.0 twice.
    for (const input of ['', 'v1.4', 'refs/heads/main', 'v1.4.2-beta', undefined]) {
      expect(() => parseVersion(input)).toThrow()
    }
  })

  it('refuses a version the versionCode packing cannot represent', () => {
    expect(() => parseVersion('1.1000.0')).toThrow(/packing/)
    expect(() => parseVersion('1.0.1000')).toThrow(/packing/)
  })
})

describe('versionCode', () => {
  it('packs the three parts into one integer', () => {
    expect(versionCode(parseVersion('1.4.2'))).toBe(1_004_002)
    expect(versionCode(parseVersion('0.1.0'))).toBe(1_000)
  })

  it('increases with every kind of version bump', () => {
    // Play rejects a versionCode that is not higher than the last upload's, so
    // this ordering is the whole contract.
    const codes = ['0.1.0', '0.1.1', '0.2.0', '1.0.0', '1.0.1', '1.1.0', '2.0.0'].map((v) =>
      versionCode(parseVersion(v)),
    )
    const sorted = [...codes].sort((a, b) => a - b)
    expect(codes).toEqual(sorted)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('stays inside the Play ceiling for versions we could plausibly reach', () => {
    expect(versionCode(parseVersion('999.999.999'))).toBeLessThan(2_100_000_000)
  })
})

describe('versionName', () => {
  it('drops the v prefix the tag carries', () => {
    expect(versionName(parseVersion('refs/tags/v2.0.0'))).toBe('2.0.0')
  })
})

describe('resolve', () => {
  it('takes the tag when there is one', () => {
    expect(resolve({ ref: 'refs/tags/v3.2.1', packageVersion: '0.1.0' })).toEqual({
      name: '3.2.1',
      code: 3_002_001,
      source: 'tag',
    })
  })

  it('falls back to package.json on a manual dispatch', () => {
    // Dispatch runs only build artifacts for inspection; they never publish.
    expect(resolve({ ref: '', packageVersion: '0.1.0' })).toEqual({
      name: '0.1.0',
      code: 1_000,
      source: 'package.json',
    })
  })

  it('ignores a branch ref rather than treating it as a version', () => {
    expect(resolve({ ref: 'refs/heads/main', packageVersion: '0.1.0' }).source).toBe('package.json')
  })
})

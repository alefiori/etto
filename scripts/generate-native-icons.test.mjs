import { describe, it, expect } from 'vitest'
import { platformFlags } from './generate-native-icons.mjs'

const exists = (...present) => (p) => present.includes(p)

describe('platformFlags', () => {
  it('is empty when no native project exists', () => {
    expect(platformFlags(exists())).toEqual([])
  })

  it('returns only --android when just android/ exists', () => {
    expect(platformFlags(exists('android'))).toEqual(['--android'])
  })

  it('returns only --ios when just ios/ exists', () => {
    expect(platformFlags(exists('ios/App'))).toEqual(['--ios'])
  })

  it('returns both when both projects exist', () => {
    expect(platformFlags(exists('ios/App', 'android'))).toEqual(['--ios', '--android'])
  })

  it('never includes --pwa (the manifest is owned by vite-pwa)', () => {
    expect(platformFlags(exists('ios/App', 'android'))).not.toContain('--pwa')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ICON_NAME, notificationIconXml } from './patch-android-notification-icon.mjs'

describe('notificationIconXml', () => {
  const xml = notificationIconXml()

  it('is a vector drawable at the 24dp size Android composites at', () => {
    expect(xml).toContain('<vector xmlns:android="http://schemas.android.com/apk/res/android"')
    expect(xml).toContain('android:width="24dp"')
    expect(xml).toContain('android:viewportWidth="24"')
  })

  it('is flat white, because a small icon is drawn as a silhouette', () => {
    // Any other colour is discarded, and leaving fillColor unset renders the
    // path black — invisible against a dark status bar.
    expect(xml).toContain('android:fillColor="#FFFFFFFF"')
    expect(xml).not.toMatch(/fillColor="#(?!FFFFFFFF)/)
  })

  it('draws exactly one path, and one inside the viewport', () => {
    expect(xml.match(/<path/g)).toHaveLength(1)
    const data = xml.match(/android:pathData="([^"]+)"/)?.[1] ?? ''
    const numbers = data.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
    expect(numbers.length).toBeGreaterThan(0)
    // Coordinates are absolute or relative within a 24-unit viewport; nothing
    // should be reaching for a coordinate space that isn't there.
    expect(Math.max(...numbers)).toBeLessThanOrEqual(24)
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(-24)
  })

  it('says where it came from, since android/ is regenerated', () => {
    expect(xml).toContain('scripts/patch-android-notification-icon.mjs')
  })
})

describe('the name capacitor.config.ts asks for', () => {
  it('matches the resource this writes', () => {
    // A mismatch is silent: Android falls back to the launcher icon and the
    // status bar shows a grey blob, with nothing logged anywhere.
    // Relative to the repo root, which is where Vitest runs from.
    const config = readFileSync('capacitor.config.ts', 'utf8')
    expect(config).toContain(`smallIcon: '${ICON_NAME}'`)
  })
})

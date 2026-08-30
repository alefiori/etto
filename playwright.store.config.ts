import { defineConfig } from '@playwright/test'

const PORT = 4173
const baseURL = `http://localhost:${PORT}`

/**
 * Store listing screenshots — separate from playwright.config.ts on purpose.
 *
 * These produce artifacts rather than assertions, take a different set of
 * viewports, and must not run in CI on every push. Keeping them out of
 * `testDir: './e2e'` is what stops `pnpm run e2e` picking them up.
 *
 * Each project is one required upload size, expressed as a CSS viewport times a
 * device scale factor, because that is what Playwright screenshots multiply to:
 *
 *   iphone-6.9   430×932  ×3 = 1290×2796   App Store, required
 *   ipad-13      1032×1376 ×2 = 2064×2752  App Store, required once iPad is a
 *                                          supported device family — which it
 *                                          is (see scripts/verify-ipad.mjs)
 *   android-phone 360×640 ×3 = 1080×1920   Play, min 2 shots, 9:16
 *   android-tablet 800×1280 ×2 = 1600×2560 Play, needed to be listed as
 *                                          tablet-compatible
 *
 * Confirm the exact pixel sizes each store is asking for before an upload —
 * both change them, and a rejected asset is a wasted review cycle.
 */
const devices = {
  'iphone-6.9': { width: 430, height: 932, scale: 3 },
  'ipad-13': { width: 1032, height: 1376, scale: 2 },
  'android-phone': { width: 360, height: 640, scale: 3 },
  'android-tablet': { width: 800, height: 1280, scale: 2 },
}

export default defineConfig({
  testDir: './store',
  // Only the screenshot spec. Playwright's default testMatch also claims
  // `*.test.mjs`, which in this directory means store/listings.test.mjs — a
  // Vitest file. Playwright loads it, `describe` resolves to Vitest's, and the
  // whole run dies at collection with "Cannot read properties of undefined
  // (reading 'config')" before a single screenshot is taken.
  testMatch: '**/*.spec.ts',
  // Sequential: the projects share one preview server, and parallel workers
  // racing on it produce the occasional half-rendered capture.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: Object.entries(devices).map(([name, d]) => ({
    name,
    use: {
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: d.scale,
      isMobile: false,
      hasTouch: true,
    },
  })),
  webServer: {
    command: 'ppnpm run build:test && ppnpm run preview:test',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})

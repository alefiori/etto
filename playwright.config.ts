import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const baseURL = `http://localhost:${PORT}`

/**
 * Hermetic E2E config. The app is built with `--mode test` so the bundle points
 * at the stub Supabase host from .env.test; every request to it is intercepted
 * by e2e/fixtures/supabase.ts, so the tests need no secrets and no network.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Global comparison settings for e2e/visual.spec.ts's toHaveScreenshot()
  // calls, so no test configures its own threshold. A small tolerance absorbs
  // sub-pixel anti-aliasing differences between machines without hiding a real
  // layout or colour regression; `toHaveScreenshot`'s own default of disabling
  // CSS/web animations before capture already handles motion.
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Optional override for sandboxed environments that ship a pre-installed
    // Chromium whose build differs from the one @playwright/test expects. Unset
    // in CI, where `playwright install chromium` provides the matching browser.
    launchOptions: process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A dedicated script rather than `pnpm run build -- --mode test`: pnpm
    // forwards the `--` to the script, and `vite build -- --mode test` silently
    // drops the flag, producing a production build against the real Supabase
    // host. build:test bakes .env.test in with no separator to get wrong.
    command: 'pnpm run build:test && pnpm run preview:test',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
